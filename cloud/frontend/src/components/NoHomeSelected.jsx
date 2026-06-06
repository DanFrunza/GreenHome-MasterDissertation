import { Link } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import '../styles/NoHomeSelected.css'

export default function NoHomeSelected() {
  const { homes, loading } = useHome()

  if (loading) return <div className="content-padding"><p>Loading…</p></div>

  return (
    <div className="content-padding">
      <div className="no-home-container">
        <svg className="no-home-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
        <h2 className="no-home-title">
          {homes.length === 0 ? 'No home enrolled yet' : 'No home selected'}
        </h2>
        <p className="no-home-desc">
          {homes.length === 0
            ? 'Enroll a home in Settings to start monitoring, or join an existing one to test with demo data.'
            : 'Select a home from the menu above to continue.'}
        </p>
        {homes.length === 0 && (
          <Link to="/settings" className="no-home-btn">Go to Settings</Link>
        )}
      </div>
    </div>
  )
}
