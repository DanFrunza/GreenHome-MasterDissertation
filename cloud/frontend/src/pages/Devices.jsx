import { useEffect, useState, useCallback } from 'react'
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
import { useConfig } from '../hooks/useConfig'
import { useToast } from '../context/ToastContext'
import { usePageTitle } from '../hooks/usePageTitle'

const WEEK_AGO = () => new Date(Date.now() - 7 * 86400 * 1000).toISOString()

function relativeTime(dateStr) {
  if (!dateStr) return 'N/A'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff <= 0) return 'just now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Devices() {
  usePageTitle('Devices')
  const { selectedHome } = useHome()
  const isOwner = selectedHome?.role === 'owner'
  const { toast } = useToast()
  const { deviceTypes: APPLIANCE_TYPES = [], recommendations: recommendationsData = null } = useConfig()
  const [devices, setDevices]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [switchStates, setSwitchStates] = useState({})
  const [switchLoading, setSwitchLoading] = useState({})
  const [expanded, setExpanded]         = useState({})
  const [tariff, setTariff]             = useState(null)
  const [anomalyDevices, setAnomalyDevices] = useState({})
  const [syncing, setSyncing] = useState(false)
  const [onlineCollapsed,   setOnlineCollapsed]   = useState(false)
  const [offlineCollapsed,  setOfflineCollapsed]  = useState(false)
  const [expandedEntities, setExpandedEntities]   = useState({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/config`)
      .then(r => r.json())
      .then(setTariff)
      .catch(() => setTariff(null))
  }, [selectedHome])

  const fetchAnomalies = useCallback(() => {
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

  usePolling(selectedHome ? fetchAnomalies : null, 60000, [selectedHome])

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
    if (selectedHome) {
      setLoading(true)
      setSearch('')
      setExpandedEntities({})
      setExpanded({})
      setOnlineCollapsed(false)
      setOfflineCollapsed(false)
    }
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
      toast.success('Device classification saved')
    } catch { /* silent — optimistic update already applied */ }
  }

  const handleRefresh = async () => {
    setSyncing(true)
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/devices/refresh`, { method: 'POST' })
      setTimeout(() => {
        fetchDevices()
        setSyncing(false)
        toast.success('Synced from Home Assistant')
      }, 2000)
    } catch {
      setSyncing(false)
      toast.error('Sync failed')
    }
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
      toast.error('Failed to toggle device')
    } finally {
      setSwitchLoading(prev => ({ ...prev, [entityId]: false }))
    }
  }

    if (!selectedHome) return <NoHomeSelected />
  if (loading && !devices.length) return <div className="content-padding"><p>Loading...</p></div>
  if (error   && !devices.length) return <div className="content-padding"><p className="devices-error">{error}</p></div>
  if (!loading && !devices.length) return (
    <div className="content-padding">
      <div className="devices-container">
        <div className="devices-header">
          <div>
            <h1 className="devices-title">Devices</h1>
            <p className="devices-subtitle">No devices found</p>
          </div>
          <button className="refresh-btn" onClick={handleRefresh} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync from HA'}
          </button>
        </div>
      </div>
      <p className="devices-empty-state">No devices have been synced yet. Click <strong>Sync from HA</strong> to import your devices from Home Assistant.</p>
    </div>
  )

  const allUnclassified  = devices.length > 0 && devices.every(d => !d.appliance_type)
  const q = search.trim().toLowerCase()
  const visibleDevices = q
    ? devices.filter(d => inferDeviceName(d.entities).toLowerCase().includes(q))
    : devices
  const onlineDevices  = visibleDevices.filter(d => d.available)
  const offlineDevices = visibleDevices.filter(d => !d.available)

  const renderDeviceCard = (device) => {
    const statusColor = device.available ? 'var(--status-online)' : 'var(--status-offline)'
    const lastSeen      = relativeTime(device.last_seen)
    const deviceName    = inferDeviceName(device.entities)
    const anomalies     = anomalyDevices[device.device_id]
    const applianceLabel = APPLIANCE_TYPES.find(t => t.value === device.appliance_type)?.label
    const availableCount = device.entities.filter(e => e.available).length
    const totalCount     = device.entities.length
    const allAvailable   = availableCount === totalCount
    const availDotColor  = allAvailable ? 'var(--status-online)' : availableCount === 0 ? 'var(--status-offline)' : '#f59e0b'

    return (
      <div key={device.device_id} className={`device-list-card ${device.available ? 'device-online' : 'device-offline'}`}>
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

              <div className="device-list-meta">
                <div className="device-list-meta-left">
                  {applianceLabel && (
                    <span className="device-meta-chip">{applianceLabel}</span>
                  )}
                  {device.energy_class && (
                    <span className="device-meta-chip device-meta-energy-class">Class {device.energy_class}</span>
                  )}
                </div>
                <div className="device-list-meta-right">
                  <span className="status-dot" style={{ backgroundColor: availDotColor }} />
                  <span className="device-meta-availability">
                    {allAvailable ? 'All available' : `${availableCount}/${totalCount} available`}
                  </span>
                  <span className="device-meta-sep">·</span>
                  <span title={device.last_seen ? new Date(device.last_seen).toLocaleString() : ''}>Last seen: {lastSeen}</span>
                </div>
              </div>

              <div className="device-list-attributes">
                <h3>Entities <span className="entities-count">({device.entities.length})</span></h3>
                <div className="attributes-container">
                  {(() => {
                    const DOMAIN_ORDER  = { switch: 0 }
                    const CLASS_ORDER   = { energy: 0, power: 1 }
                    const sorted = [...device.entities].sort((a, b) => {
                      const da = (DOMAIN_ORDER[a.domain] ?? 1) * 100 + (CLASS_ORDER[a.device_class] ?? 99)
                      const db = (DOMAIN_ORDER[b.domain] ?? 1) * 100 + (CLASS_ORDER[b.device_class] ?? 99)
                      return da - db
                    })
                    const isExpanded = expandedEntities[device.device_id]
                    const visible = isExpanded || sorted.length <= 4 ? sorted : sorted.slice(0, 4)
                    const hidden  = sorted.length - 4
                    return (
                      <>
                        {visible.map(entity => (
                          <div key={entity.entity_id} className="attribute-row">
                            <div className="attribute-info">
                              <span
                                className="status-dot entity-avail-dot"
                                style={{ backgroundColor: entity.available ? 'var(--status-online)' : 'var(--status-offline)' }}
                              />
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
                              <div className="switch-control" title={!isOwner ? 'Only the home owner can control devices' : undefined}>
                                <span className="switch-label">{switchStates[entity.entity_id] ? 'ON' : 'OFF'}</span>
                                <label className={`toggle-switch ${switchLoading[entity.entity_id] ? 'toggle-loading' : ''} ${!isOwner ? 'toggle-disabled' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={switchStates[entity.entity_id] || false}
                                    onChange={() => handleToggle(entity.entity_id, switchStates[entity.entity_id])}
                                    disabled={switchLoading[entity.entity_id] || !isOwner}
                                  />
                                  <span className="toggle-slider" />
                                </label>
                              </div>
                            ) : (
                              <span className="entity-ha-info">
                                {entity.device_class && (
                                  <>
                                    <span className="entity-ha-class">{entity.device_class.replace(/_/g, ' ')}</span>
                                    <span className="entity-ha-sep">|</span>
                                  </>
                                )}
                                <span className="entity-ha-id" title={entity.entity_id}>{entity.entity_id}</span>
                              </span>
                            )}
                          </div>
                        ))}
                        {sorted.length > 4 && (
                          <button
                            className="entities-expand-btn"
                            onClick={() => setExpandedEntities(prev => ({ ...prev, [device.device_id]: !prev[device.device_id] }))}
                          >
                            {isExpanded ? 'Show less' : `+${hidden} more entit${hidden === 1 ? 'y' : 'ies'}`}
                          </button>
                        )}
                      </>
                    )
                  })()}
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

                </div>
              </div>

              {!device.appliance_type ? (
                <div className="rec-unclassified">
                  Classify this device above to receive personalised energy and health recommendations.
                </div>
              ) : (
                <div className="device-recommendations">
                  {(() => {
                    const rec = getRecommendations(device.appliance_type, tariff, recommendationsData)
                    if (!rec) return null
                    return (
                      <>
                        {rec.energy && rec.energy.length > 0 && (
                          <div className="rec-section">
                            <button className="rec-toggle" onClick={() => toggleExpanded(device.device_id, 'energy')}>
                              <span>Energy savings</span>
                              <span className="rec-chevron">{expanded[`${device.device_id}_energy`] ? '▲' : '▼'}</span>
                            </button>
                            {expanded[`${device.device_id}_energy`] && (
                              <div className="rec-body">
                                {rec.energy.map((item, i) => (
                                  <div key={i} className={`rec-item${i > 0 ? ' rec-item-divider' : ''}`}>
                                    <div className="rec-item-header">
                                      <p className="rec-title">{item.title}</p>
                                      {item.impact && <span className={`rec-impact rec-impact-${item.impact}`}>{item.impact}</span>}
                                    </div>
                                    <p className="rec-text">{item.body}</p>
                                    {item.automation_hint && (
                                      <p className="rec-automation-hint">HA tip: {item.automation_hint}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {rec.health && rec.health.length > 0 && (
                          <div className="rec-section">
                            <button className="rec-toggle" onClick={() => toggleExpanded(device.device_id, 'health')}>
                              <span>Health &amp; comfort</span>
                              <span className="rec-chevron">{expanded[`${device.device_id}_health`] ? '▲' : '▼'}</span>
                            </button>
                            {expanded[`${device.device_id}_health`] && (
                              <div className="rec-body">
                                {rec.health.map((item, i) => (
                                  <div key={i} className={`rec-item${i > 0 ? ' rec-item-divider' : ''}`}>
                                    <div className="rec-item-header">
                                      <p className="rec-title">{item.title}</p>
                                      {item.impact && <span className={`rec-impact rec-impact-${item.impact}`}>{item.impact}</span>}
                                    </div>
                                    <p className="rec-text">{item.body}</p>
                                    {item.automation_hint && (
                                      <p className="rec-automation-hint">HA tip: {item.automation_hint}</p>
                                    )}
                                  </div>
                                ))}
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
  }

  return (
    <div className="content-padding">
      {selectedHome?.agent_status === 'offline' && (
        <div className="agent-offline-banner">
          <span>⚠</span>
          <span>Local agent is offline — device commands may not work.</span>
        </div>
      )}
      {!isOwner && (
        <div className="agent-offline-banner">
          <span>ℹ</span>
          <span>Device control is restricted to the home owner. Permission management will be available in a future update.</span>
        </div>
      )}
      <div className="devices-container">
        <div className="devices-header">
          <div>
            <h1 className="devices-title">Devices</h1>
            <p className="devices-subtitle">Manage your connected devices</p>
            {devices.length > 0 && (
              <p className="page-stats">
                {devices.length} device{devices.length !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;
                <span className="devices-summary-online">{devices.filter(d => d.available).length} online</span>
                {devices.filter(d => !d.available).length > 0 && (
                  <>&nbsp;&middot;&nbsp;<span className="devices-summary-offline">{devices.filter(d => !d.available).length} offline</span></>
                )}
              </p>
            )}
          </div>
          <div className="devices-header-right">
            <div className="devices-search-wrap">
              <input
                className="devices-search-input"
                type="text"
                placeholder="Search device…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="devices-search-clear" onClick={() => setSearch('')}>×</button>
              )}
            </div>
            <button className="refresh-btn" onClick={handleRefresh} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync from HA'}
            </button>
          </div>
        </div>
        {search && (
          <p className="devices-search-info">
            {visibleDevices.length === 0
              ? 'No devices match your search.'
              : `Showing ${visibleDevices.length} of ${devices.length} device${devices.length !== 1 ? 's' : ''}`}
          </p>
        )}
        {allUnclassified && (
          <div className="devices-classify-banner">
            <span className="devices-classify-banner-icon">💡</span>
            <span>Classify your devices below to unlock personalised recommendations and ROI calculations.</span>
          </div>
        )}
      </div>

      <div className="devices-list">
        {q ? (
          visibleDevices.length > 0
            ? visibleDevices.map(renderDeviceCard)
            : null
        ) : (
          <>
            {onlineDevices.length > 0 && (
              <div className="devices-section">
                <button className="devices-section-toggle" onClick={() => setOnlineCollapsed(p => !p)}>
                  <span className="devices-section-title online">Online <span className="devices-section-count">({onlineDevices.length})</span></span>
                  <span className="devices-section-chevron">{onlineCollapsed ? '▶' : '▼'}</span>
                </button>
                {!onlineCollapsed && onlineDevices.map(renderDeviceCard)}
              </div>
            )}
            {offlineDevices.length > 0 && (
              <div className="devices-section">
                <button className="devices-section-toggle" onClick={() => setOfflineCollapsed(p => !p)}>
                  <span className="devices-section-title offline">Offline <span className="devices-section-count">({offlineDevices.length})</span></span>
                  <span className="devices-section-chevron">{offlineCollapsed ? '▶' : '▼'}</span>
                </button>
                {!offlineCollapsed && offlineDevices.map(renderDeviceCard)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
