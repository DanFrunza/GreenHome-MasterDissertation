import { useEffect, useState } from 'react'
import { useHome } from '../context/HomeContext'
import { API_URL } from '../config'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import HourlyProfileChart from '../components/HourlyProfileChart'
import TrendChart from '../components/TrendChart'
import HeatmapChart from '../components/HeatmapChart'
import '../styles/Statistics.css'

const PERIODS = [
  { key: '7D',  label: '7 Days',   days: 7,   aggPeriod: 'day',   aggLabel: 'day'   },
  { key: '30D', label: '30 Days',  days: 30,  aggPeriod: 'day',   aggLabel: 'day'   },
  { key: '3M',  label: '3 Months', days: 90,  aggPeriod: 'week',  aggLabel: 'week'  },
  { key: '1Y',  label: '1 Year',   days: 365, aggPeriod: 'month', aggLabel: 'month' },
]

function InfoTooltip({ children }) {
  return (
    <span className="info-tooltip-wrap">
      <span className="info-icon">i</span>
      <span className="info-tooltip-box">{children}</span>
    </span>
  )
}

function StatCard({ label, value, unit, sub, tooltip }) {
  return (
    <div className="stat-card">
      <span className="stat-card-label">
        {label}
        {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
      </span>
      <span className="stat-card-value">
        {value != null ? Number(value).toFixed(2) : '—'}
        {value != null && unit && <span className="stat-card-unit"> {unit}</span>}
      </span>
      {sub && <span className="stat-card-sub">{sub}</span>}
    </div>
  )
}

function TrendLegend() {
  return (
    <div className="chart-legend">
      <span className="legend-item">
        <span className="legend-line" />
        Average
      </span>
      <span className="legend-item">
        <span className="legend-band" />
        Min – Max range
      </span>
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
        setSelectedEntity(prev => {
          if (!prev) return sensors[0] ?? null
          return sensors.find(s => s.entity_id === prev.entity_id) ?? sensors[0] ?? null
        })
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

  const activePeriod = PERIODS.find(p => p.key === period)
  const fromDate = new Date(Date.now() - activePeriod.days * 86400 * 1000).toISOString()
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
            <div className="stats-section-header">
              <div>
                <h2 className="stats-section-title">
                  Overview
                  <InfoTooltip>
                    Calculated directly from raw sensor readings stored in the database.
                    All values are computed over the last {activePeriod.label.toLowerCase()} of data
                    for <em>{selectedEntity.deviceName} — {selectedEntity.label}</em>.
                  </InfoTooltip>
                </h2>
                <p className="stats-section-subtitle">
                  Summary for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — last {activePeriod.label.toLowerCase()}
                </p>
              </div>
            </div>
            {loadingOverview ? (
              <p className="stats-loading">Loading...</p>
            ) : overview ? (
              <div className="stat-cards-grid">
                <StatCard
                  label="Average" value={overview.avg_value} unit={unit}
                  sub={overview.count ? `Mean of ${Number(overview.count).toLocaleString()} readings` : null}
                  tooltip={`Arithmetic mean of all ${Number(overview.count).toLocaleString()} raw readings over the last ${activePeriod.label.toLowerCase()}.`}
                />
                <StatCard
                  label="Minimum" value={overview.min_value} unit={unit}
                  sub="Lowest single reading"
                  tooltip={`The single lowest value recorded among all readings in the last ${activePeriod.label.toLowerCase()}.`}
                />
                <StatCard
                  label="Maximum" value={overview.max_value} unit={unit}
                  sub="Highest single reading"
                  tooltip={`The single highest value recorded among all readings in the last ${activePeriod.label.toLowerCase()}.`}
                />
                <StatCard
                  label="Readings" value={overview.count} unit=""
                  sub={overview.first_recorded
                    ? `${new Date(overview.first_recorded).toLocaleDateString()} – ${new Date(overview.last_recorded).toLocaleDateString()}`
                    : null}
                  tooltip={`Total number of individual data points recorded in the last ${activePeriod.label.toLowerCase()}.`}
                />
              </div>
            ) : (
              <p className="stats-empty">No data available for this period.</p>
            )}
          </div>

          {/* Card 2 — Daily Pattern */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              Daily Pattern
              <InfoTooltip>
                Each hour shows two bars: <strong style={{color:'var(--accent)'}}>blue</strong> for weekday (Mon–Fri)
                and <strong style={{color:'#f59e0b'}}>amber</strong> for weekend (Sat–Sun) averages, computed
                across all {activePeriod.days} days in the selected period. For example, the bars at 08:00
                are the mean of every reading taken between 08:00–08:59 on weekdays vs weekends.
                Shaded background = night hours (22:00–06:00). Below the chart: day vs night averages
                and weekday vs weekend averages, each with the percentage difference.
                Hours are shown in your local timezone.
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              Hourly averages for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> across
              all {activePeriod.days} days — weekday vs weekend, day vs night patterns
            </p>
            <HourlyProfileChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={fromDate}
            />
          </div>

          {/* Card 3 — Trend */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              Trend
              <InfoTooltip>
                Shows pre-computed {activePeriod.aggLabel}-by-{activePeriod.aggLabel} aggregations
                calculated by the analytics service every hour. The <strong>line</strong> is
                the average value per {activePeriod.aggLabel}. The <strong>shaded band</strong> shows
                the range between the minimum and maximum recorded in that {activePeriod.aggLabel} —
                a wider band means more variability.
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {activePeriod.aggLabel.charAt(0).toUpperCase() + activePeriod.aggLabel.slice(1)}-by-{activePeriod.aggLabel} averages
              for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> over the last {activePeriod.label.toLowerCase()}
            </p>
            <TrendChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              aggPeriod={activePeriod.aggPeriod}
              from={fromDate}
            />
            <TrendLegend />
          </div>

          {/* Card 4 — Heatmap */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              Weekly Heatmap
              <InfoTooltip>
                Each cell shows the average value for a specific hour of the day (columns)
                and day of the week (rows), computed from all readings in the last {activePeriod.label.toLowerCase()}.
                Darker blue = higher average value. The color scale at the bottom shows
                the range from minimum (left) to maximum (right). Hover any cell for the exact value and sample count.
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              Average <strong>{selectedEntity.label}</strong> per hour × day of week — darker = higher — hover a cell for details
            </p>
            <HeatmapChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={fromDate}
            />
          </div>

        </div>
      )}
    </div>
  )
}
