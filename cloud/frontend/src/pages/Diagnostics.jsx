import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import { usePageTitle } from '../hooks/usePageTitle'
import NoHomeSelected from '../components/NoHomeSelected'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import { isFaultSensor, getDeepRuleEntities, evaluateDevice } from '../utils/healthRules'
import { formatSensorValue } from '../utils/formatValue'
import { useDismissedAnomalies } from '../hooks/useDismissedAnomalies'
import '../styles/Statistics.css'
import '../styles/Diagnostics.css'
import '../styles/Anomalies.css'

const PERIODS = [
  { key: '7D',  label: '7 Days',   days: 7   },
  { key: '30D', label: '30 Days',  days: 30  },
  { key: '90D', label: '90 Days',  days: 90  },
  { key: '6M',  label: '6 Months', days: 183 },
  { key: '1Y',  label: '1 Year',   days: 365 },
]

const ANOMALY_FETCH_LIMIT = 2000

// Card 1 — Hardware Alerts 

function HardwareAlertsCard({ devices, homeId, from, to }) {
  const faultGroups = useMemo(() => {
    const groups = []
    for (const device of devices) {
      const faults = device.entities.filter(isFaultSensor)
      if (faults.length > 0) groups.push({ device, faults })
    }
    return groups
  }, [devices])

  const [faultEvents, setFaultEvents] = useState({}) // entity_id → [{ recorded_at }]

  useEffect(() => {
    setFaultEvents({}) // reset → {} means "loading" (no keys present yet)
    if (!homeId || !faultGroups.length) return
    const allFaultEntities = faultGroups.flatMap(g => g.faults)
    const params = new URLSearchParams({ limit: '3' })
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    Promise.all(allFaultEntities.map(entity =>
      apiFetch(`${API_URL}/homes/${homeId}/entities/${entity.entity_id}/fault-events?${params}`)
        .then(r => r.json())
        .then(rows => ({ id: entity.entity_id, rows: Array.isArray(rows) ? rows : [] }))
        .catch(() => ({ id: entity.entity_id, rows: [] }))
    )).then(results => {
      const map = {}
      results.forEach(r => { map[r.id] = r.rows })
      setFaultEvents(map)
    })
  }, [homeId, faultGroups, from, to])

  if (faultGroups.length === 0) {
    return (
      <div className="diag-card">
        <h2 className="diag-card-title">Hardware Alerts</h2>
        <p className="diag-card-desc">Fault indicators reported directly by your devices.</p>
        <p className="diag-empty">No hardware fault sensors detected in your setup.</p>
      </div>
    )
  }

  const allFaults     = faultGroups.flatMap(g => g.faults)
  const triggeredCount = allFaults.filter(e => e.state === 'on').length
  const totalCount     = allFaults.length

  const fmtEvent = (ts) => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
           ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="diag-card">
      <div className="diag-card-header-row">
        <div>
          <h2 className="diag-card-title">Hardware Alerts</h2>
          <p className="diag-card-desc">Fault indicators reported directly by your devices. Recent triggers show events within the selected period.</p>
        </div>
        {triggeredCount > 0
          ? <span className="diag-alert-badge">{triggeredCount}/{totalCount} triggered</span>
          : <span className="diag-alert-badge ok">All {totalCount} OK</span>
        }
      </div>

      <div className="diag-fault-groups">
        {faultGroups.map(({ device, faults }) => {
          const deviceName = inferDeviceName(device.entities)
          return (
            <div key={device.device_id} className="diag-fault-device">
              <div className="diag-fault-device-name">{deviceName}</div>
              <div className="diag-fault-sensors">
                {faults.map(entity => {
                  const active   = entity.state === 'on'
                  const label    = shortLabel(entity.friendly_name, deviceName)
                  const loaded   = entity.entity_id in faultEvents
                  const events   = faultEvents[entity.entity_id] ?? []
                  return (
                    <div key={entity.entity_id} className={`diag-fault-row ${active ? 'triggered' : 'ok'}`}>
                      <span className={`diag-fault-dot ${active ? 'triggered' : 'ok'}`} />
                      <div className="diag-fault-main">
                        <span className="diag-fault-name">{label || entity.entity_id}</span>
                        {loaded && (
                          <div className="diag-fault-history">
                            {events.length > 0 ? (
                              <>
                                <span className="diag-fault-history-label">Recent triggers:</span>
                                {events.map(ev => (
                                  <span key={ev.recorded_at} className="diag-fault-event">{fmtEvent(ev.recorded_at)}</span>
                                ))}
                              </>
                            ) : (
                              <span className="diag-fault-history-none">No triggers in this period</span>
                            )}
                          </div>
                        )}
                      </div>
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

// Card 2 — Anomalies

function AnomaliesCard({ anomalies30D, devices, homeId, initialEntity, from, to, periodLabel, hasMore, anomalyLoading }) {
  const navigate = useNavigate()
  const [deviceFilter, setDeviceFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [expandedDays, setExpandedDays] = useState({})
  const [showDismissed, setShowDismissed] = useState(false)
  const { dismissed, dismiss, restore } = useDismissedAnomalies(homeId)
  const appliedInitial = useRef(false)

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

  // Apply ?entity= URL param once, after entityDeviceMap is populated
  useEffect(() => {
    if (!initialEntity || appliedInitial.current || !Object.keys(entityDeviceMap).length) return
    appliedInitial.current = true
    const info = entityDeviceMap[initialEntity]
    setEntityFilter(initialEntity)
    if (info) setDeviceFilter(info.device_id)
    const recentForEntity = anomalies30D.find(a => a.entity_id === initialEntity)
    const dayKey = recentForEntity
      ? new Date(recentForEntity.detected_at).toLocaleDateString()
      : new Date().toLocaleDateString()
    setExpandedDays({ [dayKey]: true })
  }, [initialEntity, entityDeviceMap, anomalies30D])

  const fromTs = from ? new Date(from).getTime() : 0
  const toTs   = to   ? new Date(to).getTime()   : Infinity

  const filtered = useMemo(() => anomalies30D.filter(a => {
    const ts = new Date(a.detected_at).getTime()
    if (ts < fromTs || ts > toTs) return false
    if (deviceFilter) {
      const info = entityDeviceMap[a.entity_id]
      if (!info || info.device_id !== deviceFilter) return false
    }
    if (entityFilter && a.entity_id !== entityFilter) return false
    return true
  }), [anomalies30D, fromTs, toTs, deviceFilter, entityFilter, entityDeviceMap])

  // Unique devices that appear in anomalies within the selected period
  const devicesInAnomalies = useMemo(() => {
    const seen = new Map()
    filtered.forEach(a => {
      const info = entityDeviceMap[a.entity_id]
      if (info && !seen.has(info.device_id)) seen.set(info.device_id, info.deviceName)
    })
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, entityDeviceMap])

  // Entities for the selected device (or all if no device selected), within the selected period
  const entitiesInAnomalies = useMemo(() => {
    const seen = new Map()
    filtered.forEach(a => {
      if (deviceFilter) {
        const info = entityDeviceMap[a.entity_id]
        if (!info || info.device_id !== deviceFilter) return
      }
      if (!seen.has(a.entity_id)) {
        const info = entityDeviceMap[a.entity_id]
        const devName = info?.deviceName || ''
        const short = shortLabel(a.friendly_name, devName) || a.entity_id
        const label = deviceFilter ? short : `${devName} — ${short}`
        seen.set(a.entity_id, label)
      }
    })
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, deviceFilter, entityDeviceMap])

  const active     = filtered.filter(a => !dismissed.has(a.id))
  const dismissed_ = filtered.filter(a =>  dismissed.has(a.id))
  const visible    = showDismissed ? filtered : active

  const toKey = d => { const l = new Date(d); return `${l.getFullYear()}-${String(l.getMonth()+1).padStart(2,'0')}-${String(l.getDate()).padStart(2,'0')}` }
  const today     = toKey(new Date())
  const yesterday = toKey(Date.now() - 86400000)
  const dayLabel  = key =>
    key === today ? 'Today' : key === yesterday ? 'Yesterday'
    : new Date(key + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const groups = {}
  visible.forEach(a => {
    const key = toKey(a.detected_at)
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
      <p className="diag-card-desc">Sensor anomalies detected in the selected period. Click any row to explore the sensor in Statistics.</p>

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

      </div>

      {anomalyLoading && anomalies30D.length === 0 ? (
        <p className="diag-empty">Loading anomalies…</p>
      ) : filtered.length === 0 ? (
        <p className="diag-empty">No anomalies detected in this period.</p>
      ) : (
        <>
          <div className="anomaly-summary-row">
            {totalCritical > 0 && <span className="anomaly-badge critical">{totalCritical} critical</span>}
            {totalWarning  > 0 && <span className="anomaly-badge warning">{totalWarning} warning</span>}
            <span className="anomaly-summary-text">in {periodLabel}</span>
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
                    <div
                      className="anomaly-day-header"
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedDays(prev => ({ ...prev, [key]: !prev[key] }))}
                      onKeyDown={e => e.key === 'Enter' || e.key === ' ' ? setExpandedDays(prev => ({ ...prev, [key]: !prev[key] })) : null}
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
                    </div>

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
                                    {a.anomaly_muted      && <span className="anomaly-state-tag muted">muted</span>}
                                    {a.anomaly_suppressed && <span className="anomaly-state-tag suppressed">suppressed</span>}
                                  </span>
                                  <span className="anomaly-row-baseline">
                                    <span className={`anomaly-dir ${a.value > a.mean ? 'up' : 'down'}`}>
                                      {a.value > a.mean ? '↑' : '↓'}
                                    </span>
                                    {' '}{formatSensorValue(a.value, a.device_class)}{a.unit ? ` ${a.unit}` : ''}
                                    {' '}· μ={formatSensorValue(a.mean, a.device_class)} ±{formatSensorValue(a.std_dev, a.device_class)}
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

          {hasMore && (
            <div className="diag-load-more-row">
              <span className="diag-load-more-hint">
                Showing the {anomalies30D.length.toLocaleString()} most recent anomalies — more exist in this period but exceed the display limit.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Card 3 — Anomaly Management 

function AnomalyManagementCard({ devices, homeId }) {
  const [search, setSearch]       = useState('')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [viewFilter, setViewFilter]     = useState('all') // 'all' | 'muted' | 'suppressed' | 'modified'
  const [settings, setSettings]   = useState({})   // entity_id → { muted, suppressed }
  const [saving, setSaving]       = useState({})   // entity_id → bool

  const allEntities = useMemo(() => {
    const list = []
    for (const device of devices) {
      const deviceName = inferDeviceName(device.entities)
      for (const entity of device.entities) {
        if (entity.domain !== 'sensor' || !entity.unit) continue
        list.push({
          entity_id:   entity.entity_id,
          deviceName,
          device_id:   device.device_id,
          label:       shortLabel(entity.friendly_name, deviceName),
          unit:        entity.unit,
          device_class: entity.device_class,
          muted:       entity.anomaly_muted      ?? false,
          suppressed:  entity.anomaly_suppressed ?? false,
        })
      }
    }
    return list.sort((a, b) => a.deviceName.localeCompare(b.deviceName) || a.label.localeCompare(b.label))
  }, [devices])

  useEffect(() => {
    if (!allEntities.length) return
    const initial = {}
    allEntities.forEach(e => { initial[e.entity_id] = { muted: e.muted, suppressed: e.suppressed } })
    setSettings(initial)
  }, [allEntities])

  const uniqueDevices = useMemo(() =>
    [...new Map(allEntities.map(e => [e.device_id, e.deviceName])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  , [allEntities])

  const filtered = useMemo(() => allEntities.filter(e => {
    const s = settings[e.entity_id] ?? { muted: e.muted, suppressed: e.suppressed }
    if (viewFilter === 'muted'      && !s.muted)                   return false
    if (viewFilter === 'suppressed' && !s.suppressed)              return false
    if (viewFilter === 'modified'   && !s.muted && !s.suppressed)  return false
    if (deviceFilter && e.device_id !== deviceFilter)              return false
    if (search) {
      const q = search.toLowerCase()
      if (!e.label.toLowerCase().includes(q) && !e.deviceName.toLowerCase().includes(q)) return false
    }
    return true
  }), [allEntities, settings, viewFilter, deviceFilter, search])

  const mutedCount      = useMemo(() => allEntities.filter(e => (settings[e.entity_id] ?? e).muted).length,      [allEntities, settings])
  const suppressedCount = useMemo(() => allEntities.filter(e => (settings[e.entity_id] ?? e).suppressed).length, [allEntities, settings])

  const patchSetting = async (entity_id, field, value) => {
    setSaving(prev => ({ ...prev, [entity_id]: true }))
    setSettings(prev => ({ ...prev, [entity_id]: { ...(prev[entity_id] ?? {}), [field]: value } }))
    try {
      await apiFetch(`${API_URL}/homes/${homeId}/entities/${entity_id}/anomaly-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field === 'muted' ? 'muted' : 'suppressed']: value }),
      })
    } catch {
      // Revert on error
      setSettings(prev => ({ ...prev, [entity_id]: { ...(prev[entity_id] ?? {}), [field]: !value } }))
    } finally {
      setSaving(prev => ({ ...prev, [entity_id]: false }))
    }
  }

  const VIEW_FILTERS = [
    { key: 'all',        label: 'All sensors' },
    { key: 'muted',      label: `Muted${mutedCount > 0 ? ` (${mutedCount})` : ''}` },
    { key: 'suppressed', label: `Suppressed${suppressedCount > 0 ? ` (${suppressedCount})` : ''}` },
    { key: 'modified',   label: 'Managed' },
  ]

  return (
    <div className="diag-card">
      <div className="diag-card-header-row">
        <div>
          <h2 className="diag-card-title">Anomaly Management</h2>
          <p className="diag-card-desc">
            Control anomaly detection per sensor.{' '}
            <strong>Mute</strong> stops detecting new anomalies entirely (useful for sensors with a corrupted baseline).{' '}
            <strong>Suppress</strong> keeps detecting but hides results from Home &amp; Statistics — visible only here.
          </p>
        </div>
        {(mutedCount > 0 || suppressedCount > 0) && (
          <div className="diag-mgmt-header-badges">
            {mutedCount      > 0 && <span className="diag-alert-badge muted">{mutedCount} muted</span>}
            {suppressedCount > 0 && <span className="diag-alert-badge suppressed">{suppressedCount} suppressed</span>}
          </div>
        )}
      </div>

      <div className="diag-anomaly-filters" style={{ marginBottom: '0.5rem' }}>
        <input
          className="diag-mgmt-search"
          placeholder="Search sensor or device…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="statistics-select" value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}>
          <option value="">All devices</option>
          {uniqueDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="period-pills" style={{ marginBottom: '0.75rem' }}>
        {VIEW_FILTERS.map(f => (
          <button
            key={f.key}
            className={`period-pill ${viewFilter === f.key ? 'active' : ''}`}
            onClick={() => setViewFilter(f.key)}
          >{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="diag-empty">No sensors match the current filter.</p>
      ) : (
        <div className="diag-mgmt-list">
          <div className="diag-mgmt-header-row">
            <span className="diag-mgmt-col-name">Sensor</span>
            <span className="diag-mgmt-col-toggle">
              Suppress
              <span className="diag-mgmt-hint">hide from UI, keep detecting</span>
            </span>
            <span className="diag-mgmt-col-toggle">
              Mute
              <span className="diag-mgmt-hint">stop detecting entirely</span>
            </span>
          </div>
          {filtered.map(e => {
            const s   = settings[e.entity_id] ?? { muted: e.muted, suppressed: e.suppressed }
            const busy = saving[e.entity_id]
            return (
              <div key={e.entity_id} className={`diag-mgmt-row ${s.muted ? 'is-muted' : s.suppressed ? 'is-suppressed' : ''}`}>
                <div className="diag-mgmt-col-name">
                  <span className="diag-mgmt-device">{e.deviceName}</span>
                  <span className="diag-mgmt-entity">{e.label}{e.unit ? ` (${e.unit})` : ''}</span>
                </div>
                <div className="diag-mgmt-col-toggle">
                  <button
                    className={`diag-mgmt-toggle ${s.suppressed ? 'active suppressed' : ''}`}
                    disabled={busy}
                    onClick={() => patchSetting(e.entity_id, 'suppressed', !s.suppressed)}
                    title={s.suppressed ? 'Click to restore' : 'Click to suppress'}
                  >
                    {s.suppressed ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="diag-mgmt-col-toggle">
                  <button
                    className={`diag-mgmt-toggle ${s.muted ? 'active muted' : ''}`}
                    disabled={busy}
                    onClick={() => patchSetting(e.entity_id, 'muted', !s.muted)}
                    title={s.muted ? 'Click to restore' : 'Click to mute'}
                  >
                    {s.muted ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Card 4 — Device Health 

function DeviceHealthCard({ devices, anomalies, entityOverviews, fromDate, periodLabel, anomalyLoading }) {
  const navigate = useNavigate()

  const [expandedDevices,  setExpandedDevices]  = useState({})
  const [expandedInsights, setExpandedInsights] = useState({})

  const toggleDevice  = id  => setExpandedDevices(prev  => ({ ...prev, [id]:  !prev[id] }))
  const toggleInsight = key => setExpandedInsights(prev => ({ ...prev, [key]: !prev[key] }))

  const periodFrom = fromDate ? new Date(fromDate).getTime() : null

  // Evaluate all classified devices once and sort: most severe first
  const classifiedWithInsights = useMemo(() =>
    devices
      .filter(d => d.appliance_type)
      .map(d => {
        const insights = evaluateDevice(d, anomalies, entityOverviews)
        const score = insights.reduce((s, i) => s + (i.severity === 'critical' ? 2 : 1), 0)
        return { device: d, insights, score }
      })
      .sort((a, b) => b.score - a.score),
  [devices, anomalies, entityOverviews])

  // Single pass over anomalies → entity_id: count within the selected period
  const entityCountMap = useMemo(() => {
    if (!periodFrom) return {}
    const map = {}
    anomalies.forEach(a => {
      if (new Date(a.detected_at).getTime() >= periodFrom)
        map[a.entity_id] = (map[a.entity_id] ?? 0) + 1
    })
    return map
  }, [anomalies, periodFrom])

  if (classifiedWithInsights.length === 0) {
    return (
      <div className="diag-card">
        <h2 className="diag-card-title">Device Health</h2>
        <p className="diag-card-desc">Automated analysis based on your sensor data and usage patterns.</p>
        <p className="diag-empty">Classify your devices in the Devices page to enable health analysis.</p>
      </div>
    )
  }

  if (anomalyLoading) {
    return (
      <div className="diag-card">
        <h2 className="diag-card-title">Device Health</h2>
        <p className="diag-card-desc">
          Click a device to expand its health report. Diagnostic rules always analyze the last 30 days of sensor data,
          regardless of the period selected above. Sensor activity at the bottom of each report reflects your selected period.
        </p>
        <p className="diag-empty">Analyzing sensor data…</p>
      </div>
    )
  }

  return (
    <div className="diag-card">
      <h2 className="diag-card-title">Device Health</h2>
      <p className="diag-card-desc">
        Click a device to expand its health report. Diagnostic rules always analyze the last 30 days of sensor data,
        regardless of the period selected above. Sensor activity at the bottom of each report reflects your selected period.
      </p>

      <div className="diag-health-list">
        {classifiedWithInsights.map(({ device, insights }) => {
          const deviceName = inferDeviceName(device.entities)
          const isOpen     = !!expandedDevices[device.device_id]

          const nCrit = insights.filter(i => i.severity === 'critical').length
          const nWarn = insights.filter(i => i.severity === 'warning').length

          const entityActivity = device.entities
            .map(e => ({
              entity: e,
              label:  shortLabel(e.friendly_name, deviceName) || e.entity_id,
              count:  entityCountMap[e.entity_id] ?? 0,
            }))
            .filter(x => x.count > 0)

          return (
            <div key={device.device_id} className={`diag-health-device ${nCrit > 0 ? 'has-critical' : nWarn > 0 ? 'has-warning' : 'has-ok'}`}>
              <div
                className="diag-health-device-header diag-health-device-toggle"
                role="button"
                tabIndex={0}
                onClick={() => toggleDevice(device.device_id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleDevice(device.device_id)}
              >
                <span className="diag-health-device-name">{deviceName}</span>
                <span className="diag-health-type-badge">
                  {device.appliance_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <span className="diag-health-device-summary">
                  {nCrit > 0 && <span className="diag-health-issue-badge critical">{nCrit} critical</span>}
                  {nWarn > 0 && <span className="diag-health-issue-badge warning">{nWarn} warning</span>}
                  {nCrit === 0 && nWarn === 0 && <span className="diag-health-issue-badge ok">All OK</span>}
                </span>
                <span className="diag-health-chevron">{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div className="diag-health-device-body">
                  {insights.length === 0 ? (
                    <div className="diag-health-ok">
                      <span className="diag-health-ok-dot" />
                      No issues found in the last 30 days.
                    </div>
                  ) : (
                    <div className="diag-health-insights">
                      {insights.map((ins, i) => {
                        const insKey  = `${device.device_id}-${i}`
                        const insOpen = !!expandedInsights[insKey]
                        return (
                          <div key={i} className={`diag-health-insight diag-health-insight-collapsible ${ins.severity}`}>
                            <div
                              className="diag-health-insight-header"
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleInsight(insKey)}
                              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleInsight(insKey)}
                            >
                              <span className={`diag-health-dot ${ins.severity}`} />
                              <span className="diag-health-insight-title">{ins.title}</span>
                              <span className="diag-health-insight-chevron">{insOpen ? '▲' : '▼'}</span>
                            </div>
                            {insOpen && (
                              <div className="diag-health-insight-expanded">
                                <span className="diag-health-insight-text">{ins.body}</span>
                                {ins.entityId && (
                                  <span
                                    className="diag-health-insight-link"
                                    onClick={() => navigate(`/statistics?entity=${ins.entityId}`)}
                                  >
                                    View in Statistics →
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {entityActivity.length > 0 && (
                    <div className="diag-health-period-activity">
                      <span className="diag-health-period-label">Sensor activity in {periodLabel}:</span>
                      <div className="diag-health-period-items">
                        {entityActivity.map(({ entity, label, count }) => (
                          <span
                            key={entity.entity_id}
                            className="diag-health-period-item"
                            onClick={() => navigate(`/statistics?entity=${entity.entity_id}`)}
                          >
                            {label}: <strong>{count}</strong> {count === 1 ? 'anomaly' : 'anomalies'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Page 

export default function Diagnostics() {
  usePageTitle('Diagnostics')
  const { selectedHome } = useHome()
  const [searchParams] = useSearchParams()
  const initialEntity = searchParams.get('entity') || ''

  //  Period state 
  const [period, setPeriod]                     = useState('30D')
  const [customFrom, setCustomFrom]             = useState('')
  const [customTo, setCustomTo]                 = useState('')
  const [customPickerOpen, setCustomPickerOpen] = useState(false)

  const activePeriod = (() => {
    if (period === 'custom' && customFrom) {
      const from = new Date(customFrom)
      const to   = customTo ? new Date(customTo) : new Date()
      const days = Math.max(1, (to - from) / 86400000)
      return { key: 'custom', label: 'Custom range', days }
    }
    return PERIODS.find(p => p.key === period) ?? PERIODS[1]
  })()

  const fromDate = period === 'custom' && customFrom
    ? new Date(customFrom).toISOString()
    : new Date(Date.now() - activePeriod.days * 86400 * 1000).toISOString()
  const toDate = period === 'custom' && customTo
    ? new Date(customTo + 'T23:59:59').toISOString()
    : undefined

  const periodLabel = period === 'custom' ? 'the selected range'
    : `the last ${activePeriod.label.toLowerCase()}`

  // Data 
  const [devices, setDevices]                 = useState([])
  const [anomalies, setAnomalies]             = useState([])
  const [entityOverviews, setEntityOverviews] = useState({})
  const [loading, setLoading]                 = useState(true)
  const [anomalyLoading, setAnomalyLoading]   = useState(true)
  const [hasMoreAnomalies, setHasMoreAnomalies] = useState(false)

  // Device + entity overview — re-runs only when the home changes
  useEffect(() => {
    if (!selectedHome) return
    setLoading(true)
    setEntityOverviews({})

    async function loadDevices() {
      try {
        const devs = await apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`).then(r => r.json())
        const devices_ = Array.isArray(devs) ? devs : []
        setDevices(devices_)

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

    loadDevices()
  }, [selectedHome])

  // Anomaly fetch — re-runs on period or load-more changes (no full-page blank)
  useEffect(() => {
    if (!selectedHome) return
    setAnomalyLoading(true)

    async function loadAnomalies() {
      try {
        // Fetch at least 30D so DeviceHealth quick rules always have enough history
        const fetchDays = Math.max(activePeriod.days, 30)
        const fetchFrom = period === 'custom' && customFrom
          ? new Date(customFrom).toISOString()
          : new Date(Date.now() - fetchDays * 86400 * 1000).toISOString()

        // Fetch one extra to detect if more exist without a separate count query
        const toParam = period === 'custom' && customTo
          ? `&to=${new Date(customTo + 'T23:59:59').toISOString()}`
          : ''
        const anom = await apiFetch(`${API_URL}/homes/${selectedHome.id}/anomalies?from=${fetchFrom}${toParam}&limit=${ANOMALY_FETCH_LIMIT + 1}`).then(r => r.json())
        const raw = Array.isArray(anom) ? anom : []
        setHasMoreAnomalies(raw.length > ANOMALY_FETCH_LIMIT)
        setAnomalies(raw.slice(0, ANOMALY_FETCH_LIMIT))
      } catch { /* silent */ } finally {
        setAnomalyLoading(false)
      }
    }

    loadAnomalies()
  }, [selectedHome, period, customFrom, customTo])

  if (!selectedHome) return <NoHomeSelected />

  if (loading) return <div className="content-padding"><p>Loading...</p></div>

  // Date hint for the period label
  const hintFrom = new Date(fromDate)
  const hintTo   = toDate ? new Date(toDate) : new Date()
  const sameYear = hintFrom.getFullYear() === hintTo.getFullYear()
  const fmtHint  = (d, yr) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(yr ? { year: 'numeric' } : {}) })
  const dateHint = `${fmtHint(hintFrom, !sameYear)} – ${fmtHint(hintTo, true)}`

  return (
    <div className="content-padding">
      <div className="diag-page-header">
        <h1 className="diag-title">Diagnostics</h1>
        <p className="diag-subtitle">Hardware alerts, anomaly history, device health, and sensor management</p>
      </div>

      {/* ── Sticky period bar ── */}
      <div className="diag-period-bar">
        <div className="selector-group">
          <label className="selector-label">
            Period
            <span className="period-date-hint">{dateHint}</span>
          </label>
          <div className="period-pills">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`period-pill ${period === p.key ? 'active' : ''}`}
                onClick={() => { setPeriod(p.key); setCustomPickerOpen(false); setHasMoreAnomalies(false) }}
              >{p.label}</button>
            ))}
            <button
              className={`period-pill ${period === 'custom' ? 'active' : ''}`}
              onClick={() => { setPeriod('custom'); setCustomPickerOpen(true); setHasMoreAnomalies(false) }}
            >Custom</button>
          </div>
        </div>

        {period === 'custom' && customPickerOpen && (
          <div className="period-custom-range">
            <div className="period-custom-field">
              <label className="selector-label">From</label>
              <input
                type="date"
                className="period-date-input"
                value={customFrom}
                max={customTo || new Date().toISOString().split('T')[0]}
                onChange={e => {
                  setCustomFrom(e.target.value)
                  if (e.target.value && customTo) setCustomPickerOpen(false)
                }}
              />
            </div>
            <span className="period-date-sep">—</span>
            <div className="period-custom-field">
              <label className="selector-label">To</label>
              <input
                type="date"
                className="period-date-input"
                value={customTo}
                min={customFrom || undefined}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => {
                  setCustomTo(e.target.value)
                  if (customFrom && e.target.value) setCustomPickerOpen(false)
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="diag-cards">
        <HardwareAlertsCard devices={devices} homeId={selectedHome.id} from={fromDate} to={toDate} />
        <AnomaliesCard
          anomalies30D={anomalies}
          devices={devices}
          homeId={selectedHome.id}
          initialEntity={initialEntity}
          from={fromDate}
          to={toDate}
          periodLabel={periodLabel}
          hasMore={hasMoreAnomalies}
          anomalyLoading={anomalyLoading}
        />
        <DeviceHealthCard
          devices={devices}
          anomalies={anomalies}
          entityOverviews={entityOverviews}
          fromDate={fromDate}
          periodLabel={periodLabel}
          anomalyLoading={anomalyLoading}
        />
        <AnomalyManagementCard devices={devices} homeId={selectedHome.id} />
      </div>
    </div>
  )
}
