import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { API_URL } from '../config'

const UserContext = createContext(null)

export function getToken() {
  return localStorage.getItem('token')
}

export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function UserProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  const login = useCallback((token, userData) => {
    localStorage.setItem('token', token)
    setUser(userData)
  }, [])

  const updateUser = useCallback((partial) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev)
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }

    const tryFetch = async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
          if (r.status === 401) { logout(); return }
          if (!r.ok) return
          setUser(await r.json())
          return
        } catch {
          if (i < 2) await new Promise(res => setTimeout(res, 500))
        }
      }
    }

    tryFetch().finally(() => setLoading(false))
  }, [logout])

  useEffect(() => {
    const theme = user?.theme ?? 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [user?.theme])

  useEffect(() => {
    window.addEventListener('auth:unauthorized', logout)
    return () => window.removeEventListener('auth:unauthorized', logout)
  }, [logout])

  return (
    <UserContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
