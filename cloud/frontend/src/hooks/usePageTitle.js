import { useEffect } from 'react'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — GreenNest` : 'GreenNest'
    return () => { document.title = 'GreenNest' }
  }, [title])
}
