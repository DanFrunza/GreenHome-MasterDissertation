import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useClickOutside } from '../hooks/useClickOutside'

export default function ProfileDropdown() {
  const { user, logout } = useUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, () => setOpen(false))

  if (!user) return null

  const displayName = user.display_name || user.username || user.email
  const initials    = displayName.slice(0, 2).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
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
