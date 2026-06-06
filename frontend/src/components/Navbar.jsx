import { useState, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ProfileDropdown from './ProfileDropdown'
import { useHome } from '../context/HomeContext'
import { useClickOutside } from '../hooks/useClickOutside'
import '../styles/Navbar.css'

const NAV_ITEMS = [
  { path: '/',            label: 'Home'        },
  { path: '/dashboard',   label: 'Dashboard'   },
  { path: '/devices',     label: 'Devices'     },
  { path: '/automations', label: 'Automations' },
  { path: '/statistics',  label: 'Statistics'  },
  { path: '/diagnostics', label: 'Diagnostics' },
  { path: '/roi',         label: 'ROI'         },
]

const statusColor = (home) =>
  home?.status === 'online' ? 'var(--status-online)' : 'var(--status-offline)'

export default function Navbar() {
  const location = useLocation()
  const { homes, selectedHome, setSelectedHome } = useHome()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, () => setOpen(false))

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <svg className="navbar-logo-icon" viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true">
          <path d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z" />
        </svg>
        <span>GreenNest</span>
      </Link>

      <div className="navbar-links">
        {NAV_ITEMS.map(({ path, label }) => (
          <Link
            key={path}
            to={path}
            className={`nav-link ${location.pathname === path ? 'active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {homes.length > 0 && (
        <div className="home-selector" ref={ref}>
          <button
            className={`home-selector-btn ${open ? 'open' : ''}`}
            onClick={() => setOpen(prev => !prev)}
          >
            <span className="home-selector-dot" style={{ backgroundColor: statusColor(selectedHome) }} />
            <span className="home-selector-name">{selectedHome?.name || selectedHome?.id}</span>
          </button>

          {open && (
            <div className="home-selector-dropdown">
              {homes.map(h => (
                <button
                  key={h.id}
                  className={`home-selector-option ${selectedHome?.id === h.id ? 'active' : ''}`}
                  onClick={() => { setSelectedHome(h); setOpen(false) }}
                >
                  <span className="home-selector-dot" style={{ backgroundColor: statusColor(h) }} />
                  <div className="home-option-text">
                    <span className="home-option-name">{h.name || h.id}</span>
                    <span className="home-option-status">{h.status === 'online' ? 'Online' : 'Offline'}</span>
                  </div>
                  {selectedHome?.id === h.id && <span className="home-option-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ProfileDropdown />
    </nav>
  )
}
