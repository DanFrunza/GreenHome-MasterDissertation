import { useEffect, useState } from 'react'
import '../styles/Devices.css'
import { API_URL } from '../config'
import { useHome } from '../context/HomeContext'

function shortLabel(friendlyName, deviceName) {
  const stripped = friendlyName?.startsWith(deviceName)
    ? friendlyName.slice(deviceName.length).trim()
    : friendlyName
  return stripped || friendlyName
}

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

export default function Devices() {
  const { selectedHome } = useHome()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [switchStates, setSwitchStates] = useState({})
  const [switchLoading, setSwitchLoading] = useState({})

  const fetchDevices = async () => {
    if (!selectedHome) return
    try {
      setLoading(true)
      const res = await fetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      const data = await res.json()
      setDevices(data)

      const states = {}
      data.forEach(device => {
        device.entities
          .filter(e => e.domain === 'switch')
          .forEach(e => { states[e.entity_id] = e.state === 'on' })
      })
      setSwitchStates(states)
      setError(null)
    } catch (err) {
      console.error('Error fetching devices:', err)
      setError('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [selectedHome])

  const handleRefresh = async () => {
    try {
      await fetch(`${API_URL}/homes/${selectedHome.id}/devices/refresh`, { method: 'POST' })
      setTimeout(fetchDevices, 2000)
    } catch (err) {
      console.error('Refresh failed:', err)
    }
  }

  const handleToggle = async (entityId, currentOn) => {
    const action = currentOn ? 'off' : 'on'
    setSwitchStates(prev => ({ ...prev, [entityId]: !currentOn }))
    setSwitchLoading(prev => ({ ...prev, [entityId]: true }))

    try {
      await fetch(`${API_URL}/homes/${selectedHome.id}/entities/${entityId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
    } catch (err) {
      setSwitchStates(prev => ({ ...prev, [entityId]: currentOn }))
      console.error('Command failed:', err)
    } finally {
      setSwitchLoading(prev => ({ ...prev, [entityId]: false }))
    }
  }

  if (loading) return <div className="content-padding"><p>Loading...</p></div>
  if (error) return <div className="content-padding"><p style={{ color: 'red' }}>{error}</p></div>

  return (
    <div className="content-padding">
      <div className="devices-container">
        <div className="devices-header">
          <div>
            <h1 className="devices-title">Devices</h1>
            <p className="devices-subtitle">Manage your connected devices</p>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>Sync from HA</button>
        </div>
      </div>

      <div className="devices-list">
        {devices.map(device => {
          const statusColor = device.available ? 'var(--status-online)' : 'var(--status-offline)'
          const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'
          const deviceName = inferDeviceName(device.entities)

          return (
            <div key={device.device_id} className="device-list-card">
              <div className="device-list-header">
                <h2 className="device-list-name">{deviceName}</h2>
                <div className="device-list-status">
                  <span className="status-dot" style={{ backgroundColor: statusColor }}></span>
                  <span>{device.available ? 'Online' : 'Offline'}</span>
                </div>
              </div>

              <div className="device-list-source">
                <div><strong>Last seen:</strong> {lastSeen}</div>
              </div>

              <div className="device-list-attributes">
                <h3>Entities</h3>
                <div className="attributes-container">
                  {device.entities.map(entity => (
                    <div key={entity.entity_id} className="attribute-row">
                      <div className="attribute-info">
                        <span className="attribute-name">
                          {shortLabel(entity.friendly_name, deviceName)}
                        </span>
                        {entity.domain !== 'switch' && (
                          <span className="attribute-ha-id">
                            {entity.state}{entity.unit ? ` ${entity.unit}` : ''}
                          </span>
                        )}
                      </div>

                      {entity.domain === 'switch' ? (
                        <div className="switch-control">
                          <span className="switch-label">
                            {switchStates[entity.entity_id] ? 'ON' : 'OFF'}
                          </span>
                          <label className={`toggle-switch ${switchLoading[entity.entity_id] ? 'toggle-loading' : ''}`}>
                            <input
                              type="checkbox"
                              checked={switchStates[entity.entity_id] || false}
                              onChange={() => handleToggle(entity.entity_id, switchStates[entity.entity_id])}
                              disabled={switchLoading[entity.entity_id]}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', opacity: 0.5 }}>{entity.entity_id}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
