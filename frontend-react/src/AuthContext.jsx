import { createContext, useContext, useState, useEffect } from 'react'
import { useServer } from './ServerContext.jsx'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const { API_BASE } = useServer()

  const [token, setToken] = useState(
    () => localStorage.getItem('music_auth_token') || ''
  )

  const [refreshToken, setRefreshToken] = useState(
    () => localStorage.getItem('music_refresh_token') || ''
  )

  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (!res.ok) {
          throw new Error('Unauthorized')
        }

        const data = await res.json()

        if (cancelled) return

        setUser({
          email: data.email
        })

        // Optional profile information
        try {
          const profileRes = await fetch(
            `${API_BASE}/settings/profile`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )

          if (profileRes.ok) {
            const profile = await profileRes.json()

            if (!cancelled) {
              setUser({
                email: profile.email,
                name: profile.name,
                username: profile.username
              })
            }
          }
        } catch {
          // Profile information is optional
        }

      } catch {
        if (!cancelled) {
          localStorage.removeItem('music_auth_token')
          localStorage.removeItem('music_refresh_token')

          setToken('')
          setRefreshToken('')
          setUser(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, API_BASE])


  async function login(email, password) {
    const formData = new FormData()

    formData.append('username', email)
    formData.append('password', password)

    let res

    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(5000)
      })
    } catch {
      return {
        ok: false,
        error: 'Server error. Is the backend running?'
      }
    }

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return {
        ok: false,
        error: data.detail || `Login failed (${res.status})`
      }
    }

    localStorage.setItem(
      'music_auth_token',
      data.access_token
    )

    localStorage.setItem(
      'music_refresh_token',
      data.refresh_token
    )

    setToken(data.access_token)
    setRefreshToken(data.refresh_token)

    return {
      ok: true
    }
  }


  async function refreshAccessToken() {
    if (!refreshToken) {
      return false
    }

    try {
      const res = await fetch(
        `${API_BASE}/auth/refresh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            refresh_token: refreshToken
          })
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        return false
      }

      localStorage.setItem(
        'music_auth_token',
        data.access_token
      )

      setToken(data.access_token)

      return true

    } catch {
      return false
    }
  }


  async function logout() {
    try {
      if (refreshToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            refresh_token: refreshToken
          })
        })
      }
    } catch {
      // Continue local logout even if server request fails
    }

    localStorage.removeItem('music_auth_token')
    localStorage.removeItem('music_refresh_token')

    setToken('')
    setRefreshToken('')
    setUser(null)
  }


  return (
    <AuthContext.Provider
      value={{
        token,
        refreshToken,
        user,
        login,
        logout,
        refreshAccessToken
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  return useContext(AuthContext)
}