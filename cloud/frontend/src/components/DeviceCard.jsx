import { useState } from 'react'
import AttributeChart from './AttributeChart'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import '../styles/DeviceCard.css'
import '../styles/Anomalies.css'

const CARD_PERIODS = ['1H', '6H', '24H', '7D', '30D']
const CARD_PERIOD_HOURS = { '1H': 1, '6H': 6, '24H': 24, '7D': 168, '30D': 720 }

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
const ENTITY_CLASS_ORDER = { energy: 0, power: 1 }

function ColIcon({ two }) {
  return two ? (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
      <rect x="0" y="0" width="6" height="10" rx="1"/>
      <rect x="8" y="0" width="6" height="10" rx="1"/>
    </svg>
  ) : (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor">
      <rect x="0" y="0" width="14" height="10" rx="1"/>
    </svg>
  )
}

export default function DeviceCard({ device, homeId, deviceAnomalies, entityAnomalies = {} }) {
  const [syncPeriod,    setSyncPeriod]    = useState('7D')
  const [isCustom,      setIsCustom]      = useState(false)
  const [isTwoCol,      setIsTwoCol]      = useState(false)
  const [cardCustomFrom, setCardCustomFrom] = useState('')
  const [cardCustomTo,   setCardCustomTo]   = useState('')
  const [showCardCustom, setShowCardCustom] = useState(false)
  const [cardInputFrom,  setCardInputFrom]  = useState('')
  const [cardInputTo,    setCardInputTo]    = useState('')

  const deviceName     = inferDeviceName(device.entities)
  const sensorEntities = device.entities
    .filter(e => e.domain === 'sensor')
    .sort((a, b) => (ENTITY_CLASS_ORDER[a.device_class] ?? 99) - (ENTITY_CLASS_ORDER[b.device_class] ?? 99))
  const lastSeen       = relativeTime(device.last_seen)

  const liveValues = sensorEntities
    .filter(e => e.available && e.state && e.state !== 'unavailable')
    .map(e => {
      const val = parseFloat(e.state)
      if (isNaN(val)) return null
      const fmt = e.device_class === 'energy' ? val.toFixed(3) : val.toFixed(1)
      return { label: shortLabel(e.friendly_name, deviceName), value: fmt, unit: e.unit || '' }
    })
    .filter(Boolean)
  const statusColor    = device.available ? 'var(--status-online)' : 'var(--status-offline)'

  const allLabels = device.entities
    .map(e => shortLabel(e.friendly_name, deviceName))
    .filter(Boolean)
  const entityDisplay = allLabels.length > 4
    ? `${allLabels.slice(0, 4).join(', ')} +${allLabels.length - 4} more`
    : allLabels.join(', ')

  const handleCardPeriod = (p) => {
    setSyncPeriod(p)
    setIsCustom(false)
    setShowCardCustom(false)
  }

  const openCardCustom = () => {
    if (!showCardCustom) {
      const toDate   = syncPeriod === 'custom' && cardCustomTo   ? cardCustomTo   : new Date().toISOString()
      const hours    = CARD_PERIOD_HOURS[syncPeriod] || 168
      const fromDate = syncPeriod === 'custom' && cardCustomFrom ? cardCustomFrom : new Date(Date.now() - hours * 3600000).toISOString()
      setCardInputFrom(fromDate.slice(0, 16))
      setCardInputTo(toDate.slice(0, 16))
    }
    setShowCardCustom(prev => !prev)
  }

  const handleApplyCardCustom = () => {
    if (!cardInputFrom || !cardInputTo || new Date(cardInputTo) <= new Date(cardInputFrom)) return
    setCardCustomFrom(new Date(cardInputFrom).toISOString())
    setCardCustomTo(new Date(cardInputTo).toISOString())
    setSyncPeriod('custom')
    setIsCustom(false)
    setShowCardCustom(false)
  }

  return (
    <div className={`device-card ${device.available ? 'device-online' : 'device-offline'}`}>
      <div className="device-card-header">
        <h3 className="device-name">{deviceName}</h3>
        <div className="device-header-right">
          {deviceAnomalies?.critical > 0 && (
            <span className="anomaly-badge critical" title={`${deviceAnomalies.critical} critical anomal${deviceAnomalies.critical === 1 ? 'y' : 'ies'} in the last 7 days`}>
              {deviceAnomalies.critical} critical
            </span>
          )}
          {deviceAnomalies?.warning > 0 && (
            <span className="anomaly-badge warning" title={`${deviceAnomalies.warning} warning${deviceAnomalies.warning === 1 ? '' : 's'} in the last 7 days`}>
              {deviceAnomalies.warning} warning
            </span>
          )}
          <div className="device-status">
            <span className="status-dot" style={{ backgroundColor: statusColor }} />
            <span>{device.available ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      <div className="device-info">
        <div className="device-info-row">
          {liveValues.length > 0
            ? <div className="device-live-values">
                <span className="device-live-heading">Live values:</span>
                {liveValues.map((v, i) => (
                  <span key={i} className="device-live-chip">
                    <span className="device-live-label">{v.label}</span>
                    <span className="device-live-value">{v.value} {v.unit}</span>
                  </span>
                ))}
              </div>
            : <p><strong>Entities:</strong> {entityDisplay}</p>
          }
          <p title={device.last_seen ? new Date(device.last_seen).toLocaleString() : ''}><strong>Last Seen:</strong> {lastSeen}</p>
        </div>
      </div>

      {sensorEntities.length > 0 && (
        <>
          <div className="device-period-row">
            <span className="device-period-label">All charts:</span>
            <div className="device-period-selector">
              {CARD_PERIODS.map(p => (
                <button
                  key={p}
                  className={`period-btn ${!isCustom && syncPeriod === p ? 'active' : ''}`}
                  onClick={() => handleCardPeriod(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className={`period-btn ${(!isCustom && syncPeriod === 'custom') || showCardCustom ? 'active' : ''}`}
                onClick={openCardCustom}
              >
                Custom
              </button>
            </div>
            {isCustom && <span className="device-period-custom">mixed</span>}
            {sensorEntities.length > 1 && (
              <button
                className={`col-toggle-btn ${isTwoCol ? 'active' : ''}`}
                title={isTwoCol ? 'Switch to 1 column' : 'Switch to 2 columns'}
                onClick={() => setIsTwoCol(p => !p)}
              >
                <ColIcon two={!isTwoCol} />
              </button>
            )}
          </div>
          {showCardCustom && (
            <div className="device-custom-range">
              <input type="datetime-local" value={cardInputFrom} onChange={e => setCardInputFrom(e.target.value)} />
              <span className="custom-range-sep">→</span>
              <input type="datetime-local" value={cardInputTo} onChange={e => setCardInputTo(e.target.value)} />
              <button
                className="custom-range-apply"
                onClick={handleApplyCardCustom}
                disabled={!cardInputFrom || !cardInputTo || new Date(cardInputTo) <= new Date(cardInputFrom)}
              >Apply</button>
            </div>
          )}
        </>
      )}

      <div className={`device-charts ${isTwoCol ? 'two-col' : ''}`}>
        {sensorEntities.map(entity => (
          <AttributeChart
            key={entity.entity_id}
            homeId={homeId}
            entityId={entity.entity_id}
            label={shortLabel(entity.friendly_name, deviceName)}
            unit={entity.unit}
            deviceClass={entity.device_class}
            externalPeriod={syncPeriod}
            externalCustomFrom={cardCustomFrom}
            externalCustomTo={cardCustomTo}
            onLocalChange={() => setIsCustom(true)}
            entityAnomalies={entityAnomalies[entity.entity_id]}
          />
        ))}
      </div>
    </div>
  )
}
