from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.models.userpreference import UserPreference
from app.utils.security import hash_password, verify_password, get_current_user

router = APIRouter(
    prefix="/settings",
    tags=["Settings"]
)

# Pydantic models
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class NotificationSettings(BaseModel):
    email_notifications: bool = True
    push_notifications: bool = True
    new_releases: bool = True
    playlist_updates: bool = True
    social_activity: bool = False
    marketing_emails: bool = False

class PlaybackSettings(BaseModel):
    crossfade: bool = False
    gapless_playback: bool = True
    auto_play: bool = True
    streaming_quality: str = "high"
    download_quality: str = "high"
    normalize_volume: bool = True

class PreferencesSettings(BaseModel):
    language: str = "en"
    region: str = "US"
    theme: str = "dark"

class UserSettingsResponse(BaseModel):
    user_id: int
    name: str
    username: str
    email: EmailStr
    profile_image: Optional[str] = None
    notifications: NotificationSettings
    playback: PlaybackSettings
    preferences: PreferencesSettings
    two_factor_enabled: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# ---- Persisted settings (stored in the user_preferences table) ----

def get_default_settings() -> dict:
    return {
        "notifications": NotificationSettings().dict(),
        "playback": PlaybackSettings().dict(),
        "preferences": PreferencesSettings().dict(),
        "two_factor_enabled": False
    }


def get_user_settings(db: Session, user_id: int) -> dict:
    """Load a user's settings from the DB, merged over defaults."""
    user_pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    settings = get_default_settings()

    if user_pref and user_pref.features:
        stored = user_pref.features
        for key in ("notifications", "playback", "preferences"):
            if isinstance(stored.get(key), dict):
                settings[key] = {**settings[key], **stored[key]}
        if isinstance(stored.get("two_factor_enabled"), bool):
            settings["two_factor_enabled"] = stored["two_factor_enabled"]

    return settings


def save_user_settings(db: Session, user_id: int, settings: dict) -> None:
    """Persist the given settings keys for a user. Raises on commit failure."""
    user_pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()

    if user_pref is None:
        user_pref = UserPreference(user_id=user_id, features={})
        db.add(user_pref)

    features = dict(user_pref.features or {})

    for key in ("notifications", "playback", "preferences"):
        if key in settings:
            stored_key = features.get(key)
            if isinstance(stored_key, dict):
                features[key] = {**stored_key, **settings[key]}
            else:
                features[key] = settings[key]

    if "two_factor_enabled" in settings:
        features["two_factor_enabled"] = settings["two_factor_enabled"]

    user_pref.features = features
    db.commit()


def get_user_or_404(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/profile", response_model=UserSettingsResponse)
def get_profile(
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user profile with settings"""
    user = get_user_or_404(db, current_user_email)
    settings = get_user_settings(db, user.user_id)

    return UserSettingsResponse(
        user_id=user.user_id,
        name=user.name,
        username=user.username,
        email=user.email,
        profile_image=user.profile_image,
        notifications=NotificationSettings(**settings["notifications"]),
        playback=PlaybackSettings(**settings["playback"]),
        preferences=PreferencesSettings(**settings["preferences"]),
        two_factor_enabled=settings["two_factor_enabled"],
        created_at=datetime.utcnow()
    )


@router.put("/profile")
def update_profile(
    profile_data: ProfileUpdate,
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    user = get_user_or_404(db, current_user_email)

    if profile_data.name is not None:
        user.name = profile_data.name
    if profile_data.username is not None:
        # Check if username is already taken
        existing = db.query(User).filter(User.username == profile_data.username).first()
        if existing and existing.user_id != user.user_id:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = profile_data.username

    db.commit()
    db.refresh(user)

    return {
        "message": "Profile updated successfully",
        "user": {
            "user_id": user.user_id,
            "name": user.name,
            "username": user.username,
            "email": user.email
        }
    }


@router.put("/password")
def change_password(
    password_data: PasswordChange,
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    user = get_user_or_404(db, current_user_email)

    if not verify_password(password_data.current_password, user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(password_data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    user.password = hash_password(password_data.new_password)
    db.commit()

    return {"message": "Password changed successfully"}


@router.get("/notifications", response_model=NotificationSettings)
def get_notification_settings(
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notification settings"""
    user = get_user_or_404(db, current_user_email)
    settings = get_user_settings(db, user.user_id)
    return NotificationSettings(**settings["notifications"])


@router.put("/notifications")
def update_notification_settings(
    settings_data: NotificationSettings,
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update notification settings"""
    user = get_user_or_404(db, current_user_email)
    save_user_settings(db, user.user_id, {"notifications": settings_data.dict()})
    return {"message": "Notification settings updated successfully", "settings": settings_data}


@router.get("/playback", response_model=PlaybackSettings)
def get_playback_settings(
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get playback settings"""
    user = get_user_or_404(db, current_user_email)
    settings = get_user_settings(db, user.user_id)
    return PlaybackSettings(**settings["playback"])


@router.put("/playback")
def update_playback_settings(
    settings_data: PlaybackSettings,
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update playback settings"""
    user = get_user_or_404(db, current_user_email)
    save_user_settings(db, user.user_id, {"playback": settings_data.dict()})
    return {"message": "Playback settings updated successfully", "settings": settings_data}


@router.get("/preferences", response_model=PreferencesSettings)
def get_preferences(
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user preferences"""
    user = get_user_or_404(db, current_user_email)
    settings = get_user_settings(db, user.user_id)
    return PreferencesSettings(**settings["preferences"])


@router.put("/preferences")
def update_preferences(
    settings_data: PreferencesSettings,
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user preferences"""
    user = get_user_or_404(db, current_user_email)
    save_user_settings(db, user.user_id, {"preferences": settings_data.dict()})
    return {"message": "Preferences updated successfully", "settings": settings_data}


@router.delete("/account")
def delete_account(
    current_user_email: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user account"""
    user = get_user_or_404(db, current_user_email)

    user_id = user.user_id

    # Remove preferences tied to the account
    db.query(UserPreference).filter(UserPreference.user_id == user_id).delete()

    db.delete(user)
    db.commit()

    return {"message": "Account deleted successfully"}