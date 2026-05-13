import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="navbar-profile" ref={dropdownRef}>
      <button 
        className={`profile-button ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="profile-icon">👤</span>
        <span>Profile</span>
      </button>
      
      <div className={`dropdown-menu ${isOpen ? '' : 'hidden'}`}>
        <Link to="/login" className="dropdown-link" onClick={() => setIsOpen(false)}>
          🔑 Login
        </Link>
        <Link to="/register" className="dropdown-link" onClick={() => setIsOpen(false)}>
          ✍️ Register
        </Link>
        <Link to="/profile" className="dropdown-link" onClick={() => setIsOpen(false)}>
          ⚙️ Settings
        </Link>
      </div>
    </div>
  );
}
