import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import { useDismissedAnomalies } from '../hooks/useDismissedAnomalies'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import HourlyProfileChart from '../components/HourlyProfileChart'
import TrendChart from '../components/TrendChart'
import HeatmapChart from '../components/HeatmapChart'
import SeasonalChart from '../components/SeasonalChart'
import PredictionChart from '../components/PredictionChart'
import InfoTooltip from '../components/InfoTooltip'
import { getThresholds } from '../utils/thresholds'
import { effectiveTariff } from '../utils/tariffUtils'
import '../styles/Statistics.css'
import '../styles/Anomalies.css'

const PERIODS = [
  { key: '7D',  label: '7 Days',   days: 7,   aggPeriod: 'day',   aggLabel: 'day'   },
  { key: '30D', label: '30 Days',  days: 30,  aggPeriod: 'day',   aggLabel: 'day'   },
  { key: '3M',  label: '3 Months', days: 90,  aggPeriod: 'week',  aggLabel: 'week'  },
  { key: '1Y',  label: '1 Year',   days: 365, aggPeriod: 'month', aggLabel: 'month' },
]

const PRED_MODEL_LABELS = {
  seasonal_naive:   'Seasonal Forecast',
  ridge_regression: 'Ridge Regression',
  random_forest:    'Random Forest',
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

function isPeakHour(h, tariff) {
  if (!tariff?.peak_start || !tariff?.peak_end) return false
  const s = parseInt(tariff.peak_start.slice(0, 2))
  const e = parseInt(tariff.peak_end.slice(0, 2))
  return e > s ? h >= s && h < e : h >= s || h < e
}

function StatCard({ label, value, unit, sub, tooltip, integer }) {
  const formatted = value != null
    ? integer ? Number(value).toLocaleString() : Number(value).toFixed(2)
    : '—'
  return (
    <div className="stat-card">
      <span className="stat-card-label">
        {label}
        {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
      </span>
      <span className="stat-card-value">
        {formatted}
        {value != null && unit && <span className="stat-card-unit"> {unit}</span>}
      </span>
      {sub && <span className="stat-card-sub">{sub}</span>}
    </div>
  )
}

function StatCardPair({ label, value, unit, sub, tooltip, integer,
                        label2, value2, unit2, sub2, tooltip2 }) {
  const fmt = (v, int) => v != null
    ? int ? Number(v).toLocaleString() : Number(v).toFixed(2)
    : '—'
  return (
    <div className="stat-card">
      <span className="stat-card-label">
        {label}{tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
      </span>
      <span className="stat-card-value">
        {fmt(value, integer)}
        {value != null && unit && <span className="stat-card-unit"> {unit}</span>}
      </span>
      {sub && <span className="stat-card-sub">{sub}</span>}

      {value2 != null && (
        <>
          <div className="stat-card-divider" />
          <span className="stat-card-label stat-card-label-sm">
            {label2}{tooltip2 && <InfoTooltip>{tooltip2}</InfoTooltip>}
          </span>
          <span className="stat-card-value stat-card-value-sm">
            {fmt(value2)}
            {unit2 && <span className="stat-card-unit"> {unit2}</span>}
          </span>
          {sub2 && <span className="stat-card-sub">{sub2}</span>}
        </>
      )}
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

function AnomalyList({ anomalies, dismissed, dismiss, restore,
                       showDismissed, setShowDismissed,
                       expandedDays, setExpandedDays, periodLabel }) {
  if (!anomalies.length) return (
    <p className="stats-empty">
      No anomalies detected in this period. The analytics service runs every hour and requires
      at least 50 baseline readings to flag anomalies.
    </p>
  )

  const active     = anomalies.filter(a => !dismissed.has(a.id))
  const dismissed_ = anomalies.filter(a =>  dismissed.has(a.id))
  const visible    = showDismissed ? anomalies : active

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

  return (
    <>
      <div className="anomaly-summary-row">
        {totalCritical > 0 && <span className="anomaly-badge critical">{totalCritical} critical</span>}
        {totalWarning  > 0 && <span className="anomaly-badge warning">{totalWarning} warning</span>}
        <span className="anomaly-summary-text">in the last {periodLabel}</span>
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
        <p className="stats-empty">All anomalies in this period have been dismissed.</p>
      ) : (
        <div className="anomaly-day-groups">
          {sortedKeys.map(key => {
            const rows      = groups[key]
            const activeRows = rows.filter(a => !dismissed.has(a.id))
            const open      = !!expandedDays[key]
            const nCrit     = activeRows.filter(a => a.severity === 'critical').length
            const nWarn     = activeRows.filter(a => a.severity === 'warning').length
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
                        const isDismissed = dismissed.has(a.id)
                        return (
                          <div key={a.id} className={`anomaly-row ${isDismissed ? 'is-dismissed' : ''}`}>
                            <span className={`anomaly-severity-dot ${a.severity}`} />
                            <div className="anomaly-row-main">
                              <span className="anomaly-row-value">
                                {Number(a.value).toFixed(2)}{a.unit ? ` ${a.unit}` : ''}
                              </span>
                              <span className="anomaly-row-baseline">
                                baseline {Number(a.mean).toFixed(2)} ± {Number(a.std_dev).toFixed(2)} · z = {Number(a.z_score).toFixed(2)}
                              </span>
                            </div>
                            <span className="anomaly-row-time">
                              {new Date(a.detected_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isDismissed ? (
                              <button className="anomaly-restore-btn" onClick={e => { e.stopPropagation(); restore(a.id) }}>
                                Restore
                              </button>
                            ) : (
                              <button className="anomaly-dismiss-btn" title="Dismiss" onClick={e => { e.stopPropagation(); dismiss(a.id) }}>
                                ×
                              </button>
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
  )
}

export default function Statistics() {
  const { selectedHome } = useHome()
  const [searchParams] = useSearchParams()
  const [entities, setEntities]             = useState([])
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [period, setPeriod]                 = useState('7D')
  const [overview, setOverview]             = useState(null)
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [tariff, setTariff]                 = useState(null)
  const [splitData, setSplitData]           = useState(null)
  const [splitDataKwh, setSplitDataKwh]     = useState(null)
  const [anomalies, setAnomalies]           = useState(null)
  const [anomalyOpen, setAnomalyOpen]       = useState(false)
  const [showDismissed, setShowDismissed]   = useState(false)
  const [expandedDays, setExpandedDays]     = useState({})
  const [predictions, setPredictions]       = useState([])
  const [predAccuracy, setPredAccuracy]     = useState(null)
  const [loadingPredictions, setLoadingPredictions] = useState(false)
  const { dismissed, dismiss, restore }     = useDismissedAnomalies(selectedHome?.id)
  const [deviceFilter, setDeviceFilter]     = useState('')
  const [search, setSearch]                 = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    if (!selectedHome) return
    Promise.all([
      apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`).then(r => r.json()),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/config`).then(r => r.json()).catch(() => null),
    ]).then(([devices, cfg]) => {
      setTariff(cfg)
      const sensors = devices.flatMap(d => {
        const deviceName = inferDeviceName(d.entities)
        return d.entities
          .filter(e => e.domain === 'sensor' && e.unit)
          .map(e => ({ ...e, label: shortLabel(e.friendly_name, deviceName), deviceName }))
      })
      setEntities(sensors)
      setDeviceFilter('')
      setSearch('')
      setSelectedEntity(prev => {
        const fromUrl = searchParams.get('entity')
        if (fromUrl) return sensors.find(s => s.entity_id === fromUrl) ?? sensors[0] ?? null
        if (!prev) return sensors[0] ?? null
        return sensors.find(s => s.entity_id === prev.entity_id) ?? sensors[0] ?? null
      })
    }).catch(() => {})
  }, [selectedHome])

  useEffect(() => {
    if (!selectedHome || !selectedEntity) return
    const p    = PERIODS.find(p => p.key === period)
    const from = new Date(Date.now() - p.days * 86400 * 1000).toISOString()
    setLoadingOverview(true)
    setSplitData(null)
    setSplitDataKwh(null)
    const entityIsKwh = selectedEntity.device_class === 'energy'
    Promise.all([
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/overview?from=${from}`).then(r => r.json()),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/hourly-profile-split?from=${from}&tz=${TZ}`).then(r => r.json()).catch(() => null),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/anomalies?entity_id=${selectedEntity.entity_id}&from=${from}&limit=500`).then(r => r.json()).catch(() => []),
      entityIsKwh
        ? apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/hourly-agg-split?from=${from}&tz=${TZ}`).then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
    ]).then(([ov, split, anom, splitKwh]) => {
      setOverview(ov)
      setSplitData(split)
      setAnomalies(Array.isArray(anom) ? anom : [])
      setSplitDataKwh(splitKwh)
      setLoadingOverview(false)
    }).catch(() => setLoadingOverview(false))
  }, [selectedHome, selectedEntity, period])

  useEffect(() => {
    const today = new Date().toLocaleDateString()
    setExpandedDays({ [today]: true })
  }, [selectedEntity, period])

  useEffect(() => {
    if (!selectedHome || !selectedEntity) { setPredictions([]); setPredAccuracy(null); return }
    setLoadingPredictions(true)
    Promise.all([
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/predictions`).then(r => r.json()),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/prediction-accuracy`).then(r => r.json()).catch(() => null),
    ]).then(([d, acc]) => {
      setPredictions(Array.isArray(d) ? d : [])
      setPredAccuracy(acc?.available ? acc : null)
      setLoadingPredictions(false)
    }).catch(() => { setPredictions([]); setPredAccuracy(null); setLoadingPredictions(false) })
  }, [selectedHome, selectedEntity])

  const activePeriod    = PERIODS.find(p => p.key === period)
  const fromDate        = new Date(Date.now() - activePeriod.days * 86400 * 1000).toISOString()
  const unit            = selectedEntity?.unit || ''
  const activeThresholds = getThresholds(selectedEntity?.device_class)
  const isEnergyKwh     = selectedEntity?.device_class === 'energy'
  const isEnergyUnit    = unit === 'W' || unit === 'kWh'

  const ThresholdTooltipSection = activeThresholds ? (
    <>
      <hr />
      <strong>Reference lines</strong> — {activeThresholds.source}.<br />
      {activeThresholds.summary}<br />
      {activeThresholds.lines.map((l, i) => (
        <span key={i}>• <strong>{l.chartLabel}</strong>: {l.description}{i < activeThresholds.lines.length - 1 ? <br /> : null}</span>
      ))}
    </>
  ) : null

  const periodDays = overview?.first_recorded && overview?.last_recorded
    ? Math.max(1, (new Date(overview.last_recorded) - new Date(overview.first_recorded)) / 86400000)
    : activePeriod.days

  const periodKwh = (() => {
    if (!overview) return null
    if (unit === 'W')   return parseFloat(overview.avg_value) * periodDays * 24 / 1000
    if (unit === 'kWh') return parseFloat(overview.max_value) - parseFloat(overview.min_value)
    return null
  })()

  const dailyKwh   = periodKwh != null ? periodKwh / periodDays : null
  const weeklyKwh  = dailyKwh  != null ? dailyKwh * 7  : null
  const monthlyKwh = dailyKwh  != null ? dailyKwh * 30 : null

  const tariffRate = effectiveTariff(tariff)
  const currency   = tariff?.currency ?? 'RON'

  const predModelType = predictions[0]?.model_type ?? null

  const predicted24hKwh = (() => {
    if (!predictions.length || !isEnergyUnit) return null
    const next24 = predictions.slice(0, 24)
    if (isEnergyKwh) return next24.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0)
    if (unit === 'W') return next24.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0) / 1000
    return null
  })()

  const predicted7dKwh = (() => {
    if (!predictions.length || !isEnergyUnit) return null
    if (isEnergyKwh) return predictions.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0)
    if (unit === 'W') return predictions.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0) / 1000
    return null
  })()

  const predicted24hVsHistorical = (predicted24hKwh != null && dailyKwh != null && dailyKwh > 0)
    ? (predicted24hKwh - dailyKwh) / dailyKwh * 100
    : null

  const uncertaintyPct = (() => {
    if (!predAccuracy?.mae || !predAccuracy?.mean_actual || predAccuracy.mean_actual < 1e-6) return 15
    return Math.min(50, Math.max(5, Math.round(predAccuracy.mae / predAccuracy.mean_actual * 100)))
  })()

  const wdWeKwh = (() => {
    if (isEnergyKwh && splitDataKwh) {
      const wdKwh = splitDataKwh.reduce((s, h) => s + (h.weekday_avg ?? 0), 0)
      const weKwh = splitDataKwh.reduce((s, h) => s + (h.weekend_avg ?? 0), 0)
      return { wdKwh, weKwh }
    }
    if (!splitData || unit !== 'W') return null
    const wdKwh = splitData.reduce((s, h) => s + (h.weekday_avg ?? 0) / 1000, 0)
    const weKwh = splitData.reduce((s, h) => s + (h.weekend_avg ?? 0) / 1000, 0)
    return { wdKwh, weKwh }
  })()

  const detailedCost = (() => {
    const sourceData = isEnergyKwh ? splitDataKwh : (unit === 'W' ? splitData : null)
    if (!sourceData || !tariff) return null
    const peak    = parseFloat(tariff.tariff_peak)
    const offpeak = parseFloat(tariff.tariff_offpeak)
    const flat    = parseFloat(tariff.tariff_flat)
    const weekend = parseFloat(tariff.tariff_weekend)
    if (!peak && !offpeak && !flat) return null

    let wdCost = 0, weCost = 0
    sourceData.forEach(h => {
      const rate   = (r) => isPeakHour(h.hour, tariff) ? (r.peak || r.flat || 0) : (r.offpeak || r.flat || 0)
      const wdRate = rate({ peak, offpeak, flat })
      const weRate = weekend || rate({ peak, offpeak, flat })
      if (isEnergyKwh) {
        wdCost += (h.weekday_avg ?? 0) * wdRate
        weCost += (h.weekend_avg ?? 0) * weRate
      } else {
        wdCost += (h.weekday_avg ?? 0) / 1000 * wdRate
        weCost += (h.weekend_avg ?? 0) / 1000 * weRate
      }
    })
    const monthlyWdCost = wdCost * 30 * 5 / 7
    const monthlyWeCost = weCost * 30 * 2 / 7
    return { wdCostPerDay: wdCost, weCostPerDay: weCost, monthlyWdCost, monthlyWeCost }
  })()

  const peakHours = (() => {
    if (!splitData || isEnergyKwh) return []
    return splitData
      .filter(h => h.weekday_avg != null || h.weekend_avg != null)
      .map(h => {
        const wdN   = h.weekday_count > 0 ? 5 : 0
        const weN   = h.weekend_count > 0 ? 2 : 0
        const denom = wdN + weN
        const combined = denom > 0
          ? ((h.weekday_avg ?? 0) * wdN + (h.weekend_avg ?? 0) * weN) / denom
          : 0
        return { hour: h.hour, combined }
      })
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 3)
  })()

  const uniqueDevices    = [...new Set(entities.map(e => e.deviceName))].sort()
  const filteredEntities = deviceFilter ? entities.filter(e => e.deviceName === deviceFilter) : entities
  const suggestions      = search.trim().length > 0
    ? entities
        .filter(e => `${e.deviceName} ${e.label} ${e.unit || ''}`.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 8)
    : []

  const handleDeviceChange = (name) => {
    setDeviceFilter(name)
    setSearch('')
    if (!name) return
    const first = entities.find(e => e.deviceName === name)
    if (first) setSelectedEntity(first)
  }

  const handleEntityChange = (entityId) => {
    const entity = entities.find(e => e.entity_id === entityId)
    if (!entity) return
    setSelectedEntity(entity)
    setDeviceFilter(entity.deviceName)
    setSearch('')
  }

  const selectFromSearch = (entity) => {
    setSelectedEntity(entity)
    setDeviceFilter(entity.deviceName)
    setSearch('')
    setShowSuggestions(false)
  }

  if (!selectedHome) return <NoHomeSelected />
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
            <label className="selector-label">Device</label>
            <select
              className="statistics-select"
              value={deviceFilter}
              onChange={e => handleDeviceChange(e.target.value)}
            >
              <option value="">All devices</option>
              {uniqueDevices.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="selector-group">
            <label className="selector-label">Entity</label>
            <select
              className="statistics-select"
              value={selectedEntity?.entity_id || ''}
              onChange={e => handleEntityChange(e.target.value)}
            >
              {filteredEntities.map(e => (
                <option key={e.entity_id} value={e.entity_id}>
                  {deviceFilter ? '' : `${e.deviceName} — `}{e.label}{e.unit ? ` (${e.unit})` : ''}
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

          <div className="selector-group stats-search-group">
            <label className="selector-label">Quick search</label>
            <div className="stats-search-wrap">
              <input
                className="stats-search-input"
                type="text"
                placeholder="Type to search any entity…"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="stats-search-suggestions">
                  {suggestions.map(e => (
                    <button key={e.entity_id} className="stats-suggestion-item" onMouseDown={() => selectFromSearch(e)}>
                      <span className="suggestion-device">{e.deviceName}</span>
                      <span className="suggestion-entity">{e.label}{e.unit ? ` (${e.unit})` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
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
                  label="Readings" value={overview.count} unit="" integer
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

          {/* Card 2 — Consumption & Cost */}
          {isEnergyUnit && (
            <div className="stats-section-card">
              <h2 className="stats-section-title">
                Consumption &amp; Cost
                <InfoTooltip>
                  Consumption is estimated from the raw readings over the selected period.
                  For power sensors (W): average power × hours in period ÷ 1000.
                  For energy sensors (kWh): maximum minus minimum recorded value.
                  Daily, weekly and monthly figures are extrapolated from the measured period.
                  {tariff
                    ? tariff.tariff_peak && tariff.tariff_offpeak
                      ? ` Cost uses your configured peak (${tariff.tariff_peak} ${currency}/kWh, ${tariff.peak_start?.slice(0,5)}–${tariff.peak_end?.slice(0,5)}) and off-peak (${tariff.tariff_offpeak} ${currency}/kWh) rates${tariff.tariff_weekend ? `, weekend rate ${tariff.tariff_weekend} ${currency}/kWh` : ''}.`
                      : ` Cost uses your configured flat rate (${tariff.tariff_flat} ${currency}/kWh).`
                    : ' Configure your electricity tariff in Settings to see cost estimates.'}
                </InfoTooltip>
              </h2>
              <p className="stats-section-subtitle">
                Estimated energy use and cost for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — last {activePeriod.label.toLowerCase()}
              </p>
              {loadingOverview ? (
                <p className="stats-loading">Loading...</p>
              ) : periodKwh != null ? (
                <>
                  <div className="stat-cards-grid">
                    <StatCardPair
                      label="Total in period" value={periodKwh} unit="kWh"
                      sub={`Over ${Math.round(periodDays)} days of data`}
                      tooltip={unit === 'W'
                        ? `Average power (${parseFloat(overview.avg_value).toFixed(1)} W) × ${Math.round(periodDays)} days × 24h ÷ 1000`
                        : `Cumulative energy delta: max (${parseFloat(overview.max_value).toFixed(2)}) − min (${parseFloat(overview.min_value).toFixed(2)}) kWh`}
                      label2="Cost in period"
                      value2={tariffRate != null ? periodKwh * tariffRate : null}
                      unit2={currency}
                      sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                      tooltip2={tariffRate != null ? `Total consumption × effective rate (${tariffRate.toFixed(4)} ${currency}/kWh). The effective rate is the time-weighted average of your peak, off-peak${tariff?.tariff_weekend ? ', and weekend' : ''} tariffs across a typical week.` : undefined}
                    />
                    <StatCardPair
                      label="Daily average" value={dailyKwh} unit="kWh/day"
                      sub="Extrapolated from period"
                      tooltip="Total consumption in the measured period divided by the number of days."
                      label2="Daily cost estimate"
                      value2={tariffRate != null && dailyKwh != null ? dailyKwh * tariffRate : null}
                      unit2={`${currency}/day`}
                      sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                    />
                    <StatCardPair
                      label="Weekly estimate" value={weeklyKwh} unit="kWh/week"
                      sub="Daily average × 7"
                      tooltip="Daily average multiplied by 7. Assumes the measured period is representative."
                      label2="Weekly cost estimate"
                      value2={tariffRate != null && weeklyKwh != null ? weeklyKwh * tariffRate : null}
                      unit2={`${currency}/week`}
                      sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                    />
                    <StatCardPair
                      label="Monthly estimate" value={monthlyKwh} unit="kWh/month"
                      sub="Daily average × 30"
                      tooltip="Daily average multiplied by 30. Assumes the measured period is representative of the full month."
                      label2="Monthly cost estimate"
                      value2={tariffRate != null && monthlyKwh != null ? monthlyKwh * tariffRate : null}
                      unit2={`${currency}/month`}
                      sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                      tooltip2={tariffRate != null ? "Monthly consumption estimate multiplied by the effective weighted tariff rate." : undefined}
                    />
                  </div>

                  {unit === 'W' && (
                    <p className="consumption-note">
                      <strong>Accuracy note:</strong> These figures assume the sensor reports 0 W when the appliance is off.
                      If the sensor only sends readings during active use, the average will be higher than the true average power
                      and consumption will be overestimated. For best accuracy, use a kWh cumulative sensor if the appliance has one.
                    </p>
                  )}

                  {wdWeKwh && (
                    <div className="wdwe-section">
                      <p className="stats-section-subtitle">
                        Weekday vs weekend daily consumption
                        <InfoTooltip>
                          {isEnergyKwh
                            ? 'Computed from hourly aggregations: average consumption delta (max − min kWh) per hour slot, grouped by weekday (Mon–Fri) and weekend (Sat–Sun). '
                            : 'Computed from the hourly profile: sum of average power readings for each of the 24 hours on weekdays (Mon–Fri) and weekends (Sat–Sun), converted to kWh per day. Hours with no readings contribute 0 — if the appliance does not report when idle, those hours are treated as zero consumption, which may underestimate total daily use. '}
                          {detailedCost ? `Cost per day uses the actual peak/off-peak rate for each hour${tariff?.tariff_weekend ? ' and the configured weekend rate' : ''}.` : ''}
                        </InfoTooltip>
                      </p>
                      <div className="stat-cards-grid">
                        <StatCardPair
                          label="Weekday daily" value={wdWeKwh.wdKwh} unit="kWh/day"
                          sub={`~${(30 * 5 / 7).toFixed(0)} weekdays/month`}
                          tooltip={isEnergyKwh
                            ? 'Sum of average hourly consumption deltas on weekdays (Mon–Fri), from hourly aggregation data.'
                            : 'Sum of average hourly power on weekdays (Mon–Fri), converted to kWh per day.'}
                          label2={detailedCost ? 'Cost / day (weekdays)' : undefined}
                          value2={detailedCost?.wdCostPerDay}
                          unit2={`${currency}/day`}
                          sub2={detailedCost ? `~${detailedCost.monthlyWdCost.toFixed(0)} ${currency}/month (weekdays)` : undefined}
                          tooltip2={detailedCost ? `Weekday cost per day × ${(30 * 5 / 7).toFixed(1)} weekdays per month. Uses peak/off-peak rate per hour.` : undefined}
                        />
                        <StatCardPair
                          label="Weekend daily" value={wdWeKwh.weKwh} unit="kWh/day"
                          sub={`~${(30 * 2 / 7).toFixed(0)} weekend days/month`}
                          tooltip={isEnergyKwh
                            ? 'Sum of average hourly consumption deltas on weekends (Sat–Sun), from hourly aggregation data.'
                            : 'Sum of average hourly power on weekends (Sat–Sun), converted to kWh per day.'}
                          label2={detailedCost ? 'Cost / day (weekends)' : undefined}
                          value2={detailedCost?.weCostPerDay}
                          unit2={`${currency}/day`}
                          sub2={detailedCost ? `~${detailedCost.monthlyWeCost.toFixed(0)} ${currency}/month (weekends)` : undefined}
                          tooltip2={detailedCost ? `Weekend cost per day × ${(30 * 2 / 7).toFixed(1)} weekend days per month.${tariff?.tariff_weekend ? ` Uses configured weekend rate (${tariff.tariff_weekend} ${currency}/kWh).` : ' Uses same peak/off-peak rates as weekdays.'}` : undefined}
                        />
                      </div>
                    </div>
                  )}

                  {!tariffRate && (
                    <p className="stats-empty anomaly-open-subtitle">
                      Configure your electricity tariff in Settings to see cost estimates.
                    </p>
                  )}
                </>
              ) : (
                <p className="stats-empty">No data available for this period.</p>
              )}
            </div>
          )}

          {/* Card 2b — Predicted Consumption & Cost */}
          {isEnergyUnit && (predicted24hKwh != null || loadingPredictions) && (
            <div className="stats-section-card">
              <div className="prediction-card-top">
                <div>
                  <h2 className="stats-section-title">
                    Predicted Consumption &amp; Cost
                    <InfoTooltip>
                      Forecast generated by the analytics service using historical hourly aggregations.
                      {predModelType && <> Model: <strong>{PRED_MODEL_LABELS[predModelType] ?? predModelType}</strong>.</>}
                      {' '}For power sensors (W): hourly predicted average power summed over the period ÷ 1000.
                      For energy sensors (kWh): sum of predicted hourly consumption deltas.
                      Predictions are refreshed every hour. Accuracy depends on data volume and usage pattern regularity.
                    </InfoTooltip>
                  </h2>
                  <p className="stats-section-subtitle">
                    Forecast for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong>
                    {predModelType && (
                      <span className="prediction-model-tag">
                        · {PRED_MODEL_LABELS[predModelType] ?? predModelType}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {predAccuracy && (
                <p className="prediction-accuracy-note">
                  <strong>Model accuracy (last 7 days):</strong>{' '}
                  average error ±{predAccuracy.mae != null ? predAccuracy.mae.toFixed(2) : '—'}{unit ? ` ${unit}` : ''}
                  {predAccuracy.mean_actual != null && predAccuracy.mean_actual > 1e-6
                    ? ` (${uncertaintyPct}% of mean value)`
                    : ''}
                  {predAccuracy.n > 0 && `, based on ${predAccuracy.n} hourly comparisons`}.
                  {' '}The forecast band in the chart below reflects this uncertainty (±{uncertaintyPct}%).
                </p>
              )}
              {loadingPredictions ? (
                <p className="stats-loading">Loading forecast...</p>
              ) : (
                <div className="stat-cards-grid">
                  <StatCardPair
                    label="Next 24 hours" value={predicted24hKwh} unit="kWh"
                    sub={predicted24hVsHistorical != null
                      ? `${predicted24hVsHistorical > 0 ? '+' : ''}${predicted24hVsHistorical.toFixed(0)}% vs historical daily avg`
                      : 'Compared to historical average'}
                    tooltip={unit === 'W'
                      ? 'Sum of predicted hourly average power for the next 24 hours, converted to kWh.'
                      : 'Sum of predicted hourly energy deltas for the next 24 hours.'}
                    label2="Estimated cost (24h)"
                    value2={tariffRate != null && predicted24hKwh != null ? predicted24hKwh * tariffRate : null}
                    unit2={currency}
                    sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                    tooltip2="Predicted 24-hour consumption multiplied by the effective weighted tariff rate."
                  />
                  <StatCardPair
                    label="Next 7 days" value={predicted7dKwh} unit="kWh"
                    sub="7-day forecast total"
                    tooltip="Total predicted consumption over the next 7 days."
                    label2="Estimated cost (7 days)"
                    value2={tariffRate != null && predicted7dKwh != null ? predicted7dKwh * tariffRate : null}
                    unit2={currency}
                    sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                    tooltip2="Predicted 7-day consumption multiplied by the effective weighted tariff rate."
                  />
                </div>
              )}
            </div>
          )}

          {/* Card 3 — Daily Pattern */}
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
                {ThresholdTooltipSection}
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {isEnergyKwh
                ? <>Average kWh consumed per hour for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — weekday vs weekend pattern</>
                : <>Hourly averages for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> across all {activePeriod.days} days — weekday vs weekend, day vs night patterns</>
              }
            </p>
            <HourlyProfileChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={fromDate}
              deviceClass={selectedEntity.device_class}
            />
            {peakHours.length > 0 && (
              <div className="peak-hours-row">
                <span className="peak-hours-label">Peak consumption hours:</span>
                {peakHours.map(({ hour, combined }) => (
                  <span key={hour} className="peak-hour-chip">
                    <span className="peak-hour-time">{String(hour).padStart(2, '0')}:00</span>
                    <span className="peak-hour-value">
                      avg {combined >= 1000
                        ? `${(combined / 1000).toFixed(2)} k${unit}`
                        : `${combined.toFixed(1)} ${unit}`}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Card 4 — Seasonal Pattern */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              Seasonal Pattern
              <InfoTooltip>
                Each line shows the average value per hour of the day for one meteorological season:
                Spring (Mar–May), Summer (Jun–Aug), Autumn (Sep–Nov), Winter (Dec–Feb).
                Only seasons present in the available data are drawn — a full comparison requires at least one year of readings.
                Hours are shown in your local timezone.
                {ThresholdTooltipSection}
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {isEnergyKwh
                ? <>Average kWh consumed per hour by season for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — all available data</>
                : <>Hourly averages per season for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — all available data</>
              }
            </p>
            <SeasonalChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              deviceClass={selectedEntity.device_class}
            />
          </div>

          {/* Card 5 — Trend */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              Trend
              <InfoTooltip>
                Shows pre-computed {activePeriod.aggLabel}-by-{activePeriod.aggLabel} aggregations
                calculated by the analytics service every hour. The <strong>line</strong> is
                the average value per {activePeriod.aggLabel}. The <strong>shaded band</strong> shows
                the range between the minimum and maximum recorded in that {activePeriod.aggLabel} —
                a wider band means more variability.
                {isEnergyKwh && (
                  <><hr /><strong>Cumulative energy meter:</strong> This sensor only ever increases — the raw average value has no meaningful interpretation on a trend chart. Instead, each {activePeriod.aggLabel} point shows the <strong>energy consumed within that {activePeriod.aggLabel}</strong> (maximum minus minimum cumulative reading). The min–max band is hidden since the values are already deltas.</>
                )}
                {ThresholdTooltipSection}
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {isEnergyKwh
                ? <>{activePeriod.aggLabel.charAt(0).toUpperCase() + activePeriod.aggLabel.slice(1)}-by-{activePeriod.aggLabel} <strong>consumption</strong> for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> over the last {activePeriod.label.toLowerCase()}</>
                : <>{activePeriod.aggLabel.charAt(0).toUpperCase() + activePeriod.aggLabel.slice(1)}-by-{activePeriod.aggLabel} averages for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> over the last {activePeriod.label.toLowerCase()}</>
              }
            </p>
            <TrendChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              aggPeriod={activePeriod.aggPeriod}
              from={fromDate}
              deviceClass={selectedEntity.device_class}
            />
            {!isEnergyKwh && <TrendLegend />}
          </div>

          {/* Card 6 — Anomalies */}
          {anomalies !== null && (
            <div className="stats-section-card">
              <div className="anomaly-collapse-header" onClick={() => setAnomalyOpen(o => !o)}>
                <h2 className="stats-section-title">
                  Anomaly Detection
                  <InfoTooltip>
                    Values are flagged as anomalies when their Z-score exceeds a threshold relative to
                    the 30-day baseline for this sensor. Z = (value − mean) / std deviation.
                    Z ≥ 2.5 = <strong>warning</strong> (unusual but possible).
                    Z ≥ 3.5 = <strong>critical</strong> (very rare under normal conditions).
                    Sensors with fewer than 50 baseline readings or zero variance are skipped.
                    kWh cumulative sensors and switches are excluded.
                  </InfoTooltip>
                </h2>
                <span className="anomaly-collapse-chevron">{anomalyOpen ? '▲' : '▼'}</span>
              </div>

              {anomalyOpen && (
                <>
                  <p className="stats-section-subtitle anomaly-open-subtitle">
                    Anomalous readings for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — last {activePeriod.label.toLowerCase()}
                  </p>
                  {loadingOverview ? (
                    <p className="stats-loading">Loading...</p>
                  ) : isEnergyKwh ? (
                    <p className="stats-empty anomaly-open-subtitle">
                      Anomaly detection is not applied to cumulative energy meters — the value only increases
                      over time, so z-score comparison against a baseline has no meaningful interpretation.
                      Anomaly detection runs on instantaneous sensors (power W, temperature, CO₂, humidity, etc.).
                    </p>
                  ) : (
                    <AnomalyList
                      anomalies={anomalies}
                      dismissed={dismissed}
                      dismiss={dismiss}
                      restore={restore}
                      showDismissed={showDismissed}
                      setShowDismissed={setShowDismissed}
                      expandedDays={expandedDays}
                      setExpandedDays={setExpandedDays}
                      periodLabel={activePeriod.label.toLowerCase()}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Card 7 — Weekly Heatmap */}
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
              {isEnergyKwh
                ? <>Average kWh consumed per slot for <strong>{selectedEntity.label}</strong> — darker = more consumption — hover a cell for details</>
                : <>Average <strong>{selectedEntity.label}</strong> per hour × day of week — darker = higher — hover a cell for details</>
              }
            </p>
            <HeatmapChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={fromDate}
              deviceClass={selectedEntity.device_class}
            />
          </div>

          {/* Card 8 — 7-Day Forecast */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              7-Day Forecast
              <InfoTooltip>
                Predicted daily values for the next 7 days, shown alongside the last 7 days of historical data.
                The shaded band reflects the model's historical error (see the accuracy note below the chart).
                The model is retrained every hour using the latest available data.{' '}
                {isEnergyKwh
                  ? 'For cumulative energy sensors: the chart shows predicted daily consumption (sum of hourly deltas), consistent with the Trend chart.'
                  : 'The chart shows predicted daily average values, consistent with the Trend chart.'}
                Three models are used depending on data volume:{' '}
                <strong>Seasonal Forecast</strong> (fewer than 2 weeks of data — historical average per hour and day of week),{' '}
                <strong>Ridge Regression</strong> (2–8 weeks — linear model with Fourier seasonal features),{' '}
                <strong>Random Forest</strong> (more than 8 weeks — non-linear model capturing complex usage patterns).
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              Historical and predicted daily {isEnergyKwh ? 'consumption' : 'average'} for{' '}
              <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong>
            </p>
            <PredictionChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={isEnergyKwh ? 'kWh' : unit}
              deviceClass={selectedEntity.device_class}
              uncertaintyPct={uncertaintyPct}
            />
            {predAccuracy && (
              <p className="forecast-note">
                Shaded band = ±{uncertaintyPct}% uncertainty.
                {' '}Average error over last 7 days: ±{predAccuracy.mae != null ? predAccuracy.mae.toFixed(2) : '—'}{unit ? ` ${unit}` : ''}
                {predAccuracy.mean_actual != null && predAccuracy.mean_actual > 1e-6
                  ? ` (${uncertaintyPct}% of mean)`
                  : ''}
                {predAccuracy.n > 0 ? `, ${predAccuracy.n} comparisons.` : '.'}
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
