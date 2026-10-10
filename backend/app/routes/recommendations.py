from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.song import Song, AnalysisStatus
from app.services.recommendation_engine import RecommendationEngine

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

# Singleton recommendation engine
recommendation_engine = RecommendationEngine()


@router.get("/", response_model=List[dict])
def get_recommendations(
    mood: str = Query(..., description="Target mood (happy, sad, energetic, calm, angry, romantic)"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of recommendations"),
    user_id: Optional[int] = Query(None, description="User ID for personalization"),
    db: Session = Depends(get_db)
):
    """
    Get song recommendations based on mood.

    This endpoint uses stored emotion vectors for fast recommendations.
    No ML model runs during this request.
    """

    # Validate mood
    valid_moods = ['happy', 'sad', 'energetic', 'calm', 'angry', 'romantic']
    if mood.lower() not in valid_moods:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mood. Valid options: {valid_moods}"
        )

    # Get recommendations
    recommendations = recommendation_engine.get_recommendations(
        db=db,
        mood=mood,
        user_id=user_id,
        limit=limit
    )

    return recommendations


@router.post("/feedback", response_model=dict)
def record_feedback(
    song_id: int,
    feedback_type: str = Query(..., description="Feedback type: like, dislike, skip, play"),
    user_id: Optional[int] = Query(None, description="User ID"),
    db: Session = Depends(get_db)
):
    """Record user feedback for a song"""

    valid_feedback = ['like', 'dislike', 'skip', 'play']
    if feedback_type not in valid_feedback:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid feedback type. Valid options: {valid_feedback}"
        )

    # Verify song exists
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # TODO: Save feedback to database
    # This will be implemented when we add the History/LikedSong models

    return {
        "song_id": song_id,
        "feedback_type": feedback_type,
        "message": "Feedback recorded"
    }


@router.get("/moods", response_model=List[dict])
def list_moods():
    """List all available moods"""

    moods = [
        {"name": "happy", "description": "Upbeat and joyful music"},
        {"name": "sad", "description": "Melancholic and emotional music"},
        {"name": "energetic", "description": "High energy and dynamic music"},
        {"name": "calm", "description": "Relaxing and peaceful music"},
        {"name": "angry", "description": "Intense and aggressive music"},
        {"name": "romantic", "description": "Love and romantic music"},
    ]

    return moods


@router.get("/similar/{song_id}", response_model=List[dict])
def get_similar_songs(
    song_id: int,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get songs similar to a specific song"""

    # Get the target song's emotion
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    from app.models.song_emotion import SongEmotion
    emotion = db.query(SongEmotion).filter(SongEmotion.song_id == song_id).first()
    if not emotion:
        raise HTTPException(
            status_code=404,
            detail="Song not analyzed yet"
        )

    # Use emotion features as the target mood
    target_mood = max(emotion.features, key=emotion.features.get)

    recommendations = recommendation_engine.get_recommendations(
        db=db,
        mood=target_mood,
        limit=limit + 1,  # +1 to exclude the song itself
        exclude_song_ids=[song_id]
    )

    return recommendations[:limit]
