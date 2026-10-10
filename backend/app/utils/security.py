from datetime import datetime, timedelta
import uuid

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt

from app.config import JWT_SECRET_KEY


# =========================================================
# Password Hashing
# =========================================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""

    if len(password) > 72:
        password = password[:72]

    salt = bcrypt.gensalt(rounds=12)

    hashed = bcrypt.hashpw(
        password.encode("utf-8"),
        salt
    )

    return hashed.decode("utf-8")


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    """Verify a password against a bcrypt hash."""

    if len(plain_password) > 72:
        plain_password = plain_password[:72]

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


# =========================================================
# JWT Configuration
# =========================================================

SECRET_KEY = JWT_SECRET_KEY
ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 30


# =========================================================
# OAuth2 Scheme
# =========================================================

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login"
)


# =========================================================
# Access Token
# =========================================================

def create_access_token(data: dict):
    """Create a short-lived access token."""

    to_encode = data.copy()

    expire = datetime.utcnow() + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({
        "exp": expire,
        "type": "access"
    })

    encoded_jwt = jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return encoded_jwt


# =========================================================
# Refresh Token
# =========================================================

def create_refresh_token(data: dict):
    """Create a unique refresh token."""

    to_encode = data.copy()

    to_encode.update({
        "type": "refresh",
        "jti": str(uuid.uuid4())
    })

    encoded_jwt = jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return encoded_jwt


# =========================================================
# Get Current User
# =========================================================

def get_current_user(
    token: str = Depends(oauth2_scheme)
):
    """Get the current user from an access token."""

    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials"
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        token_type = payload.get("type")
        email = payload.get("sub")

        if token_type != "access":
            raise credentials_exception

        if email is None:
            raise credentials_exception

        return email

    except JWTError:
        raise credentials_exception
