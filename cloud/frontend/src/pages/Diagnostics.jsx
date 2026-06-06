import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import { isFaultSensor, getDeepRuleEntities, evaluateDevice } from '../utils/healthRules'
import { useDismissedAnomalies } from '../hooks/useDismissedAnomalies'
import '../styles/Statistics.css'
import '../styles/Diagnostics.css'
import '../styles/Anomalies.css'

const PERIODS = [
  { key: '7D',  label: '7 Days',  days: 7  },
  { key: '30D', label: '30 Days', days: 30 },
]

// ─── Card 1 — Hardware Alerts ─────────────────────────────────────────────────

function HardwareAlertsCard({ devices }) {
  const faultGroups = useMemo(() => {
    const groups = []
    for (const device of devices) {
      const faults = device.entities.filter(isFaultSensor)
      if (faults.length > 0) groups.push({ device, faults })
    }
    return groups
  }, [devices])

  if (faultGroups.length === 0) {
    return (
      <div className="diag-card">
        <h2 className="diag-card-title">Hardware Alerts</h2>
        <p className="diag-card-desc">Fault indicators reported directly by your devices.</p>
        <p className="diag-empty">No hardware fault sensors detected in your setup.</p>
      </div>
    )
  }

  const anyTriggered = faultGroups.some(g => g.faults.some(e => e.state === 'on'))

  return (
    <div className="diag-card">
      <div className="diag-card-header-row">
        <div>
          <h2 className="diag-card-title">Hardware Alerts</h2>
          <p className="diag-card-desc">Fault indicators reported directly by your devices.</p>
        </div>
        {anyTriggered && <span className="diag-alert-badge">Issues detected</span>}
      </div>

      <div className="diag-fault-groups">
        {faultGroups.map(({ device, faults }) => {
          const deviceName = inferDeviceName(device.entities)
          return (
            <div key={device.device_id} className="diag-fault-device">
              <div className="diag-fault-device-name">{deviceName}</div>
              <div className="diag-fault-sensors">
                {faults.map(entity => {
                  const active = entity.state === 'on'
                  const label  = shortLabel(entity.friendly_name, deviceName)
                  return (
                    <div key={entity.entity_id} className={`diag-fault-row ${active ? 'triggered' : 'ok'}`}>
                      <span className={`diag-fault-dot ${active ? 'triggered' : 'ok'}`} />
                      <span className="diag-fault-name">{label || entity.entity_id}</span>
                      <span className={`diag-fault-status ${active ? 'triggered' : 'ok'}`}>
                        {active ? 'TRIGGERED' : 'OK'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Card 2 — Anomalies ───────────────────────────────────────────────────────

function AnomaliesCard({ anomalies30D, devices, homeId }) {
  const navigate = useNavigate()
  const [period, setPeriod]             = useState('7D')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [expandedDays, setExpandedDays] = useState({})
  const [showDismissed, setShowDismissed] = useState(false)
  const { dismissed, dismiss, restore } = useDismissedAnomalies(homeId)

  // Build entity_id → device mapping for filtering
  const entityDeviceMap = useMemo(() => {
    const map = {}
    for (const device of devices) {
      const name = inferDeviceName(device.entities)
      for (const entity of device.entities) {
        map[entity.entity_id] = { device_id: device.device_id, deviceName: name }
      }
    }
    return map
  }, [devices])

  // Unique devices that appear in anomalies
  const devicesInAnomalies = useMemo(() => {
    const seen = new Map()
    anomalies30D.forEach(a => {
      const info = entityDeviceMap[a.entity_id]
      if (info && !seen.has(info.device_id)) seen.set(info.device_id, info.deviceName)
    })
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [anomalies30D, entityDeviceMap])

  // Entities for the selected device (or all if no device selected)
  const entitiesInAnomalies = useMemo(() => {
    const seen = new Map()
    anomalies30D.forEach(a => {
      if (deviceFilter) {
        const info = entityDeviceMap[a.entity_id]
        if (!info || info.device_id !== deviceFilter) return
      }
      if (!seen.has(a.entity_id)) seen.set(a.entity_id, a.friendly_name || a.entity_id)
    })
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [anomalies30D, deviceFilter, entityDeviceMap])

  const days = PERIODS.find(p => p.key === period).days
  const fromTs = Date.now() - days * 86400 * 1000

  const filtered = useMemo(() => anomalies30D.filter(a => {
    if (new Date(a.detected_at).getTime() < fromTs) return false
    if (deviceFilter) {
      const info = entityDeviceMap[a.entity_id]
      if (!info || info.device_id !== deviceFilter) return false
    }
    if (entityFilter && a.entity_id !== entityFilter) return false
    return true
  }), [anomalies30D, fromTs, deviceFilter, entityFilter, entityDeviceMap])

  const active     = filtered.filter(a => !dismissed.has(a.id))
  const dismissed_ = filtered.filter(a =>  dismissed.has(a.id))
  const visible    = showDismissed ? filtered : active

  const today     = new Date().toLocaleDateString()
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString()
  const dayLabel  = key =>
    key === today ? 'Today' : key === yesterday ? 'Yesterday'
    : new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const groups = {}
  visible.forEach(a => {
    const key = new Date(a.detected_at).toLocaleDateString()
    ;(groups[key] ??= []).push(a)
  })
  const sortedKeys = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a))

  const totalCritical = active.filter(a => a.severity === 'critical').length
  const totalWarning  = active.filter(a => a.severity === 'warning').length

  const handleDeviceChange = (deviceId) => {
    setDeviceFilter(deviceId)
    setEntityFilter('')
    setExpandedDays({})
  }

  return (
    <div className="diag-card">
      <h2 className="diag-card-title">Anomalies</h2>

      <div className="diag-anomaly-filters">
        <div className="selector-group">
          <label className="selector-label">Device</label>
          <select
            className="statistics-select"
            value={deviceFilter}
            onChange={e => handleDeviceChange(e.target.value)}
          >
            <option value="">All devices</option>
            {devicesInAnomalies.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="selector-group">
          <label className="selector-label">Entity</label>
          <select
            className="statistics-select"
            value={entityFilter}
            onChange={e => { setEntityFilter(e.target.value); setExpandedDays({}) }}
          >
            <option value="">All entities</option>
            {entitiesInAnomalies.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div className="selector-group">
          <label className="selector-label">Period</label>
          <div className="period-pills">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`period-pill ${period === p.key ? 'active' : ''}`}
                onClick={() => { setPeriod(p.key); setExpandedDays({}) }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="diag-empty">No anomalies detected in this period.</p>
      ) : (
        <>
          <div className="anomaly-summary-row">
            {totalCritical > 0 && <span className="anomaly-badge critical">{totalCritical} critical</span>}
            {totalWarning  > 0 && <span className="anomaly-badge warning">{totalWarning} warning</span>}
            <span className="anomaly-summary-text">
              in the last {PERIODS.find(p => p.key === period).label.toLowerCase()}
            </span>
            {dismissed_.length > 0 && (
              <button
                className={`anomaly-toggle-dismissed ${showDismissed ? 'active' : ''}`}
                onClick={() => setShowDismissed(s => !s)}
              >
                {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissed_.length})`}
              </button>
            )}
          </div>

          {active.length === 0 && !showDismissed ? (
            <p className="diag-empty">All anomalies in this period have been dismissed.</p>
          ) : (
            <div className="anomaly-day-groups">
              {sortedKeys.map(key => {
                const rows       = groups[key]
                const activeRows = rows.filter(a => !dismissed.has(a.id))
                const open       = !!expandedDays[key]
                const nCrit      = activeRows.filter(a => a.severity === 'critical').length
                const nWarn      = activeRows.filter(a => a.severity === 'warning').length
                return (
                  <div key={key} className="anomaly-day-group">
                    <button
                      className="anomaly-day-header"
                      onClick={() => setExpandedDays(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <span className="anomaly-day-label">{dayLabel(key)}</span>
                      <span className="anomaly-day-badges">
                        {nCrit > 0 && <span className="anomaly-badge critical">{nCrit} critical</span>}
                        {nWarn > 0 && <span className="anomaly-badge warning">{nWarn} warning</span>}
                      </span>
                      {activeRows.length > 0 && (
                        <button
                          className="anomaly-group-dismiss"
                          title="Dismiss all from this day"
                          onClick={e => { e.stopPropagation(); dismiss(activeRows.map(a => a.id)) }}
                        >
                          Dismiss all
                        </button>
                      )}
                      <span className="anomaly-day-chevron">{open ? '▲' : '▼'}</span>
                    </button>

                    {open && (
                      <div className="anomaly-day-content">
                        <div className="anomalies-list">
                          {rows.map(a => {
                            const devInfo    = entityDeviceMap[a.entity_id]
                            const isDismissed = dismissed.has(a.id)
                            return (
                              <div
                                key={a.id}
                                className={`anomaly-row anomaly-row-link ${isDismissed ? 'is-dismissed' : ''}`}
                                onClick={() => navigate(`/statistics?entity=${a.entity_id}`)}
                              >
                                <span className={`anomaly-severity-dot ${a.severity}`} />
                                <div className="anomaly-row-main">
                                  <span className="anomaly-entity-name">
                                    {devInfo ? `${devInfo.deviceName} — ` : ''}
                                    {a.friendly_name
                                      ? shortLabel(a.friendly_name, devInfo?.deviceName || '')
                                      : a.entity_id}
                                    {a.unit ? ` (${a.unit})` : ''}
                                  </span>
                                  <span className="anomaly-row-baseline">
                                    {Number(a.value).toFixed(2)}{a.unit ? ` ${a.unit}` : ''}
                                    {' '}· baseline {Number(a.mean).toFixed(2)} ± {Number(a.std_dev).toFixed(2)}
                                    {' '}· z={Number(a.z_score).toFixed(1)}
                                  </span>
                                </div>
                                <span className="anomaly-row-time">
                                  {new Date(a.detected_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isDismissed ? (
                                  <button
                                    className="anomaly-restore-btn"
                                    onClick={e => { e.stopPropagation(); restore(a.id) }}
                                  >Restore</button>
                                ) : (
                                  <button
                                    className="anomaly-dismiss-btn"
                                    title="Dismiss"
                                    onClick={e => { e.stopPropagation(); dismiss(a.id) }}
                                  >×</button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Card 3 — Device Health ───────────────────────────────────────────────────

function DeviceHealthCard({ devices, anomalies, entityOverviews }) {
  const classified = devices.filter(d => d.appliance_type)

  if (classified.length === 0) {
    return (
      <div className="diag-card">
        <h2 className="diag-card-title">Device Health</h2>
        <p className="diag-card-desc">Automated analysis based on your sensor data and usage patterns.</p>
        <p className="diag-empty">
          Classify your devices in the Devices page to enable health analysis.
        </p>
      </div>
    )
  }

  return (
    <div className="diag-card">
      <h2 className="diag-card-title">Device Health</h2>
      <p className="diag-card-desc">
        Automated analysis based on your sensor data and usage patterns.
        Only classified devices are evaluated — set the device type in the Devices page.
      </p>

      <div className="diag-health-list">
        {classified.map(device => {
          const deviceName = inferDeviceName(device.entities)
          const insights   = evaluateDevice(device, anomalies, entityOverviews)

          return (
            <div key={device.device_id} className={`diag-health-device ${insights.length > 0 ? 'has-issues' : ''}`}>
              <div className="diag-health-device-header">
                <span className="diag-health-device-name">{deviceName}</span>
                <span className="diag-health-type-badge">
                  {device.appliance_type.replace(/_/g, ' ')}
                </span>
              </div>

              {insights.length === 0 ? (
                <div className="diag-health-ok">
                  <span className="diag-health-ok-dot" />
                  No issues detected
                </div>
              ) : (
                <div className="diag-health-insights">
                  {insights.map((ins, i) => (
                    <div key={i} className={`diag-health-insight ${ins.severity}`}>
                      <span className={`diag-health-dot ${ins.severity}`} />
                      <div className="diag-health-insight-body">
                        <span className="diag-health-insight-title">{ins.title}</span>
                        <span className="diag-health-insight-text">{ins.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Diagnostics() {
  const { selectedHome } = useHome()
  const [devices, setDevices]               = useState([])
  const [anomalies, setAnomalies]           = useState([])
  const [entityOverviews, setEntityOverviews] = useState({})
  const [loading, setLoading]               = useState(true)

  useEffect(() => {
    if (!selectedHome) return
    setLoading(true)
    setEntityOverviews({})

    async function load() {
      try {
        const from30D = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
        const [devs, anom] = await Promise.all([
          apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`).then(r => r.json()),
          apiFetch(`${API_URL}/homes/${selectedHome.id}/anomalies?from=${from30D}&limit=500`).then(r => r.json()),
        ])

        const devices_   = Array.isArray(devs) ? devs : []
        const anomalies_ = Array.isArray(anom) ? anom : []
        setDevices(devices_)
        setAnomalies(anomalies_)

        const needed = getDeepRuleEntities(devices_)
        if (!needed.length) return

        const results = await Promise.all(
          needed.map(async ({ entity_id, fromDays }) => {
            const from = new Date(Date.now() - fromDays * 86400 * 1000).toISOString()
            try {
              const overview = await apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${entity_id}/overview?from=${from}`).then(r => r.json())
              return { entity_id, overview }
            } catch {
              return { entity_id, overview: null }
            }
          })
        )

        const map = {}
        results.forEach(({ entity_id, overview }) => { map[entity_id] = overview })
        setEntityOverviews(map)
      } catch { /* silent */ } finally {
        setLoading(false)
      }
    }

    load()
  }, [selectedHome])

  if (!selectedHome) return <NoHomeSelected />

  if (loading) return <div className="content-padding"><p>Loading...</p></div>

  return (
    <div className="content-padding">
      <div className="diag-page-header">
        <h1 className="diag-title">Diagnostics</h1>
        <p className="diag-subtitle">Hardware alerts, anomaly history, and device health analysis</p>
      </div>

      <div className="diag-cards">
        <HardwareAlertsCard devices={devices} />
        <AnomaliesCard anomalies30D={anomalies} devices={devices} homeId={selectedHome.id} />
        <DeviceHealthCard devices={devices} anomalies={anomalies} entityOverviews={entityOverviews} />
      </div>
    </div>
  )
}
