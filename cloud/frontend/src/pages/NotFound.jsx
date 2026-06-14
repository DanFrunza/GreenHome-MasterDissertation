import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFound() {
  usePageTitle('Page not found')
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: '1rem',
      textAlign: 'center', padding: '2rem',
    }}>
      <span style={{ fontSize: '3rem', lineHeight: 1 }}>404</span>
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'var(--foreground)' }}>
        Page not found
      </h1>
      <p style={{ margin: 0, color: 'var(--muted-foreground)', maxWidth: 360 }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" style={{
        marginTop: '0.5rem', padding: '0.55rem 1.25rem',
        background: 'var(--accent)', color: '#fff',
        borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem',
        textDecoration: 'none',
      }}>
        Go home
      </Link>
    </div>
  )
}
