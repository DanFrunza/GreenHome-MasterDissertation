import { useState, useEffect } from 'react'
import { API_URL } from '../config'

const CACHE_KEY = 'greennest_config_v2'

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {}
  return null
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {}
}

const FALLBACK = {
  deviceTypes:     [],
  recommendations: null,
  thresholds:      null,
  healthRules:     null,
  benchmarks:      null,
}

export function useConfig() {
  const [config, setConfig] = useState(() => readCache() ?? FALLBACK)

  useEffect(() => {
    fetch(`${API_URL}/config`)
      .then(r => r.json())
      .then(data => {
        const merged = { ...FALLBACK, ...data }
        const cached = readCache()
        if (cached?._version === merged._version) return
        writeCache(merged)
        setConfig(merged)
      })
      .catch(() => {})
  }, [])

  return config
}
