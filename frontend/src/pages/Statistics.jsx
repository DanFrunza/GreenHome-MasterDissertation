import { useEffect, useState } from 'react'
import { useHome } from '../context/HomeContext'
import { API_URL } from '../config'
import HourlyProfileChart from '../components/HourlyProfileChart'
import TrendChart from '../components/TrendChart'
import HeatmapChart from '../components/HeatmapChart'
import '../styles/Statistics.css'

function inferDeviceName(entities) {
  if (!entities?.length) return 'Unknown Device'
  if (entities.length === 1) return entities[0].friendly_name || 'Unknown Device'
  const words = entities.map(e => (e.friendly_name || '').split(' '))
  let prefix = words[0]
  for (let i = 1; i < words.length; i++) {
    let j = 0
    while (j < prefix.length && j < words[i].length && prefix[j] === words[i][j]) j++
    prefix = prefix.slice(0, j)
  }
  return prefix.join(' ') || entities[0].friendly_name || 'Unknown Device'
}

function shortLabel(friendlyName, deviceName) {
  const stripped = friendlyName?.startsWith(deviceName)
    ? friendlyName.slice(deviceName.length).trim()
    : friendlyName
  return stripped || friendlyName
}

const PERIODS = [
  { key: '7D',  label: '7 Days',  days: 7,   aggPeriod: 'day'  },
  { key: '30D', label: '30 Days', days: 30,  aggPeriod: 'day'  },
  { key: '3M',  label: '3 Months',days: 90,  aggPeriod: 'week' },
  { key: '1Y',  label: '1 Year',  days: 365, aggPeriod: 'month'},
]

function StatCard({ label, value, unit, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">
        {value != null ? Number(value).toFixed(2) : '—'}
        {value != null && unit && <span className="stat-card-unit"> {unit}</span>}
      </span>
      {sub && <span className="stat-card-sub">{sub}</span>}
    </div>
  )
}

export default function Statistics() {
  const { selectedHome } = useHome()
  const [entities, setEntities] = useState([])
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [period, setPeriod] = useState('7D')
  const [overview, setOverview] = useState(null)
  const [loadingOverview, setLoadingOverview] = useState(false)

  useEffect(() => {
    if (!selectedHome) return
    fetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      .then(r => r.json())
      .then(devices => {
        const sensors = devices.flatMap(d => {
          const deviceName = inferDeviceName(d.entities)
          return d.entities
            .filter(e => e.domain === 'sensor' && e.unit)
            .map(e => ({ ...e, label: shortLabel(e.friendly_name, deviceName), deviceName }))
        })
        setEntities(sensors)
        if (sensors.length > 0) setSelectedEntity(sensors[0])
      })
      .catch(console.error)
  }, [selectedHome])

  useEffect(() => {
    if (!selectedHome || !selectedEntity) return
    const p = PERIODS.find(p => p.key === period)
    const from = new Date(Date.now() - p.days * 86400 * 1000).toISOString()
    setLoadingOverview(true)
    fetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/overview?from=${from}`)
      .then(r => r.json())
      .then(data => { setOverview(data); setLoadingOverview(false) })
      .catch(() => setLoadingOverview(false))
  }, [selectedHome, selectedEntity, period])

  const unit = selectedEntity?.unit || ''

  return (
    <div className="content-padding">
      <div className="statistics-container">
        <div className="statistics-header">
          <div>
            <h1 className="statistics-title">Statistics</h1>
            <p className="statistics-subtitle">Analyse your home sensor data</p>
          </div>
        </div>

        <div className="statistics-selectors">
          <div className="selector-group">
            <label className="selector-label">Entity</label>
            <select
              className="statistics-select"
              value={selectedEntity?.entity_id || ''}
              onChange={e => setSelectedEntity(entities.find(en => en.entity_id === e.target.value))}
            >
              {entities.map(e => (
                <option key={e.entity_id} value={e.entity_id}>
                  {e.deviceName} — {e.label} {e.unit ? `(${e.unit})` : ''}
                </option>
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
                  onClick={() => setPeriod(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedEntity && (
        <div className="statistics-cards">

          {/* Card 1 — Overview */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">Overview</h2>
            <p className="stats-section-subtitle">
              Summary for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> over the last {PERIODS.find(p => p.key === period)?.label.toLowerCase()}
            </p>
            {loadingOverview ? (
              <p className="stats-loading">Loading...</p>
            ) : overview ? (
              <div className="stat-cards-grid">
                <StatCard label="Average"  value={overview.avg_value} unit={unit} />
                <StatCard label="Minimum"  value={overview.min_value} unit={unit} />
                <StatCard label="Maximum"  value={overview.max_value} unit={unit} />
                <StatCard
                  label="Readings"
                  value={overview.count}
                  unit=""
                  sub={overview.first_recorded
                    ? `${new Date(overview.first_recorded).toLocaleDateString()} – ${new Date(overview.last_recorded).toLocaleDateString()}`
                    : null}
                />
              </div>
            ) : (
              <p className="stats-empty">No data available for this period.</p>
            )}
          </div>

          {/* Card 2 — Daily Pattern */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">Daily Pattern</h2>
            <p className="stats-section-subtitle">
              Average value by hour of day for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — reveals daily usage peaks
            </p>
            <HourlyProfileChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={new Date(Date.now() - PERIODS.find(p => p.key === period).days * 86400 * 1000).toISOString()}
            />
          </div>

          {/* Card 3 — Trend */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">Trend</h2>
            <p className="stats-section-subtitle">
              Aggregated <strong>{PERIODS.find(p => p.key === period)?.aggPeriod}-by-{PERIODS.find(p => p.key === period)?.aggPeriod}</strong> averages with min/max range
            </p>
            <TrendChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              aggPeriod={PERIODS.find(p => p.key === period)?.aggPeriod}
              from={new Date(Date.now() - PERIODS.find(p => p.key === period).days * 86400 * 1000).toISOString()}
            />
          </div>

          {/* Card 4 — Heatmap */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">Weekly Heatmap</h2>
            <p className="stats-section-subtitle">
              Average value by hour of day and day of week — darker = higher value
            </p>
            <HeatmapChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={new Date(Date.now() - PERIODS.find(p => p.key === period).days * 86400 * 1000).toISOString()}
            />
          </div>

        </div>
      )}
    </div>
  )
}
