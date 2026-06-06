import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import '../styles/Devices.css'
import '../styles/Anomalies.css'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import { usePolling } from '../hooks/usePolling'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import { getRecommendations, getRoiMessage, ENERGY_CLASS_TYPES, ENERGY_CLASSES } from '../utils/recommendations'
import { APPLIANCE_TYPES } from '../utils/deviceTypes'

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400 * 1000).toISOString()

export default function Devices() {
  const { selectedHome } = useHome()
  const [devices, setDevices]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [switchStates, setSwitchStates] = useState({})
  const [switchLoading, setSwitchLoading] = useState({})
  const [savedFeedback, setSavedFeedback] = useState({})
  const [expanded, setExpanded]         = useState({})
  const [tariff, setTariff]             = useState(null)
  const [anomalyDevices, setAnomalyDevices] = useState({})
  const saveTimers = useRef({})

  useEffect(() => {
    return () => { Object.values(saveTimers.current).forEach(clearTimeout) }
  }, [])

  useEffect(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/config`)
      .then(r => r.json())
      .then(setTariff)
      .catch(() => setTariff(null))
  }, [selectedHome])

  useEffect(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/anomalies?from=${WEEK_AGO()}&limit=500`)
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows)) return
        const map = {}
        rows.forEach(r => {
          if (!r.device_id) return
          if (!map[r.device_id]) map[r.device_id] = { critical: 0, warning: 0 }
          map[r.device_id][r.severity] = (map[r.device_id][r.severity] || 0) + 1
        })
        setAnomalyDevices(map)
      })
      .catch(() => {})
  }, [selectedHome])

  const toggleExpanded = (deviceId, section) => {
    const key = `${deviceId}_${section}`
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const fetchDevices = useCallback(async () => {
    if (!selectedHome) return
    try {
      const res  = await apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      const data = await res.json()
      setDevices(data.sort((a, b) => a.device_id.localeCompare(b.device_id)))
      const states = {}
      data.forEach(device =>
        device.entities
          .filter(e => e.domain === 'switch')
          .forEach(e => { states[e.entity_id] = e.state === 'on' })
      )
      setSwitchStates(states)
      setError(null)
    } catch {
      setError('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }, [selectedHome])

  useEffect(() => {
    if (selectedHome) setLoading(true)
  }, [selectedHome])

  usePolling(selectedHome ? fetchDevices : null, 15000, [selectedHome])

  const handleMetadataChange = async (deviceId, field, value) => {
    setDevices(prev => prev.map(d =>
      d.device_id === deviceId ? { ...d, [field]: value || null } : d
    ))
    const device = devices.find(d => d.device_id === deviceId)
    const patch = {
      appliance_type: field === 'appliance_type' ? value || null : device?.appliance_type ?? null,
      energy_class:   field === 'energy_class'   ? value || null : device?.energy_class   ?? null,
    }
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/devices/${deviceId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setSavedFeedback(prev => ({ ...prev, [deviceId]: true }))
      clearTimeout(saveTimers.current[deviceId])
      saveTimers.current[deviceId] = setTimeout(
        () => setSavedFeedback(prev => ({ ...prev, [deviceId]: false })),
        2000
      )
    } catch { /* silent — optimistic update already applied */ }
  }

  const handleRefresh = async () => {
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/devices/refresh`, { method: 'POST' })
      setTimeout(fetchDevices, 2000)
    } catch { /* silent */ }
  }

  const handleToggle = async (entityId, currentOn) => {
    const action = currentOn ? 'off' : 'on'
    setSwitchStates(prev => ({ ...prev, [entityId]: !currentOn }))
    setSwitchLoading(prev => ({ ...prev, [entityId]: true }))
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${entityId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    } catch {
      setSwitchStates(prev => ({ ...prev, [entityId]: currentOn }))
    } finally {
      setSwitchLoading(prev => ({ ...prev, [entityId]: false }))
    }
  }

    if (!selectedHome) return <NoHomeSelected />
  if (loading && !devices.length) return <div className="content-padding"><p>Loading...</p></div>
  if (error   && !devices.length) return <div className="content-padding"><p className="devices-error">{error}</p></div>

  return (
    <div className="content-padding">
      <div className="devices-container">
        <div className="devices-header">
          <div>
            <h1 className="devices-title">Devices</h1>
            <p className="devices-subtitle">Manage your connected devices</p>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>Sync from HA</button>
        </div>
      </div>

      <div className="devices-list">
        {devices.map(device => {
          const statusColor = device.available ? 'var(--status-online)' : 'var(--status-offline)'
          const lastSeen    = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'
          const deviceName  = inferDeviceName(device.entities)
          const anomalies   = anomalyDevices[device.device_id]

          return (
            <div key={device.device_id} className="device-list-card">
              <div className="device-list-header">
                <h2 className="device-list-name">{deviceName}</h2>
                <div className="device-list-right">
                  {anomalies?.critical > 0 && (
                    <span className="anomaly-badge critical" title={`${anomalies.critical} critical anomal${anomalies.critical === 1 ? 'y' : 'ies'} in the last 7 days`}>
                      {anomalies.critical} critical
                    </span>
                  )}
                  {anomalies?.warning > 0 && (
                    <span className="anomaly-badge warning" title={`${anomalies.warning} warning${anomalies.warning === 1 ? '' : 's'} in the last 7 days`}>
                      {anomalies.warning} warning
                    </span>
                  )}
                  <div className="device-list-status">
                    <span className="status-dot" style={{ backgroundColor: statusColor }} />
                    <span>{device.available ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>

              <div className="device-list-source">
                <div><strong>Last seen:</strong> {lastSeen}</div>
              </div>

              <div className="device-list-attributes">
                <h3>Entities</h3>
                <div className="attributes-container">
                  {device.entities.map(entity => (
                    <div key={entity.entity_id} className="attribute-row">
                      <div className="attribute-info">
                        <span className="attribute-name">
                          {shortLabel(entity.friendly_name, deviceName) || entity.entity_id}
                        </span>
                        {entity.domain !== 'switch' && (
                          <span className="attribute-ha-id">
                            {entity.state}{entity.unit ? ` ${entity.unit}` : ''}
                          </span>
                        )}
                      </div>

                      {entity.domain === 'switch' ? (
                        <div className="switch-control">
                          <span className="switch-label">{switchStates[entity.entity_id] ? 'ON' : 'OFF'}</span>
                          <label className={`toggle-switch ${switchLoading[entity.entity_id] ? 'toggle-loading' : ''}`}>
                            <input
                              type="checkbox"
                              checked={switchStates[entity.entity_id] || false}
                              onChange={() => handleToggle(entity.entity_id, switchStates[entity.entity_id])}
                              disabled={switchLoading[entity.entity_id]}
                            />
                            <span className="toggle-slider" />
                          </label>
                        </div>
                      ) : (
                        <span className="entity-id-label">{entity.entity_id}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="device-classification">
                <div className="device-classification-row">
                  <div className="device-classification-field">
                    <label className="classification-label">Device type</label>
                    <select
                      className="classification-select"
                      value={device.appliance_type || ''}
                      onChange={e => handleMetadataChange(device.device_id, 'appliance_type', e.target.value)}
                    >
                      {APPLIANCE_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {ENERGY_CLASS_TYPES.has(device.appliance_type) && (
                    <div className="device-classification-field">
                      <label className="classification-label">
                        Energy class
                        <span className="energy-class-hint" title="New EU scale (from 2021). Approximate conversion from old scale: A+++ = A, A++ = B, A+ = C/D, A = D/E, B = E/F, C = F/G">ⓘ</span>
                      </label>
                      <select
                        className="classification-select energy-class-select"
                        value={device.energy_class || ''}
                        onChange={e => handleMetadataChange(device.device_id, 'energy_class', e.target.value)}
                      >
                        <option value="">—</option>
                        {ENERGY_CLASSES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {savedFeedback[device.device_id] && (
                    <span className="classification-saved">Saved ✓</span>
                  )}
                </div>
              </div>

              {!device.appliance_type ? (
                <div className="rec-unclassified">
                  Classify this device above to receive personalised energy and health recommendations.
                </div>
              ) : (
                <div className="device-recommendations">
                  {(() => {
                    const rec = getRecommendations(device.appliance_type, tariff)
                    if (!rec) return null
                    return (
                      <>
                        {rec.energy && (
                          <div className="rec-section">
                            <button className="rec-toggle" onClick={() => toggleExpanded(device.device_id, 'energy')}>
                              <span>Energy savings</span>
                              <span className="rec-chevron">{expanded[`${device.device_id}_energy`] ? '▲' : '▼'}</span>
                            </button>
                            {expanded[`${device.device_id}_energy`] && (
                              <div className="rec-body">
                                <p className="rec-title">{rec.energy.title}</p>
                                <p className="rec-text">{rec.energy.body}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {rec.health && (
                          <div className="rec-section">
                            <button className="rec-toggle" onClick={() => toggleExpanded(device.device_id, 'health')}>
                              <span>Health &amp; comfort</span>
                              <span className="rec-chevron">{expanded[`${device.device_id}_health`] ? '▲' : '▼'}</span>
                            </button>
                            {expanded[`${device.device_id}_health`] && (
                              <div className="rec-body">
                                <p className="rec-title">{rec.health.title}</p>
                                <p className="rec-text">{rec.health.body}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {ENERGY_CLASS_TYPES.has(device.appliance_type) && (
                          <div className="rec-section">
                            <button className="rec-toggle" onClick={() => toggleExpanded(device.device_id, 'roi')}>
                              <span>ROI analysis</span>
                              <span className="rec-chevron">{expanded[`${device.device_id}_roi`] ? '▲' : '▼'}</span>
                            </button>
                            {expanded[`${device.device_id}_roi`] && (
                              <div className="rec-body">
                                {!device.energy_class ? (
                                  <p className="rec-text">Set the energy class for this device in the fields above to enable ROI analysis.</p>
                                ) : device.energy_class === 'A' ? (
                                  <p className="rec-text">This appliance is rated class A — the most efficient category. No efficiency upgrade is available.</p>
                                ) : (() => {
                                  const roi = getRoiMessage(device.energy_class)
                                  return roi ? (
                                    <>
                                      <p className="rec-title">{roi.title}</p>
                                      <p className="rec-text">{roi.body}</p>
                                      <Link className="rec-roi-link" to={`/roi?device=${device.device_id}`}>
                                        Open ROI Calculator →
                                      </Link>
                                    </>
                                  ) : null
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
