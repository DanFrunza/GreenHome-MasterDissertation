import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import { usePageTitle } from '../hooks/usePageTitle'
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
import { useConfig } from '../hooks/useConfig'
import { effectiveTariff } from '../utils/tariffUtils'
import { formatSensorValue } from '../utils/formatValue'
import '../styles/Statistics.css'
import '../styles/Anomalies.css'

const PERIODS = [
  { key: '7D',  label: '7 Days',   days: 7,   aggPeriod: 'day',   aggLabel: 'day'   },
  { key: '30D', label: '30 Days',  days: 30,  aggPeriod: 'day',   aggLabel: 'day'   },
  { key: '3M',  label: '3 Months', days: 90,  aggPeriod: 'week',  aggLabel: 'week'  },
  { key: '6M',  label: '6 Months', days: 183, aggPeriod: 'month', aggLabel: 'month' },
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

function StatCard({ label, value, unit, sub, tooltip, integer, deviceClass }) {
  const formatted = value != null
    ? integer ? Number(value).toLocaleString() : formatSensorValue(value, deviceClass)
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

function StatCardPair({ label, value, unit, sub, tooltip, integer, deviceClass,
                        label2, value2, unit2, sub2, tooltip2 }) {
  const fmt = (v, int, dc) => v != null
    ? int ? Number(v).toLocaleString() : formatSensorValue(v, dc)
    : '—'
  return (
    <div className="stat-card">
      <span className="stat-card-label">
        {label}{tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
      </span>
      <span className="stat-card-value">
        {fmt(value, integer, deviceClass)}
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
            {fmt(value2, false, null)}
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
                       expandedDays, setExpandedDays, periodLabel, deviceClass }) {
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
        <span className="anomaly-summary-text">in {periodLabel}</span>
        {dismissed_.length > 0 && (
          <button
            className={`anomaly-toggle-dismissed ${showDismissed ? 'active' : ''}`}
            onClick={() => setShowDismissed(s => !s)}
          >
            {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissed_.length})`}
          </button>
        )}
        {anomalies.length >= 500 && (
          <span className="anomaly-summary-text" style={{ fontStyle: 'italic' }}>
            — showing first 500. Narrow the period to see all.
          </span>
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
                <div
                  className="anomaly-day-header"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedDays(prev => ({ ...prev, [key]: !prev[key] }))}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedDays(prev => ({ ...prev, [key]: !prev[key] }))}
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
                        const isDismissed = dismissed.has(a.id)
                        const direction   = Number(a.value) > Number(a.mean) ? '↑' : '↓'
                        const dc          = a.device_class || deviceClass
                        return (
                          <div key={a.id} className={`anomaly-row ${isDismissed ? 'is-dismissed' : ''}`}>
                            <span className={`anomaly-severity-dot ${a.severity}`} />
                            <div className="anomaly-row-main">
                              <span className="anomaly-row-value">
                                <span style={{ marginRight: '0.2em', opacity: 0.7 }}>{direction}</span>
                                {formatSensorValue(a.value, dc)}{a.unit ? ` ${a.unit}` : ''}
                              </span>
                              <span className="anomaly-row-baseline">
                                baseline {formatSensorValue(a.mean, dc)} ± {formatSensorValue(a.std_dev, dc)}{a.unit ? ` ${a.unit}` : ''} · z = {Number(a.z_score).toFixed(2)}
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
  usePageTitle('Statistics')
  const { selectedHome } = useHome()
  const { thresholds: thresholdsData = null } = useConfig()
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
  const [customFrom, setCustomFrom]         = useState('')
  const [customTo, setCustomTo]             = useState('')
  const [customPickerOpen, setCustomPickerOpen] = useState(false)
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [recentEntities, setRecentEntities]   = useState([])
  const [meterResets, setMeterResets]         = useState([])
  const [prevOverview, setPrevOverview]       = useState(null)
  const [filtersOpen, setFiltersOpen]         = useState(true)

  useEffect(() => {
    if (!selectedHome) return
    setLoadingEntities(true)
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
      setLoadingEntities(false)
    }).catch(() => setLoadingEntities(false))
  }, [selectedHome])

  useEffect(() => {
    if (!selectedHome) return
    try {
      const stored = localStorage.getItem(`greennest_recent_${selectedHome.id}`)
      setRecentEntities(stored ? JSON.parse(stored) : [])
    } catch { setRecentEntities([]) }
  }, [selectedHome?.id])

  useEffect(() => {
    if (!selectedEntity || !selectedHome) return
    setRecentEntities(prev => {
      const filtered = prev.filter(e => e.entity_id !== selectedEntity.entity_id)
      const next = [{
        entity_id: selectedEntity.entity_id,
        label: selectedEntity.label,
        deviceName: selectedEntity.deviceName,
        unit: selectedEntity.unit,
        device_class: selectedEntity.device_class,
      }, ...filtered].slice(0, 5)
      localStorage.setItem(`greennest_recent_${selectedHome.id}`, JSON.stringify(next))
      return next
    })
  }, [selectedEntity?.entity_id, selectedHome?.id])

  useEffect(() => {
    if (!selectedHome || !selectedEntity) return
    if (period === 'custom' && !customFrom) return
    const from = period === 'custom'
      ? new Date(customFrom).toISOString()
      : new Date(Date.now() - (PERIODS.find(p => p.key === period)?.days ?? 7) * 86400 * 1000).toISOString()
    const to = period === 'custom' && customTo ? new Date(customTo).toISOString() : ''
    const toParam = to ? `&to=${to}` : ''
    setLoadingOverview(true)
    setSplitData(null)
    setSplitDataKwh(null)
    setMeterResets([])
    setPrevOverview(null)
    const entityIsKwh = selectedEntity.device_class === 'energy'
    const periodDaysForFetch = period === 'custom' && customFrom && customTo
      ? Math.max(1, (new Date(customTo) - new Date(customFrom)) / 86400000)
      : (PERIODS.find(p => p.key === period)?.days ?? 7)
    const prevFrom = new Date(new Date(from).getTime() - periodDaysForFetch * 86400 * 1000).toISOString()
    Promise.all([
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/overview?from=${from}${toParam}`).then(r => r.json()),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/hourly-profile-split?from=${from}${toParam}&tz=${TZ}`).then(r => r.json()).catch(() => null),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/anomalies?entity_id=${selectedEntity.entity_id}&from=${from}${toParam}&limit=500`).then(r => r.json()).catch(() => []),
      entityIsKwh
        ? apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/hourly-agg-split?from=${from}${toParam}&tz=${TZ}`).then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
      entityIsKwh
        ? apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/meter-resets`).then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntity.entity_id}/overview?from=${prevFrom}&to=${from}`).then(r => r.json()).catch(() => null),
    ]).then(([ov, split, anom, splitKwh, resets, prevOv]) => {
      setOverview(ov)
      setSplitData(split)
      setAnomalies(Array.isArray(anom) ? anom : [])
      setSplitDataKwh(splitKwh)
      setMeterResets(Array.isArray(resets) ? resets : [])
      setPrevOverview(prevOv)
      setLoadingOverview(false)
    }).catch(() => setLoadingOverview(false))
  }, [selectedHome, selectedEntity, period, customFrom, customTo])

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

  const activePeriod = (() => {
    if (period === 'custom' && customFrom) {
      const from = new Date(customFrom)
      const to   = customTo ? new Date(customTo) : new Date()
      const days = Math.max(1, (to - from) / 86400000)
      const aggPeriod = days <= 31 ? 'day' : days <= 180 ? 'week' : 'month'
      return { key: 'custom', label: 'Custom range', days, aggPeriod, aggLabel: aggPeriod }
    }
    return PERIODS.find(p => p.key === period) ?? PERIODS[0]
  })()
  const fromDate = period === 'custom' && customFrom
    ? new Date(customFrom).toISOString()
    : new Date(Date.now() - activePeriod.days * 86400 * 1000).toISOString()
  const toDate   = period === 'custom' && customTo ? new Date(customTo).toISOString() : undefined
  const unit            = selectedEntity?.unit || ''
  const activeThresholds = getThresholds(selectedEntity?.device_class, thresholdsData)
  const isEnergyKwh     = selectedEntity?.device_class === 'energy'
  const isEnergyUnit    = unit === 'W' || unit === 'kWh'
  // Period-aware text helpers — "last 7 days" for preset, "selected range" for custom
  const periodLabel   = period === 'custom' ? 'selected range'     : `last ${activePeriod.label.toLowerCase()}`
  const periodInText  = period === 'custom' ? 'the selected range'  : `the last ${activePeriod.label.toLowerCase()}`

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

  const sampleRateSub = (() => {
    if (!overview?.count || !periodDays) return null
    const mins = (periodDays * 24 * 60) / overview.count
    if (mins < 1.5)  return '~1 reading/min'
    if (mins < 60)   return `~every ${Math.round(mins)} min`
    return `~every ${Math.round(mins / 60)} h`
  })()

  const fmtTs = ts => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  const resetsInPeriod = meterResets.filter(r => {
    const t = new Date(r.reset_at)
    return t >= new Date(fromDate) && (!toDate || t <= new Date(toDate))
  })

  const readingsDateSub = (() => {
    if (!overview?.first_recorded) return sampleRateSub
    const spanDays = Math.round((new Date(overview.last_recorded) - new Date(overview.first_recorded)) / 86400000)
    const fmt = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const dateStr = `${fmt(overview.first_recorded)} – ${fmt(overview.last_recorded)} · ${spanDays} day${spanDays !== 1 ? 's' : ''}`
    return sampleRateSub ? `${dateStr} · ${sampleRateSub}` : dateStr
  })()

  const periodKwh = (() => {
    if (!overview) return null
    if (unit === 'W') return parseFloat(overview.avg_value) * periodDays * 24 / 1000
    if (unit === 'kWh') {
      if (resetsInPeriod.length === 0) {
        return Math.max(0, parseFloat(overview.max_value) - parseFloat(overview.min_value))
      }
      // Reset-aware: sum consumption across each segment between resets
      const sorted = [...resetsInPeriod].sort((a, b) => new Date(a.reset_at) - new Date(b.reset_at))
      let total = 0
      let segStart = parseFloat(overview.first_value ?? overview.min_value)
      for (const r of sorted) {
        total += Math.max(0, parseFloat(r.value_before ?? segStart) - segStart)
        segStart = parseFloat(r.value_after ?? 0)
      }
      total += Math.max(0, parseFloat(overview.period_last_value ?? overview.max_value) - segStart)
      return total
    }
    return null
  })()

  const dailyKwh   = periodKwh != null ? periodKwh / periodDays : null
  const weeklyKwh  = dailyKwh  != null ? dailyKwh * 7   : null
  const monthlyKwh = dailyKwh  != null ? dailyKwh * 30  : null
  const annualKwh  = dailyKwh  != null ? dailyKwh * 365 : null

  const prevFromDate = new Date(new Date(fromDate).getTime() - activePeriod.days * 86400 * 1000).toISOString()
  const prevToDate   = fromDate

  const prevPeriodDays = prevOverview?.first_recorded && prevOverview?.last_recorded
    ? Math.max(1, (new Date(prevOverview.last_recorded) - new Date(prevOverview.first_recorded)) / 86400000)
    : activePeriod.days

  const prevResetsInPeriod = meterResets.filter(r => {
    const t = new Date(r.reset_at)
    return t >= new Date(prevFromDate) && t < new Date(fromDate)
  })

  const prevPeriodKwh = (() => {
    if (!prevOverview?.avg_value && !prevOverview?.max_value) return null
    if (unit === 'W') {
      if (!prevOverview.avg_value) return null
      return parseFloat(prevOverview.avg_value) * prevPeriodDays * 24 / 1000
    }
    if (unit === 'kWh') {
      if (!prevOverview.max_value) return null
      if (prevResetsInPeriod.length === 0) {
        return Math.max(0, parseFloat(prevOverview.max_value) - parseFloat(prevOverview.min_value))
      }
      const sorted = [...prevResetsInPeriod].sort((a, b) => new Date(a.reset_at) - new Date(b.reset_at))
      let total = 0
      let segStart = parseFloat(prevOverview.first_value ?? prevOverview.min_value)
      for (const r of sorted) {
        total += Math.max(0, parseFloat(r.value_before ?? segStart) - segStart)
        segStart = parseFloat(r.value_after ?? 0)
      }
      total += Math.max(0, parseFloat(prevOverview.period_last_value ?? prevOverview.max_value) - segStart)
      return total
    }
    return null
  })()

  const vsLastPeriodPct = prevPeriodKwh != null && prevPeriodKwh > 0.001 && periodKwh != null
    ? (periodKwh - prevPeriodKwh) / prevPeriodKwh * 100
    : null

  const tariffRate = effectiveTariff(tariff)
  const currency   = tariff?.currency ?? 'RON'

  const predModelType = predictions[0]?.model_type ?? null

  const predicted24hKwh = (() => {
    if (!predictions.length || !isEnergyUnit) return null
    if (predictions.length < 24) return null
    const next24 = predictions.slice(0, 24)
    if (isEnergyKwh) return next24.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0)
    if (unit === 'W') return next24.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0) / 1000
    return null
  })()

  const predicted7dKwh = (() => {
    if (!predictions.length || !isEnergyUnit) return null
    if (predictions.length < 168) return null
    const next7d = predictions.slice(0, 168)
    if (isEnergyKwh) return next7d.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0)
    if (unit === 'W') return next7d.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0) / 1000
    return null
  })()

  const predicted30dKwh = (() => {
    if (!predictions.length || !isEnergyUnit) return null
    if (predictions.length < 720) return null
    const next30d = predictions.slice(0, 720)
    if (isEnergyKwh) return next30d.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0)
    if (unit === 'W') return next30d.reduce((s, p) => s + Math.max(0, parseFloat(p.predicted_value)), 0) / 1000
    return null
  })()

  const predicted24hVsHistorical = (predicted24hKwh != null && dailyKwh != null && dailyKwh > 0)
    ? (predicted24hKwh - dailyKwh) / dailyKwh * 100
    : null

  const predicted7dVsHistorical = predicted7dKwh != null && weeklyKwh != null && weeklyKwh > 0
    ? (predicted7dKwh - weeklyKwh) / weeklyKwh * 100
    : null

  const predicted30dVsHistorical = predicted30dKwh != null && monthlyKwh != null && monthlyKwh > 0
    ? (predicted30dKwh - monthlyKwh) / monthlyKwh * 100
    : null

  const rawUncertaintyPct = predAccuracy?.mae && predAccuracy?.mean_actual > 1e-6
    ? Math.max(5, Math.round(predAccuracy.mae / predAccuracy.mean_actual * 100))
    : 15
  const uncertaintyPct = Math.min(50, rawUncertaintyPct)

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
      const weRate = (tariff.tariff_weekend != null && !isNaN(weekend)) ? weekend : rate({ peak, offpeak, flat })
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

  const wdWeConsumptionDiffPct = wdWeKwh?.wdKwh > 0
    ? Math.round((wdWeKwh.weKwh - wdWeKwh.wdKwh) / wdWeKwh.wdKwh * 100)
    : null
  const wdWeCostDiffPct = detailedCost?.wdCostPerDay > 0
    ? Math.round((detailedCost.weCostPerDay - detailedCost.wdCostPerDay) / detailedCost.wdCostPerDay * 100)
    : null

  const prevPeriodCost = prevPeriodKwh != null && tariffRate != null ? prevPeriodKwh * tariffRate : null

  const peakHours = (() => {
    const source = isEnergyKwh ? splitDataKwh : splitData
    if (!source) return []
    return source
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
  if (!loadingEntities && entities.length === 0) return (
    <div className="content-padding">
      <div className="stats-no-sensors">
        <p className="stats-no-sensors-title">No sensor data yet</p>
        <p className="stats-no-sensors-desc">
          Make sure your local agent is online and your devices have at least one recorded measurement.
          Only sensors with a unit (temperature, power, CO₂, etc.) appear here — switches and binary sensors are excluded.
        </p>
      </div>
    </div>
  )
  return (
    <div className="content-padding">
      <div className="statistics-header">
        <div>
          <h1 className="statistics-title">Statistics</h1>
          <p className="statistics-subtitle">Explore trends, patterns and anomalies across your home sensors</p>
          {entities.length > 0 && (
            <p className="statistics-entity-count">
              {entities.length} sensor{entities.length !== 1 ? 's' : ''} · {uniqueDevices.length} device{uniqueDevices.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="statistics-container">
        <div className="stat-filters-bar">
          {!filtersOpen && (
            <span className="stat-filters-summary">
              {deviceFilter || 'All devices'}
              {selectedEntity ? ` — ${selectedEntity.label}` : ''}
              <span className="stat-filters-summary-period">
                {period === 'custom' ? 'Custom' : PERIODS.find(p => p.key === period)?.label}
              </span>
            </span>
          )}
          <button
            className="stat-filters-toggle"
            onClick={() => setFiltersOpen(o => !o)}
            title={filtersOpen ? 'Collapse filters' : 'Expand filters'}
          >
            {filtersOpen ? '▲ Hide filters' : '▼ Filters'}
          </button>
        </div>
        {filtersOpen && <div className="statistics-selectors">
          <div className="selector-group">
            <label className="selector-label">Device</label>
            <select
              className="statistics-select"
              value={deviceFilter}
              onChange={e => handleDeviceChange(e.target.value)}
              disabled={loadingEntities}
            >
              {loadingEntities
                ? <option>Loading sensors…</option>
                : <>
                    <option value="">All devices</option>
                    {uniqueDevices.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </>
              }
            </select>
          </div>

          <div className="selector-group">
            <label className="selector-label">Entity</label>
            <select
              className="statistics-select"
              value={selectedEntity?.entity_id || ''}
              onChange={e => handleEntityChange(e.target.value)}
              disabled={loadingEntities}
            >
              {loadingEntities
                ? <option>Loading sensors…</option>
                : filteredEntities.map(e => (
                    <option key={e.entity_id} value={e.entity_id}>
                      {deviceFilter ? '' : `${e.deviceName} — `}{e.label}{e.unit ? ` (${e.unit})` : ''}
                    </option>
                  ))
              }
            </select>
          </div>

          <div className="selector-group">
            <label className="selector-label">
              Period
              {!(period === 'custom' && !customFrom) && (() => {
                const from = new Date(fromDate)
                const to   = period === 'custom' && customTo ? new Date(customTo + 'T23:59:59') : new Date()
                const sameYear = from.getFullYear() === to.getFullYear()
                const fmt = (d, yr) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(yr ? { year: 'numeric' } : {}) })
                const isCustom = period === 'custom'
                return (
                  <span
                    className={`period-date-hint ${isCustom ? 'period-date-hint-clickable' : ''}`}
                    onClick={isCustom ? () => setCustomPickerOpen(o => !o) : undefined}
                    title={isCustom ? 'Click to edit date range' : undefined}
                  >
                    {fmt(from, !sameYear)} – {fmt(to, true)}
                    {isCustom && <span className="period-date-hint-edit">✎</span>}
                  </span>
                )
              })()}
            </label>
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
              <button
                className={`period-pill ${period === 'custom' ? 'active' : ''}`}
                onClick={() => { setPeriod('custom'); setCustomPickerOpen(true) }}
              >
                Custom
              </button>
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

          {recentEntities.filter(e => entities.some(en => en.entity_id === e.entity_id)).length > 0 && (
            <div className="recent-entities-row">
              <span className="recent-entities-label">Recent:</span>
              {recentEntities
                .filter(e => entities.some(en => en.entity_id === e.entity_id))
                .map(e => (
                  <button
                    key={e.entity_id}
                    className={`recent-entity-chip ${selectedEntity?.entity_id === e.entity_id ? 'active' : ''}`}
                    onClick={() => handleEntityChange(e.entity_id)}
                  >
                    {e.deviceName} — {e.label}
                    {e.unit && <span className="recent-entity-unit">{e.unit}</span>}
                  </button>
                ))}
              <button
                className="recent-entities-clear"
                title="Clear history"
                onClick={() => {
                  setRecentEntities([])
                  if (selectedHome) localStorage.removeItem(`greennest_recent_${selectedHome.id}`)
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>}
      </div>

      {selectedEntity && (
        <div className="entity-info-bar">
          <div className="entity-info-left">
            <span className="entity-info-name">{selectedEntity.label}</span>
            <span className="entity-info-device">{selectedEntity.deviceName}</span>
          </div>
          <div className="entity-info-right">
            {selectedEntity.device_class && (
              <span className="entity-info-badge">{selectedEntity.device_class.replace(/_/g, ' ')}</span>
            )}
            {unit && <span className="entity-info-badge entity-info-unit-badge">{unit}</span>}
            {overview?.first_recorded && (
              <span className="entity-info-meta">Since {new Date(overview.first_recorded).toLocaleDateString()}</span>
            )}
            {overview?.count && (
              <span className="entity-info-meta">{Number(overview.count).toLocaleString()} readings</span>
            )}
          </div>
        </div>
      )}

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
                    All values are computed over {periodInText} for <em>{selectedEntity.deviceName} — {selectedEntity.label}</em>.
                    {isEnergyKwh && ' This is a cumulative energy meter — values represent meter readings, not consumption.'}
                  </InfoTooltip>
                </h2>
                <p className="stats-section-subtitle">
                  Summary for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — {periodLabel}
                </p>
              </div>
            </div>
            {loadingOverview ? (
              <p className="stats-loading">Loading...</p>
            ) : overview ? (
              <>
                {isEnergyKwh ? (
                  <>
                    {meterResets.length > 0 && (
                      <div className="reset-history">
                        <div className="reset-history-header">
                          <span className="reset-history-title">Meter Reset History</span>
                          <span className="reset-history-count">{meterResets.length} reset{meterResets.length !== 1 ? 's' : ''} total</span>
                        </div>
                        {meterResets.slice(0, 3).map(r => (
                          <div key={r.id} className="reset-history-row">
                            <span className="reset-history-date">
                              {new Date(r.reset_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {r.value_before != null && (
                              <span className="reset-history-values">
                                {Number(r.value_before).toFixed(2)} → {Number(r.value_after).toFixed(2)} kWh
                                <span className="reset-history-delta">
                                  (−{(Number(r.value_before) - Number(r.value_after)).toFixed(0)} kWh)
                                </span>
                              </span>
                            )}
                          </div>
                        ))}
                        {meterResets.length > 3 && (
                          <p className="reset-history-more">+{meterResets.length - 3} older reset{meterResets.length - 3 !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                    )}
                    <p className="consumption-note">
                      <strong>Cumulative energy meter:</strong> This sensor records the total energy consumed since installation — it only ever increases.
                      Period consumption is calculated in the <strong>Consumption &amp; Cost</strong> card below.
                    </p>
                    <div className="stat-cards-grid stat-cards-grid-3">
                      <StatCard
                        label="Current reading" value={overview.last_value} unit="kWh" deviceClass="energy"
                        sub="Latest meter value"
                        tooltip="The most recent value recorded by this cumulative energy meter."
                      />
                      <StatCard
                        label="Period consumption" value={periodKwh} unit="kWh" deviceClass="energy"
                        sub={resetsInPeriod.length > 0 ? '⚠ Reset-aware sum of segments' : `Over ${Math.round(periodDays)} days`}
                        tooltip={`Energy consumed in ${periodInText}.${resetsInPeriod.length > 0 ? ' Calculated as the sum of consumption across each segment between meter resets.' : ' Calculated as max reading minus min reading.'}`}
                      />
                      <StatCard
                        label="Daily average" value={dailyKwh} unit="kWh/day" deviceClass="energy"
                        sub="Extrapolated from period"
                        tooltip="Period consumption divided by the number of days. Assumes the measured period is representative."
                      />
                      <StatCard
                        label="Monthly estimate" value={monthlyKwh} unit="kWh/month" deviceClass="energy"
                        sub="Daily average × 30"
                        tooltip="Estimated monthly consumption based on the daily average from this period. Assumes stable usage patterns."
                      />
                      <StatCard
                        label="Meter resets" value={meterResets.length} unit="" integer
                        sub={meterResets.length > 0
                          ? `Last: ${new Date(meterResets[0].reset_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : 'No resets detected'}
                        tooltip="Number of times this meter has been reset or replaced since tracking began. A reset causes the cumulative reading to drop back to near zero."
                      />
                      <StatCard
                        label="Readings" value={overview.count} unit="" integer
                        sub={readingsDateSub}
                        tooltip={`Total number of individual data points recorded in ${periodInText}.`}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {overview.count < 50 && (
                      <p className="overview-low-readings-warning">
                        ⚠ Only {overview.count} reading{overview.count !== 1 ? 's' : ''} in this period — statistics may not be representative.
                      </p>
                    )}
                    <div className="stat-cards-grid stat-cards-grid-3">
                      <StatCard
                        label="Average" value={overview.avg_value} unit={unit}
                        deviceClass={selectedEntity.device_class}
                        sub={`Mean of ${Number(overview.count).toLocaleString()} readings`}
                        tooltip={`Arithmetic mean of all ${Number(overview.count).toLocaleString()} raw readings over ${periodInText}.`}
                      />
                      <StatCard
                        label="Minimum" value={overview.min_value} unit={unit}
                        deviceClass={selectedEntity.device_class}
                        sub={overview.min_recorded_at ? fmtTs(overview.min_recorded_at) : 'Lowest single reading'}
                        tooltip={`The single lowest value recorded among all readings in ${periodInText}.`}
                      />
                      <StatCard
                        label="Maximum" value={overview.max_value} unit={unit}
                        deviceClass={selectedEntity.device_class}
                        sub={overview.max_recorded_at ? fmtTs(overview.max_recorded_at) : 'Highest single reading'}
                        tooltip={`The single highest value recorded among all readings in ${periodInText}.`}
                      />
                      <StatCardPair
                        label="Range" value={overview.max_value != null && overview.min_value != null ? parseFloat(overview.max_value) - parseFloat(overview.min_value) : null}
                        unit={unit} deviceClass={selectedEntity.device_class}
                        sub="Max − Min spread"
                        tooltip="Difference between the highest and lowest reading in the period. A large range means the sensor value fluctuated a lot."
                        label2="Variability" value2={overview.std_dev ?? null}
                        unit2={unit}
                        sub2="Standard deviation (1σ)"
                        tooltip2={`Standard deviation of all readings. ~68% of readings fall within ±1σ of the average.${parseFloat(overview.std_dev) === 0 ? ' A value of 0 may indicate a stuck sensor.' : ''}`}
                      />
                      <StatCard
                        label="Last reading" value={overview.last_value} unit={unit}
                        deviceClass={selectedEntity.device_class}
                        sub={overview.last_recorded ? fmtTs(overview.last_recorded) : 'Most recent in period'}
                        tooltip="The most recent value recorded by this sensor (all-time latest reading)."
                      />
                      <StatCard
                        label="Readings" value={overview.count} unit="" integer
                        sub={readingsDateSub}
                        tooltip={`Total number of individual data points recorded in ${periodInText}.`}
                      />
                    </div>
                  </>
                )}
              </>
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
                  For energy sensors (kWh): {resetsInPeriod.length > 0
                    ? `reset-aware sum of ${resetsInPeriod.length + 1} consumption segment${resetsInPeriod.length !== 1 ? 's' : ''} between meter resets`
                    : 'maximum minus minimum recorded value'}.
                  Daily, weekly, monthly and annual figures are extrapolated from the measured period.
                  {tariff
                    ? tariff.tariff_peak && tariff.tariff_offpeak
                      ? ` Cost uses your configured peak (${tariff.tariff_peak} ${currency}/kWh, ${tariff.peak_start?.slice(0,5)}–${tariff.peak_end?.slice(0,5)}) and off-peak (${tariff.tariff_offpeak} ${currency}/kWh) rates${tariff.tariff_weekend ? `, weekend rate ${tariff.tariff_weekend} ${currency}/kWh` : ''}.`
                      : ` Cost uses your configured flat rate (${tariff.tariff_flat} ${currency}/kWh).`
                    : ' Configure your electricity tariff in Settings to see cost estimates.'}
                </InfoTooltip>
              </h2>
              <p className="stats-section-subtitle">
                Estimated energy use and cost for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — {periodLabel}
              </p>
              {loadingOverview ? (
                <p className="stats-loading">Loading...</p>
              ) : periodKwh != null ? (
                <>
                  <div className="stat-cards-grid">
                    <StatCardPair
                      label="Total in period" value={periodKwh} unit="kWh"
                      sub={unit === 'kWh' && resetsInPeriod.length > 0
                        ? `Reset-aware · ${Math.round(periodDays)} days · ${resetsInPeriod.length} reset${resetsInPeriod.length !== 1 ? 's' : ''} in period`
                        : `Over ${Math.round(periodDays)} days of data`}
                      tooltip={unit === 'W'
                        ? `Average power (${parseFloat(overview.avg_value).toFixed(1)} W) × ${Math.round(periodDays)} days × 24h ÷ 1000`
                        : resetsInPeriod.length > 0
                          ? `Reset-aware calculation: sum of ${resetsInPeriod.length + 1} consumption segment${resetsInPeriod.length !== 1 ? 's' : ''} between meter resets. Each segment = reading before reset − first reading in that segment.`
                          : `Cumulative energy delta: max (${parseFloat(overview.max_value).toFixed(2)}) − min (${parseFloat(overview.min_value).toFixed(2)}) kWh`}
                      label2="Cost in period"
                      value2={tariffRate != null ? periodKwh * tariffRate : null}
                      unit2={currency}
                      sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                      tooltip2={tariffRate != null ? `Total consumption × effective rate (${tariffRate.toFixed(4)} ${currency}/kWh). The effective rate is the time-weighted average of your peak, off-peak${tariff?.tariff_weekend ? ', and weekend' : ''} tariffs across a typical week.` : undefined}
                    />
                    <StatCardPair
                      label="Previous period" value={prevPeriodKwh} unit="kWh"
                      sub={`${new Date(prevFromDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} – ${new Date(prevToDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}${prevPeriodKwh == null ? ' · No data' : ''}`}
                      tooltip={`Consumption during the preceding equal-duration period (${period === 'custom' ? 'same-length window before current range' : `${activePeriod.label.toLowerCase()} before the current window`}), using the same calculation method.`}
                      label2={prevPeriodCost != null ? 'Previous cost' : (vsLastPeriodPct != null ? (vsLastPeriodPct > 0 ? '↑ Higher this period' : '↓ Lower this period') : 'Period change')}
                      value2={prevPeriodCost != null ? prevPeriodCost : (vsLastPeriodPct != null ? Math.round(Math.abs(vsLastPeriodPct)) : null)}
                      unit2={prevPeriodCost != null ? currency : '%'}
                      sub2={
                        prevPeriodCost != null && vsLastPeriodPct != null
                          ? `${vsLastPeriodPct > 0 ? '↑ +' : '↓ '}${Math.round(Math.abs(vsLastPeriodPct))}% vs current`
                          : prevPeriodCost != null
                            ? undefined
                            : vsLastPeriodPct != null
                              ? `vs previous ${periodLabel}`
                              : prevPeriodKwh == null ? 'No previous data' : undefined
                      }
                      tooltip2={prevPeriodCost != null
                        ? `Previous period cost at ${tariffRate?.toFixed(4)} ${currency}/kWh effective rate. The change vs current period is shown below.`
                        : "Percentage change in consumption compared to the previous equivalent period. Positive = used more this period."}
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
                    <StatCardPair
                      label="Annual estimate" value={annualKwh} unit="kWh/year"
                      sub="Daily average × 365"
                      tooltip="Projected annual consumption based on the daily average from this period. Assumes stable usage patterns year-round."
                      label2="Annual cost estimate"
                      value2={annualKwh != null && tariffRate != null ? annualKwh * tariffRate : null}
                      unit2={`${currency}/year`}
                      sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                      tooltip2={tariffRate != null ? "Projected annual cost based on the annual consumption estimate and your effective tariff rate." : undefined}
                    />
                    <StatCardPair
                      label="Weekday daily" value={wdWeKwh?.wdKwh ?? null} unit="kWh/day"
                      sub={`~${(30 * 5 / 7).toFixed(0)} weekdays/month · Mon–Fri`}
                      tooltip={isEnergyKwh
                        ? `Average daily consumption on weekdays (Mon–Fri), from hourly aggregation data.${wdWeKwh == null ? ' Not yet available — requires the analytics service to have processed at least one week of data.' : ''}`
                        : `Sum of average hourly power on weekdays (Mon–Fri), converted to kWh per day. Hours with no readings contribute 0.${wdWeKwh == null ? ' Not yet available — requires the analytics service to have processed at least one week of data.' : ''}`}
                      label2={detailedCost ? 'Cost / day (weekdays)' : undefined}
                      value2={detailedCost?.wdCostPerDay ?? null}
                      unit2={`${currency}/day`}
                      sub2={detailedCost ? `~${detailedCost.monthlyWdCost.toFixed(0)} ${currency}/month (weekdays)` : undefined}
                      tooltip2={detailedCost ? `Weekday cost per day × ${(30 * 5 / 7).toFixed(1)} weekdays per month. Uses peak/off-peak rate per hour.` : undefined}
                    />
                    <StatCardPair
                      label="Weekend daily" value={wdWeKwh?.weKwh ?? null} unit="kWh/day"
                      sub={`~${(30 * 2 / 7).toFixed(0)} weekend days/month · Sat–Sun${wdWeConsumptionDiffPct != null ? ` · ${wdWeConsumptionDiffPct > 0 ? '+' : ''}${wdWeConsumptionDiffPct}% vs weekday` : ''}`}
                      tooltip={isEnergyKwh
                        ? `Average daily consumption on weekends (Sat–Sun), from hourly aggregation data.${wdWeKwh == null ? ' Not yet available — requires the analytics service to have processed at least one week of data.' : ''}`
                        : `Sum of average hourly power on weekends (Sat–Sun), converted to kWh per day.${tariff?.tariff_weekend ? ` Uses configured weekend rate (${tariff.tariff_weekend} ${currency}/kWh).` : ''}${wdWeKwh == null ? ' Not yet available — requires the analytics service to have processed at least one week of data.' : ''}`}
                      label2={detailedCost ? 'Cost / day (weekends)' : undefined}
                      value2={detailedCost?.weCostPerDay ?? null}
                      unit2={`${currency}/day`}
                      sub2={detailedCost
                        ? `~${detailedCost.monthlyWeCost.toFixed(0)} ${currency}/month (weekends)${wdWeCostDiffPct != null ? ` · ${wdWeCostDiffPct > 0 ? '+' : ''}${wdWeCostDiffPct}% vs weekday` : ''}`
                        : wdWeConsumptionDiffPct != null ? `${wdWeConsumptionDiffPct > 0 ? '+' : ''}${wdWeConsumptionDiffPct}% vs weekday` : undefined}
                      tooltip2={detailedCost ? `Weekend cost per day × ${(30 * 2 / 7).toFixed(1)} weekend days per month.${tariff?.tariff_weekend ? ` Uses configured weekend rate (${tariff.tariff_weekend} ${currency}/kWh).` : ' Uses same peak/off-peak rates as weekdays.'}` : undefined}
                    />
                  </div>

                  {unit === 'W' && (
                    <p className="consumption-note">
                      Note: These figures assume the sensor reports 0 W when the appliance is off.
                      If the sensor only sends readings during active use, consumption may be overestimated.
                      For best accuracy, use a kWh cumulative sensor if the appliance has one.
                    </p>
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
                      Predictions generated by the analytics service from historical hourly aggregations — refreshed every hour.
                      {' '}W sensors: predicted hourly power summed over the window ÷ 1000 = kWh.
                      {' '}kWh sensors: sum of predicted hourly consumption deltas.
                      <br/><br/>
                      The <strong>selected period does not affect predictions</strong> — it only changes the historical baseline used for ↑/↓ % comparisons. Changing the period shifts the comparison reference, not the forecast values.
                      <br/><br/>
                      <strong>Accuracy</strong> is measured against actual data from the last 7 days (fixed rolling window, independent of period selection). Higher data volume unlocks more accurate models — see the tier row below the accuracy note.
                      <br/><br/>
                      The <strong>30-day forecast card</strong> is hidden until the model has produced at least 720 hourly predictions (≈30 days). It appears automatically once enough predictions have been generated.
                    </InfoTooltip>
                  </h2>
                  <p className="stats-section-subtitle">
                    Forecast for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong>
                  </p>
                </div>
              </div>

              {predAccuracy && (
                <p className="prediction-accuracy-note">
                  <strong>Model accuracy (last 7 days):</strong>{' '}
                  average error ±{predAccuracy.mae != null ? formatSensorValue(predAccuracy.mae, selectedEntity.device_class) : '—'}
                  {unit ? ` ${unit}${isEnergyKwh ? '/h' : ''}` : ''}
                  {predAccuracy.mean_actual != null && predAccuracy.mean_actual > 1e-6
                    ? ` (${rawUncertaintyPct}% of mean ${isEnergyKwh ? 'hourly ' : ''}value)`
                    : ''}
                  {predAccuracy.n > 0 && `, based on ${predAccuracy.n} hourly comparisons`}.
                  {' '}The forecast band in the chart below reflects this uncertainty (±{uncertaintyPct}%{rawUncertaintyPct > 50 ? ', capped' : ''}).
                </p>
              )}
              {predModelType && (
                <div className="prediction-model-row">
                  <span className={`model-active-badge model-badge-${predModelType}`}>
                    {PRED_MODEL_LABELS[predModelType] ?? predModelType}
                  </span>
                  {predAccuracy?.training_count != null && (
                    <span className="model-data-count">
                      ~{predAccuracy.training_count.toLocaleString()}h training data
                    </span>
                  )}
                  <span className="model-tier-info">
                    Tiers: Seasonal&nbsp;&lt;336h · Ridge&nbsp;336–1,344h · Random&nbsp;Forest&nbsp;&gt;1,344h
                  </span>
                </div>
              )}
              {loadingPredictions ? (
                <p className="stats-loading">Loading forecast...</p>
              ) : (
                <div className="stat-cards-grid">
                  <StatCardPair
                    label="Next 24 hours" value={predicted24hKwh} unit="kWh"
                    sub={predicted24hVsHistorical != null
                      ? `${predicted24hVsHistorical > 0 ? '↑ +' : '↓ '}${Math.abs(predicted24hVsHistorical).toFixed(0)}% vs historical daily`
                      : 'Compared to historical daily average'}
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
                    sub={predicted7dVsHistorical != null
                      ? `${predicted7dVsHistorical > 0 ? '↑ +' : '↓ '}${Math.abs(predicted7dVsHistorical).toFixed(0)}% vs last 7d historical`
                      : '7-day forecast total'}
                    tooltip="Total predicted consumption over the next 7 days (sum of 168 hourly predictions)."
                    label2="Estimated cost (7 days)"
                    value2={tariffRate != null && predicted7dKwh != null ? predicted7dKwh * tariffRate : null}
                    unit2={currency}
                    sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                    tooltip2="Predicted 7-day consumption multiplied by the effective weighted tariff rate."
                  />
                  <StatCardPair
                    label="Next 30 days" value={predicted30dKwh} unit="kWh"
                    sub={predicted30dVsHistorical != null
                      ? `${predicted30dVsHistorical > 0 ? '↑ +' : '↓ '}${Math.abs(predicted30dVsHistorical).toFixed(0)}% vs last 30d historical`
                      : '30-day forecast total'}
                    tooltip="Total predicted consumption over the next 30 days (sum of 720 hourly predictions)."
                    label2="Estimated cost (30 days)"
                    value2={tariffRate != null && predicted30dKwh != null ? predicted30dKwh * tariffRate : null}
                    unit2={currency}
                    sub2={tariffRate != null ? `At ${tariffRate.toFixed(4)} ${currency}/kWh effective rate` : undefined}
                    tooltip2="Predicted 30-day consumption multiplied by the effective weighted tariff rate."
                  />
                  <div className="stat-card stat-card-history">
                    <span className="stat-card-label">Historical reference</span>
                    <div className="history-rows">
                      <div className="history-row">
                        <span className="history-row-period">Daily avg</span>
                        <span className="history-row-value">{dailyKwh != null ? `${dailyKwh.toFixed(2)} kWh` : '—'}</span>
                        {tariffRate != null && dailyKwh != null && <span className="history-row-cost">{(dailyKwh * tariffRate).toFixed(2)} {currency}</span>}
                      </div>
                      <div className="history-row">
                        <span className="history-row-period">
                          {activePeriod.days >= 7 ? '7-day total' : '7d estimate'}
                        </span>
                        <span className="history-row-value">{weeklyKwh != null ? `${weeklyKwh.toFixed(2)} kWh` : '—'}</span>
                        {tariffRate != null && weeklyKwh != null && <span className="history-row-cost">{(weeklyKwh * tariffRate).toFixed(2)} {currency}</span>}
                      </div>
                      <div className="history-row">
                        <span className="history-row-period">
                          {activePeriod.days >= 30 ? '30-day total' : '30d estimate'}
                        </span>
                        <span className="history-row-value">{monthlyKwh != null ? `${monthlyKwh.toFixed(2)} kWh` : '—'}</span>
                        {tariffRate != null && monthlyKwh != null && <span className="history-row-cost">{(monthlyKwh * tariffRate).toFixed(2)} {currency}</span>}
                      </div>
                    </div>
                    <span className="stat-card-sub">
                      {activePeriod.days >= 30 ? 'Actual' : `Actual daily · 7d/30d extrapolated`} · {periodLabel}
                    </span>
                  </div>
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
                across all {Math.round(activePeriod.days)} days in the selected period.
                {isEnergyKwh
                  ? <> For energy (kWh) sensors each bar is the <strong>average hourly consumption</strong> — the difference between the meter's max and min reading within that hour bucket, averaged over all matching days. This gives actual energy used per hour, not the cumulative meter value.</>
                  : <> Each bar is the mean of every reading recorded in that hour slot (e.g. bars at 08:00 = average of all readings from 08:00–08:59).</>
                }
                {' '}Shaded background = night hours (22:00–06:00). Below the chart: day vs night averages
                and weekday vs weekend averages, each with the percentage difference.
                {' '}Hours are shown in your local timezone. Responds to the selected period.
                {ThresholdTooltipSection}
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {isEnergyKwh
                ? <>Average kWh consumed per hour for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> across all {Math.round(activePeriod.days)} days — weekday vs weekend pattern</>
                : <>Hourly averages for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> across all {Math.round(activePeriod.days)} days — weekday vs weekend, day vs night patterns</>
              }
            </p>
            <HourlyProfileChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={fromDate}
              to={toDate}
              deviceClass={selectedEntity.device_class}
            />
            {peakHours.length > 0 && (
              <div className="peak-hours-row">
                <span className="peak-hours-label">{isEnergyKwh ? 'Peak consumption hours:' : 'Peak hours:'}</span>
                {peakHours.map(({ hour, combined }) => (
                  <span key={hour} className="peak-hour-chip">
                    <span className="peak-hour-time">{String(hour).padStart(2, '0')}:00</span>
                    <span className="peak-hour-value">
                      avg {unit === 'W' && combined >= 1000
                        ? `${(combined / 1000).toFixed(2)} kW`
                        : combined < 0.1
                          ? `${combined.toFixed(3)} ${unit}`
                          : `${combined.toFixed(2)} ${unit}`}
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
                {isEnergyKwh
                  ? <> For energy (kWh) sensors each point is the <strong>average hourly consumption</strong> (meter delta per hour bucket), not the raw cumulative meter value.</>
                  : <> Each point is the mean of all readings recorded in that hour slot across every day in that season.</>
                }
                {' '}Only seasons present in the available data are drawn — a full comparison requires at least one year of readings.
                {' '}Hours are shown in your local timezone.
                {' '}<strong>Independent of the selected period</strong> — uses all available historical data regardless of the period selector.
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
                <hr />Responds to the selected period — change the period above to see a different date range.
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {isEnergyKwh
                ? <>{activePeriod.aggLabel.charAt(0).toUpperCase() + activePeriod.aggLabel.slice(1)}-by-{activePeriod.aggLabel} <strong>consumption</strong> for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — {periodLabel}</>
                : <>{activePeriod.aggLabel.charAt(0).toUpperCase() + activePeriod.aggLabel.slice(1)}-by-{activePeriod.aggLabel} averages for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — {periodLabel}</>
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
              <div
                className="anomaly-collapse-header"
                role="button"
                tabIndex={0}
                onClick={() => setAnomalyOpen(o => !o)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setAnomalyOpen(o => !o)}
              >
                <h2 className="stats-section-title">
                  Anomaly Detection
                  <InfoTooltip>
                    Values are flagged as anomalies when their Z-score exceeds a threshold relative to the 30-day baseline.
                    Z = (value − mean) / std deviation.
                    Z ≥ 2.5 = <strong>warning</strong> (unusual but possible).
                    Z ≥ 3.5 = <strong>critical</strong> (very rare under normal conditions).{' '}
                    A <strong>↑ / ↓ arrow</strong> indicates whether the reading was above or below the baseline.
                    {' '}Sensors with fewer than 50 baseline readings or zero variance are skipped.
                    Sensors where σ/μ &gt; 0.8 (bimodal or cyclical loads like washing machines) are also skipped to avoid false positives.
                    A 4-hour cooldown prevents the same sensor from generating repeated records during a sustained spike.
                    kWh cumulative sensors and switches are excluded.
                    {' '}<strong>Responds to the selected period</strong> — shows anomalies detected within the selected date range. The 30-day baseline is always computed from historical data prior to the detection window.
                    The detection job runs once per hour.
                  </InfoTooltip>
                </h2>
                <span className="anomaly-collapse-chevron">{anomalyOpen ? '▲' : '▼'}</span>
              </div>

              {anomalyOpen && (
                <>
                  <p className="stats-section-subtitle anomaly-open-subtitle">
                    Anomalous readings for <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong>
                    {' '}— {periodLabel}
                  </p>
                  {loadingOverview ? (
                    <p className="stats-loading">Loading...</p>
                  ) : selectedEntity.anomaly_muted ? (
                    <>
                      <p className="stats-empty anomaly-open-subtitle" style={{ marginBottom: '0.75rem' }}>
                        Anomaly detection is <strong>paused</strong> for this sensor — no new anomalies are being recorded.
                        {anomalies.length > 0
                          ? ' Historical anomalies from before pausing are shown below.'
                          : ' No historical anomalies exist for the selected period.'}
                      </p>
                      {anomalies.length > 0 && (
                        <AnomalyList
                          anomalies={anomalies}
                          dismissed={dismissed}
                          dismiss={dismiss}
                          restore={restore}
                          showDismissed={showDismissed}
                          setShowDismissed={setShowDismissed}
                          expandedDays={expandedDays}
                          setExpandedDays={setExpandedDays}
                          periodLabel={periodInText}
                          deviceClass={selectedEntity.device_class}
                        />
                      )}
                      <div className="anomaly-diag-footer">
                        <Link to={`/diagnostics?entity=${selectedEntity.entity_id}`} className="anomaly-diag-link">
                          Manage in Diagnostics →
                        </Link>
                      </div>
                    </>
                  ) : selectedEntity.anomaly_suppressed ? (
                    <>
                      <p className="stats-empty anomaly-open-subtitle">
                        Anomalies for this sensor are <strong>suppressed</strong> — detection runs but results are hidden from this view.
                        You can review them in Diagnostics.
                      </p>
                      <div className="anomaly-diag-footer">
                        <Link to={`/diagnostics?entity=${selectedEntity.entity_id}`} className="anomaly-diag-link">
                          View in Diagnostics →
                        </Link>
                      </div>
                    </>
                  ) : isEnergyKwh ? (
                    <>
                      <p className="stats-empty anomaly-open-subtitle">
                        Anomaly detection is not applied to cumulative energy meters — the value only increases
                        over time, so z-score comparison against a baseline has no meaningful interpretation.
                        Anomaly detection runs on instantaneous sensors (power W, temperature, CO₂, humidity, etc.).
                      </p>
                      <div className="anomaly-diag-footer">
                        Want to check device-level health rules and fault indicators?{' '}
                        <Link to={`/diagnostics?entity=${selectedEntity.entity_id}`} className="anomaly-diag-link">
                          Open Diagnostics →
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <AnomalyList
                        anomalies={anomalies}
                        dismissed={dismissed}
                        dismiss={dismiss}
                        restore={restore}
                        showDismissed={showDismissed}
                        setShowDismissed={setShowDismissed}
                        expandedDays={expandedDays}
                        setExpandedDays={setExpandedDays}
                        periodLabel={periodInText}
                        deviceClass={selectedEntity.device_class}
                      />
                      <div className="anomaly-diag-footer">
                        Recurring anomalies may point to a hardware or configuration issue.{' '}
                        <Link to={`/diagnostics?entity=${selectedEntity.entity_id}`} className="anomaly-diag-link">
                          Check Diagnostics for this device →
                        </Link>
                      </div>
                    </>
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
                Each cell shows the <strong>average value</strong> for a specific hour of the day (columns, midnight–11 pm)
                and day of the week (rows, Mon–Sun), computed from all readings in the selected period.
                {isEnergyKwh
                  ? <> For kWh cumulative sensors the cell value is the <strong>average energy consumed within that hour slot</strong> (max − min per hourly bucket, averaged across matching slots in the period), not the raw meter reading.</>
                  : null}
                {' '}Darker blue = higher average value — the color scale is <strong>relative to this dataset</strong> (min → max of displayed data), so absolute values require hovering.
                {' '}Cells with no readings are shown in grey.
                {tariff?.peak_start && tariff?.peak_end
                  ? <> A subtle yellow band highlights <strong>peak-rate hours</strong> based on your configured tariff.</>
                  : null}
                {' '}The dashed line separates weekdays from the weekend.
                {' '}<strong>Responds to the selected period</strong> — change the period above to see a different date range.
              </InfoTooltip>
            </h2>
            <p className="stats-section-subtitle">
              {isEnergyKwh
                ? <>Avg. kWh consumed per hour slot — <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> — {periodLabel} — darker = more consumption</>
                : <>Avg. <strong>{selectedEntity.deviceName} — {selectedEntity.label}</strong> per hour × day — {periodLabel} — darker = higher</>
              }
            </p>
            <HeatmapChart
              homeId={selectedHome.id}
              entityId={selectedEntity.entity_id}
              unit={unit}
              from={fromDate}
              to={toDate}
              deviceClass={selectedEntity.device_class}
              tariff={tariff}
            />
          </div>

          {/* Card 8 — 7-Day Forecast */}
          <div className="stats-section-card">
            <h2 className="stats-section-title">
              7-Day Forecast
              <InfoTooltip>
                Predicted daily values for the next 7 days, shown alongside the last 7 days of historical data.
                Independent of the selected period — always uses the last 7 days of history and forecasts the next 7 days.{' '}
                The shaded band reflects the model's historical error: width = ±{uncertaintyPct}%
                {predAccuracy ? ' (calculated from the last 7 days of actual vs predicted)' : ' (default estimate — accuracy data not yet available)'}.
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
            <p className="forecast-note">
              Shaded band = ±{uncertaintyPct}% uncertainty.
              {predAccuracy ? (
                <>
                  {' '}Average error over last 7 days: ±{predAccuracy.mae != null ? formatSensorValue(predAccuracy.mae, selectedEntity.device_class) : '—'}{unit ? ` ${unit}` : ''}
                  {predAccuracy.mean_actual != null && predAccuracy.mean_actual > 1e-6
                    ? ` (${uncertaintyPct}% of mean)`
                    : ''}
                  {predAccuracy.n > 0 ? `, ${predAccuracy.n} comparisons.` : '.'}
                </>
              ) : (
                ' Default estimate — accuracy data becomes available after the first full day of predictions.'
              )}
            </p>
          </div>

        </div>
      )}
    </div>
  )
}
