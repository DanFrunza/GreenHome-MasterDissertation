import { useEffect, useState } from 'react'
import '../styles/Dashboard.css'
import { API_URL, HOME_ID } from '../config'
import DeviceCard from '../components/DeviceCard'

export default function Dashboard() {
  const [devices, setDevices] = useState([])
  const [measurementsData, setMeasurementsData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        const structureRes = await fetch(`${API_URL}/homes/${HOME_ID}/structure`)
        const structure = await structureRes.json()
        setDevices(structure)

        const measurements = {}
        for (const device of structure) {
          measurements[device.device_id] = {}

          // Filter out state attributes (not numeric)
          const numericAttrs = device.attributes.filter(attr => attr.attribute !== 'state')

          for (const attrObj of numericAttrs) {
            const startOfDay = new Date()
            startOfDay.setHours(0, 0, 0, 0)

            const meaRes = await fetch(
              `${API_URL}/homes/${HOME_ID}/devices/${device.device_id}/measurements?attribute=${attrObj.attribute}&limit=1000&from=${startOfDay.toISOString()}`
            )
            const data = await meaRes.json()
            measurements[device.device_id][attrObj.attribute] = data
          }
        }
        setMeasurementsData(measurements)
        setError(null)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

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
            measurementsData={measurementsData}
          />
        ))}
      </div>
    </div>
  )
}