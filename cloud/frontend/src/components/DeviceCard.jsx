import AttributeChart from './AttributeChart'
import { inferDeviceName, shortLabel } from '../utils/deviceUtils'
import '../styles/DeviceCard.css'

export default function DeviceCard({ device, homeId }) {
  const deviceName    = inferDeviceName(device.entities)
  const sensorEntities = device.entities.filter(e => e.domain === 'sensor')
  const lastSeen      = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'
  const statusColor   = device.available ? 'var(--status-online)' : 'var(--status-offline)'

  const allLabels = device.entities
    .map(e => shortLabel(e.friendly_name, deviceName))
    .filter(Boolean)
  const entityDisplay = allLabels.length > 4
    ? `${allLabels.slice(0, 4).join(', ')} +${allLabels.length - 4} more`
    : allLabels.join(', ')

  return (
    <div className="device-card">
      <div className="device-card-header">
        <h3 className="device-name">{deviceName}</h3>
        <div className="device-status">
          <span className="status-dot" style={{ backgroundColor: statusColor }} />
          <span>{device.available ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className="device-info">
        <div className="device-info-row">
          <p><strong>Entities:</strong> {entityDisplay}</p>
          <p><strong>Last Seen:</strong> {lastSeen}</p>
        </div>
      </div>

      <div className="device-charts">
        {sensorEntities.map(entity => (
          <AttributeChart
            key={entity.entity_id}
            homeId={homeId}
            entityId={entity.entity_id}
            label={shortLabel(entity.friendly_name, deviceName)}
            unit={entity.unit}
            deviceClass={entity.device_class}
          />
        ))}
      </div>
    </div>
  )
}
