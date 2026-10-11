const STORAGE_KEY = 'rivibeUnavailableSongIds'

export function getUnavailableSongIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(ids) ? ids.map(String) : [])
  } catch {
    return new Set()
  }
}

export function hideUnavailableSong(songId) {
  if (songId === null || songId === undefined) return
  const ids = getUnavailableSongIds()
  ids.add(String(songId))
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

export function filterUnavailableSongs(songs) {
  const unavailableIds = getUnavailableSongIds()
  return (Array.isArray(songs) ? songs : [])
    .filter(song => song && !unavailableIds.has(String(song.id)))
}
