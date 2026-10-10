import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useServer } from '../ServerContext.jsx'
import { useAuth } from '../AuthContext.jsx'
import '../styles/main.css'

const MOOD_MAP = [
  { emoji: '😊', label: 'Happy', mood: 'happy' },
  { emoji: '😢', label: 'Sad', mood: 'sad' },
  { emoji: '⚡', label: 'Energetic', mood: 'energetic' },
  { emoji: '😌', label: 'Calm', mood: 'calm' },
  { emoji: '😡', label: 'Angry', mood: 'angry' },
  { emoji: '❤️', label: 'Romantic', mood: 'romantic' },
]

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function cleanTitle(title) {
  return title
    .replace(/\.\w+$/, '')
    .replace(/_/g, ' ')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function Library() {
  const { API_BASE, connected, serverIP, testConnection } = useServer()
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [songs, setSongs] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeMood, setActiveMood] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recLoading, setRecLoading] = useState(false)
  const [analysisStats, setAnalysisStats] = useState(null)
  const [volume, setVolume] = useState(70)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playlist, setPlaylist] = useState([])
  const [playlistIndex, setPlaylistIndex] = useState(-1)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const audioRef = useRef(null)
  const firstName = user?.name ? user.name.split(' ')[0] : user?.username || user?.email || 'Account'

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Set up audio element
  useEffect(() => {
    audioRef.current = new Audio()
    audioRef.current.volume = volume / 100

    const onTimeUpdate = () => setCurrentTime(audioRef.current.currentTime)
    const onLoadedMetadata = () => setDuration(audioRef.current.duration)
    const onEnded = () => playNext()
    const onError = (e) => {
      console.error('Audio error:', e)
      setIsPlaying(false)
    }

    audioRef.current.addEventListener('timeupdate', onTimeUpdate)
    audioRef.current.addEventListener('loadedmetadata', onLoadedMetadata)
    audioRef.current.addEventListener('ended', onEnded)
    audioRef.current.addEventListener('error', onError)

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeEventListener('timeupdate', onTimeUpdate)
        audioRef.current.removeEventListener('loadedmetadata', onLoadedMetadata)
        audioRef.current.removeEventListener('ended', onEnded)
        audioRef.current.removeEventListener('error', onError)
      }
    }
  }, [])

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  // Sync play/pause state
  useEffect(() => {
    if (audioRef.current && audioRef.current.src) {
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false))
      } else {
        audioRef.current.pause()
      }
    }
  }, [isPlaying])

  // Fetch songs from backend
  useEffect(() => {
    if (connected) {
      fetchSongs()
      fetchStats()
    }
  }, [connected, API_BASE])

  // Fetch recommendations when mood changes
  useEffect(() => {
    if (activeMood !== null && connected) {
      fetchRecommendations(MOOD_MAP[activeMood].mood)
    }
  }, [activeMood, connected, API_BASE])

  async function fetchSongs() {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/songs/?limit=100`)
      const data = await res.json()
      setSongs(data)
    } catch (err) {
      console.error('Failed to fetch songs:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/songs/stats/analysis`)
      const data = await res.json()
      setAnalysisStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  async function fetchRecommendations(mood) {
    try {
      setRecLoading(true)
      const res = await fetch(`${API_BASE}/recommendations/?mood=${mood}&limit=20`)
      const data = await res.json()
      setRecommendations(data)
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
    } finally {
      setRecLoading(false)
    }
  }

  function playSong(song, songList = null) {
    if (!audioRef.current) return

    const songData = {
      id: song.id,
      title: cleanTitle(song.title),
      artist: song.artist_name || 'Unknown Artist',
    }

    if (currentSong?.id === song.id) {
      togglePlay()
      return
    }

    if (songList) {
      setPlaylist(songList)
      const idx = songList.findIndex(s => s.id === song.id)
      setPlaylistIndex(idx >= 0 ? idx : 0)
    }

    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current.src = `${API_BASE}/songs/${song.id}/stream`
    setCurrentSong(songData)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(true)
  }

  function playRecommendation(rec) {
    playSong({ id: rec.id, title: rec.title, artist_name: rec.artist_name }, recommendations)
  }

  function playNext() {
    if (playlist.length === 0) return
    const nextIndex = (playlistIndex + 1) % playlist.length
    setPlaylistIndex(nextIndex)
    const nextSong = playlist[nextIndex]
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current.src = `${API_BASE}/songs/${nextSong.id}/stream`
    setCurrentSong({
      id: nextSong.id,
      title: cleanTitle(nextSong.title),
      artist: nextSong.artist_name || 'Unknown Artist',
    })
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(true)
  }

  function playPrev() {
    if (playlist.length === 0) return
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      return
    }
    const prevIndex = playlistIndex <= 0 ? playlist.length - 1 : playlistIndex - 1
    setPlaylistIndex(prevIndex)
    const prevSong = playlist[prevIndex]
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current.src = `${API_BASE}/songs/${prevSong.id}/stream`
    setCurrentSong({
      id: prevSong.id,
      title: cleanTitle(prevSong.title),
      artist: prevSong.artist_name || 'Unknown Artist',
    })
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(true)
  }

  function togglePlay() {
    setIsPlaying(prev => !prev)
  }

  function handleSeek(e) {
    const time = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const filteredSongs = songs.filter(s =>
    cleanTitle(s.title).toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Connection error screen
  if (!connected) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(33, 33, 154, 0.95), rgba(122, 15, 154, 0.95))',
        color: 'white',
        fontFamily: 'Montserrat, sans-serif',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div>
          <h1 style={{ fontSize: '3rem', marginBottom: '20px' }}>🎵</h1>
          <h2 style={{ marginBottom: '10px' }}>Connecting to Music Server...</h2>
          <p style={{ color: '#aaa', marginBottom: '30px' }}>
            Server: {API_BASE}
          </p>
          <p style={{ color: '#6EE7FF', marginBottom: '10px' }}>
            Make sure the backend server is running on your laptop.
          </p>
          <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: '30px' }}>
            If connecting from a phone, ensure you're on the same WiFi network.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => testConnection()}
              style={{
                padding: '12px 24px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '25px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Retry Connection
            </button>
            <Link to="/server" style={{
              padding: '12px 24px',
              background: 'rgba(110, 231, 255, 0.2)',
              border: '1px solid rgba(110, 231, 255, 0.4)',
              borderRadius: '25px',
              color: '#6EE7FF',
              cursor: 'pointer',
              fontSize: '1rem',
              textDecoration: 'none'
            }}>
              Change Server
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* NAVBAR */}
      <nav>
        <div className="left-half">
          <div className="logo">
            <i className="fa-brands fa-itunes-note"></i>
          </div>
          <Link to="/" className="home" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
            <i className="fa-solid fa-house"></i>
          </Link>
          <div className="search">
            <div className="search-icon">
              <i className="fa-solid fa-magnifying-glass"></i>
            </div>
            <input
              type="text"
              className="input-box"
              placeholder="Search songs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="right-half">
          <div className="right-half_pt-1">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '20px',
              fontSize: '0.85rem',
              color: '#6EE7FF'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4CAF50' }}></span>
              {isMobile ? 'Mobile' : 'Desktop'}
            </div>
          </div>
          <div className="right-half_pt-2">
            {user ? (
              <Link to="/settings" className="user-chip" title="Your account">
                <i className="fa-solid fa-user-check"></i>
                <span>{firstName}</span>
              </Link>
            ) : (
              <Link to="/login" className="login-button">Login</Link>
            )}
            <Link to="/settings" className="settings-button" style={{ textDecoration: 'none', color: 'inherit' }}>
              <i className="fa-solid fa-gear"></i>
            </Link>
          </div>
        </div>
      </nav>

      <div className="main">
        {/* LEFT SIDEBAR */}
        <div className="main-left-part">
          <div className="library">
            <p>Your Library</p>
          </div>
          <div className="box-container">
            {!user && (
              <div className="box" style={{ border: '1px dashed rgba(255,255,255,0.25)' }}>
                <h4>👤 Guest Mode</h4>
                <p style={{ fontSize: '0.8rem', color: '#aaa' }}>
                  Playlists &amp; preferences aren&apos;t saved as a guest.
                </p>
                <Link to="/register" style={{ fontSize: '0.8rem', color: '#6EE7FF', display: 'block', marginTop: '8px' }}>
                  Create a free account →
                </Link>
              </div>
            )}
            <div className="box">
              <h4>Song Library</h4>
              <p>{songs.length} songs loaded</p>
              {analysisStats && (
                <p style={{ fontSize: '0.8rem', color: '#6EE7FF' }}>
                  ✅ {analysisStats.completed} analyzed
                  {analysisStats.pending > 0 && ` · ⏳ ${analysisStats.pending} pending`}
                  {analysisStats.failed > 0 && ` · ❌ ${analysisStats.failed} failed`}
                </p>
              )}
            </div>
            <div className="box">
              <h4>Server Info</h4>
              <p style={{ fontSize: '0.8rem', color: '#6EE7FF' }}>
                {serverIP && `IP: ${serverIP}`}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '5px' }}>
                {isMobile ? 'Streaming from laptop' : 'Streaming to devices'}
              </p>
              <Link to="/server" style={{ fontSize: '0.75rem', color: '#6EE7FF', marginTop: '5px', display: 'block' }}>
                Change Server →
              </Link>
            </div>
            <div className="box">
              <h4>Mood-Based Playlists</h4>
              <p>Select a mood on the right to get personalized recommendations</p>
            </div>
          </div>
        </div>

        {/* RIGHT MAIN CONTENT */}
        <div className="main-right-part">
          {/* MOOD PICKER */}
          <div className="corner" style={{ position: 'relative', top: 0, right: 0, marginBottom: '20px' }}>
            <div className="ai_mood_detector" style={{ width: '100%', maxWidth: '500px' }}>
              <h2>What's your mood?</h2>
              <div className="moods" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                {MOOD_MAP.map((m, i) => (
                  <button
                    key={i}
                    className={`mood ${activeMood === i ? 'active' : ''}`}
                    onClick={() => setActiveMood(activeMood === i ? null : i)}
                    title={m.label}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RECOMMENDATIONS SECTION */}
          {activeMood !== null && (
            <div className="music-section">
              <h2>
                {MOOD_MAP[activeMood].emoji} Recommended for "{MOOD_MAP[activeMood].label}"
              </h2>
              {recLoading ? (
                <p style={{ color: '#fff' }}>Loading recommendations...</p>
              ) : recommendations.length > 0 ? (
                <div className="songs">
                  {recommendations.map(rec => (
                    <div
                      className={`music-card ${currentSong?.id === rec.id ? 'active' : ''}`}
                      key={rec.id}
                      onClick={() => playRecommendation(rec)}
                    >
                      <div className="music-card-icon">
                        <i className="fa-solid fa-music"></i>
                      </div>
                      <div className="img-title">{cleanTitle(rec.title)}</div>
                      <div className="img-description">
                        Match: {Math.round(rec.score * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#aaa' }}>No recommendations available</p>
              )}
            </div>
          )}

          {/* ALL SONGS SECTION */}
          <div className="music-section">
            <h2>All Songs ({filteredSongs.length})</h2>
            {loading ? (
              <p style={{ color: '#fff' }}>Loading songs...</p>
            ) : filteredSongs.length > 0 ? (
              <div className="song-list">
                {filteredSongs.map((song, index) => (
                  <div
                    className={`song-row ${currentSong?.id === song.id ? 'active' : ''}`}
                    key={song.id}
                    onClick={() => playSong(song, filteredSongs)}
                  >
                    <span className="song-row-index">
                      {currentSong?.id === song.id && isPlaying ? '♫' : index + 1}
                    </span>
                    <span className="song-row-title">{cleanTitle(song.title)}</span>
                    <span className="song-row-status">
                      {song.analysis_status === 'completed' && '✅'}
                      {song.analysis_status === 'pending' && '⏳'}
                      {song.analysis_status === 'processing' && '🔄'}
                      {song.analysis_status === 'failed' && '❌'}
                    </span>
                    <span className="song-row-duration">{formatTime(song.duration)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#aaa' }}>No songs found</p>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM PLAYER */}
      <div className="music-control">
        <div className="song-info">
          <div className="song-info-icon">
            <i className="fa-solid fa-music"></i>
          </div>
          <div className="song-text">
            <h4>{currentSong ? currentSong.title : 'No song selected'}</h4>
            <p>{currentSong ? currentSong.artist : 'Select a song to play'}</p>
          </div>
        </div>

        <div className="player">
          <div className="player-buttons">
            <button className="icon-btn">
              <i className="fa-solid fa-shuffle"></i>
            </button>
            <button className="icon-btn" onClick={playPrev}>
              <i className="fa-solid fa-backward-step"></i>
            </button>
            <button className="play-btn" onClick={togglePlay}>
              <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'}></i>
            </button>
            <button className="icon-btn" onClick={playNext}>
              <i className="fa-solid fa-forward-step"></i>
            </button>
            <button className="icon-btn">
              <i className="fa-solid fa-repeat"></i>
            </button>
          </div>
          <div className="progress-bar">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="right-controls">
          <button className="icon-btn">
            <i className={`fa-solid ${volume === 0 ? 'fa-volume-xmark' : volume < 50 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </>
  )
}
