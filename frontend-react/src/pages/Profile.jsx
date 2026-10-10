import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../styles/auth.css'
import { useAuth } from '../AuthContext.jsx'

export default function Profile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    document.body.classList.add('auth-body')

    return () => document.body.classList.remove('auth-body')
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="forgot-container">
      <div className="forgot-box">

        <div
          style={{
            fontSize: '60px',
            marginBottom: '15px'
          }}
        >
          👤
        </div>

        <h2>Profile</h2>

        {user ? (
          <>
            <p>
              <strong>Name:</strong>{' '}
              {user.name || 'Not available'}
            </p>

            <p>
              <strong>Username:</strong>{' '}
              {user.username || 'Not available'}
            </p>

            <p>
              <strong>Email:</strong>{' '}
              {user.email}
            </p>

            <button
              type="button"
              onClick={handleLogout}
              style={{ marginTop: '20px' }}
            >
              Logout
            </button>

            <div className="back-login">
              <Link to="/">
                ← Back to Home
              </Link>
            </div>
          </>
        ) : (
          <>
            <p>You are not logged in.</p>

            <Link to="/login">
              <button type="button">
                Login
              </button>
            </Link>
          </>
        )}

      </div>
    </div>
  )
}