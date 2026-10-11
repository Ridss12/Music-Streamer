from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class Download(Base):
    __tablename__ = "downloads"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    user_id = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    song_id = Column(
        Integer,
        ForeignKey("songs.id"),
        nullable=False
    )

    downloaded_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False
    )