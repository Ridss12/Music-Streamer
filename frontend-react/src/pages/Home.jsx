import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useServer } from '../ServerContext'
import '../styles/main.css'

const MOODS = [
  { emoji: '😊', key: 'happy', label: 'Happy' },
  { emoji: '😍', key: 'romantic', label: 'Love' },
  { emoji: '😎', key: 'energetic', label: 'Energetic' },
  { emoji: '😢', key: 'sad', label: 'Sad' },
  { emoji: '😴', key: 'calm', label: 'Calm' },
  { emoji: '😡', key: 'angry', label: 'Angry' },
]

// ---------- localStorage helpers ----------
const HISTORY_KEY = 'ms_history'   // [{id,title,artist_name,duration,at}] newest-first, snapshots
const FAVS_KEY = 'ms_favs'         // [id]

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */
}
}

function getHistory() { return loadJSON(HISTORY_KEY, []) }
function getFavs() { return loadJSON(FAVS_KEY, []) }
function getPlaylists() { return loadJSON('ms_playlists', []) }
function savePlaylists(list) { saveJSON('ms_playlists', list) }

function recordPlay(song) {
  const history = getHistory()
  const entry = {
    id: song.id,
    title: song.title,
    artist_name: song.artist_name || 'Unknown Artist',
    duration: song.duration || null,
    at: Date.now(),
  }
  // Move existing entry to top, else prepend
  const rest = history.filter(h => h.id !== song.id)
  const next = [entry, ...rest].slice(0, 200)
  saveJSON(HISTORY_KEY, next)
}

function sessionLabel(at) {
  const d = new Date(at)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// Group history into per-day sessions, exclude today, newest first
function previousSessions(history, max = 3) {
  const sessions = new Map()
  for (const rec of history) { // history is newest-first
    const key = new Date(rec.at).toDateString()
    if (!sessions.has(key)) sessions.set(key, [])
    sessions.get(key).push(rec)
  }
  const list = [...sessions.values()]
    .filter(recs => sessionLabel(recs[0].at) !== 'Today')
    .map(recs => ({ label: sessionLabel(recs[0].at), songs: recs }))
  return list.slice(0, max)
}

function dedupeRecent(history, max = 12) {
  const seen = new Set()
  const out = []
  for (const rec of history) {
    if (seen.has(rec.id)) continue
    seen.add(rec.id)
    out.push(rec)
    if (out.length >= max) break
  }
  return out
}

function SongThumb() {
  return (
    <div className="music-card-icon">
      <i
        className="fa-solid fa-music"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  )
}
function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function cleanTitle(t) {
  return (t || '')
    .replace(/\.\w+$/, '')
    .replace(/_/g, ' ')
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function Home() {
  const { API_BASE, connected } = useServer()
  const { user } = useAuth()
  const handleDownload = async (song) => {
    const token = localStorage.getItem('music_auth_token')

    if (!token) {
      alert('Please login to download songs.')
      return
    }

    try {
      const response = await fetch(
        `${API_BASE}/songs/${song.id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Download failed')
      }

      const blob = await response.blob()

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = song.file_name || `${song.title}.mp3`

      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
      alert(error.message || 'Unable to download song')
    }
  }


  const [searchTerm, setSearchTerm] = useState('')
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showDownloads, setShowDownloads] = useState(false)
  const [downloadedSongs, setDownloadedSongs] = useState([])
  const [downloadsLoading, setDownloadsLoading] = useState(false)
  const [downloadsError, setDownloadsError] = useState(null)

  const [history, setHistory] = useState(() => getHistory())
  const [favs, setFavs] = useState(() => getFavs())
  const [playlists, setPlaylists] = useState(() => getPlaylists())
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [chooserSong, setChooserSong] = useState(null) // song whose add-to-playlist popover is open
  const [activeMood, setActiveMood] = useState(null)
  const [moodSongs, setMoodSongs] = useState([])
  const [moodLoading, setMoodLoading] = useState(false)
  const [moodError, setMoodError] = useState(null)

  const [currentSong, setCurrentSong] = useState({ title: '', artist: '', id: null })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [volume, setVolume] = useState(70)
  const [lastVolume, setLastVolume] = useState(70)
  const [showQueue, setShowQueue] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const audioRef = useRef(null)
  const songsRef = useRef([])
  const currentSongRef = useRef({ title: '', artist: '', id: null })
  const repeatRef = useRef(false)
  const rowRefs = useRef({})
  const sectionsRef = useRef({})
  const fileInputRef = useRef(null)
  const [uploads, setUploads] = useState([]) // [{id,name,status}] status: uploading|done|error

  // ---------- audio element ----------
  useEffect(() => {
    const audio = new Audio()
    audio.volume = volume / 100
    audioRef.current = audio

    const onTime = () => {
      setCurrentTime(audio.currentTime)
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0)
    }

    const onLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)

    const onEnded = () => {
      setProgress(0)
      setCurrentTime(0)

      const list = songsRef.current.filter(song => song && song.id)
      const current = currentSongRef.current

      if (repeatRef.current) {
        audio.currentTime = 0
        audio.play().catch(() => setIsPlaying(false))
        return
      }

      if (!list.length || !current.id) {
        setIsPlaying(false)
        return
      }

      const index = list.findIndex(song => song.id === current.id)
      const nextSong = index >= 0 ? list[(index + 1) % list.length] : list[0]

      if (nextSong) setTimeout(() => playSong(nextSong), 0)
      else setIsPlaying(false)
    }

    const onError = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.src = ''
    }
  }, [])

  useEffect(() => { songsRef.current = songs }, [songs])
  useEffect(() => { currentSongRef.current = currentSong }, [currentSong])
  useEffect(() => { repeatRef.current = isRepeat }, [isRepeat])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  useEffect(() => {
    if (audioRef.current?.src) {
      if (isPlaying) audioRef.current.play().catch(() => setIsPlaying(false))
      else audioRef.current.pause()
    }
  }, [isPlaying])

  // ---------- fetch songs ----------
  const fetchSongs = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('music_auth_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API_BASE}/songs/?limit=100`, { headers })
      if (!res.ok) throw new Error('Failed to fetch songs')
      const data = await res.json()
      setSongs(Array.isArray(data) ? data : [])
      setError(null)
    } catch {
      setError('Failed to load songs. Please login to access music library.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSongs() }, [connected, API_BASE])

  // ---------- download history ----------
  const loadDownloadedSongs = async () => {
    const token = localStorage.getItem('music_auth_token')

    if (!token) {
      setDownloadedSongs([])
      setDownloadsError('Please login to view your downloaded songs.')
      return
    }

    try {
      setDownloadsLoading(true)
      setDownloadsError(null)

      const response = await fetch(`${API_BASE}/songs/downloads`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Failed to load downloaded songs')
      }

      const data = await response.json()

      console.log('DOWNLOADED SONGS FROM API:', data)

      setDownloadedSongs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Download history error:', error)
      setDownloadedSongs([])
      setDownloadsError(error.message || 'Unable to load downloaded songs.')
    } finally {
      setDownloadsLoading(false)
    }
  }

  const openDownloads = () => {
    console.log('DOWNLOAD BUTTON CLICKED')
    setShowDownloads(true)
    loadDownloadedSongs()
  }

  const closeDownloads = () => {
    setShowDownloads(false)
    setDownloadsError(null)
  }

  // ---------- upload songs ----------
  const handleFiles = async (files) => {
    const list = Array.from(files || [])
    if (list.length === 0) return
    const newUploads = list.map(f => ({ id: `${Date.now()}-${f.name}-${Math.random()}`, name: f.name, status: 'uploading' }))
    setUploads(prev => [...prev, ...newUploads])

    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      const uid = newUploads[i].id
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${API_BASE}/songs/`, {
          method: 'POST',
          body: fd
        })
        if (!res.ok) throw new Error('Upload failed')
        setUploads(prev => prev.map(u => (u.id === uid ? { ...u, status: 'done' } : u)))
      } catch {
        setUploads(prev => prev.map(u => (u.id === uid ? { ...u, status: 'error' } : u)))
      }
    }
    fetchSongs()
  }

  // ---------- playback ----------
  const playSong = (song) => {
    if (!song || !song.id) return

    if (currentSong.id === song.id && isPlaying) {
      setIsPlaying(false)
      return
    }

    const nextCurrentSong = {
      id: song.id,
      title: cleanTitle(song.title),
      artist: song.artist_name || 'Unknown Artist',
    }

    setCurrentSong(nextCurrentSong)
    currentSongRef.current = nextCurrentSong

    if (audioRef.current) {
      audioRef.current.src = `${API_BASE}/songs/${song.id}/stream`
      audioRef.current.load()
    }

    setIsPlaying(true)
    setProgress(0)
    setCurrentTime(0)
    recordPlay(song)
    setHistory(getHistory())
  }

  const togglePlay = () => {
    if (currentSong.id) setIsPlaying(p => !p)
  }

  const playNext = () => {
    const list = songsRef.current.filter(song => song && song.id)
    if (!list.length) return

    const index = list.findIndex(song => song.id === currentSongRef.current.id)
    playSong(index === -1 ? list[0] : list[(index + 1) % list.length])
  }

  const playPrevious = () => {
    const list = songsRef.current.filter(song => song && song.id)
    if (!list.length) return

    if (audioRef.current?.currentTime > 3) {
      audioRef.current.currentTime = 0
      setCurrentTime(0)
      setProgress(0)
      return
    }

    const index = list.findIndex(song => song.id === currentSongRef.current.id)
    playSong(index === -1 ? list[0] : list[(index - 1 + list.length) % list.length])
  }

  // Leo runs above the route tree, so connect its browser events to this page's
  // player while Home is mounted. Keep the handlers current across renders.
  useEffect(() => {
    const handleLeoCommand = (event) => {
      const { action, song: requestedSong } = event.detail || {}
      const list = songsRef.current.filter(song => song && song.id)

      switch (action) {
        case 'play': {
          const query = String(requestedSong || '').trim().toLowerCase()
          if (!query) break
          const match = list.find(song =>
            [song.title, song.artist_name].some(value =>
              String(value || '').toLowerCase().includes(query)
            )
          )
          if (match) playSong(match)
          break
        }
        case 'pause':
        case 'stop':
          setIsPlaying(false)
          if (action === 'stop' && audioRef.current) {
            audioRef.current.currentTime = 0
            setCurrentTime(0)
            setProgress(0)
          }
          break
        case 'resume':
          if (currentSongRef.current.id) setIsPlaying(true)
          else if (list.length) playSong(list[0])
          break
        case 'next':
          playNext()
          break
        case 'previous':
          playPrevious()
          break
        case 'volume':
          if (Number.isFinite(Number(event.detail?.value))) {
            setVolume(Math.max(0, Math.min(100, Number(event.detail.value))))
          }
          break
        case 'mute':
          setLastVolume(volume > 0 ? volume : lastVolume)
          setVolume(0)
          break
        case 'unmute':
          setVolume(lastVolume > 0 ? lastVolume : 70)
          break
        case 'repeat':
          setIsRepeat(true)
          break
        case 'shuffle':
          if (list.length > 1) {
            const choices = list.filter(song => song.id !== currentSongRef.current.id)
            playSong(choices[Math.floor(Math.random() * choices.length)])
          }
          break
        default:
          break
      }
    }

    window.addEventListener('leo-command', handleLeoCommand)
    return () => window.removeEventListener('leo-command', handleLeoCommand)
  }, [API_BASE, isPlaying, currentSong, volume, lastVolume])

  const toggleRepeat = () => setIsRepeat(p => !p)

  const toggleMute = () => {
    if (volume > 0) {
      setLastVolume(volume)
      setVolume(0)
    } else {
      setVolume(lastVolume > 0 ? lastVolume : 70)
    }
  }

  const handleVolumeChange = (e) => {
    const nextVolume = Number(e.target.value)
    setVolume(nextVolume)
    if (nextVolume > 0) setLastVolume(nextVolume)
  }

  const onMoodToggle = async (m) => {
    if (activeMood === m.key) {
      setActiveMood(null)
      setMoodSongs([])
      return
    }
    setActiveMood(m.key)
    setMoodLoading(true)
    setMoodError(null)
    try {
      const res = await fetch(
        `${API_BASE}/recommendations/?mood=${m.key}&limit=20`
      )
      if (!res.ok) throw new Error('Failed to load recommendations')
      const data = await res.json()
      setMoodSongs(Array.isArray(data) ? data : [])
    } catch {
      setMoodError('Could not load songs for this mood.')
      setMoodSongs([])
    } finally {
      setMoodLoading(false)
    }
  }

  const toggleFavorite = (e, id) => {
    if (e) e.stopPropagation()
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [id, ...prev]
      saveJSON(FAVS_KEY, next)
      return next
    })
  }

  const createPlaylist = () => {
    const name = newPlaylistName.trim()
    if (!name) return
    const list = [...playlists, { id: Date.now(), name, song_ids: [], created_at: Date.now() }]
    savePlaylists(list)
    setPlaylists(list)
    setNewPlaylistName('')
    setCreatingPlaylist(false)
  }

  const addToPlaylist = (playlist, song) => {
    if (!song || !song.id) return
    const updated = playlists.map(p =>
      p.id === playlist.id && !p.song_ids.includes(song.id)
        ? { ...p, song_ids: [...p.song_ids, song.id] }
        : p
    )
    savePlaylists(updated)
    setPlaylists(updated)
    setChooserSong(null)
  }

  const removeFromPlaylist = (e, playlist, songId) => {
    if (e) e.stopPropagation()
    const updated = playlists.map(p =>
      p.id === playlist.id ? { ...p, song_ids: p.song_ids.filter(id => id !== songId) } : p
    )
    savePlaylists(updated)
    setPlaylists(updated)
  }

  const deletePlaylist = (id) => {
    const target = playlists.find(p => p.id === id)
    if (!target) return
    if (!window.confirm(`Delete playlist "${target.name}"? This can't be undone.`)) return
    const updated = playlists.filter(p => p.id !== id)
    savePlaylists(updated)
    setPlaylists(updated)
    setChooserSong(null)
  }

  const handleProgress = (e) => {
    const val = Number(e.target.value)
    setProgress(val)
    if (audioRef.current?.duration) {
      audioRef.current.currentTime = (val / 100) * audioRef.current.duration
    }
  }

  const scrollRow = (key, dir) => {
    const el = rowRefs.current[key]
    if (el) el.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  const scrollToSection = (key) => {
    const el = sectionsRef.current[key]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---------- derived sections ----------
  const byId = new Map(songs.map(s => [s.id, s]))
  const allSongs = songs.filter(s => {
    if (!searchTerm.trim()) return true
    const t = searchTerm.toLowerCase()
    return (
      s.title.toLowerCase().includes(t) ||
      (s.artist_name || '').toLowerCase().includes(t) ||
      (s.album_name || '').toLowerCase().includes(t)
    )
  })

  const recentSongs = dedupeRecent(history).map(rec => byId.get(rec.id) || rec).filter(Boolean)
  const favSongs = favs.map(id => byId.get(id)).filter(Boolean)
  const sessions = previousSessions(history)
  const playlistRows = playlists.map(p => ({
  ...p,
  songs: p.song_ids.map(id => byId.get(id)).filter(Boolean)
}))

  // ---------- render a single horizontal row ----------
  // mode: 'add' shows a + to add to a playlist; 'remove' shows a ✕ to remove from that playlist
  const renderRow = (key, items, mode = 'add', playlist = null) => (
    <div className="songs" key={key} ref={el => { rowRefs.current[key] = el }}>
      {items.map(song => {
        const active = currentSong.id === song.id && isPlaying
        const fav = favs.includes(song.id)
        return (
          <div
            key={song.id}
            className={`music-card ${active ? 'active' : ''}`}
            onClick={() => playSong(song)}
          >
            {mode === 'remove'
              ? (
                <button
                  className="card-add"
                  onClick={(e) => removeFromPlaylist(e, playlist, song.id)}
                  title="Remove from playlist"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )
              : (
                <button
                  className="card-add"
                  onClick={(e) => { e.stopPropagation(); setChooserSong(song) }}
                  title="Add to playlist"
                >
                  <i className="fa-solid fa-plus"></i>
                </button>
              )}
            <button
              className={`card-heart ${fav ? 'liked' : ''}`}
              onClick={(e) => toggleFavorite(e, song.id)}
              title={fav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <i className={fav ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}></i>
            </button>
            {active && <span className="card-equalizer">♫</span>}
            <SongThumb song={song} API_BASE={API_BASE} />
            <div className="img-title">{cleanTitle(song.title)}</div>
            <div className="img-description">
              {song.artist_name || 'Unknown Artist'}
            </div>
            <div>
              <button
                className="card-download"
                onClick={(e) => {
                  e.stopPropagation()
                handleDownload(song)
              }}
              title="Download song"
            >
              <i className="fa-solid fa-download"></i>
            </button>

            </div>
          </div>
        )
      })}
    </div>
  )

  // ---------- render a section w/ header + arrows ----------
  const renderSection = (key, title, items, emoji, emptyHint, mode = 'add', playlist = null) => (
    <div
      className="music-section"
      ref={el => { sectionsRef.current[key] = el }}
    >
      <div className="row-header">
        <h2>{emoji} {title} <span className="count-chip">{items.length}</span></h2>
        <div className="row-header-actions">
          {mode === 'remove' && (
            <button className="playlist-delete-btn" onClick={() => deletePlaylist(playlist.id)} title="Delete playlist">
              <i className="fa-solid fa-trash"></i>
            </button>
          )}
          {items.length > 4 && (
            <div className="scroll-btns">
              <button onClick={() => scrollRow(key, -1)}><i className="fa-solid fa-chevron-left"></i></button>
              <button onClick={() => scrollRow(key, 1)}><i className="fa-solid fa-chevron-right"></i></button>
            </div>
          )}
        </div>
      </div>
      {items.length > 0
        ? renderRow(key, items, mode, playlist)
        : <p className="empty-hint">{emptyHint}</p>}
    </div>
  )

  return (
    <>
      {/* NAVBAR */}
      <nav>
        <div className="left-half">
          <div className="logo"><i className="fa-brands fa-itunes-note"></i></div>
          <Link to="/" className="home" style={{ textDecoration: 'none', color: 'inherit' }}>
            <i className="fa-solid fa-house"></i>
          </Link>
          <div className="search">
            <div className="search-icon"><i className="fa-solid fa-magnifying-glass"></i></div>
            <input
              type="text" className="input-box" placeholder="Search to listen"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="right-half">
          <div className="right-half_pt-1">

            <div
              className="download"
              onClick={openDownloads}
              style={{ cursor: 'pointer' }}
            >
              <i className="fa-solid fa-circle-arrow-down"></i>
              <span>Download</span>
            </div>
          </div>
          <div className="right-half_pt-2">
            <Link to="/settings" className="settings-button"><i className="fa-solid fa-gear"></i></Link>
            {user ? (
              <Link to="/profile" className="login-button" title="Profile">
                <i className="fa-solid fa-user"></i>
              </Link>
            ) : (
              <Link to="/login" className="login-button">
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="main">
        {/* LEFT SIDEBAR */}
        <div className="main-left-part">
          <div className="library"><p>Your Library</p></div>
          <div className="box-container">
            <div className="box playlist-create-box">
              <h4>🎧 Your Playlists</h4>
              <p>{playlists.length} playlist{playlists.length === 1 ? '' : 's'}</p>
              <button onClick={(e) => { e.stopPropagation(); setCreatingPlaylist(true) }}>+ New Playlist</button>
              <div
                className="nav-card"
                onClick={() => {
                  if (playlists.length) scrollToSection(`playlist-${playlists[0].id}`)
                  else setCreatingPlaylist(true)
                }}
              >
                {playlists.length > 0 && (
                  <ul className="sidebar-playlist-list">
                    {playlists.map(p => (
                      <li key={p.id}>
                        <span>{p.name}</span>
                        <span className="sidebar-playlist-count">{p.song_ids.length}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {playlists.length === 0 && (
                  <p className="nav-hint">Create one &amp; tap here to jump to it →</p>
                )}
              </div>
            </div>
            <div className="box add-songs-box">
              <h4>📤 Add Songs</h4>
              <p>Upload music — it's stored on the server, analyzed, and ready to play</p>
              <button onClick={() => fileInputRef.current?.click()}>
                Upload Music
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
              />
              {uploads.length > 0 && (
                <ul className="upload-status-list">
                  {uploads.map(u => (
                    <li key={u.id} className={u.status}>
                      <span className="upload-name">{u.name}</span>
                      <span className="upload-icon">
                        {u.status === 'uploading' && <i className="fa-solid fa-spinner fa-spin"></i>}
                        {u.status === 'done' && <i className="fa-solid fa-circle-check" style={{ color: '#4CAF50' }}></i>}
                        {u.status === 'error' && <i className="fa-solid fa-circle-xmark" style={{ color: '#ff4d6d' }}></i>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="box nav-card" onClick={() => scrollToSection('recent')}>
              <h4>🕘 Recently Played</h4>
              <p>{dedupeRecent(history).length} songs in your history</p>
              <span className="nav-hint">Tap to jump →</span>
            </div>
            <div className="box nav-card" onClick={() => scrollToSection('favs')}>
              <h4>❤️ Favorite Songs</h4>
              <p>{favSongs.length} saved</p>
              <span className="nav-hint">Tap to jump →</span>
              <i className={`fa-solid fa-heart ${favSongs.length > 0 ? 'active' : ''}`}></i>
            </div>
            <div className="box nav-card" onClick={() => scrollToSection(sessions.length ? 'session-0' : 'all')}>
              <h4>💾 Previous Sessions</h4>
              <p>{sessions.length ? `${sessions.length} prior session${sessions.length > 1 ? 's' : ''}` : 'No prior sessions yet'}</p>
              <span className="nav-hint">Tap to jump →</span>
            </div>
          </div>
        </div>

        {/* RIGHT MAIN CONTENT */}
        <div className="main-right-part">
          {/* EMOTION STICKER BAR */}
          <div className="emoji-sticker-bar">
            {MOODS.map(m => (
              <button
                key={m.key}
                className={`emoji-sticker ${activeMood === m.key ? 'active' : ''}`}
                onClick={() => onMoodToggle(m)}
                title={`Find ${m.label.toLowerCase()} songs`}
              >
                <span className="sticker-emoji">{m.emoji}</span>
                <span className="sticker-label">{m.label}</span>
              </button>
            ))}
          </div>

          {loading && (
            <p className="load-hint">Loading your music library...</p>
          )}

          {error && (
            <p className="load-error">{error}</p>
          )}

          {!loading && !error && songs.length === 0 && (
            <p className="empty-hint">No songs found. Add music to your library first.</p>
          )}

          {!loading && !error && (
            <>
              {activeMood && (
                <div className="music-section">
                  <div className="row-header">
                    <h2>
                      {MOODS.find(m => m.key === activeMood)?.emoji} {MOODS.find(m => m.key === activeMood)?.label} Songs
                      <span className="count-chip">{moodSongs.length}</span>
                    </h2>
                  </div>
                  {moodLoading ? (
                    <p className="load-hint">Finding songs for this mood...</p>
                  ) : moodError ? (
                    <p className="load-error">{moodError}</p>
                  ) : moodSongs.length > 0 ? (
                    renderRow('mood', moodSongs)
                  ) : (
                    <p className="empty-hint">No analyzed songs match this mood yet.</p>
                  )}
                </div>
              )}

              {renderSection(
                'recent', 'Recently Played', recentSongs, '🕘',
                'Nothing played yet — tap a song below to start.'
              )}

              {renderSection(
                'favs', 'Favorite Songs', favSongs, '❤️',
                'Tap the heart on any song to add it to favorites.'
              )}

              {sessions.map((s, i) =>
                renderSection(
                  `session-${i}`, `Previous Session · ${s.label}`, s.songs, '💾',
                  ''
                )
              )}

              {playlistRows.map(p =>
                renderSection(
                  `playlist-${p.id}`, p.name, p.songs, '🎧',
                  'Empty — tap the + on any song to add it here.',
                  'remove', p
                )
              )}

              {renderSection(
                'all', 'All Songs', allSongs, '🎵',
                'No songs match your search.'
              )}
            </>
          )}
        </div>
      </div>

      {/* BOTTOM MINI PLAYER */}
      {currentSong.id && (
        <div className="music-control">
          <div className="song-info">
            <div className="song-info-icon"><i className="fa-solid fa-music"></i></div>
            <div className="song-text">
              <h4>{currentSong.title}</h4>
              <p>{currentSong.artist}</p>
            </div>
            <button className="icon-btn" onClick={(e) => toggleFavorite(e, currentSong.id)}>
              <i className={favs.includes(currentSong.id) ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}></i>
            </button>
          </div>

          <div className="player">
            <div className="player-buttons">
              {/* Shuffle removed intentionally — Rivibe uses sequential playback. */}
              <button className="icon-btn" onClick={playPrevious} title="Previous song">
                <i className="fa-solid fa-backward-step"></i>
              </button>
              <button className="play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                <i className={isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'}></i>
              </button>
              <button className="icon-btn" onClick={playNext} title="Next song">
                <i className="fa-solid fa-forward-step"></i>
              </button>
              <button className={`icon-btn ${isRepeat ? 'active' : ''}`} onClick={toggleRepeat} title={isRepeat ? 'Repeat on' : 'Repeat off'}>
                <i className="fa-solid fa-repeat"></i>
              </button>
            </div>
            <div className="progress-bar">
              <span>{formatTime(currentTime)}</span>
              <input type="range" value={progress} onChange={handleProgress} min={0} max={100} step={0.1} aria-label="Song progress" />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="right-controls">
            <button className={`icon-btn ${showQueue ? 'active' : ''}`} onClick={() => setShowQueue(p => !p)} title="Queue">
              <i className="fa-solid fa-list"></i>
            </button>
            <button className="icon-btn" onClick={toggleMute} title={volume === 0 ? 'Unmute' : 'Mute'}>
              <i className={`fa-solid ${volume === 0 ? 'fa-volume-xmark' : volume < 50 ? 'fa-volume-low' : 'fa-volume-high'}`}></i>
            </button>
            <input type="range" value={volume} onChange={handleVolumeChange} min={0} max={100} aria-label="Volume" />
          </div>
        </div>
      )}

      {/* PLAY QUEUE */}
      {showQueue && currentSong.id && (
        <div onClick={() => setShowQueue(false)} style={{ position: 'fixed', right: '24px', bottom: '100px', zIndex: 99998, width: 'min(380px, 90vw)', maxHeight: '60vh', overflowY: 'auto', padding: '16px', borderRadius: '16px', background: 'linear-gradient(145deg, #25145f, #5a1680)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', color: '#fff' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0 }}>☷ Queue</h3>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: '12px' }}>{songs.length} songs</p>
            </div>
            <button onClick={() => setShowQueue(false)} title="Close queue" style={{ border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
          </div>
          {songs.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.7)' }}>No songs in the queue.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {songs.map((song, index) => {
                const active = currentSong.id === song.id
                return (
                  <button key={`queue-${song.id}-${index}`} onClick={() => { playSong(song); setShowQueue(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', padding: '10px', borderRadius: '10px', border: active ? '1px solid rgba(110,231,255,0.65)' : '1px solid rgba(255,255,255,0.08)', background: active ? 'rgba(110,231,255,0.12)' : 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer' }}>
                    <span style={{ width: '22px', textAlign: 'center' }}>{active && isPlaying ? '▶' : index + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanTitle(song.title)}</strong>
                      <small style={{ color: 'rgba(255,255,255,0.65)' }}>{song.artist_name || 'Unknown Artist'}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* DOWNLOAD HISTORY MODAL */}
      {showDownloads && (
        <div
          onClick={closeDownloads}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 95vw)',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'linear-gradient(145deg, #25145f, #5a1680)',
              borderRadius: '18px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
              padding: '24px',
              color: '#ffffff'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px'
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>⬇️ Downloaded Songs</h2>
                <p style={{ margin: '6px 0 0', color: '#777' }}>
                  {downloadedSongs.length} downloaded {downloadedSongs.length === 1 ? 'song' : 'songs'}
                </p>
              </div>

              <button
                onClick={closeDownloads}
                title="Close"
                style={{
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '38px',
                  height: '38px',
                  cursor: 'pointer',
                  fontSize: '20px'
                }}
              >
                ✕
              </button>
            </div>

            {downloadsLoading && (
              <p style={{ textAlign: 'center', padding: '30px 10px' }}>
                Loading your downloaded songs...
              </p>
            )}

            {!downloadsLoading && downloadsError && (
              <p style={{ color: '#d33', padding: '20px 0' }}>
                {downloadsError}
              </p>
            )}

            {!downloadsLoading && !downloadsError && downloadedSongs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '45px 15px', color: '#777' }}>
                <div style={{ fontSize: '42px', marginBottom: '12px' }}>⬇️</div>
                <h3 style={{ margin: '0 0 8px', color: '#ffffff' }}>
                  No downloaded songs yet
                </h3>
                <p style={{ margin: 0 }}>
                  Click the download icon on any song to download it.
                </p>
              </div>
            )}

            {!downloadsLoading && downloadedSongs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {downloadedSongs.map((item) => {
                  const matchingSong = songs.find(s => s.id === item.song_id)

                  const songForPlayer = matchingSong || {
                    id: item.song_id,
                    title: item.title,
                    artist_name: item.artist_name || 'Unknown Artist',
                    album_name: item.album_name || ''
                  }

                  return (
                    <div
                      key={item.download_id || `${item.song_id}-${item.downloaded_at}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '12px 14px',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          minWidth: '48px',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'rgba(255, 255, 255, 0.12)',
                          fontSize: '20px'
                        }}
                      >
                        🎵
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {cleanTitle(item.title)}
                        </div>

                        <div style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '14px', marginTop: '3px' }}>
                          {item.artist_name || 'Unknown Artist'}
                        </div>

                        {item.downloaded_at && (
                          <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '12px', marginTop: '3px' }}>
                            Downloaded {new Date(item.downloaded_at).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => playSong(songForPlayer)}
                        title="Play song"
                        style={{
                          border: 'none',
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: '#111',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        <i className="fa-solid fa-play"></i>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE PLAYLIST MODAL */}
      {creatingPlaylist && (
        <div className="popover-backdrop" onClick={() => setCreatingPlaylist(false)}>
          <div className="playlist-chooser create" onClick={(e) => e.stopPropagation()}>
            <h4>Create Playlist</h4>
            <input
              autoFocus
              className="playlist-name-input"
              placeholder="Playlist name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createPlaylist() }}
            />
            <div className="chooser-actions">
              <button className="btn-cancel" onClick={() => setCreatingPlaylist(false)}>Cancel</button>
              <button className="btn-create" onClick={createPlaylist} disabled={!newPlaylistName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD-TO-PLAYLIST POPOVER */}
      {chooserSong && (
        <div className="popover-backdrop" onClick={() => setChooserSong(null)}>
          <div className="playlist-chooser" onClick={(e) => e.stopPropagation()}>
            <h4>Add to Playlist</h4>
            <p className="popover-song">{cleanTitle(chooserSong.title)}</p>
            {playlists.length === 0 && (
              <p className="empty-hint">No playlists yet — create one from the sidebar.</p>
            )}
            {playlists.map(p => (
              <button key={p.id} className="chooser-item" onClick={() => addToPlaylist(p, chooserSong)}>
                <i className="fa-solid fa-list"></i>
                <span>{p.name}</span>
                <span className="chooser-count">{p.song_ids.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
