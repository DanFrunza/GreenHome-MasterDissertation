import AttributeChart from './AttributeChart'
import '../styles/DeviceCard.css'

export default function DeviceCard({ device, measurementsData }) {
  const statusColor = device.available 
    ? 'var(--status-online)' 
    : 'var(--status-offline)'
  const statusText = device.available ? 'Online' : 'Offline'
  const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'

  return (
    <div className="device-card">
      <div className="device-card-header">
        <h3 className="device-name">{device.device_id}</h3>
        <div className="device-status">
          <span 
            className="status-dot" 
            style={{ backgroundColor: statusColor }}
          ></span>
          <span>{statusText}</span>
        </div>
      </div>
      <div className="device-info">
        <div className="device-info-row">
          <p><strong>Attributes:</strong> {device.attributes.map(a => a.attribute).join(', ')}</p>
          <p><strong>Last Seen:</strong> {lastSeen}</p>
        </div>
        <div className="device-info-row">
          <p><strong>Source:</strong> {device.source}</p>
          <div></div>
        </div>
      </div>

      {/* Attribute Charts Inside Device Card */}
      <div className="device-charts">
        {device.attributes
          .filter(attr => attr.attribute !== 'state')
          .map(attrObj => (
            <AttributeChart
              key={`${device.device_id}-${attrObj.attribute}`}
              deviceId={device.device_id}
              attribute={attrObj.attribute}
              unit={attrObj.unit}
              measurements={measurementsData?.[device.device_id]?.[attrObj.attribute] || []}
            />
          ))}
      </div>
    </div>
  )
}
