import numpy as np
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.song import Song, AnalysisStatus
from app.models.song_emotion import SongEmotion
from app.models.userpreference import UserPreference

logger = logging.getLogger(__name__)

# Default emotion weights for mood selection
MOOD_VECTORS = {
    'happy': {'happy': 1.0, 'sad': 0.0, 'energetic': 0.8, 'calm': 0.2, 'angry': 0.0, 'romantic': 0.3},
    'sad': {'happy': 0.0, 'sad': 1.0, 'energetic': 0.1, 'calm': 0.6, 'angry': 0.2, 'romantic': 0.4},
    'energetic': {'happy': 0.7, 'sad': 0.0, 'energetic': 1.0, 'calm': 0.0, 'angry': 0.3, 'romantic': 0.2},
    'calm': {'happy': 0.3, 'sad': 0.2, 'energetic': 0.1, 'calm': 1.0, 'angry': 0.0, 'romantic': 0.6},
    'angry': {'happy': 0.0, 'sad': 0.3, 'energetic': 0.8, 'calm': 0.0, 'angry': 1.0, 'romantic': 0.0},
    'romantic': {'happy': 0.4, 'sad': 0.3, 'energetic': 0.2, 'calm': 0.7, 'angry': 0.0, 'romantic': 1.0},
}

# Default weights for recommendation scoring
DEFAULT_WEIGHTS = {
    'emotion_similarity': 0.7,
    'user_preference': 0.2,
    'listening_history': 0.1,
}


class RecommendationEngine:
    """Generate music recommendations based on emotion vectors and user preferences"""

    def __init__(self):
        self.weights = DEFAULT_WEIGHTS.copy()

    def set_weights(self, weights: Dict[str, float]):
        """Update recommendation weights"""
        self.weights.update(weights)

    def cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))

    def get_mood_vector(self, mood: str) -> Dict[str, float]:
        """Convert a mood string to a target emotion vector"""
        mood_lower = mood.lower()
        if mood_lower in MOOD_VECTORS:
            return MOOD_VECTORS[mood_lower]
        else:
            # Default to neutral
            logger.warning(f"Unknown mood '{mood}', using neutral")
            return {k: 0.5 for k in MOOD_VECTORS['happy'].keys()}

    def get_recommendations(
        self,
        db: Session,
        mood: str,
        user_id: Optional[int] = None,
        limit: int = 20,
        exclude_song_ids: Optional[List[int]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get song recommendations based on mood and user preferences.

        Args:
            db: Database session
            mood: Target mood (e.g., 'happy', 'sad', 'energetic')
            user_id: Optional user ID for personalization
            limit: Maximum number of recommendations
            exclude_song_ids: Song IDs to exclude from results

        Returns:
            List of recommended songs with scores
        """
        # Get target emotion vector
        target_vector = self.get_mood_vector(mood)
        target_array = np.array([target_vector[k] for k in sorted(target_vector.keys())])

        # Get user preference vector if available
        user_preference = None
        if user_id:
            user_preference = self._get_user_preference(db, user_id)

        # Get all analyzed songs with their emotion vectors
        query = (
            db.query(Song, SongEmotion)
            .join(SongEmotion, Song.id == SongEmotion.song_id)
            .filter(Song.analysis_status == AnalysisStatus.COMPLETED)
        )

        if exclude_song_ids:
            query = query.filter(Song.id.notin_(exclude_song_ids))

        songs_with_emotions = query.all()

        if not songs_with_emotions:
            logger.warning("No analyzed songs found for recommendations")
            return []

        # Calculate scores
        scored_songs = []
        for song, emotion in songs_with_emotions:
            score = self._calculate_score(
                target_array,
                emotion.features,
                user_preference,
                song.id,
                db
            )
            scored_songs.append({
                'song': song,
                'score': score,
                'emotion_features': emotion.features
            })

        # Sort by score (highest first)
        scored_songs.sort(key=lambda x: x['score'], reverse=True)

        # Return top N
        recommendations = []
        for item in scored_songs[:limit]:
            song = item['song']
            recommendations.append({
                'id': song.id,
                'title': song.title,
                'artist_name': song.artist_name,
                'album_name': song.album_name,
                'duration': song.duration,
                'score': round(item['score'], 4),
                'emotion_features': item['emotion_features']
            })

        logger.info(f"Generated {len(recommendations)} recommendations for mood '{mood}'")
        return recommendations

    def _calculate_score(
        self,
        target_array: np.ndarray,
        song_emotion: Dict[str, float],
        user_preference: Optional[Dict[str, float]],
        song_id: int,
        db: Session
    ) -> float:
        """Calculate final recommendation score for a song"""

        # Emotion similarity score (0-1)
        song_array = np.array([song_emotion[k] for k in sorted(song_emotion.keys())])
        emotion_score = self.cosine_similarity(target_array, song_array)

        # User preference score (0-1)
        preference_score = 0.5  # Default neutral
        if user_preference:
            pref_array = np.array([user_preference[k] for k in sorted(user_preference.keys())])
            preference_score = self.cosine_similarity(pref_array, song_array)

        # Listening history score (simplified for now)
        history_score = 0.5

        # Weighted combination
        final_score = (
            self.weights['emotion_similarity'] * emotion_score +
            self.weights['user_preference'] * preference_score +
            self.weights['listening_history'] * history_score
        )

        return final_score

    def _get_user_preference(self, db: Session, user_id: int) -> Optional[Dict[str, float]]:
        """Get user's emotion preference profile"""
        preference = db.query(UserPreference).filter(
            UserPreference.user_id == user_id
        ).first()

        if preference and preference.features:
            return preference.features

        return None
