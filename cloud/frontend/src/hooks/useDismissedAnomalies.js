import { useState, useEffect, useCallback } from 'react'

export function useDismissedAnomalies(homeId) {
  const storageKey = homeId ? `dismissed_anomalies_${homeId}` : null

  const [dismissed, setDismissed] = useState(() => {
    if (!storageKey) return new Set()
    try {
      const s = localStorage.getItem(storageKey)
      return s ? new Set(JSON.parse(s)) : new Set()
    } catch { return new Set() }
  })

  useEffect(() => {
    if (!storageKey) { setDismissed(new Set()); return }
    try {
      const s = localStorage.getItem(storageKey)
      setDismissed(s ? new Set(JSON.parse(s)) : new Set())
    } catch { setDismissed(new Set()) }
  }, [storageKey])

  const dismiss = useCallback((ids) => {
    if (!storageKey) return
    const arr = Array.isArray(ids) ? ids : [ids]
    setDismissed(prev => {
      const next = new Set([...prev, ...arr])
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }, [storageKey])

  const restore = useCallback((ids) => {
    if (!storageKey) return
    const arr = Array.isArray(ids) ? ids : [ids]
    setDismissed(prev => {
      const next = new Set(prev)
      arr.forEach(id => next.delete(id))
      localStorage.setItem(storageKey, JSON.stringify([...next]))
      return next
    })
  }, [storageKey])

  return { dismissed, dismiss, restore }
}
