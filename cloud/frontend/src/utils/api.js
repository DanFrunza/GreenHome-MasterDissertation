import { authHeaders } from '../context/UserContext'

const RETRY_DELAYS = [500, 1000]

export async function apiFetch(url, options = {}) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...authHeaders(), ...options.headers },
      })
      if (res.status === 401) window.dispatchEvent(new Event('auth:unauthorized'))
      return res
    } catch (err) {
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
      } else {
        throw err
      }
    }
  }
}
