import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import '../styles/auth.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  useEffect(() => {
    document.body.classList.add('auth-body')
    return () => document.body.classList.remove('auth-body')
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Please fill in both fields.')
      return
    }

    setLoading(true)

    // FastAPI OAuth2 expects "username" field (we send email)
    const result = await login(email, password)

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (remember) {
      // Token is already persisted; note it for future enhancement
    }
    navigate('/')
  }

  return (
    <div className="log">
      <div className="log_box">
        <h1>Welcome to login page</h1>
        <p>Login to continue</p>

        <form onSubmit={handleSubmit}>
          <div className="input-box">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-box">
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="options">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>

            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          <button type="submit">login</button>

          <div className="signup-link">
            Don't have account?
            <Link to="/register"> Sign-up</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
