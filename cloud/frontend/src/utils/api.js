import { authHeaders } from '../context/UserContext'

export function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  }).then(res => {
    if (res.status === 401) window.dispatchEvent(new Event('auth:unauthorized'))
    return res
  })
}
