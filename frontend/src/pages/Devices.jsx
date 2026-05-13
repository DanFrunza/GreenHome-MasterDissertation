import { useEffect, useState } from 'react'
import '../styles/Devices.css'
import { API_URL, HOME_ID } from '../config'

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggleStates, setToggleStates] = useState({})

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true)
        const res = await fetch(`${API_URL}/homes/${HOME_ID}/structure`)
        const data = await res.json()
        setDevices(data)
        // Initialize toggle states
        const states = {}
        data.forEach(device => {
          states[device.device_id] = false
        })
        setToggleStates(states)
        setError(null)
      } catch (err) {
        console.error('Error fetching devices:', err)
        setError('Failed to load devices')
      } finally {
        setLoading(false)
      }
    }

    fetchDevices()
  }, [])

  const handleToggle = (deviceId) => {
    setToggleStates(prev => ({
      ...prev,
      [deviceId]: !prev[deviceId]
    }))
  }

  if (loading) return <div className="content-padding"><p>Loading...</p></div>
  if (error) return <div className="content-padding"><p style={{ color: 'red' }}>{error}</p></div>

  return (
    <div className="content-padding">
      <div className="devices-container">
        <h1 className="devices-title">Devices</h1>
        <p className="devices-subtitle">Manage your connected devices</p>
      </div>

      <div className="devices-list">
        {devices.map(device => {
          const statusColor = device.available ? 'var(--status-online)' : 'var(--status-offline)'
          const statusText = device.available ? 'Online' : 'Offline'
          const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'N/A'

          return (
            <div key={device.device_id} className="device-list-card">
              {/* Header Section */}
              <div className="device-list-header">
                <h2 className="device-list-name">{device.device_id}</h2>
                <div className="device-list-status">
                  <span 
                    className="status-dot" 
                    style={{ backgroundColor: statusColor }}
                  ></span>
                  <span>{statusText}</span>
                </div>
              </div>

              {/* Source with On/Off Toggle */}
              <div className="device-list-source">
                <div>
                  <strong>Source:</strong> {device.source}
                </div>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={toggleStates[device.device_id] || false}
                    onChange={() => handleToggle(device.device_id)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Attributes List */}
              <div className="device-list-attributes">
                <h3>Attributes</h3>
                <div className="attributes-container">
                  {device.attributes.map(attr => (
                    <div key={`${device.device_id}-${attr.attribute}`} className="attribute-row">
                      <div className="attribute-info">
                        <span className="attribute-name">{attr.attribute}:</span>
                        <span className="attribute-ha-id">{attr.ha_entity_id || 'N/A'}</span>
                      </div>
                      <button className="edit-btn">Edit</button>
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