import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { API_URL } from '../config'
import { useUser } from '../context/UserContext'
import '../styles/Auth.css'

export default function Register() {
  const { user, login } = useUser()
  const navigate = useNavigate()

  const [username, setUsername]         = useState('')
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [displayName, setDisplayName]   = useState('')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res  = await fetch(`${API_URL}/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, email, password, display_name: displayName || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Registration failed'); return }
      login(data.token, data.user)
      navigate('/')
    } catch {
      setError('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/login" className="auth-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true">
            <path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z" />
          </svg>
          GreenNest
        </Link>

        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Start monitoring your home energy</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Username</label>
            <input
              className="auth-input"
              type="text"
              placeholder="johndoe"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Display name <span className="auth-optional">(optional)</span></label>
            <input
              className="auth-input"
              type="text"
              placeholder="John Doe"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              className={`auth-input ${error ? 'error' : ''}`}
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
