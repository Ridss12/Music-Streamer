from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from app.database import get_db
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.password_reset_token import PasswordResetToken
from app.models.email_verification_token import EmailVerificationToken
from app.schemas.user import UserCreate, UserResponse
from app.email_service import send_password_reset_otp

from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    SECRET_KEY,
    ALGORITHM
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)


# =========================================================
# Request Models
# =========================================================

class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str


class VerifyEmailRequest(BaseModel):
    verification_token: str


# =========================================================
# Register
# =========================================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
def register(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(User)
        .filter(User.email == user.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    new_user = User(
        name=user.name,
        username=user.username,
        email=user.email,
        password=hash_password(user.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


# =========================================================
# Login
# =========================================================

@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    db_user = (
        db.query(User)
        .filter(User.email == form_data.username)
        .first()
    )

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    password_valid = verify_password(
        form_data.password,
        db_user.password
    )

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    access_token = create_access_token(
        data={
            "sub": db_user.email
        }
    )

    refresh_token = create_refresh_token(
        data={
            "sub": db_user.email
        }
    )

    new_refresh_token = RefreshToken(
        user_id=db_user.user_id,
        token=refresh_token,
        expires_at=None,
        revoked=0
    )

    db.add(new_refresh_token)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


# =========================================================
# Refresh Access Token
# =========================================================

@router.post("/refresh")
def refresh_access_token(
    request: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or revoked refresh token"
    )

    try:
        payload = jwt.decode(
            request.refresh_token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        token_type = payload.get("type")
        email = payload.get("sub")

        if token_type != "refresh":
            raise credentials_exception

        if email is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    stored_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token == request.refresh_token,
            RefreshToken.revoked == 0
        )
        .first()
    )

    if not stored_token:
        raise credentials_exception

    db_user = (
        db.query(User)
        .filter(
            User.user_id == stored_token.user_id,
            User.email == email
        )
        .first()
    )

    if not db_user:
        raise credentials_exception

    new_access_token = create_access_token(
        data={
            "sub": db_user.email
        }
    )

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


# =========================================================
# Logout
# =========================================================

@router.post("/logout")
def logout(
    request: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token == request.refresh_token,
            RefreshToken.revoked == 0
        )
        .first()
    )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or already revoked refresh token"
        )

    token.revoked = 1

    db.commit()

    return {
        "message": "Logged out successfully"
    }


# =========================================================
# Forgot Password
# =========================================================

@router.post("/forgot-password")
def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(User.email == request.email)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with this email does not exist"
        )

    # Generate a 6-digit OTP
    otp = str(secrets.randbelow(900000) + 100000)

    expires_at = datetime.utcnow() + timedelta(minutes=5)

    new_reset_token = PasswordResetToken(
        user_id=user.user_id,
        token=otp,
        expires_at=expires_at,
        used=0
    )

    db.add(new_reset_token)
    db.commit()
    
    send_password_reset_otp(
    user.email,
    otp
)

    return {
    "message": "Password reset OTP sent to your email",
    "expires_in_minutes": 5
}

# =========================================================
# Reset Password
# =========================================================

@router.post("/reset-password")
def reset_password(
    request: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token == request.reset_token,
            PasswordResetToken.used == 0
        )
        .first()
    )

    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used reset token"
        )

    if datetime.utcnow() > reset_record.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )

    user = (
        db.query(User)
        .filter(User.user_id == reset_record.user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.password = hash_password(request.new_password)

    reset_record.used = 1

    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.user_id,
        RefreshToken.revoked == 0
    ).update(
        {
            RefreshToken.revoked: 1
        },
        synchronize_session=False
    )

    db.commit()

    return {
        "message": "Password reset successfully"
    }


# =========================================================
# Send Email Verification Token
# =========================================================

@router.post("/send-verification")
def send_verification(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = (
        db.query(User)
        .filter(User.email == current_user)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    verification_token = secrets.token_urlsafe(32)

    expires_at = datetime.utcnow() + timedelta(minutes=15)

    new_verification_token = EmailVerificationToken(
        user_id=user.user_id,
        token=verification_token,
        expires_at=expires_at,
        used=0
    )

    db.add(new_verification_token)
    db.commit()

    return {
        "message": "Email verification token generated",
        "verification_token": verification_token,
        "expires_in_minutes": 15
    }


# =========================================================
# Verify Email
# =========================================================

@router.post("/verify-email")
def verify_email(
    request: VerifyEmailRequest,
    db: Session = Depends(get_db)
):
    verification_record = (
        db.query(EmailVerificationToken)
        .filter(
            EmailVerificationToken.token == request.verification_token,
            EmailVerificationToken.used == 0
        )
        .first()
    )

    if not verification_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used verification token"
        )

    if datetime.utcnow() > verification_record.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired"
        )

    user = (
        db.query(User)
        .filter(User.user_id == verification_record.user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    verification_record.used = 1

    db.commit()

    return {
        "message": "Email verified successfully"
    }


# =========================================================
# Current User
# =========================================================

@router.get("/me")
def get_current_user_profile(
    current_user: str = Depends(get_current_user)
):
    return {
        "message": "Welcome!",
        "email": current_user
    }
