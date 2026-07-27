import { Navigate, Link } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import '../styles/Landing.css'

//  SVG Icons
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
const IconAuto = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)
const IconLeaf = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <path d="M2 22 C2 22 6 16 12 14 C18 12 22 2 22 2 C22 2 18 8 12 10 C6 12 2 22 2 22Z" />
  </svg>
)
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)
const IconArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

//  Data 
const FEATURES = [
  {
    Icon: IconMonitoring,
    color: '#3b82f6',
    title: 'Real-time dashboard',
    desc: 'Live sensor readings from every appliance — temperature, humidity, power consumption — updated the moment data arrives via MQTT. Organised by device and room.',
  },
  {
    Icon: IconAnomaly,
    color: '#f59e0b',
    title: 'Anomaly detection',
    desc: 'Statistical Z-score analysis flags unusual sensor behaviour automatically. Mute false positives, track history, and deep-link directly to the anomalous sensor\'s statistics.',
  },
  {
    Icon: IconAnalytics,
    color: '#22c55e',
    title: 'Deep energy analytics',
    desc: 'Hourly consumption profiles, weekly heatmaps, seasonal trends, and machine-learning forecasts (Ridge Regression, Random Forest) reveal exactly where your energy goes.',
  },
  {
    Icon: IconROI,
    color: '#8b5cf6',
    title: 'ROI & CO₂ calculator',
    desc: 'Estimate payback period and CO₂ savings when upgrading appliances. Uses EU energy class data and your actual consumption history — not generic averages.',
  },
  {
    Icon: IconAuto,
    color: '#06b6d4',
    title: 'Automation viewer',
    desc: 'See all your Home Assistant automations in one place — conditions, triggers, actions, and last-run status. Understand your smart home logic without opening HA.',
  },
  {
    Icon: IconLeaf,
    color: '#22c55e',
    title: 'Green Score & Eco Guide',
    desc: 'A per-device efficiency score based on actual usage patterns. The Eco Guide surfaces quick wins, personalised energy tips, and automation ideas tailored to your devices.',
  },
  {
    Icon: IconShield,
    color: '#ef4444',
    title: 'Diagnostics & alerts',
    desc: 'Full anomaly management: suppress noisy sensors, review history, set cooldown windows. Stay informed without alert fatigue.',
  },
  {
    Icon: IconAnalytics,
    color: '#f97316',
    title: 'Multi-home support',
    desc: 'Manage multiple properties from one account. Each home has independent device trees, MQTT credentials, members, and analytics — useful for landlords or holiday homes.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Have Home Assistant running',
    desc: 'GreenNest requires an existing Home Assistant installation with at least one sensor entity (power meter, temperature, humidity…). HA handles all local device communication and integration.',
    tag: 'Prerequisite',
    tagColor: '#f59e0b',
  },
  {
    n: '2',
    title: 'Deploy the local stack',
    desc: 'Install the GreenNest local package alongside HA — it includes a local MQTT broker and the local agent. HA publishes entity states to the local broker, which bridges them automatically to the GreenNest cloud. The agent handles device discovery and command relay.',
    tag: 'One-time setup',
    tagColor: '#3b82f6',
  },
  {
    n: '3',
    title: 'Create your account & home',
    desc: 'Sign up, create a home, and paste your unique MQTT credentials into the local stack config. Your home ID links the local broker bridge to your cloud account. Done in under two minutes.',
    tag: 'Sign up',
    tagColor: '#22c55e',
  },
  {
    n: '4',
    title: 'Monitor, analyse & optimise',
    desc: 'Watch live sensor data on the dashboard, explore historical trends, get anomaly alerts, discover where energy is wasted, and calculate the ROI of appliance upgrades.',
    tag: 'Ongoing',
    tagColor: '#8b5cf6',
  },
]

const REQUIREMENTS = [
  {
    required: true,
    title: 'Home Assistant',
    desc: 'A self-hosted Home Assistant instance with at least one sensor already configured. HA integrates your devices and publishes their state to the local MQTT broker — GreenNest never talks to your devices directly.',
    link: 'https://www.home-assistant.io',
    linkLabel: 'homeassistant.io →',
  },
  {
    required: true,
    title: 'GreenNest local stack',
    desc: 'A Docker-based package that includes a local MQTT broker (Mosquitto) and the GreenNest local agent. The broker bridges HA state data to the cloud; the agent handles entity discovery and command execution. Runs on Linux, Raspberry Pi, or any Docker host.',
    link: null,
    linkLabel: null,
  },
  {
    required: false,
    title: 'Smart sensors',
    desc: 'Any sensor integrated in Home Assistant works — smart plugs with power metering, temperature/humidity sensors, EV chargers, solar inverters, and more. The more sensors, the richer the analytics.',
    link: null,
    linkLabel: null,
  },
]

// Component
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
          <div className="landing-badge">Analytics layer for Home Assistant</div>
          <h1 className="landing-hero-title">
            Your Home Assistant data,<br />
            <span className="landing-hero-accent">finally making sense.</span>
          </h1>
          <p className="landing-hero-sub">
            GreenNest adds a cloud analytics layer on top of your existing Home Assistant setup.
            Real-time monitoring, anomaly detection, energy forecasting, and automation intelligence —
            all in one dashboard, with no changes to your HA configuration.
          </p>
          <div className="landing-hero-ctas">
            <Link to="/register" className="landing-btn landing-btn-primary landing-btn-lg">
              Get started free
            </Link>
            <Link to="/login" className="landing-btn landing-btn-ghost landing-btn-lg">
              Log in →
            </Link>
          </div>
          <p className="landing-hero-note">Requires Home Assistant · Free forever · Live demo available</p>
        </div>

        {/* decorative grid */}
        <div className="landing-hero-grid" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="landing-hero-grid-cell" />
          ))}
        </div>
      </section>

      {/* ── What is GreenNest ── */}
      <section className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="landing-what">
            <div className="landing-what-text">
              <div className="landing-what-label">What is GreenNest?</div>
              <h2 className="landing-what-title">Home Assistant collects your data.<br />GreenNest makes it useful.</h2>
              <p className="landing-what-desc">
                Home Assistant is excellent at integrating smart home devices and collecting sensor data.
                But it wasn't designed for deep energy analytics, anomaly detection, or consumption forecasting.
                That's exactly what GreenNest adds.
              </p>
              <p className="landing-what-desc">
                The <strong>GreenNest local stack</strong> runs alongside Home Assistant and consists of
                two components: a <strong>local MQTT broker</strong> that receives HA entity state updates
                and bridges them to the GreenNest cloud, and the <strong>local agent</strong> which handles
                entity discovery (so GreenNest knows what devices you have) and relays commands back to HA
                when needed. Sensor data flows through the broker — not the agent.
              </p>
              <p className="landing-what-desc">
                GreenNest is not a replacement for Home Assistant. It's a companion that answers
                questions HA can't: <em>"Which device is consuming the most energy this month?"</em>,
                <em>"Is my fridge behaving abnormally?"</em>, <em>"Would a heat pump actually pay off?"</em>
              </p>
            </div>

            {/* Architecture flow diagram */}
            <div className="landing-arch">
              <div className="landing-arch-node landing-arch-node-device">
                <div className="landing-arch-icon">⚡</div>
                <div className="landing-arch-label">Smart devices</div>
                <div className="landing-arch-sub">Plugs, sensors, meters, EV chargers…</div>
              </div>
              <div className="landing-arch-arrow"><IconArrow /></div>
              <div className="landing-arch-node landing-arch-node-ha">
                <div className="landing-arch-icon">🏠</div>
                <div className="landing-arch-label">Home Assistant</div>
                <div className="landing-arch-sub">Integrates devices, publishes states to local broker</div>
              </div>
              <div className="landing-arch-arrow"><IconArrow /></div>
              <div className="landing-arch-node landing-arch-node-agent">
                <div className="landing-arch-icon">🔗</div>
                <div className="landing-arch-label">Local stack</div>
                <div className="landing-arch-sub">MQTT broker bridges data to cloud · Agent handles discovery &amp; commands</div>
              </div>
              <div className="landing-arch-arrow"><IconArrow /></div>
              <div className="landing-arch-node landing-arch-node-cloud">
                <div className="landing-arch-icon">📊</div>
                <div className="landing-arch-label">GreenNest</div>
                <div className="landing-arch-sub">Analytics, anomalies, predictions, ROI</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Requirements ── */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2 className="landing-section-title">What you need to get started</h2>
            <p className="landing-section-sub">GreenNest is a companion tool — not a standalone platform. Here's what's required.</p>
          </div>
          <div className="landing-requirements">
            {REQUIREMENTS.map(({ required, title, desc, link, linkLabel }) => (
              <div key={title} className="landing-req-card">
                <div className="landing-req-header">
                  <h3 className="landing-req-title">{title}</h3>
                  <span className={`landing-req-badge ${required ? 'landing-req-badge-required' : 'landing-req-badge-optional'}`}>
                    {required ? 'Required' : 'Recommended'}
                  </span>
                </div>
                <p className="landing-req-desc">{desc}</p>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="landing-req-link">
                    {linkLabel}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Everything analytics that Home Assistant doesn't have</h2>
            <p className="landing-section-sub">Purpose-built features for understanding and optimising your home's energy use.</p>
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
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section-header">
            <h2 className="landing-section-title">How it works</h2>
            <p className="landing-section-sub">From your first sensor reading to full analytics — four steps, most of which you've probably already done.</p>
          </div>
          <div className="landing-steps">
            {STEPS.map(({ n, title, desc, tag, tagColor }) => (
              <div key={n} className="landing-step">
                <div className="landing-step-num">{n}</div>
                <div className="landing-step-body">
                  <span className="landing-step-tag" style={{ color: tagColor, background: `${tagColor}1a` }}>{tag}</span>
                  <h3 className="landing-step-title">{title}</h3>
                  <p className="landing-step-desc">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo CTA ── */}
      <section className="landing-section landing-section-alt">
        <div className="landing-container">
          <div className="landing-cta-card">
            <div className="landing-cta-icon">
              <IconPlay />
            </div>
            <div className="landing-cta-body">
              <h3 className="landing-cta-title">Try the live demo — no Home Assistant needed</h3>
              <p className="landing-cta-desc">
                Not ready to connect your own HA instance? Sign up and join the demo home.
                It's pre-loaded with real sensor data, anomaly events, energy predictions, and statistics
                from an actual smart home setup — so you can explore every feature before committing.
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
