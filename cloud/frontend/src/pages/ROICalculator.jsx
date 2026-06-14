import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import { ENERGY_CLASS_TYPES, ENERGY_CLASSES, CLASS_EFFICIENCY } from '../utils/recommendations'
import { effectiveTariff } from '../utils/tariffUtils'
import { usePageTitle } from '../hooks/usePageTitle'
import '../styles/ROICalculator.css'

const FROM_30D = () => new Date(Date.now() - 30 * 86400 * 1000).toISOString()

// EU average grid emission factor — IEA 2022 data
const CO2_FACTOR        = 0.231  // kg CO₂/kWh
const CO2_PER_TREE      = 22     // kg CO₂ absorbed by one mature tree per year (EPA/USDA)
const CO2_PER_KM_CAR    = 0.120  // kg CO₂/km, EU fleet average (EEA 2022)
const CO2_PER_KM_FLIGHT = 0.255  // kg CO₂/km/passenger, economy class (ICAO)

export default function ROICalculator() {
  usePageTitle('ROI Calculator')
  const { selectedHome } = useHome()
  const [searchParams] = useSearchParams()

  const [devices, setDevices]         = useState([])
  const [allEntities, setAllEntities] = useState([])
  const [tariff, setTariff]           = useState(null)

  const [selectedDeviceId, setSelectedDeviceId] = useState(searchParams.get('device') || '')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [manualKwh, setManualKwh]               = useState('')
  const [replacementCost, setReplacementCost]   = useState('')
  const [targetClass, setTargetClass]           = useState('A')
  const [overview, setOverview]                 = useState(null)
  const [overviewLoading, setOverviewLoading]   = useState(false)
  const [dailyHours, setDailyHours]             = useState('')

  useEffect(() => {
    if (!selectedHome) return
    Promise.all([
      apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`).then(r => r.json()),
      apiFetch(`${API_URL}/homes/${selectedHome.id}/config`).then(r => r.json()).catch(() => null),
    ]).then(([devs, tar]) => {
      setDevices(devs)
      setTariff(tar)
      const entities = devs.flatMap(d => {
        const name = inferDeviceName(d.entities)
        return d.entities
          .filter(e => e.unit === 'W' || e.unit === 'kWh')
          .map(e => ({ ...e, deviceName: name, label: shortLabel(e.friendly_name, name) }))
      })
      setAllEntities(entities)
    }).catch(() => {})
  }, [selectedHome])

  useEffect(() => {
    if (!selectedEntityId || !selectedHome) { setOverview(null); return }
    setOverviewLoading(true)
    apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntityId}/overview?from=${FROM_30D()}`)
      .then(r => r.json())
      .then(data => { setOverview(data); setOverviewLoading(false) })
      .catch(() => { setOverview(null); setOverviewLoading(false) })
  }, [selectedEntityId, selectedHome])

  const classifiedDevices = devices.filter(d => ENERGY_CLASS_TYPES.has(d.appliance_type))
  const selectedDevice    = devices.find(d => d.device_id === selectedDeviceId)
  const currentClass      = selectedDevice?.energy_class || ''
  const availableTargets  = ENERGY_CLASSES.filter(c =>
    ENERGY_CLASSES.indexOf(c) < ENERGY_CLASSES.indexOf(currentClass)
  )

  useEffect(() => {
    if (availableTargets.length) setTargetClass(availableTargets[0])
  }, [currentClass])

  useEffect(() => {
    if (!selectedDeviceId) return
    const deviceEntityIds = new Set(
      (devices.find(d => d.device_id === selectedDeviceId)?.entities ?? []).map(e => e.entity_id)
    )
    const own = allEntities.filter(e => deviceEntityIds.has(e.entity_id))
    const best = own.find(e => e.unit === 'kWh') ?? own.find(e => e.unit === 'W') ?? null
    if (best) { setSelectedEntityId(best.entity_id); setManualKwh(''); setDailyHours('') }
    else       { setSelectedEntityId(''); setDailyHours('') }
  }, [selectedDeviceId])

  const selectedEntity = allEntities.find(e => e.entity_id === selectedEntityId)

  const getAnnualKwh = () => {
    if (manualKwh) return parseFloat(manualKwh)
    if (!overview || !selectedEntityId) return null
    const entity = allEntities.find(e => e.entity_id === selectedEntityId)
    if (!entity || !overview.avg_value) return null
    if (entity.unit === 'W') {
      const hours = dailyHours ? parseFloat(dailyHours) : 24
      return (parseFloat(overview.avg_value) * hours * 365) / 1000
    }
    // kWh cumulative — use first→last delta (not max−min, which breaks on meter resets)
    if (!overview.first_recorded || !overview.last_recorded) return null
    const days  = Math.max(1,
      (new Date(overview.last_recorded) - new Date(overview.first_recorded)) / 86400000
    )
    const first = parseFloat(overview.first_value)
    const last  = parseFloat(overview.last_value)
    const delta = last - first
    if (delta < 0) return null  // meter reset detected — signal via kwhResetDetected
    return (delta / days) * 365
  }

  const kwhResetDetected = !manualKwh && selectedEntity?.unit === 'kWh' && !overviewLoading &&
    overview?.first_value != null && overview?.last_value != null &&
    (parseFloat(overview.last_value) - parseFloat(overview.first_value)) < 0

  const annualKwh  = getAnnualKwh()
  const cost       = parseFloat(replacementCost) || null
  const tariffRate = effectiveTariff(tariff)
  const currency   = tariff?.currency ?? 'RON'

  let results = null
  if (annualKwh && cost && currentClass && targetClass && availableTargets.length > 0 &&
      CLASS_EFFICIENCY[currentClass] && CLASS_EFFICIENCY[targetClass]) {
    const upgradedKwh    = annualKwh * (CLASS_EFFICIENCY[targetClass] / CLASS_EFFICIENCY[currentClass])
    const savedKwhYear   = annualKwh - upgradedKwh
    const savedMoneyYear = tariffRate ? savedKwhYear * tariffRate : null
    const paybackMonths  = savedMoneyYear && savedMoneyYear > 0
      ? Math.round((cost / savedMoneyYear) * 12)
      : null
    const savingPct    = Math.round((savedKwhYear / annualKwh) * 100)
    const savedCo2Year = savedKwhYear * CO2_FACTOR
    results = { annualKwh, upgradedKwh, savedKwhYear, savedMoneyYear, paybackMonths, savingPct, savedCo2Year, currency }
  }

  const missingForResults = []
  if (!annualKwh) missingForResults.push('consumption data (select an entity or enter manually)')
  if (!cost)      missingForResults.push('replacement cost')
  if (!currentClass) missingForResults.push(
    <>current energy class — <a href="/devices" className="roi-missing-link">classify device in Devices</a></>
  )
  if (availableTargets.length === 0 && currentClass) missingForResults.push(
    'upgrade target (Class A is already the most efficient — no upgrade available)'
  )
  if (!tariffRate) missingForResults.push(
    <>electricity tariff — <a href="/settings" className="roi-missing-link">configure in Settings</a></>
  )

  if (!selectedHome) return <NoHomeSelected />

  return (
    <div className="content-padding">
      <div className="roi-page">
        <h1 className="roi-title">ROI Calculator</h1>
        <p className="roi-subtitle">
          Estimate the payback period for replacing a household appliance with a more energy-efficient model.
        </p>

        {devices.length > 0 && classifiedDevices.length === 0 && (
          <div className="roi-classify-banner">
            <span className="roi-classify-banner-icon">💡</span>
            <span>
              No classified appliances yet. Go to{' '}
              <a href="/devices" className="roi-classify-banner-link">Devices</a>
              {' '}and set the device type and energy class to use the ROI calculator.
            </span>
          </div>
        )}

        <div className="roi-layout">
          {/* ── Left: steps ── */}
          <div className="roi-steps">

            {/* Step 1 — Appliance */}
            <div className="roi-card">
              <h2 className="roi-card-title">1. Select appliance</h2>
              <p className="roi-card-desc">Appliances must have a device type and energy class assigned to appear here.</p>
              {classifiedDevices.length === 0 ? (
                <p className="roi-empty">
                  No classified appliances found.{' '}
                  <a href="/devices" className="roi-missing-link">Go to Devices</a> to set the device type and energy class.
                </p>
              ) : (
                <select
                  className="roi-select"
                  value={selectedDeviceId}
                  onChange={e => { setSelectedDeviceId(e.target.value); setSelectedEntityId(''); setManualKwh('') }}
                >
                  <option value="">— Select appliance —</option>
                  {classifiedDevices.map(d => (
                    <option key={d.device_id} value={d.device_id}>
                      {inferDeviceName(d.entities)}{d.energy_class ? ` — class ${d.energy_class}` : ' — no class set'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedDevice && (
              <>
                {/* Step 2 — Consumption source */}
                <div className="roi-card">
                  <h2 className="roi-card-title">2. Current energy consumption</h2>
                  <p className="roi-card-desc">
                    Select the entity that measures this appliance's consumption, or enter the annual figure manually.
                    For power sensors (W), the calculator extrapolates from the 30-day average.
                    For energy sensors (kWh cumulative), it uses the delta over the last 30 days.
                  </p>
                  <label className="roi-label">Entity (W or kWh)</label>
                  <select
                    className="roi-select"
                    value={selectedEntityId}
                    onChange={e => { setSelectedEntityId(e.target.value); setManualKwh('') }}
                  >
                    <option value="">— Select entity —</option>
                    {(() => {
                      const selectedEntityIds = new Set(
                        (devices.find(d => d.device_id === selectedDeviceId)?.entities ?? []).map(e => e.entity_id)
                      )
                      const own   = allEntities.filter(e => selectedEntityIds.has(e.entity_id))
                      const other = allEntities.filter(e => !selectedEntityIds.has(e.entity_id))
                      return (
                        <>
                          {own.length > 0 && (
                            <optgroup label="This appliance">
                              {own.map(e => (
                                <option key={e.entity_id} value={e.entity_id}>
                                  {e.label} ({e.unit})
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {other.length > 0 && (
                            <optgroup label="Other devices">
                              {other.map(e => (
                                <option key={e.entity_id} value={e.entity_id}>
                                  {e.deviceName} — {e.label} ({e.unit})
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      )
                    })()}
                  </select>

                  {selectedEntityId && overviewLoading && (
                    <p className="roi-computed">Calculating…</p>
                  )}

                  {kwhResetDetected && (
                    <p className="roi-notice roi-notice-warn">
                      Meter reset detected — the sensor value dropped from{' '}
                      <strong>{parseFloat(overview.first_value).toFixed(1)}</strong> to{' '}
                      <strong>{parseFloat(overview.last_value).toFixed(1)} kWh</strong> during the 30-day window.
                      Automatic calculation is unreliable — enter the annual figure manually below.
                    </p>
                  )}

                  {selectedEntityId && !overviewLoading && overview && annualKwh && (
                    <>
                      <p className="roi-computed">
                        Estimated from entity data: <strong>{annualKwh.toFixed(0)} kWh/year</strong>
                        {selectedEntity?.unit === 'W'
                          ? ` (${parseFloat(overview.avg_value).toFixed(1)} W × ${dailyHours || 24}h/day × 365)`
                          : ` (${(parseFloat(overview.last_value) - parseFloat(overview.first_value)).toFixed(1)} kWh delta over ${
                              Math.round((new Date(overview.last_recorded) - new Date(overview.first_recorded)) / 86400000)
                            } days, extrapolated)`
                        }
                      </p>
                      <p className="roi-accuracy-note">
                        {selectedEntity?.unit === 'W' ? (
                          dailyHours
                            ? <><strong>Accuracy note:</strong> Using {dailyHours}h/day — more accurate for appliances that don't run continuously.</>
                            : <><strong>Accuracy note:</strong> Assumes the sensor reports 0 W when the appliance is off. If readings are only sent during active use, consumption will be overestimated. Prefer a <strong>kWh sensor</strong> if available.</>
                        ) : (
                          <><strong>Accuracy note:</strong> Uses the cumulative energy delta over 30 days — accurate regardless of reporting frequency or idle periods.</>
                        )}
                      </p>
                      {selectedEntity?.unit === 'W' && (
                        <div className="roi-field">
                          <label className="roi-label">Average daily usage (hours, optional)</label>
                          <input
                            className="roi-input"
                            type="number"
                            min="0.1"
                            max="24"
                            step="0.5"
                            placeholder="24 (assumes always on)"
                            value={dailyHours}
                            onChange={e => setDailyHours(e.target.value)}
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="roi-divider"><span>or enter manually</span></div>

                  <label className="roi-label">Annual consumption (kWh/year)</label>
                  <input
                    className="roi-input"
                    type="number"
                    min="0"
                    placeholder="e.g. 250"
                    value={manualKwh}
                    onChange={e => { setManualKwh(e.target.value); setSelectedEntityId('') }}
                  />
                </div>

                {/* Step 3 — Cost and target class */}
                <div className="roi-card">
                  <h2 className="roi-card-title">3. Replacement cost and target class</h2>
                  <div className="roi-row">
                    <div className="roi-field">
                      <label className="roi-label">Replacement cost ({currency})</label>
                      <input
                        className="roi-input"
                        type="number"
                        min="0"
                        placeholder="Price of new appliance"
                        value={replacementCost}
                        onChange={e => setReplacementCost(e.target.value)}
                      />
                    </div>
                    <div className="roi-field">
                      <label className="roi-label">Upgrade to class</label>
                      {!currentClass ? (
                        <p className="roi-card-desc">
                          No energy class set for this appliance.{' '}
                          <a href="/devices" className="roi-missing-link">Set it in Devices →</a>
                        </p>
                      ) : availableTargets.length === 0 ? (
                        <p className="roi-class-best">
                          Class A is the most efficient EU energy rating — no upgrade available for this appliance.
                        </p>
                      ) : (
                        <select
                          className="roi-select"
                          value={targetClass}
                          onChange={e => setTargetClass(e.target.value)}
                        >
                          {availableTargets.map(c => (
                            <option key={c} value={c}>Class {c}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  {availableTargets.length > 0 && currentClass && targetClass && (
                    <p className="roi-card-desc">
                      Current class: <strong>{currentClass}</strong>.
                      Efficiency difference between class {currentClass} and class {targetClass}: approximately{' '}
                      <strong>
                        {Math.round((1 - CLASS_EFFICIENCY[targetClass] / CLASS_EFFICIENCY[currentClass]) * 100)}%
                      </strong> less energy consumption.
                    </p>
                  )}
                </div>

                {/* Results */}
                {results ? (
                  <div className="roi-results">
                    <h2 className="roi-card-title">Results</h2>
                    <div className="roi-results-grid">
                      <div className="roi-result-item">
                        <span className="roi-result-label">Current consumption</span>
                        <span className="roi-result-value">{results.annualKwh.toFixed(0)} kWh/year</span>
                      </div>
                      <div className="roi-result-item">
                        <span className="roi-result-label">After upgrade (class {targetClass})</span>
                        <span className="roi-result-value">{results.upgradedKwh.toFixed(0)} kWh/year</span>
                      </div>
                      <div className="roi-result-item">
                        <span className="roi-result-label">Annual energy savings</span>
                        <span className="roi-result-value">{results.savedKwhYear.toFixed(0)} kWh ({results.savingPct}%)</span>
                      </div>
                      <div className="roi-result-item">
                        <span className="roi-result-label">CO₂ reduction</span>
                        <span className="roi-result-value roi-co2-value">{results.savedCo2Year.toFixed(0)} kg/year</span>
                      </div>
                      {results.savedMoneyYear != null && (
                        <div className="roi-result-item">
                          <span className="roi-result-label">Annual cost savings</span>
                          <span className="roi-result-value roi-highlight">{results.savedMoneyYear.toFixed(0)} {results.currency}/year</span>
                        </div>
                      )}
                      {results.paybackMonths != null && (
                        <div className="roi-result-item">
                          <span className="roi-result-label">Payback period</span>
                          <span className="roi-result-value roi-highlight">
                            {Math.floor(results.paybackMonths / 12) > 0
                              ? `${Math.floor(results.paybackMonths / 12)} yr ${results.paybackMonths % 12} mo`
                              : `${results.paybackMonths} months`
                            }
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="roi-co2-equiv">
                      <span className="roi-co2-equiv-title">That's equivalent to:</span>
                      <div className="roi-co2-equiv-items">
                        <span><span className="roi-co2-badge roi-co2-badge--tree">T</span> <strong>{(results.savedCo2Year / CO2_PER_TREE).toFixed(1)}</strong> trees absorbing CO₂ for a year</span>
                        <span><span className="roi-co2-badge roi-co2-badge--car">C</span> <strong>{Math.round(results.savedCo2Year / CO2_PER_KM_CAR).toLocaleString()}</strong> km driven by car</span>
                        <span><span className="roi-co2-badge roi-co2-badge--flight">F</span> <strong>{Math.round(results.savedCo2Year / CO2_PER_KM_FLIGHT).toLocaleString()}</strong> km of economy flight</span>
                      </div>
                      <span className="roi-co2-source">EU average grid emission factor: 0.231 kg CO₂/kWh (IEA, 2022)</span>
                    </div>

                    {tariffRate ? (
                      <p className="roi-results-meta">
                        Effective tariff: <strong>{tariffRate.toFixed(3)} {currency}/kWh</strong> — weighted average of your configured rates
                      </p>
                    ) : (
                      <p className="roi-notice">
                        Monetary savings and payback period require an electricity tariff.{' '}
                        <a href="/settings" className="roi-missing-link">Configure it in Settings →</a>
                      </p>
                    )}

                    {results.paybackMonths != null && results.paybackMonths > 180 && (
                      <p className="roi-notice roi-notice-warn">
                        At {Math.floor(results.paybackMonths / 12)} years, this payback period likely exceeds the expected lifespan of a new appliance — the upgrade may not be financially worthwhile.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="roi-missing">
                    <p className="roi-missing-title">Missing information for calculation:</p>
                    <ul className="roi-missing-list">
                      {missingForResults.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Right: summary sidebar ── */}
          <div className="roi-summary">
            <h2 className="roi-summary-title">Summary</h2>
            {!selectedDevice ? (
              <p className="roi-summary-empty">Select an appliance on the left to begin.</p>
            ) : (
              <>
                <div className="roi-summary-section">
                  <span className="roi-summary-label">Appliance</span>
                  <span className="roi-summary-value">{inferDeviceName(selectedDevice.entities)}</span>
                  {currentClass && availableTargets.length > 0 && targetClass && (
                    <span className="roi-summary-sub">Class {currentClass} → Class {targetClass}</span>
                  )}
                  {currentClass && availableTargets.length === 0 && (
                    <span className="roi-summary-sub">Class A — already most efficient</span>
                  )}
                  {!currentClass && (
                    <span className="roi-summary-sub roi-summary-missing">No energy class set</span>
                  )}
                </div>

                <div className="roi-summary-section">
                  <span className="roi-summary-label">Consumption</span>
                  {annualKwh ? (
                    <>
                      <span className="roi-summary-value">{annualKwh.toFixed(0)} kWh/year</span>
                      <span className="roi-summary-sub">
                        {manualKwh ? 'entered manually' : `from ${selectedEntity?.label ?? 'entity'}`}
                      </span>
                    </>
                  ) : (
                    <span className="roi-summary-sub roi-summary-missing">Not set</span>
                  )}
                </div>

                <div className="roi-summary-section">
                  <span className="roi-summary-label">Replacement cost</span>
                  {cost ? (
                    <span className="roi-summary-value">{cost.toLocaleString()} {currency}</span>
                  ) : (
                    <span className="roi-summary-sub roi-summary-missing">Not set</span>
                  )}
                </div>

                {results ? (
                  <div className="roi-summary-results">
                    <div className="roi-summary-result-row">
                      <span>Energy savings</span>
                      <strong>{results.savedKwhYear.toFixed(0)} kWh/yr</strong>
                    </div>
                    {results.savedMoneyYear != null && (
                      <div className="roi-summary-result-row roi-summary-result-highlight">
                        <span>Cost savings</span>
                        <strong>{results.savedMoneyYear.toFixed(0)} {currency}/yr</strong>
                      </div>
                    )}
                    {results.paybackMonths != null && (
                      <div className="roi-summary-result-row roi-summary-result-highlight">
                        <span>Payback</span>
                        <strong>
                          {Math.floor(results.paybackMonths / 12) > 0
                            ? `${Math.floor(results.paybackMonths / 12)}yr ${results.paybackMonths % 12}mo`
                            : `${results.paybackMonths}mo`}
                        </strong>
                      </div>
                    )}
                    <div className="roi-summary-result-row roi-summary-result-co2">
                      <span>CO₂ saved</span>
                      <strong>{results.savedCo2Year.toFixed(0)} kg/yr</strong>
                    </div>
                  </div>
                ) : (
                  missingForResults.length > 0 && (
                    <p className="roi-summary-pending">
                      {missingForResults.length} more item{missingForResults.length > 1 ? 's' : ''} needed
                    </p>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
