import { Navigate, Link } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import '../styles/Landing.css'

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const IconMonitoring = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)
const IconAnomaly = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)
const IconAnalytics = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6"  y1="20" x2="6"  y2="14" />
  </svg>
)
const IconROI = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)
const IconHome = ({ size = 22 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="26" height="26">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
  </svg>
)

// ── Data ───────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    Icon: IconMonitoring,
    color: '#3b82f6',
    title: 'Real-time monitoring',
    desc: 'Live sensor readings from every appliance, updated the moment data arrives via MQTT. Temperature, power, humidity — all in one dashboard.',
  },
  {
    Icon: IconAnomaly,
    color: '#f59e0b',
    title: 'Anomaly detection',
    desc: 'Z-score analysis flags unusual behaviour instantly. Get alerted before a broken appliance becomes a bigger problem.',
  },
  {
    Icon: IconAnalytics,
    color: '#22c55e',
    title: 'Energy analytics',
    desc: 'Hourly profiles, seasonal trends, weekly heatmaps, and consumption forecasts reveal exactly where your energy goes.',
  },
  {
    Icon: IconROI,
    color: '#8b5cf6',
    title: 'ROI Calculator',
    desc: 'Calculate payback period and CO₂ savings when upgrading to energy-efficient appliances — with EU energy class comparisons.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Create your home',
    desc: 'Sign up and create a home in seconds. You get a unique home ID and MQTT credentials instantly — no credit card required.',
  },
  {
    n: '2',
    title: 'Connect your devices',
    desc: 'Install the GreenNest local agent on a home server. Sensors publish data via MQTT — no cloud dependency for data collection.',
  },
  {
    n: '3',
    title: 'Monitor & optimise',
    desc: 'Watch live data, receive anomaly alerts, explore trends, and discover where you can reduce energy waste and cut costs.',
  },
]

// ── Component ──────────────────────────────────────────────────────────────────
export default function Landing() {
  const { user, loading } = useUser()
  if (loading) return null
  if (user)    return <Navigate to="/home" replace />

  return (
    <div className="landing">

      {/* ── Navbar ── */}
      <nav className="landing-nav">
        <span className="landing-logo">
          <IconHome size={20} />
          GreenNest
        </span>
        <div className="landing-nav-actions">
          <Link to="/login" className="landing-nav-login">Log in</Link>
          <Link to="/register" className="landing-btn landing-btn-primary">Sign up free</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-badge">Smart home energy monitoring</div>
          <h1 className="landing-hero-title">
            Your home's energy,<br />
            <span className="landing-hero-accent">finally visible.</span>
          </h1>
          <p className="landing-hero-sub">
            GreenNest gives you real-time visibility into every appliance, detects anomalies before they escalate, and shows you exactly where to cut waste — all from one dashboard.
          </p>
          <div className="landing-hero-ctas">
            <Link to="/register" className="landing-btn landing-btn-primary landing-btn-lg">
              Get started free
            </Link>
            <Link to="/login" className="landing-btn landing-btn-ghost landing-btn-lg">
              Log in →
            </Link>
          </div>
          <p className="landing-hero-note">No credit card · Free forever · Live demo available</p>
        </div>

        {/* decorative grid */}
        <div className="landing-hero-grid" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="landing-hero-grid-cell" />
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Everything you need to understand your home</h2>
            <p className="landing-section-sub">From raw sensor data to actionable insights — built for real households.</p>
          </div>
          <div className="landing-features">
            {FEATURES.map(({ Icon, color, title, desc }) => (
              <div key={title} className="landing-feature-card">
                <div className="landing-feature-icon" style={{ color, background: `${color}1a` }}>
                  <Icon />
                </div>
                <h3 className="landing-feature-title">{title}</h3>
                <p className="landing-feature-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2 className="landing-section-title">How it works</h2>
            <p className="landing-section-sub">Set up in minutes. Works with any MQTT-compatible sensor.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} className="landing-step">
                <div className="landing-step-num">{n}</div>
                <h3 className="landing-step-title">{title}</h3>
                <p className="landing-step-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo CTA ── */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-cta-card">
            <div className="landing-cta-icon">
              <IconPlay />
            </div>
            <div className="landing-cta-body">
              <h3 className="landing-cta-title">Try the live demo</h3>
              <p className="landing-cta-desc">
                Sign up and join the demo home — pre-loaded with real sensor data, anomaly events, predictions, and statistics. No devices needed to get started.
              </p>
            </div>
            <Link to="/register" className="landing-btn landing-btn-primary landing-btn-lg landing-cta-btn">
              Create free account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <span className="landing-logo landing-logo-sm">
            <IconHome size={16} />
            GreenNest
          </span>
          <p className="landing-footer-copy">
            Dissertation project · Dan Frunză · 2025
          </p>
        </div>
      </footer>

    </div>
  )
}
