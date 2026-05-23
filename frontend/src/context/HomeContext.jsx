import { createContext, useContext, useEffect, useState } from 'react'
import { API_URL, DEMO_USER_ID } from '../config'

const HomeContext = createContext(null)

export function HomeProvider({ children }) {
  const [homes, setHomes] = useState([])
  const [selectedHome, setSelectedHome] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/users/${DEMO_USER_ID}/homes`)
      .then(r => r.json())
      .then(data => {
        setHomes(data)
        if (data.length > 0) setSelectedHome(data[0])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <HomeContext.Provider value={{ homes, selectedHome, setSelectedHome, loading }}>
      {children}
    </HomeContext.Provider>
  )
}

export function useHome() {
  return useContext(HomeContext)
}
