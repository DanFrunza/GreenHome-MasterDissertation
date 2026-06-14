import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '60vh', gap: '1rem',
          textAlign: 'center', padding: '2rem',
        }}>
          <span style={{ fontSize: '2.5rem' }}>⚠</span>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'var(--foreground)' }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, color: 'var(--muted-foreground)', maxWidth: 360 }}>
            An unexpected error occurred. Try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '0.5rem', padding: '0.55rem 1.25rem',
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: '0.375rem', fontWeight: 500, fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Refresh page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
