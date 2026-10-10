import asyncio
import logging
from typing import Callable, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.analysis_job import AnalysisJob, JobStatus
from app.models.song import Song, AnalysisStatus
from app.database import SessionLocal

# Create a single analyzer instance to avoid reloading models
_analyzer_instance = None


def _get_analyzer():
    global _analyzer_instance
    if _analyzer_instance is None:
        from app.services.emotion_analyzer import EmotionAnalyzer
        _analyzer_instance = EmotionAnalyzer()
    return _analyzer_instance

logger = logging.getLogger(__name__)


class EmotionTaskQueue:
    """Lightweight async task queue for emotion analysis jobs"""

    def __init__(self):
        self._queue = asyncio.Queue()
        self._running = False
        self._worker_task = None
        self._worker_count = 1
        self._workers = []

    async def start(self, worker_count: int = 1):
        """Start the background worker(s)"""
        self._worker_count = worker_count
        self._running = True

        for i in range(worker_count):
            worker_id = f"worker-{i+1}"
            task = asyncio.create_task(self._worker(worker_id))
            self._workers.append(task)
            logger.info(f"Started emotion analysis worker: {worker_id}")

    async def stop(self):
        """Stop all workers gracefully"""
        self._running = False
        for worker in self._workers:
            worker.cancel()
        self._workers.clear()
        logger.info("Stopped all emotion analysis workers")

    async def enqueue(self, song_id: int) -> int:
        """Add a song to the analysis queue. Returns job_id."""
        db = SessionLocal()
        try:
            # Check if song already has completed emotion data
            song = db.query(Song).filter(Song.id == song_id).first()
            if not song:
                raise ValueError(f"Song {song_id} not found")

            if song.analysis_status == AnalysisStatus.COMPLETED:
                logger.info(f"Song {song_id} already analyzed, skipping")
                return 0

            # Create or get existing job
            existing_job = db.query(AnalysisJob).filter(
                AnalysisJob.song_id == song_id,
                AnalysisJob.status.in_([JobStatus.PENDING, JobStatus.PROCESSING])
            ).first()

            if existing_job:
                logger.info(f"Song {song_id} already has pending job {existing_job.id}")
                return existing_job.id

            # Create new job
            job = AnalysisJob(song_id=song_id, status=JobStatus.PENDING)
            db.add(job)
            db.commit()
            db.refresh(job)

            # Update song status
            song.analysis_status = AnalysisStatus.PENDING
            db.commit()

            # Add to queue
            await self._queue.put(job.id)
            logger.info(f"Enqueued analysis job {job.id} for song {song_id}")

            return job.id
        finally:
            db.close()

    async def _worker(self, worker_id: str):
        """Worker coroutine that processes jobs from the queue"""
        while self._running:
            try:
                job_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                await self._process_job(job_id, worker_id)
                self._queue.task_done()
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")

    async def _process_job(self, job_id: int, worker_id: str):
        """Process a single analysis job"""
        db = SessionLocal()
        try:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if not job:
                logger.error(f"Job {job_id} not found")
                return

            # Mark as processing
            job.status = JobStatus.PROCESSING
            job.worker_id = worker_id
            job.started_at = datetime.utcnow()
            db.commit()

            song = db.query(Song).filter(Song.id == job.song_id).first()
            if not song:
                job.status = JobStatus.FAILED
                job.error_message = "Song not found"
                db.commit()
                return

            # Update song status
            song.analysis_status = AnalysisStatus.PROCESSING
            db.commit()

            try:
                # Run emotion analysis in a thread pool to avoid blocking the event loop
                analyzer = _get_analyzer()
                features = await asyncio.to_thread(analyzer.analyze_sync, song.file_path)

                # Save emotion data
                from app.models.song_emotion import SongEmotion, ModelVersion
                emotion = SongEmotion(
                    song_id=song.id,
                    model_version=ModelVersion.V1,
                    features=features
                )
                db.add(emotion)

                # Update job status
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.utcnow()

                # Update song status
                song.analysis_status = AnalysisStatus.COMPLETED

                db.commit()
                logger.info(f"Completed analysis for song {song.id}")

            except Exception as e:
                logger.error(f"Analysis failed for song {song.id}: {e}")
                job.status = JobStatus.FAILED
                job.error_message = str(e)
                job.completed_at = datetime.utcnow()
                job.retry_count += 1

                song.analysis_status = AnalysisStatus.FAILED
                db.commit()

        finally:
            db.close()

    async def retry_job(self, job_id: int) -> bool:
        """Retry a failed job"""
        db = SessionLocal()
        try:
            job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if not job or job.status != JobStatus.FAILED:
                return False

            job.status = JobStatus.PENDING
            job.error_message = None
            db.commit()

            await self._queue.put(job_id)
            logger.info(f"Retried job {job_id}")
            return True
        finally:
            db.close()

    def get_queue_size(self) -> int:
        return self._queue.qsize()


# Singleton instance
task_queue = EmotionTaskQueue()
