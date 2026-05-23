import '../styles/Home.css'
import { useHome } from '../context/HomeContext'

export default function Home() {
  const { homes, selectedHome, setSelectedHome, loading } = useHome()

  if (loading) return <div className="content-padding"><p>Loading...</p></div>

  return (
    <div className="content-padding">
      <div className="home-page-container">
        <h1 className="home-page-title">My Homes</h1>
        <p className="home-page-subtitle">Select a home to manage</p>
      </div>

      <div className="homes-list">
        {homes.map(home => (
          <div
            key={home.id}
            className={`home-card ${selectedHome?.id === home.id ? 'selected' : ''}`}
            onClick={() => setSelectedHome(home)}
          >
            <div className="home-card-left">
              <div className="home-card-status-dot"
                style={{ backgroundColor: home.status === 'online' ? 'var(--status-online)' : 'var(--status-offline)' }}
              />
              <div>
                <div className="home-card-name">{home.name || home.id}</div>
                <div className="home-card-id">{home.id}</div>
              </div>
            </div>
            <div className="home-card-right">
              <span className={`home-card-badge ${home.status === 'online' ? 'online' : 'offline'}`}>
                {home.status === 'online' ? 'Online' : 'Offline'}
              </span>
              {home.last_seen && (
                <span className="home-card-last-seen">
                  Last seen {new Date(home.last_seen).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
