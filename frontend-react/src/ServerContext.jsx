import { createContext, useContext, useState, useEffect } from 'react'

// Server Context for shared API_BASE across all pages
export const ServerContext = createContext()

export function ServerProvider({ children }) {
  const [serverURL, setServerURL] = useState(() => {
    const saved = localStorage.getItem('MUSIC_SERVER_URL')
    if (saved) return saved
    // Auto-detect: same hostname as frontend or localhost
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8000'
      : `http://${window.location.hostname}:8000`
  })

  const [connected, setConnected] = useState(false)
  const [serverIP, setServerIP] = useState('')
  const [checking, setChecking] = useState(false)

  async function testConnection() {
    setChecking(true)
    try {
      const res = await fetch(`${serverURL}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        setConnected(true)
        // Get server IP info
        try {
          const info = await fetch(`${serverURL}/api/server-info`, { signal: AbortSignal.timeout(3000) })
          if (info.ok) {
            const data = await info.json()
            setServerIP(data.ip || '')
          }
        } catch (e) { }
      } else {
        setConnected(false)
      }
    } catch (e) {
      setConnected(false)
    } finally {
      setChecking(false)
    }
  }

  function updateServerURL(newURL) {
    localStorage.setItem('MUSIC_SERVER_URL', newURL)
    setServerURL(newURL)
  }

  // Test connection on mount and when serverURL changes
  useEffect(() => {
    testConnection()
  }, [serverURL])

  return (
    <ServerContext.Provider value={{
      API_BASE: serverURL,
      serverIP,
      connected,
      checking,
      updateServerURL,
      testConnection
    }}>
      {children}
    </ServerContext.Provider>
  )
}

export function useServer() {
  return useContext(ServerContext)
}