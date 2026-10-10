from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.song import Song, AnalysisStatus
from app.models.song_emotion import SongEmotion
from app.models.analysis_job import AnalysisJob, JobStatus
from app.services.emotion_task_queue import task_queue

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/analysis-queue", response_model=dict)
def get_analysis_queue(
    status: str = "pending",
    db: Session = Depends(get_db)
):
    """Get analysis queue status"""

    valid_statuses = ['pending', 'processing', 'completed', 'failed']
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid options: {valid_statuses}"
        )

    jobs = db.query(AnalysisJob).filter(
        AnalysisJob.status == status
    ).order_by(AnalysisJob.created_at.desc()).limit(100).all()

    return {
        "status": status,
        "count": len(jobs),
        "queue_size": task_queue.get_queue_size(),
        "jobs": [
            {
                "id": job.id,
                "song_id": job.song_id,
                "status": job.status.value,
                "worker_id": job.worker_id,
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                "error_message": job.error_message,
                "retry_count": job.retry_count
            }
            for job in jobs
        ]
    }


@router.post("/retry-job/{job_id}", response_model=dict)
async def retry_job(job_id: int, db: Session = Depends(get_db)):
    """Retry a failed analysis job"""

    success = await task_queue.retry_job(job_id)

    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job not found or not in failed state"
        )

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Job queued for retry"
    }


@router.post("/retry-all-failed", response_model=dict)
async def retry_all_failed(db: Session = Depends(get_db)):
    """Retry all failed analysis jobs"""

    failed_jobs = db.query(AnalysisJob).filter(
        AnalysisJob.status == JobStatus.FAILED
    ).all()

    retried = 0
    for job in failed_jobs:
        success = await task_queue.retry_job(job.id)
        if success:
            retried += 1

    return {
        "message": f"Retried {retried} failed jobs",
        "retried": retried
    }


@router.get("/songs-needing-analysis", response_model=List[dict])
def get_songs_needing_analysis(
    db: Session = Depends(get_db)
):
    """Get songs that need emotion analysis"""

    songs = db.query(Song).filter(
        Song.analysis_status.in_([
            AnalysisStatus.PENDING,
            AnalysisStatus.FAILED
        ])
    ).all()

    return [
        {
            "id": song.id,
            "title": song.title,
            "analysis_status": song.analysis_status.value,
            "created_at": song.created_at.isoformat() if song.created_at else None
        }
        for song in songs
    ]


@router.get("/model-version", response_model=dict)
def get_model_version():
    """Get current emotion model version"""

    return {
        "current_version": "music-emotion-v1",
        "supported_versions": ["music-emotion-v1"]
    }


@router.post("/reanalyze-model/{new_version}", response_model=dict)
async def reanalyze_with_new_model(
    new_version: str,
    db: Session = Depends(get_db)
):
    """
    Re-analyze all songs with a new model version.
    WARNING: This is a destructive operation that will re-analyze all songs.
    """

    # Get all songs with old model version
    from app.models.song_emotion import ModelVersion
    old_emotions = db.query(SongEmotion).filter(
        SongEmotion.model_version != new_version
    ).all()

    requeued = 0
    for emotion in old_emotions:
        # Reset song analysis status
        song = db.query(Song).filter(Song.id == emotion.song_id).first()
        if song:
            song.analysis_status = AnalysisStatus.PENDING
            db.commit()

            # Queue for re-analysis
            await task_queue.enqueue(song.id)
            requeued += 1

    return {
        "message": f"Requeued {requeued} songs for re-analysis with model {new_version}",
        "requeued": requeued,
        "new_version": new_version
    }
