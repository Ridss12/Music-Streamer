import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/auth.css'
import { useServer } from '../ServerContext.jsx'

export default function ForgotPassword() {
  const { API_BASE } = useServer()

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.classList.add('auth-body')

    return () => document.body.classList.remove('auth-body')
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `${API_BASE}/auth/forgot-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email
          })
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(
          data.detail || 'Unable to send password reset OTP.'
        )
        return
      }

      setSent(true)

    } catch {
      setError(
        'Server error. Please make sure the backend is running.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="forgot-container">
      <div className="forgot-box">
        <h2>Forgot Password?</h2>

        <p>
          Enter your registered email address and we'll send
          you a 6-digit password reset OTP.
        </p>

        {sent ? (
          <div>
            <p
              style={{
                color: '#6EE7FF',
                marginBottom: '20px'
              }}
            >
              A 6-digit OTP has been sent to {email}.
              The OTP will expire in 5 minutes.
            </p>

            <Link to="/reset-password">
              <button type="button">
                Enter OTP
              </button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="input-box">
              <input
                type="email"
                placeholder="Enter your Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && (
              <p
                style={{
                  color: '#ff6b6b',
                  marginBottom: '15px'
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        )}

        <div className="back-login">
          <Link to="/login">
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}