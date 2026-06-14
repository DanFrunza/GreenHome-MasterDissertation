import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark',  label: 'Dark' },
]

export default function ProfileDropdown() {
  const { user, logout, updateUser } = useUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, () => setOpen(false))

  if (!user) return null

  const displayName = user.display_name || user.username || user.email
  const initials    = displayName.slice(0, 2).toUpperCase()
  const currentTheme = user.theme || 'light'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleTheme = async (theme) => {
    if (theme === currentTheme) return
    try {
      const res = await apiFetch(`${API_URL}/auth/me`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ theme }),
      })
      if (res.ok) {
        const data = await res.json()
        updateUser({ theme: data.theme })
      }
    } catch { /* silent */ }
  }

  return (
    <div className="navbar-profile" ref={ref}>
      <button
        className={`profile-button ${open ? 'open' : ''}`}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="profile-avatar">{initials}</span>
        <span className="profile-name">{displayName}</span>
      </button>

      {open && (
        <div className="dropdown-menu">
          <div className="dropdown-user-info">
            <span className="dropdown-user-name">{displayName}</span>
            <span className="dropdown-user-email">@{user.username} · {user.email}</span>
          </div>

          <div className="dropdown-divider" />

          <div className="dropdown-section-label">Theme</div>
          <div className="dropdown-theme-row">
            {THEMES.map(t => (
              <button
                key={t.value}
                className={`dropdown-theme-btn ${currentTheme === t.value ? 'active' : ''}`}
                onClick={() => handleTheme(t.value)}
                title={t.label}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="dropdown-divider" />

          <Link to="/settings" className="dropdown-link" onClick={() => setOpen(false)}>
            Settings
          </Link>

          <div className="dropdown-divider" />

          <button className="dropdown-link dropdown-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
