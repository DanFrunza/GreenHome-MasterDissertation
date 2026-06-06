import { useEffect, useRef } from 'react'

export function useClickOutside(ref, onClose) {
  const cbRef = useRef(onClose)
  cbRef.current = onClose

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) cbRef.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref])
}
