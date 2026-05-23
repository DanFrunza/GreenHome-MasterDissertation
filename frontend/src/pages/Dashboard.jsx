import { useEffect, useState } from 'react'
import '../styles/Dashboard.css'
import { API_URL } from '../config'
import { useHome } from '../context/HomeContext'
import DeviceCard from '../components/DeviceCard'

export default function Dashboard() {
  const { selectedHome } = useHome()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!selectedHome) return
    setLoading(true)
    fetch(`${API_URL}/homes/${selectedHome.id}/devices`)
      .then(r => r.json())
      .then(data => { setDevices(data); setError(null) })
      .catch(() => setError('Failed to load devices'))
      .finally(() => setLoading(false))
  }, [selectedHome])

  if (loading) return <div className="content-padding"><p>Loading...</p></div>
  if (error) return <div className="content-padding"><p style={{ color: 'red' }}>{error}</p></div>

  return (
    <div className="content-padding">
      <div className="dashboard-container">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">Monitor and control your smart home devices</p>
      </div>

      <div className="dashboard-devices">
        {devices.map(device => (
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
