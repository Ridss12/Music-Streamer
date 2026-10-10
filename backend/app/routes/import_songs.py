from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import os
from pathlib import Path

from app.database import get_db
from app.models.song import Song, AnalysisStatus
from app.models.song_emotion import SongEmotion
from app.services.emotion_task_queue import task_queue
from app.config import AUDIO_STORAGE_PATH

router = APIRouter(prefix="/import", tags=["import"])

# Configuration
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.flac', '.m4a', '.ogg'}


@router.post("/songs", response_model=dict)
async def import_songs(
    directory_path: str = AUDIO_STORAGE_PATH,
    db: Session = Depends(get_db)
):
    """
    Import all songs from a directory and queue them for analysis.
    Only imports songs that don't already exist in the database.
    """

    if not os.path.exists(directory_path):
        raise HTTPException(
            status_code=400,
            detail=f"Directory not found: {directory_path}"
        )

    # Get all audio files in directory
    audio_files = []
    for file in os.listdir(directory_path):
        file_ext = Path(file).suffix.lower()
        if file_ext in ALLOWED_EXTENSIONS:
            audio_files.append(file)

    if not audio_files:
        return {
            "message": "No audio files found in directory",
            "directory": directory_path,
            "imported": 0,
            "skipped": 0
        }

    imported = 0
    skipped = 0
    queued = []

    for file_name in audio_files:
        file_path = os.path.join(directory_path, file_name)

        # Check if song already exists
        existing_song = db.query(Song).filter(Song.file_path == file_path).first()
        if existing_song:
            skipped += 1
            continue

        # Create song record
        song_title = Path(file_name).stem
        song = Song(
            title=song_title,
            file_path=file_path,
            file_name=file_name,
            file_format=Path(file_name).suffix,
            analysis_status=AnalysisStatus.PENDING
        )
        db.add(song)
        db.commit()
        db.refresh(song)

        # Queue for analysis
        job_id = await task_queue.enqueue(song.id)
        queued.append({"song_id": song.id, "title": song_title, "job_id": job_id})

        imported += 1

    return {
        "message": f"Import complete. {imported} songs imported, {skipped} skipped (already exist).",
        "directory": directory_path,
        "imported": imported,
        "skipped": skipped,
        "queued_for_analysis": len(queued),
        "songs": queued[:10]  # Return first 10 for preview
    }


@router.get("/songs", response_model=List[dict])
def list_imported_songs(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """List all imported songs"""

    songs = db.query(Song).offset(skip).limit(limit).all()

    return [
        {
            "id": song.id,
            "title": song.title,
            "file_name": song.file_name,
            "analysis_status": song.analysis_status.value,
            "created_at": song.created_at.isoformat() if song.created_at else None
        }
        for song in songs
    ]


@router.post("/reanalyze-failed", response_model=dict)
async def reanalyze_failed(db: Session = Depends(get_db)):
    """Retry analysis for all failed songs"""

    failed_songs = db.query(Song).filter(
        Song.analysis_status == AnalysisStatus.FAILED
    ).all()

    requeued = 0
    for song in failed_songs:
        job_id = await task_queue.enqueue(song.id)
        requeued += 1

    return {
        "message": f"Requeued {requeued} failed songs for analysis",
        "requeued": requeued
    }


@router.post("/reanalyze-all", response_model=dict)
async def reanalyze_all(db: Session = Depends(get_db)):
    """
    Reanalyze all songs (admin endpoint).
    WARNING: This will re-analyze ALL songs, not just new ones.
    """

    all_songs = db.query(Song).all()
    requeued = 0

    for song in all_songs:
        # Reset status to trigger re-analysis
        song.analysis_status = AnalysisStatus.PENDING
        db.commit()

        # Queue for analysis
        job_id = await task_queue.enqueue(song.id)
        requeued += 1

    return {
        "message": f"Requeued {requeued} songs for re-analysis",
        "requeued": requeued,
        "warning": "This will re-analyze all songs"
    }
