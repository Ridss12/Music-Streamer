from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Enum
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ModelVersion(str, enum.Enum):
    V1 = "music-emotion-v1"


class SongEmotion(Base):
    __tablename__ = "song_emotions"

    id = Column(Integer, primary_key=True, index=True)
    song_id = Column(Integer, ForeignKey("songs.id"), unique=True, nullable=False, index=True)
    model_version = Column(Enum(ModelVersion), default=ModelVersion.V1, nullable=False)
    features = Column(JSON, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), server_default=func.now())
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)

    # Relationships
    song = relationship("Song", back_populates="emotion")

    def __repr__(self):
        return f"<SongEmotion(song_id={self.song_id}, model='{self.model_version}')>"
