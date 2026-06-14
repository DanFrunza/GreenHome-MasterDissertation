import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { API_URL } from '../config'
import { authHeaders } from './UserContext'
import { usePolling } from '../hooks/usePolling'
import { useUser } from './UserContext'

const HomeContext = createContext(null)

export function HomeProvider({ children }) {
  const { user } = useUser()
  const [homes, setHomes]               = useState([])
  const [selectedHome, setSelectedHome] = useState(null)
  const [loading, setLoading]           = useState(true)

  const fetchHomes = useCallback(() => {
    if (!user) return
    fetch(`${API_URL}/users/me/homes`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        setHomes(data)
        setSelectedHome(prev => {
          if (prev) {
            const updated = data.find(h => h.id === prev.id)
            if (!updated) return data[0] ?? null
            if (updated.status === prev.status && updated.agent_status === prev.agent_status && updated.name === prev.name) return prev
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
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  useEffect(() => {
    if (!user) { setHomes([]); setSelectedHome(null); setLoading(false); return }
    setLoading(true)
    fetchHomes()
  }, [user])

  useEffect(() => {
    if (selectedHome?.id) localStorage.setItem('selectedHomeId', selectedHome.id)
  }, [selectedHome])

  usePolling(user ? fetchHomes : null, 30000, [user])

  return (
    <HomeContext.Provider value={{ homes, selectedHome, setSelectedHome, loading, fetchHomes }}>
      {children}
    </HomeContext.Provider>
  )
}

export function useHome() {
  return useContext(HomeContext)
}
