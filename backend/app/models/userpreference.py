from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), unique=True, nullable=False, index=True)
    features = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", backref="preferences")

    def __repr__(self):
        return f"<UserPreference(user_id={self.user_id})>"
