import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../styles/auth.css'
import { useServer } from '../ServerContext.jsx'

export default function ResetPassword() {
  const { API_BASE } = useServer()

  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    document.body.classList.add('auth-body')

    return () => document.body.classList.remove('auth-body')
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    setError('')
    setSuccess('')

    if (!/^\d{6}$/.test(otp)) {
      setError('Please enter the 6-digit OTP.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${API_BASE}/auth/reset-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reset_token: otp,
            new_password: password
          })
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(
          data.detail || 'Unable to reset password.'
        )
        return
      }

      setSuccess('Password reset successfully. Redirecting to login...')

      setTimeout(() => {
        navigate('/login')
      }, 1500)

    } catch {
      setError(
        'Server error. Please make sure the backend is running.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="reset-container">
      <div className="reset-box">
        <h2>Reset Password</h2>

        <p>
          Enter the 6-digit OTP sent to your email and
          create a new password.
        </p>

        <form onSubmit={handleSubmit}>

          <div className="input-box">
            <input
              type="text"
              inputMode="numeric"
              maxLength="6"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) =>
                setOtp(
                  e.target.value.replace(/\D/g, '')
                )
              }
              required
            />
          </div>

          <div className="input-box">
            <input
              type="password"
              placeholder="New Password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              required
            />
          </div>

          <div className="input-box">
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              required
            />
          </div>

          {error && (
            <p className="error-text">
              {error}
            </p>
          )}

          {success && (
            <p
              style={{
                color: '#6EE7FF',
                marginBottom: '15px'
              }}
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>

          <div className="back-login">
            <Link to="/login">
              ← Back to Login
            </Link>
          </div>

        </form>
      </div>
    </div>
  )
}