import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useServer } from '../ServerContext.jsx'
import '../styles/auth.css'

export default function Register() {
  const { API_BASE } = useServer()
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreed: false,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    document.body.classList.add('auth-body')
    return () => document.body.classList.remove('auth-body')
  }, [])

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!form.agreed) {
      setError('You must agree to the Terms & Conditions.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.fullName,
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Registration failed')
        return
      }

      navigate('/login')
    } catch (err) {
      setError('Server error. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signup-container">
      <div className="signup-box">
        <h1>Create Account</h1>
        <p>Sign up to start listening</p>

        <form onSubmit={handleSubmit}>
          <div className="input-box">
            <input type="text" placeholder="Full Name" value={form.fullName} onChange={handleChange('fullName')} required />
          </div>

          <div className="input-box">
            <input type="text" placeholder="Username" value={form.username} onChange={handleChange('username')} required />
          </div>

          <div className="input-box">
            <input type="email" placeholder="Email Address" value={form.email} onChange={handleChange('email')} required />
          </div>

          <div className="input-box">
            <input type="password" placeholder="Password" value={form.password} onChange={handleChange('password')} required />
          </div>

          <div className="input-box">
            <input
              type="password"
              placeholder="Confirm Password"
              value={form.confirmPassword}
              onChange={handleChange('confirmPassword')}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="terms">
            <label>
              <input type="checkbox" checked={form.agreed} onChange={handleChange('agreed')} required />
              I agree to the Terms & Conditions
            </label>
          </div>

          <button type="submit">Create Account</button>

          <div className="login-link">
            Already have an account?
            <Link to="/login"> Login</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
