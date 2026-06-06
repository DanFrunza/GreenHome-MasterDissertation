import { useEffect, useState, useCallback } from 'react'
import '../styles/Dashboard.css'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import DeviceCard from '../components/DeviceCard'
import { usePolling } from '../hooks/usePolling'
import { inferDeviceName } from '../utils/deviceUtils'

export default function Dashboard() {
  const { selectedHome } = useHome()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const fetchDevices = useCallback(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      .then(r => r.json())
      .then(data => { setDevices(data.sort((a, b) => a.device_id.localeCompare(b.device_id))); setError(null) })
      .catch(() => setError('Failed to load devices'))
      .finally(() => setLoading(false))
  }, [selectedHome])

  useEffect(() => {
    if (selectedHome) { setLoading(true); setSearch('') }
  }, [selectedHome])

  usePolling(selectedHome ? fetchDevices : null, 15000, [selectedHome])

  const visibleDevices = search.trim()
    ? devices.filter(d => inferDeviceName(d.entities).toLowerCase().includes(search.toLowerCase()))
    : devices

    if (!selectedHome) return <NoHomeSelected />
  if (loading && !devices.length) return <div className="content-padding"><p>Loading...</p></div>
  if (error && !devices.length) return <div className="content-padding"><p className="dashboard-error">{error}</p></div>

  return (
    <div className="content-padding">
      <div className="dashboard-container">
        <div className="dashboard-header-row">
          <div>
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="dashboard-subtitle">Monitor and control your smart home devices</p>
          </div>
          <div className="dashboard-search-wrap">
            <input
              className="dashboard-search-input"
              type="text"
              placeholder="Search device…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="dashboard-search-clear" onClick={() => setSearch('')}>×</button>
            )}
          </div>
        </div>
        {search && (
          <p className="dashboard-search-info">
            {visibleDevices.length === 0
              ? 'No devices match your search.'
              : `Showing ${visibleDevices.length} of ${devices.length} device${devices.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <div className="dashboard-devices">
        {visibleDevices.map(device => (
          <DeviceCard
            key={device.device_id}
            device={device}
            homeId={selectedHome.id}
          />
        ))}
      </div>
    </div>
  )
}
