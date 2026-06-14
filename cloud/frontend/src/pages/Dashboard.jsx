import { useEffect, useState, useCallback } from 'react'
import '../styles/Dashboard.css'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { useHome } from '../context/HomeContext'
import { usePageTitle } from '../hooks/usePageTitle'
import NoHomeSelected from '../components/NoHomeSelected'
import DeviceCard from '../components/DeviceCard'
import { usePolling } from '../hooks/usePolling'
import { inferDeviceName } from '../utils/deviceUtils'

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400 * 1000).toISOString()

export default function Dashboard() {
  usePageTitle('Dashboard')
  const { selectedHome } = useHome()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [anomalyByDevice, setAnomalyByDevice] = useState({})
  const [anomalyByEntity, setAnomalyByEntity] = useState({})
  const [onlineCollapsed,  setOnlineCollapsed]  = useState(false)
  const [offlineCollapsed, setOfflineCollapsed] = useState(false)

  const fetchDevices = useCallback(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      .then(r => r.json())
      .then(data => { setDevices(data.sort((a, b) => a.device_id.localeCompare(b.device_id))); setError(null) })
      .catch(() => setError('Failed to load devices'))
      .finally(() => setLoading(false))
  }, [selectedHome])

  const fetchAnomalies = useCallback(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/anomalies?from=${WEEK_AGO()}&limit=500`)
      .then(r => r.json())
      .then(rows => {
        const byDevice = {}, byEntity = {}
        rows.forEach(r => {
          const sev = r.severity === 'critical' ? 'critical' : 'warning'
          if (!byDevice[r.device_id]) byDevice[r.device_id] = { critical: 0, warning: 0 }
          byDevice[r.device_id][sev]++
          if (!byEntity[r.entity_id]) byEntity[r.entity_id] = { critical: 0, warning: 0 }
          byEntity[r.entity_id][sev]++
        })
        setAnomalyByDevice(byDevice)
        setAnomalyByEntity(byEntity)
      })
      .catch(() => {})
  }, [selectedHome])

  useEffect(() => {
    if (selectedHome) { setLoading(true); setSearch('') }
  }, [selectedHome])

  usePolling(selectedHome ? fetchDevices : null, 15000, [selectedHome])
  usePolling(selectedHome ? fetchAnomalies : null, 60000, [selectedHome])

  const q = search.trim().toLowerCase()
  const visibleDevices = q
    ? devices.filter(d => inferDeviceName(d.entities).toLowerCase().includes(q))
    : devices
  const onlineDevices  = visibleDevices.filter(d => d.available)
  const offlineDevices = visibleDevices.filter(d => !d.available)

    if (!selectedHome) return <NoHomeSelected />
  if (loading && !devices.length) return <div className="content-padding"><p>Loading...</p></div>
  if (error && !devices.length) return <div className="content-padding"><p className="dashboard-error">{error}</p></div>

  return (
    <div className="content-padding">
      <div className="dashboard-container">
        <div className="dashboard-header-row">
          <div>
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="dashboard-subtitle">Monitor and control your smart home devices</p>
            {devices.length > 0 && (
              <p className="page-stats">
                {devices.length} device{devices.length !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;
                <span style={{ color: 'var(--status-online)' }}>{devices.filter(d => d.available).length} online</span>
                {devices.filter(d => !d.available).length > 0 && (
                  <>&nbsp;&middot;&nbsp;<span style={{ color: 'var(--status-offline)' }}>{devices.filter(d => !d.available).length} offline</span></>
                )}
              </p>
            )}
          </div>
          <div className="dashboard-search-wrap">
            <input
              className="dashboard-search-input"
              type="text"
              placeholder="Search device…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="dashboard-search-clear" onClick={() => setSearch('')}>×</button>
            )}
          </div>
        </div>
        {search && (
          <p className="dashboard-search-info">
            {visibleDevices.length === 0
              ? 'No devices match your search.'
              : `Showing ${visibleDevices.length} of ${devices.length} device${devices.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <div className="dashboard-devices">
        {q ? (
          visibleDevices.map(device => (
            <DeviceCard
              key={device.device_id}
              device={device}
              homeId={selectedHome.id}
              deviceAnomalies={anomalyByDevice[device.device_id]}
              entityAnomalies={anomalyByEntity}
            />
          ))
        ) : (
          <>
            {onlineDevices.length > 0 && (
              <div className="dashboard-section">
                <button className="dashboard-section-toggle" onClick={() => setOnlineCollapsed(p => !p)}>
                  <span className="dashboard-section-title online">Online <span className="dashboard-section-count">({onlineDevices.length})</span></span>
                  <span className="dashboard-section-chevron">{onlineCollapsed ? '▶' : '▼'}</span>
                </button>
                {!onlineCollapsed && onlineDevices.map(device => (
                  <DeviceCard
                    key={device.device_id}
                    device={device}
                    homeId={selectedHome.id}
                    deviceAnomalies={anomalyByDevice[device.device_id]}
                    entityAnomalies={anomalyByEntity}
                  />
                ))}
              </div>
            )}
            {offlineDevices.length > 0 && (
              <div className="dashboard-section">
                <button className="dashboard-section-toggle" onClick={() => setOfflineCollapsed(p => !p)}>
                  <span className="dashboard-section-title offline">Offline <span className="dashboard-section-count">({offlineDevices.length})</span></span>
                  <span className="dashboard-section-chevron">{offlineCollapsed ? '▶' : '▼'}</span>
                </button>
                {!offlineCollapsed && offlineDevices.map(device => (
                  <DeviceCard
                    key={device.device_id}
                    device={device}
                    homeId={selectedHome.id}
                    deviceAnomalies={anomalyByDevice[device.device_id]}
                    entityAnomalies={anomalyByEntity}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
