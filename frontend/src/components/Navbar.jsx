import { Link, useLocation } from 'react-router-dom';
import ProfileDropdown from './ProfileDropdown';
import '../styles/Navbar.css';

export default function Navbar() {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/devices', label: 'Devices', icon: '🔌' },
    { path: '/automations', label: 'Automations', icon: '⚙️' },
  ];

  return (
    <nav className="navbar">
      {/* Logo Section */}
      <Link to="/" className="navbar-logo">
        <span className="navbar-logo-icon">⚡</span>
        <span>HEMS Demo</span>
      </Link>

      {/* Main Navigation Links */}
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

      {/* Profile Dropdown */}
      <ProfileDropdown />
    </nav>
  );
}

