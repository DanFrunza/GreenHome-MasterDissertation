import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import { ENERGY_CLASS_TYPES, ENERGY_CLASSES, CLASS_EFFICIENCY } from '../utils/recommendations'
import { effectiveTariff } from '../utils/tariffUtils'
import '../styles/ROICalculator.css'

const FROM_30D = () => new Date(Date.now() - 30 * 86400 * 1000).toISOString()

export default function ROICalculator() {
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
    apiFetch(`${API_URL}/homes/${selectedHome.id}/entities/${selectedEntityId}/overview?from=${FROM_30D()}`)
      .then(r => r.json())
      .then(setOverview)
      .catch(() => setOverview(null))
  }, [selectedEntityId, selectedHome])

  const classifiedDevices = devices.filter(d => ENERGY_CLASS_TYPES.has(d.appliance_type))
  const selectedDevice    = devices.find(d => d.device_id === selectedDeviceId)
  const currentClass      = selectedDevice?.energy_class || ''
  const availableTargets  = ENERGY_CLASSES.filter(c =>
    ENERGY_CLASSES.indexOf(c) < ENERGY_CLASSES.indexOf(currentClass)
  )

  // When device changes: reset target class + auto-select best entity (kWh preferred over W)
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
    if (best) { setSelectedEntityId(best.entity_id); setManualKwh('') }
    else       { setSelectedEntityId('') }
  }, [selectedDeviceId])

  const getAnnualKwh = () => {
    if (manualKwh) return parseFloat(manualKwh)
    if (!overview || !selectedEntityId) return null
    const entity = allEntities.find(e => e.entity_id === selectedEntityId)
    if (!entity || !overview.avg_value) return null
    if (entity.unit === 'W') {
        if (!selectedHome) return <NoHomeSelected />
  return (parseFloat(overview.avg_value) * 24 * 365) / 1000
    }
    // kWh cumulative — delta over measured period extrapolated to year
    if (!overview.first_recorded || !overview.last_recorded) return null
    const days = Math.max(1,
      (new Date(overview.last_recorded) - new Date(overview.first_recorded)) / 86400000
    )
    const delta = parseFloat(overview.max_value) - parseFloat(overview.min_value)
    return (delta / days) * 365
  }

  const annualKwh  = getAnnualKwh()
  const cost       = parseFloat(replacementCost) || null
  const tariffRate = effectiveTariff(tariff)
  const currency   = tariff?.currency ?? 'RON'

  let results = null
  if (annualKwh && cost && currentClass && targetClass &&
      CLASS_EFFICIENCY[currentClass] && CLASS_EFFICIENCY[targetClass]) {
    const upgradedKwh    = annualKwh * (CLASS_EFFICIENCY[targetClass] / CLASS_EFFICIENCY[currentClass])
    const savedKwhYear   = annualKwh - upgradedKwh
    const savedMoneyYear = tariffRate ? savedKwhYear * tariffRate : null
    const paybackMonths  = savedMoneyYear && savedMoneyYear > 0
      ? Math.round((cost / savedMoneyYear) * 12)
      : null
    const savingPct = Math.round((savedKwhYear / annualKwh) * 100)
    results = { annualKwh, upgradedKwh, savedKwhYear, savedMoneyYear, paybackMonths, savingPct, currency }
  }

  const missingForResults = []
  if (!annualKwh)  missingForResults.push('consumption data (select an entity or enter manually)')
  if (!cost)       missingForResults.push('replacement cost')
  if (!currentClass) missingForResults.push('current energy class (classify the device in Devices)')
  if (!tariffRate) missingForResults.push('electricity tariff (configure in Settings)')

  const selectedEntity = allEntities.find(e => e.entity_id === selectedEntityId)

  return (
    <div className="content-padding">
      <div className="roi-page">
        <h1 className="roi-title">ROI Calculator</h1>
        <p className="roi-subtitle">
          Estimate the payback period for replacing a household appliance with a more energy-efficient model.
        </p>

        {/* Step 1 — Appliance */}
        <div className="roi-card">
          <h2 className="roi-card-title">1. Select appliance</h2>
          <p className="roi-card-desc">Only appliances with a device type and energy class set are shown. Go to the Devices page to classify your appliances.</p>
          {classifiedDevices.length === 0 ? (
            <p className="roi-empty">No classified appliances found. Go to Devices and set the device type and energy class for your appliances.</p>
          ) : (
            <select
              className="roi-select"
              value={selectedDeviceId}
              onChange={e => { setSelectedDeviceId(e.target.value); setSelectedEntityId(''); setManualKwh('') }}
            >
              <option value="">— Select appliance —</option>
              {classifiedDevices.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {inferDeviceName(d.entities)} — class {d.energy_class}
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

              {selectedEntityId && overview && annualKwh && (
                <>
                  <p className="roi-computed">
                    Estimated from entity data: <strong>{annualKwh.toFixed(0)} kWh/year</strong>
                    {selectedEntity?.unit === 'W'
                      ? ` (${parseFloat(overview.avg_value).toFixed(1)} W average × 24h × 365)`
                      : ` (${(parseFloat(overview.max_value) - parseFloat(overview.min_value)).toFixed(1)} kWh delta over ${
                          Math.round((new Date(overview.last_recorded) - new Date(overview.first_recorded)) / 86400000)
                        } days, extrapolated)`
                    }
                  </p>
                  <p className="roi-accuracy-note">
                    {selectedEntity?.unit === 'W'
                      ? <>
                          <strong>Accuracy note (W sensor):</strong> This estimate assumes the sensor reports 0 W when the appliance is off. If the plug only sends readings during active use, the average will be artificially high and the annual figure will be overestimated. For best accuracy, prefer a <strong>kWh cumulative sensor</strong> if this appliance has one — it measures actual energy consumed regardless of reporting frequency.
                        </>
                      : <>
                          <strong>Accuracy note (kWh sensor):</strong> This estimate uses the actual cumulative energy delta recorded over the measurement period — this is generally the most accurate method as it does not depend on reporting frequency or whether the appliance was off between readings.
                        </>
                    }
                  </p>
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
                    placeholder={`Price of new appliance`}
                    value={replacementCost}
                    onChange={e => setReplacementCost(e.target.value)}
                  />
                </div>
                <div className="roi-field">
                  <label className="roi-label">Upgrade to class</label>
                  <select
                    className="roi-select"
                    value={targetClass}
                    onChange={e => setTargetClass(e.target.value)}
                  >
                    {availableTargets.map(c => (
                      <option key={c} value={c}>Class {c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="roi-card-desc">
                Current class: <strong>{currentClass}</strong>.
                Efficiency difference between class {currentClass} and class {targetClass}: approximately{' '}
                <strong>
                  {currentClass && targetClass
                    ? Math.round((1 - CLASS_EFFICIENCY[targetClass] / CLASS_EFFICIENCY[currentClass]) * 100)
                    : '—'}%
                </strong> less energy consumption.
              </p>
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
                {!tariffRate && (
                  <p className="roi-notice">
                    Monetary savings and payback period require an electricity tariff. Configure it in Settings.
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
    </div>
  )
}
