import AttributeChart from './AttributeChart'
import '../styles/DeviceCard.css'

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

export default function DeviceCard({ device, homeId }) {
  const statusColor = device.available ? 'var(--status-online)' : 'var(--status-offline)'
  const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'
  const deviceName = inferDeviceName(device.entities)
  const sensorEntities = device.entities.filter(e => e.domain === 'sensor')

  return (
    <div className="device-card">
      <div className="device-card-header">
        <h3 className="device-name">{deviceName}</h3>
        <div className="device-status">
          <span className="status-dot" style={{ backgroundColor: statusColor }}></span>
          <span>{device.available ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      <div className="device-info">
        <div className="device-info-row">
          <p><strong>Entities:</strong> {device.entities.map(e => shortLabel(e.friendly_name, deviceName)).join(', ')}</p>
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
          />
        ))}
      </div>
    </div>
  )
}
