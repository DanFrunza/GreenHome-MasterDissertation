import { createContext, useContext, useEffect, useState } from 'react'
import { API_URL, DEMO_USER_ID } from '../config'
import { usePolling } from '../hooks/usePolling'

const HomeContext = createContext(null)

export function HomeProvider({ children }) {
  const [homes, setHomes] = useState([])
  const [selectedHome, setSelectedHome] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchHomes = () => {
    fetch(`${API_URL}/users/${DEMO_USER_ID}/homes`)
      .then(r => r.json())
      .then(data => {
        setHomes(data)
        setSelectedHome(prev => {
          if (prev) {
            const updated = data.find(h => h.id === prev.id)
            if (!updated) return prev
            if (updated.status === prev.status && updated.name === prev.name) return prev
            return updated
          }
          const savedId = localStorage.getItem('selectedHomeId')
          if (savedId) {
            const saved = data.find(h => h.id === savedId)
            if (saved) return saved
          }
          return data.find(h => h.status === 'online') ?? data[0] ?? null
        })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (selectedHome?.id) localStorage.setItem('selectedHomeId', selectedHome.id)
  }, [selectedHome])

  usePolling(fetchHomes, 30000, [])

  return (
    <HomeContext.Provider value={{ homes, selectedHome, setSelectedHome, loading }}>
      {children}
    </HomeContext.Provider>
  )
}

export function useHome() {
  return useContext(HomeContext)
}
