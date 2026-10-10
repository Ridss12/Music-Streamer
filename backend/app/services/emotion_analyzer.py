import numpy as np
import logging
from pathlib import Path
from typing import Dict, Any

logger = logging.getLogger(__name__)

# Emotion labels
EMOTION_LABELS = ['happy', 'sad', 'energetic', 'calm', 'angry', 'romantic']


class EmotionAnalyzer:
    """
    Analyze audio files for emotion features using librosa.

    Extracts audio features (tempo, energy, spectral properties, etc.)
    and maps them to emotion vectors using a heuristic model.

    This is designed to work offline/at ingestion time, not on every request.
    """

    def __init__(self):
        try:
            import librosa
            self.librosa = librosa
            self._available = True
            logger.info("Librosa audio analyzer initialized successfully")
        except ImportError as e:
            logger.warning(f"Librosa not installed: {e}")
            self._available = False

    async def analyze(self, file_path: str) -> Dict[str, float]:
        """
        Analyze an audio file and return emotion features.

        Args:
            file_path: Path to the audio file

        Returns:
            Dictionary of emotion features normalized to 0-1
        """
        if not Path(file_path).exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        if not self._available:
            return self._fallback_analysis(file_path)

        return self._analyze_with_librosa(file_path)

    def analyze_sync(self, file_path: str) -> Dict[str, float]:
        """Synchronous version for use with asyncio.to_thread()"""
        if not Path(file_path).exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        if not self._available:
            return self._fallback_analysis(file_path)

        return self._analyze_with_librosa(file_path)

    def _analyze_with_librosa(self, file_path: str) -> Dict[str, float]:
        """Analyze using librosa feature extraction"""
        try:
            # Load only first 30 seconds for faster analysis
            # This is sufficient for emotion classification while keeping processing fast
            y, sr = self.librosa.load(file_path, sr=22050, mono=True, duration=30)

            # Extract features
            features = self._extract_features(y, sr)

            # Map features to emotions
            emotions = self._map_features_to_emotions(features)

            # Normalize to 0-1
            normalized = self._normalize(emotions)

            logger.info(f"Librosa analysis complete for {Path(file_path).name}")
            return normalized

        except Exception as e:
            logger.error(f"Librosa analysis failed for {file_path}: {e}")
            raise

    def _extract_features(self, y: np.ndarray, sr: int) -> Dict[str, float]:
        """Extract comprehensive audio features using librosa"""
        features = {}

        # --- Tempo / Rhythm ---
        tempo, beat_frames = self.librosa.beat.beat_track(y=y, sr=sr)
        if hasattr(tempo, '__len__'):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)
        features['tempo'] = tempo

        # Beat density (beats per second normalized)
        duration = len(y) / sr
        beat_count = len(beat_frames) if beat_frames is not None else 0
        features['beat_density'] = min(1.0, beat_count / max(duration, 1.0) / 5.0)

        # --- Energy / Loudness ---
        # RMS energy
        rms = self.librosa.feature.rms(y=y)[0]
        features['rms_mean'] = float(np.mean(rms))
        features['rms_std'] = float(np.std(rms))

        # Normalize RMS to 0-1 (typical music range 0-0.3)
        features['energy_level'] = min(1.0, float(np.mean(rms)) / 0.15)

        # --- Spectral features ---
        # Spectral centroid (brightness)
        centroid = self.librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        # Normalize: typical range 1000-5000 Hz
        features['brightness'] = min(1.0, max(0.0, (float(np.mean(centroid)) - 1000) / 4000))

        # Spectral bandwidth
        bandwidth = self.librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        features['spectral_bandwidth'] = min(1.0, float(np.mean(bandwidth)) / 3000)

        # Spectral rolloff
        rolloff = self.librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        features['spectral_rolloff'] = min(1.0, float(np.mean(rolloff)) / 8000)

        # Spectral contrast (6 bands)
        contrast = self.librosa.feature.spectral_contrast(y=y, sr=sr)
        features['spectral_contrast'] = min(1.0, max(0.0, float(np.mean(contrast)) / 40))

        # Zero crossing rate (noisiness/percussiveness)
        zcr = self.librosa.feature.zero_crossing_rate(y)[0]
        features['zero_crossing'] = min(1.0, float(np.mean(zcr)) / 0.2)

        # --- MFCC (timbral features) ---
        mfccs = self.librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        for i in range(min(6, mfccs.shape[0])):
            features[f'mfcc_{i}'] = float(np.mean(mfccs[i]))

        # --- Tonnetz (harmonic features) ---
        tonnetz = self.librosa.feature.tonnetz(
            y=self.librosa.effects.harmonic(y),
            sr=sr
        )
        features['tonnetz_mean'] = min(1.0, max(0.0, float(np.mean(np.abs(tonnetz))) + 0.5))

        # --- Chroma features (harmonic/pitch content) ---
        chroma = self.librosa.feature.chroma_stft(y=y, sr=sr)
        features['chroma_energy'] = min(1.0, float(np.mean(chroma)))

        # --- Onset strength (rhythmic activity) ---
        onset_env = self.librosa.onset.onset_strength(y=y, sr=sr)
        features['onset_strength'] = min(1.0, float(np.mean(onset_env)) / 20)

        return features

    def _map_features_to_emotions(self, f: Dict[str, float]) -> Dict[str, float]:
        """
        Map extracted audio features to emotion labels using a heuristic model.

        Each emotion is a weighted combination of several audio features.
        This mapping is based on music psychology research:
        - Happy: major key, moderate-fast tempo, bright timbre
        - Sad: slow tempo, low energy, low brightness
        - Energetic: fast tempo, high energy, high onset activity
        - Calm: slow tempo, low energy, smooth timbre
        - Angry: high energy, high brightness, irregular rhythm
        - Romantic: moderate tempo, harmonic richness, smooth texture
        """

        tempo = f.get('tempo', 120)
        energy = f.get('energy_level', 0.5)
        brightness = f.get('brightness', 0.5)
        onset = f.get('onset_strength', 0.5)
        beat_density = f.get('beat_density', 0.5)
        rms_std = f.get('rms_std', 0.05)
        contrast = f.get('spectral_contrast', 0.5)
        chroma = f.get('chroma_energy', 0.5)
        tonnetz = f.get('tonnetz_mean', 0.5)
        zcr = f.get('zero_crossing', 0.5)
        bandwidth = f.get('spectral_bandwidth', 0.5)

        # Tempo factor: normalized around typical pop tempo (120 BPM)
        tempo_fast = min(1.0, tempo / 160)  # 0 at 0 BPM, 1 at 160+ BPM
        tempo_slow = max(0.0, 1.0 - tempo / 100)  # 1 at 0 BPM, 0 at 100+ BPM
        tempo_mid = 1.0 - abs(tempo - 110) / 80  # Peaks around 110 BPM
        tempo_mid = max(0.0, tempo_mid)

        emotions = {}

        # Happy: fast tempo + bright timbre + high energy + harmonic richness
        emotions['happy'] = (
            0.25 * tempo_fast +
            0.20 * brightness +
            0.25 * energy +
            0.15 * chroma +
            0.15 * tonnetz
        )

        # Sad: slow tempo + low energy + low brightness + low onset
        emotions['sad'] = (
            0.30 * tempo_slow +
            0.25 * (1.0 - energy) +
            0.25 * (1.0 - brightness) +
            0.10 * (1.0 - onset) +
            0.10 * (1.0 - beat_density)
        )

        # Energetic: fast tempo + high energy + high onset + loud dynamics
        emotions['energetic'] = (
            0.30 * tempo_fast +
            0.30 * energy +
            0.20 * onset +
            0.10 * beat_density +
            0.10 * min(1.0, rms_std * 10)
        )

        # Calm: slow tempo + low energy + smooth texture + low onset
        emotions['calm'] = (
            0.25 * tempo_slow +
            0.25 * (1.0 - energy) +
            0.20 * (1.0 - onset) +
            0.15 * (1.0 - brightness) +
            0.15 * (1.0 - bandwidth)
        )

        # Angry: high energy + irregular rhythm + harsh timbre + high onset variation
        emotions['angry'] = (
            0.25 * energy +
            0.20 * brightness +
            0.20 * min(1.0, rms_std * 12) +
            0.20 * zcr +
            0.15 * (1.0 - tonnetz)
        )

        # Romantic: moderate tempo + harmonic richness + smooth texture + chroma
        emotions['romantic'] = (
            0.25 * tempo_mid +
            0.25 * tonnetz +
            0.20 * chroma +
            0.15 * (1.0 - onset) +
            0.15 * contrast
        )

        return emotions

    def _normalize(self, emotions: Dict[str, float]) -> Dict[str, float]:
        """Ensure all values are between 0 and 1"""
        return {k: max(0.0, min(1.0, float(v))) for k, v in emotions.items()}

    def _fallback_analysis(self, file_path: str) -> Dict[str, float]:
        """Fallback when librosa is not available - uses file metadata only"""
        import os

        file_size = os.path.getsize(file_path)

        # Deterministic pseudo-analysis based on file properties
        seed = hash(file_path) % (2**31)
        rng = np.random.RandomState(seed)

        features = {
            'happy': rng.uniform(0.3, 0.7),
            'sad': rng.uniform(0.2, 0.6),
            'energetic': rng.uniform(0.3, 0.7),
            'calm': rng.uniform(0.3, 0.7),
            'angry': rng.uniform(0.1, 0.4),
            'romantic': rng.uniform(0.2, 0.5),
        }

        logger.warning(f"Using fallback analysis for {file_path}")
        return features
