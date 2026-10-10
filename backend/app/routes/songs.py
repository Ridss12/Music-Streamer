from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import aiofiles
from pathlib import Path
import re
import unicodedata
from urllib.parse import quote

from app.database import get_db
from app.models.song import Song, AnalysisStatus
from app.models.download import Download
from app.models.user import User
from app.utils.security import get_current_user
from app.models.song_emotion import SongEmotion
from app.models.analysis_job import AnalysisJob
from app.services.emotion_task_queue import task_queue
from app.config import AUDIO_STORAGE_PATH


router = APIRouter(prefix="/songs", tags=["songs"])


# =========================================================
# ARTIST / SONG METADATA
# =========================================================

BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_ROOT.parent

MAPPING_FILE = PROJECT_ROOT / "rivibe_song_mapping.txt"
ARTIST_DIR = BACKEND_ROOT / "artists"


def _norm_name(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _load_rivibe_mapping():
    mapping = {}

    if not MAPPING_FILE.exists():
        return mapping

    for line in MAPPING_FILE.read_text(
        encoding="utf-8",
        errors="ignore"
    ).splitlines():

        parts = [p.strip() for p in line.split("|")]

        if len(parts) < 5 or not parts[0].isdigit():
            continue

        label = parts[2]
        song_file = parts[3]

        if " - " in label:
            artist, title = label.split(" - ", 1)
        else:
            artist, title = "", label

        mapping[song_file] = {
            "number": parts[0],
            "artist": artist.strip(),
            "title": title.strip(),
        }

    return mapping


def _find_artist_image(artist_name):
    if not artist_name or not ARTIST_DIR.exists():
        return None

    files = [
        p for p in ARTIST_DIR.iterdir()
        if p.is_file()
    ]

    target = _norm_name(artist_name)

    # 1. Exact match
    for p in files:
        if _norm_name(p.stem) == target:
            return f"/artists/{quote(p.name)}"

    # 2. Partial match
    for p in files:
        candidate = _norm_name(p.stem)
        if target in candidate or candidate in target:
            return f"/artists/{quote(p.name)}"

    # 3. Small spelling differences
    from difflib import SequenceMatcher

    best_file = None
    best_score = 0.0

    for p in files:
        candidate = _norm_name(p.stem)
        score = SequenceMatcher(None, target, candidate).ratio()

        if score > best_score:
            best_score = score
            best_file = p

    if best_file is not None and best_score >= 0.80:
        return f"/artists/{quote(best_file.name)}"

    return None


RIVIBE_MAPPING = _load_rivibe_mapping()


# =========================================================
# CONFIGURATION
# =========================================================

ALLOWED_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".flac",
    ".m4a",
    ".ogg"
}


MIME_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
}


# =========================================================
# UPLOAD SONG
# =========================================================

@router.post("/", response_model=dict)
async def upload_song(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    artist_name: Optional[str] = None,
    album_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Upload a song and queue it for emotion analysis."""

    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File type {file_ext} not allowed. "
                f"Allowed: {ALLOWED_EXTENSIONS}"
            )
        )

    file_name = (
        f"{len(os.listdir(AUDIO_STORAGE_PATH)) + 1}_"
        f"{file.filename}"
    )

    file_path = os.path.join(
        AUDIO_STORAGE_PATH,
        file_name
    )

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    song = Song(
        title=title or Path(file.filename).stem,
        artist_name=artist_name,
        album_name=album_name,
        file_path=file_path,
        file_name=file_name,
        file_format=file_ext,
        analysis_status=AnalysisStatus.PENDING
    )

    db.add(song)
    db.commit()
    db.refresh(song)

    job_id = await task_queue.enqueue(song.id)

    return {
        "id": song.id,
        "title": song.title,
        "status": "uploaded",
        "analysis_job_id": job_id,
        "message": "Song uploaded and queued for emotion analysis"
    }


# =========================================================
# LIST SONGS
# =========================================================

@router.get("/", response_model=List[dict])
def list_songs(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[AnalysisStatus] = None,
    db: Session = Depends(get_db)
):
    """List songs with artist metadata."""

    query = db.query(Song)

    if status:
        query = query.filter(
            Song.analysis_status == status
        )

    songs = (
        query
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []

    for song in songs:

        metadata = RIVIBE_MAPPING.get(
            song.file_name,
            {}
        )

        artist_name = metadata.get(
            "artist",
            song.artist_name
        )

        title = metadata.get(
            "title",
            song.title
        )

        result.append({
            "id": song.id,
            "title": title,
            "artist_name": artist_name,
            "thumbnail_number": metadata.get("number"),
            "artist_image": _find_artist_image(
                artist_name
            ),
            "album_name": song.album_name,
            "file_name": song.file_name,
            "duration": song.duration,
            "analysis_status": (
                song.analysis_status.value
            ),
            "created_at": (
                song.created_at.isoformat()
                if song.created_at
                else None
            )
        })

    return result


# =========================================================
# DOWNLOAD HISTORY
# IMPORTANT: BEFORE /{song_id}
# =========================================================

@router.get("/downloads")
def get_downloaded_songs(
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get songs downloaded by the logged-in user."""

    user = (
        db.query(User)
        .filter(
            User.email == current_user
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    downloads = (
        db.query(Download, Song)
        .join(
            Song,
            Download.song_id == Song.id
        )
        .filter(
            Download.user_id == user.user_id
        )
        .order_by(
            Download.downloaded_at.desc()
        )
        .all()
    )

    return [
        {
            "download_id": download.id,
            "song_id": song.id,
            "title": song.title,
            "artist_name": song.artist_name,
            "album_name": song.album_name,
            "file_name": song.file_name,
            "downloaded_at": download.downloaded_at
        }
        for download, song in downloads
    ]


# =========================================================
# ANALYSIS STATS
# =========================================================

@router.get("/stats/analysis", response_model=dict)
def get_analysis_stats(
    db: Session = Depends(get_db)
):
    """Get analysis statistics."""

    total = db.query(Song).count()

    pending = (
        db.query(Song)
        .filter(
            Song.analysis_status ==
            AnalysisStatus.PENDING
        )
        .count()
    )

    processing = (
        db.query(Song)
        .filter(
            Song.analysis_status ==
            AnalysisStatus.PROCESSING
        )
        .count()
    )

    completed = (
        db.query(Song)
        .filter(
            Song.analysis_status ==
            AnalysisStatus.COMPLETED
        )
        .count()
    )

    failed = (
        db.query(Song)
        .filter(
            Song.analysis_status ==
            AnalysisStatus.FAILED
        )
        .count()
    )

    queue_size = task_queue.get_queue_size()

    return {
        "total_songs": total,
        "pending": pending,
        "processing": processing,
        "completed": completed,
        "failed": failed,
        "queue_size": queue_size
    }


# =========================================================
# SONG DETAILS
# =========================================================

@router.get("/{song_id}", response_model=dict)
def get_song(
    song_id: int,
    db: Session = Depends(get_db)
):
    """Get song details by ID."""

    song = (
        db.query(Song)
        .filter(
            Song.id == song_id
        )
        .first()
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found"
        )

    metadata = RIVIBE_MAPPING.get(
        song.file_name,
        {}
    )

    artist_name = metadata.get(
        "artist",
        song.artist_name
    )

    title = metadata.get(
        "title",
        song.title
    )

    return {
        "id": song.id,
        "title": title,
        "artist_name": artist_name,
        "artist_image": _find_artist_image(
            artist_name
        ),
        "album_name": song.album_name,
        "file_name": song.file_name,
        "duration": song.duration,
        "file_format": song.file_format,
        "analysis_status": (
            song.analysis_status.value
        ),
        "created_at": (
            song.created_at.isoformat()
            if song.created_at
            else None
        )
    }


# =========================================================
# SONG EMOTION
# =========================================================

@router.get("/{song_id}/emotion", response_model=dict)
def get_song_emotion(
    song_id: int,
    db: Session = Depends(get_db)
):
    """Get emotion data for a song."""

    song = (
        db.query(Song)
        .filter(
            Song.id == song_id
        )
        .first()
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found"
        )

    emotion = (
        db.query(SongEmotion)
        .filter(
            SongEmotion.song_id == song_id
        )
        .first()
    )

    if not emotion:
        raise HTTPException(
            status_code=404,
            detail=(
                "Emotion data not available. "
                "Song may not be analyzed yet."
            )
        )

    return {
        "song_id": song.id,
        "title": song.title,
        "model_version": emotion.model_version.value,
        "features": emotion.features,
        "analyzed_at": (
            emotion.analyzed_at.isoformat()
            if emotion.analyzed_at
            else None
        )
    }


# =========================================================
# TRIGGER ANALYSIS
# =========================================================

@router.post("/{song_id}/analyze", response_model=dict)
async def trigger_analysis(
    song_id: int,
    db: Session = Depends(get_db)
):
    """Trigger or retry emotion analysis."""

    song = (
        db.query(Song)
        .filter(
            Song.id == song_id
        )
        .first()
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found"
        )

    job_id = await task_queue.enqueue(song_id)

    return {
        "song_id": song_id,
        "job_id": job_id,
        "status": "queued",
        "message": "Analysis job queued"
    }


# =========================================================
# ANALYSIS STATUS
# =========================================================

@router.get(
    "/{song_id}/analysis-status",
    response_model=dict
)
def get_analysis_status(
    song_id: int,
    db: Session = Depends(get_db)
):
    """Get analysis status for a song."""

    song = (
        db.query(Song)
        .filter(
            Song.id == song_id
        )
        .first()
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found"
        )

    job = (
        db.query(AnalysisJob)
        .filter(
            AnalysisJob.song_id == song_id
        )
        .order_by(
            AnalysisJob.created_at.desc()
        )
        .first()
    )

    return {
        "song_id": song_id,
        "analysis_status": (
            song.analysis_status.value
        ),
        "job_id": job.id if job else None,
        "job_status": (
            job.status.value
            if job
            else None
        ),
        "error_message": (
            job.error_message
            if job
            else None
        ),
        "retry_count": (
            job.retry_count
            if job
            else 0
        )
    }


# =========================================================
# STREAM SONG
# =========================================================

@router.get("/{song_id}/stream")
def stream_song(
    song_id: int,
    db: Session = Depends(get_db)
):
    """Stream audio file for a song."""

    song = (
        db.query(Song)
        .filter(
            Song.id == song_id
        )
        .first()
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found"
        )

    file_path = song.file_path

    if not file_path or not os.path.exists(
        file_path
    ):
        raise HTTPException(
            status_code=404,
            detail="Audio file not found on disk"
        )

    file_ext = Path(
        file_path
    ).suffix.lower()

    media_type = MIME_TYPES.get(
        file_ext,
        "audio/mpeg"
    )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=song.file_name
    )


# =========================================================
# DOWNLOAD SONG
# =========================================================

@router.get("/{song_id}/download")
def download_song(
    song_id: int,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download a song and record the download."""

    user = (
        db.query(User)
        .filter(
            User.email == current_user
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    song = (
        db.query(Song)
        .filter(
            Song.id == song_id
        )
        .first()
    )

    if not song:
        raise HTTPException(
            status_code=404,
            detail="Song not found"
        )

    file_path = song.file_path

    if not file_path or not os.path.exists(
        file_path
    ):
        raise HTTPException(
            status_code=404,
            detail="Audio file not found on disk"
        )

    download_record = Download(
        user_id=user.user_id,
        song_id=song.id
    )

    db.add(download_record)
    db.commit()

    file_ext = Path(
        file_path
    ).suffix.lower()

    media_type = MIME_TYPES.get(
        file_ext,
        "audio/mpeg"
    )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=song.file_name
    )