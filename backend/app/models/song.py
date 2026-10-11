from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class AnalysisStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    artist_name = Column(String(255), nullable=True)
    album_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=False, unique=True)
    file_name = Column(String(255), nullable=False)
    duration = Column(Float, nullable=True)
    file_size = Column(Integer, nullable=True)
    file_format = Column(String(20), nullable=True)

    # Analysis status
    analysis_status = Column(
        Enum(AnalysisStatus),
        default=AnalysisStatus.PENDING,
        nullable=False
    )

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    emotion = relationship("SongEmotion", back_populates="song", uselist=False)
    analysis_jobs = relationship("AnalysisJob", back_populates="song")

    def __repr__(self):
        return f"<Song(id={self.id}, title='{self.title}', status='{self.analysis_status}')>"
