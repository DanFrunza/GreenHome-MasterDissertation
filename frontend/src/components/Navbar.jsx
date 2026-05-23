import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ProfileDropdown from './ProfileDropdown'
import { useHome } from '../context/HomeContext'
import '../styles/Navbar.css'

export default function Navbar() {
  const location = useLocation()
  const { homes, selectedHome, setSelectedHome } = useHome()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/devices', label: 'Devices', icon: '🔌' },
    { path: '/automations', label: 'Automations', icon: '⚙️' },
    { path: '/statistics',  label: 'Statistics',  icon: '📈' },
  ]

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (home) => {
    setSelectedHome(home)
    setDropdownOpen(false)
  }

  const isOnline = (h) => h.status === 'online'

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-logo">
        <span className="navbar-logo-icon">⚡</span>
        <span>HEMS Demo</span>
      </Link>

      <div className="navbar-links">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="nav-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      {homes.length > 0 && (
        <div className="home-selector" ref={dropdownRef}>
          <button
            className={`home-selector-btn ${dropdownOpen ? 'open' : ''}`}
            onClick={() => setDropdownOpen(prev => !prev)}
          >
            <span
              className="home-selector-dot"
              style={{ backgroundColor: isOnline(selectedHome) ? 'var(--status-online)' : 'var(--status-offline)' }}
            />
            <span className="home-selector-name">{selectedHome?.name || selectedHome?.id}</span>
          </button>

          {dropdownOpen && (
            <div className="home-selector-dropdown">
              {homes.map(h => (
                <button
                  key={h.id}
                  className={`home-selector-option ${selectedHome?.id === h.id ? 'active' : ''}`}
                  onClick={() => handleSelect(h)}
                >
                  <span
                    className="home-selector-dot"
                    style={{ backgroundColor: isOnline(h) ? 'var(--status-online)' : 'var(--status-offline)' }}
                  />
                  <div className="home-option-text">
                    <span className="home-option-name">{h.name || h.id}</span>
                    <span className="home-option-status">{isOnline(h) ? 'Online' : 'Offline'}</span>
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
