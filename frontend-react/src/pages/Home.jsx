import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { useServer } from '../ServerContext'
import { filterUnavailableSongs, getUnavailableSongIds, hideUnavailableSong } from '../unplayableSongs.js'
import { analyzeLocalAudio } from '../localAudioAnalysis.js'
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
  const [activeLibrarySection, setActiveLibrarySection] = useState('all')
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
  const [playerError, setPlayerError] = useState('')

  const audioRef = useRef(null)
  const songsRef = useRef([])
  const currentSongRef = useRef({ title: '', artist: '', id: null })
  const repeatRef = useRef(false)
  const rowRefs = useRef({})
  const sectionRefs = useRef({})
  const mainContentRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploads, setUploads] = useState([]) // local-only analysis state

  useEffect(() => () => {
    songsRef.current.filter(song => song?.isLocal).forEach(song => URL.revokeObjectURL(song.objectUrl))
  }, [])

  const removeUnavailableSong = (songId) => {
    if (songId === null || songId === undefined) return
    hideUnavailableSong(songId)
    setSongs(prev => {
      const available = prev.filter(song => String(song.id) !== String(songId))
      songsRef.current = available
      return available
    })
  }

  // ---------- audio element ----------
  useEffect(() => {
    const audio = new Audio()
    audio.volume = volume / 100
    audioRef.current = audio

    const onTime = () => {
      setCurrentTime(audio.currentTime)
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0)
    }

    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
      setPlayerError('')
    }

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

    const onError = () => {
      const failedSongId = currentSongRef.current.id
      removeUnavailableSong(failedSongId)
      setIsPlaying(false)
      setPlayerError('Audio could not be loaded. Check that the file exists on the backend, then re-upload it if needed.')
    }

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
      if (isPlaying) {
        audioRef.current.play().catch(error => {
          if (!['NotAllowedError', 'AbortError'].includes(error?.name)) {
            removeUnavailableSong(currentSongRef.current.id)
          }
          setIsPlaying(false)
          setPlayerError(
            error?.name === 'NotAllowedError'
              ? 'Your browser blocked playback. Click Play once, then try Leo again.'
              : 'Audio could not be played. Check the backend stream and audio file.'
          )
        })
      }
      else audioRef.current.pause()
    }
  }, [isPlaying, currentSong.id])

  // ---------- fetch songs ----------
  const fetchSongs = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('music_auth_token')
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API_BASE}/songs/?limit=100`, { headers })
      if (res.status === 401) throw new Error('Please login to access the music library.')
      if (!res.ok) throw new Error(`Failed to load songs (server returned ${res.status}).`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('The server returned an unexpected songs response.')
      setSongs(previous => {
        const merged = [...filterUnavailableSongs(data), ...previous.filter(song => song?.isLocal)]
        songsRef.current = merged
        return merged
      })
      setError(null)
    } catch (error) {
      console.error('Failed to load songs:', error)
      setError(error.message || 'Failed to load songs. Check the server connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSongs() }, [connected, API_BASE])

  const pendingAnalysisIds = songs
    .filter(song => !song.isLocal && ['pending', 'processing'].includes(song.analysis_status))
    .map(song => song.id)
    .join(',')

  useEffect(() => {
    if (!pendingAnalysisIds) return undefined
    const refreshStatuses = async () => {
      const ids = pendingAnalysisIds.split(',')
      const updates = await Promise.all(ids.map(async id => {
        try {
          const response = await fetch(`${API_BASE}/songs/${id}/analysis-status`)
          if (!response.ok) return null
          const status = await response.json()
          return [id, status.analysis_status]
        } catch {
          return null
        }
      }))
      const statusById = new Map(updates.filter(Boolean))
      if (statusById.size) {
        setSongs(previous => {
          let changed = false
          const updated = previous.map(song => {
            const status = statusById.get(String(song.id))
            if (!status || status === song.analysis_status) return song
            changed = true
            return { ...song, analysis_status: status }
          })
          if (changed) songsRef.current = updated
          return changed ? updated : previous
        })
      }
    }
    const timer = window.setInterval(refreshStatuses, 3000)
    refreshStatuses()
    return () => window.clearInterval(timer)
  }, [pendingAnalysisIds, API_BASE])

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

  // ---------- analyze local audio without sending it to the server ----------
  const handleFiles = async (files) => {
    const list = Array.from(files || [])
    if (list.length === 0) return
    const newUploads = []
    const oversized = []
    for (const file of list) {
      if (file.size > 100 * 1024 * 1024) {
        oversized.push(file)
        continue
      }
      const id = `local-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
      newUploads.push({
        id,
        name: file.name,
        status: 'analyzing',
        song: {
          id,
          title: cleanTitle(file.name),
          artist_name: 'Local audio',
          file_name: file.name,
          duration: null,
          isLocal: true,
          file,
          objectUrl: URL.createObjectURL(file),
          analysis_status: 'processing',
        },
      })
    }
    setUploads(prev => [
      ...prev,
      ...oversized.map(file => ({ id: `large-${Date.now()}-${Math.random()}`, name: file.name, status: 'error', error: 'Files must be 100 MB or smaller.' })),
      ...newUploads.map(({ id, name, status }) => ({ id, name, status })),
    ])
    setSongs(prev => {
      const merged = [...prev, ...newUploads.map(upload => upload.song)]
      songsRef.current = merged
      return merged
    })

    for (const upload of newUploads) {
      try {
        const emotion_features = await analyzeLocalAudio(upload.song.file)
        setSongs(prev => {
          const updated = prev.map(song => song.id === upload.id
            ? { ...song, emotion_features, analysis_status: 'completed' }
            : song)
          songsRef.current = updated
          return updated
        })
        setUploads(prev => prev.map(item => item.id === upload.id ? { ...item, status: 'done' } : item))
      } catch (error) {
        URL.revokeObjectURL(upload.song.objectUrl)
        setSongs(prev => {
          const updated = prev.filter(song => song.id !== upload.id)
          songsRef.current = updated
          return updated
        })
        setUploads(prev => prev.map(item => item.id === upload.id
          ? { ...item, status: 'error', error: error.message || 'This audio could not be analyzed in your browser.' }
          : item))
      }
    }
  }

  const retrySongAnalysis = async (event, song) => {
    event.stopPropagation()
    try {
      const response = await fetch(`${API_BASE}/songs/${song.id}/analyze`, { method: 'POST' })
      if (!response.ok) throw new Error('Could not queue analysis')
      setSongs(previous => {
        const updated = previous.map(item => item.id === song.id ? { ...item, analysis_status: 'pending' } : item)
        songsRef.current = updated
        return updated
      })
    } catch {
      setPlayerError(`Could not restart analysis for ${song.title}.`)
    }
  }

  // ---------- playback ----------
  const playSong = (song) => {
    if (!song || !song.id) return

    // Repeating the current track from Leo (or pressing Next with a one-song
    // library) should not accidentally turn playback off.
    if (currentSong.id === song.id && isPlaying) return

    setPlayerError('')

    const nextCurrentSong = {
      id: song.id,
      title: cleanTitle(song.title),
      artist: song.artist_name || 'Unknown Artist',
    }

    setCurrentSong(nextCurrentSong)
    currentSongRef.current = nextCurrentSong

    if (audioRef.current) {
      audioRef.current.src = song.isLocal ? song.objectUrl : `${API_BASE}/songs/${song.id}/stream`
      audioRef.current.load()
      // Start immediately from the click/voice event instead of waiting for a
      // React effect, which can lose the browser's user-activation window.
      audioRef.current.play().catch(error => {
        if (!['NotAllowedError', 'AbortError'].includes(error?.name)) {
          removeUnavailableSong(song.id)
        }
        setIsPlaying(false)
        setPlayerError(
          error?.name === 'NotAllowedError'
            ? 'Your browser blocked playback. Click Play once, then try Leo again.'
            : 'Audio could not be played. Try another format supported by your browser.'
        )
      })
    }

    setIsPlaying(true)
    setProgress(0)
    setCurrentTime(0)
    if (!song.isLocal) {
      recordPlay(song)
      setHistory(getHistory())
    }
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
      const { action, song: requestedSong, playlist: requestedPlaylist } = event.detail || {}
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
        case 'volume_delta':
          if (Number.isFinite(Number(event.detail?.value))) {
            const nextVolume = Math.max(0, Math.min(100, volume + Number(event.detail.value)))
            setVolume(nextVolume)
            if (nextVolume > 0) setLastVolume(nextVolume)
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
        case 'create_playlist': {
          const name = String(requestedPlaylist || '').trim()
          if (!name) break
          setPlaylists(current => {
            if (current.some(item => item.name.toLowerCase() === name.toLowerCase())) return current
            const updated = [...current, { id: Date.now(), name, song_ids: [], created_at: Date.now() }]
            savePlaylists(updated)
            return updated
          })
          break
        }
        case 'delete_playlist': {
          const name = String(requestedPlaylist || '').trim()
          const target = playlists.find(item => item.name.toLowerCase() === name.toLowerCase())
          if (!target || !window.confirm(`Delete playlist "${target.name}"? This can't be undone.`)) break
          setPlaylists(current => {
            const updated = current.filter(item => item.id !== target.id)
            savePlaylists(updated)
            return updated
          })
          setChooserSong(null)
          break
        }
        default:
          break
      }
    }

    window.addEventListener('leo-command', handleLeoCommand)
    return () => window.removeEventListener('leo-command', handleLeoCommand)
  }, [API_BASE, isPlaying, currentSong, volume, lastVolume, playlists])

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
    const localMatches = songs.filter(song => song.isLocal && song.emotion_features?.[m.key] >= 0.4)
    try {
      const res = await fetch(
        `${API_BASE}/recommendations/?mood=${m.key}&limit=20`
      )
      if (!res.ok) throw new Error('Failed to load recommendations')
      const data = await res.json()
      setMoodSongs([...(Array.isArray(data) ? data : []), ...localMatches])
    } catch {
      setMoodSongs(localMatches)
      if (!localMatches.length) setMoodError('Could not load songs for this mood.')
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
    const container = mainContentRef.current
    if (!container) return
    setActiveLibrarySection(key)
    container.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToAllSongs = () => {
    setActiveLibrarySection('all')
    window.requestAnimationFrame(() => {
      const container = mainContentRef.current
      const section = sectionRefs.current.all
      if (!container || !section) return
      const top = section.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
      container.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' })
    })
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

  const unavailableIds = getUnavailableSongIds()
  const recentSongs = dedupeRecent(history)
    .filter(rec => !unavailableIds.has(String(rec.id)))
    .map(rec => byId.get(rec.id) || rec)
    .filter(Boolean)
  const favSongs = favs.map(id => byId.get(id)).filter(Boolean)
  const localAudioSongs = songs.filter(song => song?.isLocal)
  const sessions = previousSessions(history)
  const playlistRows = playlists.map(p => ({
  ...p,
  songs: p.song_ids.map(id => byId.get(id)).filter(Boolean)
}))
  const librarySections = [
    { key: 'all', title: 'All Songs', items: allSongs.slice(0, 10), emoji: '🎵', empty: 'No songs match your search.' },
    ...(localAudioSongs.length > 0
      ? [{ key: 'local-audio', title: 'Local Audio · This Device Only', items: localAudioSongs, emoji: '💻', empty: 'Choose audio files to analyze them here.' }]
      : []),
    { key: 'recent', title: 'Recently Played', items: recentSongs, emoji: '🕘', empty: 'Nothing played yet — tap a song below to start.' },
    { key: 'favs', title: 'Favorite Songs', items: favSongs, emoji: '❤️', empty: 'Tap the heart on any song to add it to favorites.' },
    ...sessions.map((session, index) => ({
      key: `session-${index}`,
      title: `Previous Session · ${session.label}`,
      items: session.songs,
      emoji: '💾',
      empty: '',
    })),
    ...playlistRows.map(playlist => ({
      key: `playlist-${playlist.id}`,
      title: playlist.name,
      items: playlist.songs,
      emoji: '🎧',
      mode: 'remove',
      playlist,
      empty: 'Empty — tap the + on any song to add it here.',
    })),
  ]
  const selectedSection = librarySections.find(section => section.key === activeLibrarySection)
  const orderedLibrarySections = activeLibrarySection === 'all' || !selectedSection
    ? [...librarySections]
    : [
        selectedSection,
        ...librarySections.filter(section => section.key === 'all'),
        ...librarySections.filter(section => section.key !== activeLibrarySection && section.key !== 'all'),
      ]

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
            {song.isLocal && (
              <div className="local-audio-analysis">
                {song.analysis_status === 'processing'
                  ? 'Analyzing on this device…'
                  : `Estimated mood · ${Object.entries(song.emotion_features || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'audio profile'}`}
              </div>
            )}
            {!song.isLocal && song.analysis_status && song.analysis_status !== 'completed' && (
              <div className="local-audio-analysis">
                {song.analysis_status === 'failed' ? (
                  <button className="analysis-retry" onClick={event => retrySongAnalysis(event, song)}>Analysis failed · Retry</button>
                ) : `Analysis ${song.analysis_status || 'pending'}…`}
              </div>
            )}
            {!song.isLocal && <div>
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

            </div>}
          </div>
        )
      })}
    </div>
  )

  // ---------- render a section w/ header + arrows ----------
  const renderSection = (key, title, items, emoji, emptyHint, mode = 'add', playlist = null) => (
    <div className="music-section" key={key} ref={el => { sectionRefs.current[key] = el }}>
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
          <Link to="/" className="brand-lockup" aria-label="RiVibe home">
            <img src="/rivibe-logo.png" alt="" className="brand-logo" />
            <span>RiVibe</span>
          </Link>
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
          <div className="library library-heading">
            <p>Your Library</p>
            <button className="library-add-audio" onClick={() => fileInputRef.current?.click()} title="Add audio from this device" aria-label="Add local audio">
              <i className="fa-solid fa-plus" />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg"
            multiple
            className="visually-hidden-audio-input"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
          />
          <div className="box-container library-list">
            <button className={`library-nav-item ${activeLibrarySection === 'all' ? 'active' : ''}`} onClick={() => scrollToSection('all')}>
              <span><i className="fa-solid fa-music" /> All Songs</span><small>{songs.length}</small>
            </button>
            {localAudioSongs.length > 0 && (
              <button className={`library-nav-item ${activeLibrarySection === 'local-audio' ? 'active' : ''}`} onClick={() => scrollToSection('local-audio')}>
                <span><i className="fa-solid fa-computer" /> Local Audio</span><small>{localAudioSongs.length}</small>
              </button>
            )}
            <button className={`library-nav-item ${activeLibrarySection === 'recent' ? 'active' : ''}`} onClick={() => scrollToSection('recent')}>
              <span><i className="fa-solid fa-clock-rotate-left" /> Recently Played</span><small>{dedupeRecent(history).length}</small>
            </button>
            <button className={`library-nav-item ${activeLibrarySection === 'favs' ? 'active' : ''}`} onClick={() => scrollToSection('favs')}>
              <span><i className="fa-solid fa-heart" /> Favorites</span><small>{favSongs.length}</small>
            </button>
            {sessions.length > 0 && (
              <button className={`library-nav-item ${activeLibrarySection.startsWith('session-') ? 'active' : ''}`} onClick={() => scrollToSection('session-0')}>
                <span><i className="fa-solid fa-clock" /> Previous Sessions</span><small>{sessions.length}</small>
              </button>
            )}
            <div className="library-playlist-heading">
              <span>Playlists</span>
              <button onClick={() => setCreatingPlaylist(true)} title="Create playlist" aria-label="Create playlist"><i className="fa-solid fa-plus" /></button>
            </div>
            {playlists.length ? playlists.map(playlist => (
              <button key={playlist.id} className={`library-nav-item library-playlist-item ${activeLibrarySection === `playlist-${playlist.id}` ? 'active' : ''}`} onClick={() => scrollToSection(`playlist-${playlist.id}`)}>
                <span><i className="fa-solid fa-list-music" /> {playlist.name}</span><small>{playlist.song_ids.length}</small>
              </button>
            )) : <p className="library-empty">No playlists yet</p>}
            {uploads.length > 0 && (
              <ul className="upload-status-list library-upload-status">
                {uploads.map(upload => (
                  <li key={upload.id} className={upload.status} title={upload.error || upload.name}>
                    <span className="upload-name">{upload.name}</span>
                    <span className="upload-icon">
                      {upload.status === 'analyzing' && <i className="fa-solid fa-spinner fa-spin" />}
                      {upload.status === 'done' && <i className="fa-solid fa-circle-check" style={{ color: '#4CAF50' }} />}
                      {upload.status === 'error' && <i className="fa-solid fa-circle-xmark" style={{ color: '#ff4d6d' }} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT MAIN CONTENT */}
        <div className="main-right-part" ref={mainContentRef}>
          <section className="welcome-hero">
            <div className="welcome-copy">
              <span className="eyebrow"><span className="status-dot" /> YOUR PERSONAL SOUNDTRACK</span>
              <h1>Find your <span>RiVibe.</span></h1>
              <p>Music for every mood, every moment, and everything in between.</p>
              <button className="hero-cta" onClick={scrollToAllSongs}>
                Explore your music <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="welcome-orbit welcome-orbit-one" />
              <div className="welcome-orbit welcome-orbit-two" />
              <img src="/rivibe-logo.png" alt="" />
            </div>
          </section>

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

              {orderedLibrarySections.map(section => renderSection(
                section.key,
                section.title,
                section.items,
                section.emoji,
                section.empty,
                section.mode || 'add',
                section.playlist || null,
              ))}

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
              {playerError && <small className="playback-error">{playerError}</small>}
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
