import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import '../styles/Home.css'
import '../styles/Anomalies.css'
import { useHome } from '../context/HomeContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { useUser } from '../context/UserContext'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { getAllTips } from '../utils/recommendations'
import { inferDeviceName } from '../utils/deviceUtils'
import { formatSensorValue } from '../utils/formatValue'
import { useDismissedAnomalies } from '../hooks/useDismissedAnomalies'
import { useConfig } from '../hooks/useConfig'

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400 * 1000).toISOString()
const TIP_INTERVAL = 9000

function AnomaliesCard({ homeId }) {
  const [anomalies, setAnomalies]       = useState(null)
  const [loading, setLoading]           = useState(true)
  const [expandedDays, setExpandedDays] = useState({})
  const { dismissed, dismiss } = useDismissedAnomalies(homeId)

  useEffect(() => {
    if (!homeId) return
    setLoading(true)
    apiFetch(`${API_URL}/homes/${homeId}/anomalies?from=${WEEK_AGO()}&limit=100`)
      .then(r => r.json())
      .then(d => { setAnomalies(Array.isArray(d) ? d : []); setExpandedDays({}); setLoading(false) })
      .catch(() => { setAnomalies([]); setLoading(false) })
  }, [homeId])

  if (loading) return null

  const active = (anomalies || []).filter(a => !dismissed.has(a.id) && !a.anomaly_suppressed && !a.anomaly_muted)
  if (!active.length) return null

  const today     = new Date().toLocaleDateString()
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString()
  const dayLabel  = key =>
    key === today ? 'Today' : key === yesterday ? 'Yesterday'
    : new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const groups = {}
  active.forEach(a => {
    const key = new Date(a.detected_at).toLocaleDateString()
    ;(groups[key] ??= []).push(a)
  })
  const sortedKeys = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a))

  const totalCritical = active.filter(a => a.severity === 'critical').length
  const totalWarning  = active.filter(a => a.severity === 'warning').length

  return (
    <div className="anomalies-card">
      <div className="anomalies-card-header">
        <span className="anomalies-card-title">Anomalies — last 7 days</span>
        <div className="anomalies-summary-badges">
          {totalCritical > 0 && <span className="anomaly-badge critical">{totalCritical} critical</span>}
          {totalWarning  > 0 && <span className="anomaly-badge warning">{totalWarning} warning</span>}
        </div>
      </div>
      <div className="anomaly-day-groups">
        {sortedKeys.map(day => (
          <div key={day} className="anomaly-day-group">
            <button
              className="anomaly-day-header"
              onClick={() => setExpandedDays(p => ({ ...p, [day]: !p[day] }))}
            >
              <span className="anomaly-day-label">{dayLabel(day)}</span>
              <span className="anomaly-day-badges">
                {groups[day].filter(a => a.severity === 'critical').length > 0 && (
                  <span className="anomaly-badge critical">
                    {groups[day].filter(a => a.severity === 'critical').length} critical
                  </span>
                )}
                {groups[day].filter(a => a.severity === 'warning').length > 0 && (
                  <span className="anomaly-badge warning">
                    {groups[day].filter(a => a.severity === 'warning').length} warning
                  </span>
                )}
              </span>
              <span className="anomaly-day-chevron">{expandedDays[day] ? '▲' : '▼'}</span>
            </button>
            {expandedDays[day] && (
              <div className="anomaly-day-content">
                <div className="anomalies-list">
                  {groups[day].map(a => (
                    <div key={a.id} className="anomaly-row">
                      <div className={`anomaly-severity-dot ${a.severity}`} />
                      <div className="anomaly-row-main">
                        <span className="anomaly-entity-name">{a.friendly_name || a.entity_id}</span>
                        <span className="anomaly-row-baseline">
                          value {formatSensorValue(a.value, a.device_class)}{a.unit ? ` ${a.unit}` : ''} · z-score {parseFloat(a.z_score).toFixed(2)}
                        </span>
                        <span className="anomaly-row-actions">
                          <Link to={`/statistics?entity=${a.entity_id}`} className="anomaly-action-link" onClick={e => e.stopPropagation()}>Statistics</Link>
                          <span className="anomaly-action-sep">·</span>
                          <Link to={`/diagnostics?entity=${a.entity_id}`} className="anomaly-action-link" onClick={e => e.stopPropagation()}>Diagnostics</Link>
                        </span>
                      </div>
                      <span className="anomaly-row-time">{new Date(a.detected_at).toLocaleTimeString()}</span>
                      <button
                        className="anomaly-dismiss-btn"
                        onClick={e => { e.stopPropagation(); dismiss(a.id) }}
                        title="Dismiss"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TipsCard({ homeId }) {
  const [tips, setTips] = useState([])
  const [index, setIndex] = useState(0)
  const [hasUnclassified, setHasUnclassified] = useState(false)
  const timerRef = useRef(null)
  const { recommendations: recommendationsData } = useConfig()

  useEffect(() => {
    if (!homeId) return
    Promise.all([
      apiFetch(`${API_URL}/homes/${homeId}/devices`).then(r => r.json()),
      apiFetch(`${API_URL}/homes/${homeId}/config`).then(r => r.json()).catch(() => null),
    ]).then(([devices, tariff]) => {
      const mapped = devices.map(d => ({ ...d, name: inferDeviceName(d.entities) }))
      const generated = getAllTips(mapped, tariff, recommendationsData)
      setTips(generated)
      setIndex(0)
      setHasUnclassified(devices.length > 0 && generated.length === 0)
    }).catch(() => {})
  }, [homeId, recommendationsData])

  useEffect(() => {
    if (tips.length < 2) return
    timerRef.current = setInterval(() => setIndex(i => (i + 1) % tips.length), TIP_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [tips])

  const go = (dir) => {
    clearInterval(timerRef.current)
    setIndex(i => (i + dir + tips.length) % tips.length)
    timerRef.current = setInterval(() => setIndex(i => (i + 1) % tips.length), TIP_INTERVAL)
  }

  if (!tips.length) {
    if (!hasUnclassified) return null
    return (
      <div className="tips-card tips-card-classify">
        <div className="tips-classify-icon">💡</div>
        <p className="tips-classify-title">Unlock personalised recommendations</p>
        <p className="tips-classify-body">
          Classify your devices with an appliance type and energy class to receive energy-saving tips tailored to your home.
        </p>
        <a href="/devices" className="tips-classify-link">Go to Devices →</a>
      </div>
    )
  }
  const tip = tips[index]

  return (
    <div className="tips-card">
      <div className="tips-card-header">
        <div className="tips-meta">
          <span className="tips-device">{tip.deviceName}</span>
          <span className="tips-category">{tip.category}</span>
          {tip.impact && <span className={`tips-impact tips-impact-${tip.impact}`}>{tip.impact}</span>}
        </div>
        {tips.length > 1 && (
          <div className="tips-nav">
            <button className="tips-nav-btn" onClick={() => go(-1)}>&#8592;</button>
            <button className="tips-nav-btn" onClick={() => go(1)}>&#8594;</button>
          </div>
        )}
      </div>
      <p className="tips-title">{tip.title}</p>
      <p className="tips-body">{tip.body.split('\n\n')[0]}</p>
      {tips.length > 1 && (
        <div className="tips-dots">
          {tips.map((_, i) => (
            <span
              key={i}
              className={`tips-dot ${i === index ? 'active' : ''}`}
              onClick={() => { clearInterval(timerRef.current); setIndex(i) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  usePageTitle()
  const { user } = useUser()
  const { homes, selectedHome, setSelectedHome, loading } = useHome()
  const displayName = user?.display_name || user?.username || ''

  if (loading) return <div className="content-padding"><p>Loading…</p></div>

  return (
    <div className="content-padding">

      {/* Welcome */}
      <div className="home-welcome">
        <h1 className="home-welcome-title">
          Welcome{displayName ? `, ${displayName}` : ''}.
        </h1>
        <p className="home-welcome-sub">
          GreenNest monitors your home's energy consumption, detects anomalies, and gives you actionable insights to reduce costs and improve comfort.
        </p>
      </div>

      {/* Getting started — only shown when no homes enrolled yet */}
      {homes.length === 0 && (
        <div className="home-getting-started">
          <div className="home-gs-card">
            <div className="home-gs-icon home-gs-icon-demo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="home-gs-body">
              <p className="home-gs-title">Try the demo</p>
              <p className="home-gs-desc">
                Join <strong>home1</strong> in Settings to explore real energy data — charts, anomaly detection, predictions and more.
              </p>
              <Link to="/settings" className="home-gs-link">Open Settings →</Link>
            </div>
          </div>

          <div className="home-gs-card">
            <div className="home-gs-icon home-gs-icon-connect">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
                <path d="M9 21V12h6v9" />
              </svg>
            </div>
            <div className="home-gs-body">
              <p className="home-gs-title">Connect your real home</p>
              <ol className="home-gs-steps">
                <li>Create a home in Settings — you'll receive a unique home ID and MQTT credentials.</li>
                <li>
                  Install <strong>GreenNest Local Agent</strong> on your home server.{' '}
                  <span className="home-gs-badge">Coming soon</span>
                </li>
                <li>
                  Install <strong>GreenNest Local Broker</strong>.{' '}
                  <span className="home-gs-badge">Coming soon</span>
                </li>
                <li>Add the credentials to your config — tutorials coming soon.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Homes list */}
      {homes.length > 0 && (
        <>
          <div className="home-section-header">
            <h2 className="home-section-title" style={{ margin: 0 }}>Your homes</h2>
            <Link to="/settings" className="home-section-link">+ Add another home</Link>
          </div>
          <div className="homes-list">
            {homes.map(home => (
              <div
                key={home.id}
                className={`home-card ${selectedHome?.id === home.id ? 'selected' : ''}`}
                onClick={() => setSelectedHome(home)}
              >
                <div className="home-card-left">
                  <span className="home-card-dots">
                    <div
                      className="home-card-status-dot"
                      style={{ backgroundColor: home.status === 'online' ? 'var(--status-online)' : 'var(--status-offline)' }}
                    />
                    {home.agent_status === 'offline' && (
                      <span
                        className="agent-offline-icon"
                        title="Local agent offline — commands may not work"
                      />
                    )}
                  </span>
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
        </>
      )}

      {selectedHome && <AnomaliesCard homeId={selectedHome.id} />}
      {selectedHome && <TipsCard homeId={selectedHome.id} />}
    </div>
  )
}
