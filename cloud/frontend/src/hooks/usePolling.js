import { useEffect } from 'react'

export function usePolling(fn, intervalMs, deps = []) {
  useEffect(() => {
    if (!fn) return
    fn()
    const id = setInterval(fn, intervalMs)
    return () => clearInterval(id)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
