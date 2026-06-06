import { useEffect, useState } from 'react'
import { useUser } from '../context/UserContext'
import { useHome } from '../context/HomeContext'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import '../styles/Settings.css'
import '../styles/Home.css'

export default function Settings() {
  const { user, updateUser } = useUser()
  const { selectedHome, fetchHomes } = useHome()
  const [config, setConfig] = useState(null)

  // Display name editing
  const [displayName, setDisplayName]       = useState('')
  const [displayNameSaved, setDisplayNameSaved] = useState(false)
  const [displayNameLoading, setDisplayNameLoading] = useState(false)

  // Add home panel: null | 'create' | 'join'
  const [addHomePanel, setAddHomePanel] = useState(null)

  const [newHomeName, setNewHomeName]       = useState('')
  const [newHomeError, setNewHomeError]     = useState(null)
  const [newHomeLoading, setNewHomeLoading] = useState(false)
  const [newHomeCreds, setNewHomeCreds]     = useState(null)

  const [joinHomeId, setJoinHomeId]   = useState('')
  const [joinError, setJoinError]     = useState(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinSuccess, setJoinSuccess] = useState(false)

  const [members, setMembers]               = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberError, setMemberError]       = useState(null)

  const [mqttLoading, setMqttLoading] = useState(false)
  const [mqttCreds, setMqttCreds]     = useState(null)

  const myRole   = selectedHome?.role
  const isOwner  = myRole === 'owner'
  const isAdmin  = myRole === 'admin'

  // Sync display name field with user state
  useEffect(() => {
    setDisplayName(user?.display_name || '')
  }, [user?.display_name])

  useEffect(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/config`)
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [selectedHome])

  useEffect(() => {
    if (!selectedHome) { setMembers([]); return }
    setMembersLoading(true)
    setMemberError(null)
    apiFetch(`${API_URL}/homes/${selectedHome.id}/members`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setMembers(data) : setMembers([]))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))
  }, [selectedHome])

  const handleSaveDisplayName = async () => {
    setDisplayNameLoading(true)
    try {
      const res  = await apiFetch(`${API_URL}/auth/me`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ display_name: displayName }),
      })
      const data = await res.json()
      if (res.ok) {
        updateUser({ display_name: data.display_name })
        setDisplayNameSaved(true)
        setTimeout(() => setDisplayNameSaved(false), 2000)
      }
    } catch { /* silent */ }
    finally { setDisplayNameLoading(false) }
  }

  const handleCreateHome = async (e) => {
    e.preventDefault()
    if (!newHomeName.trim()) return
    setNewHomeLoading(true)
    setNewHomeError(null)
    try {
      const res  = await apiFetch(`${API_URL}/homes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newHomeName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setNewHomeError(data.error); return }
      setNewHomeCreds(data)
      setNewHomeName('')
      fetchHomes()
    } catch {
      setNewHomeError('Failed to create home')
    } finally {
      setNewHomeLoading(false)
    }
  }

  const handleJoinHome = async (e) => {
    e.preventDefault()
    if (!joinHomeId.trim()) return
    setJoinLoading(true)
    setJoinError(null)
    setJoinSuccess(false)
    try {
      const res  = await apiFetch(`${API_URL}/homes/${joinHomeId.trim()}/join`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setJoinError(data.error); return }
      setJoinSuccess(true)
      setJoinHomeId('')
      fetchHomes()
    } catch {
      setJoinError('Failed to join home')
    } finally {
      setJoinLoading(false)
    }
  }

  const handleRegenMqtt = async () => {
    setMqttLoading(true)
    try {
      const res  = await apiFetch(`${API_URL}/homes/${selectedHome.id}/mqtt-config`)
      const data = await res.json()
      setMqttCreds(data)
    } catch { /* silent */ }
    finally { setMqttLoading(false) }
  }

  const handleRoleChange = async (memberId, newRole) => {
    setMemberError(null)
    const res = await apiFetch(
      `${API_URL}/homes/${selectedHome.id}/members/${memberId}/role`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }) }
    )
    if (res.ok) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } else {
      const data = await res.json()
      setMemberError(data.error)
    }
  }

  const handleRemoveMember = async (memberId) => {
    setMemberError(null)
    const res = await apiFetch(
      `${API_URL}/homes/${selectedHome.id}/members/${memberId}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } else {
      const data = await res.json()
      setMemberError(data.error)
    }
  }

  // What actions can the current user take on a target member?
  const getActions = (target) => {
    if (target.id === user.id) return []          // never act on yourself
    if (!isOwner && !isAdmin) return []            // plain members: view only
    if (isAdmin && target.role !== 'member') return [] // admins can only remove members

    const actions = []
    if (isAdmin) {
      actions.push({ label: 'Remove', danger: true, onClick: () => handleRemoveMember(target.id) })
    }
    if (isOwner) {
      // Promote / demote cycle
      if (target.role === 'member')  actions.push({ label: 'Make admin',  onClick: () => handleRoleChange(target.id, 'admin') })
      if (target.role === 'admin')   actions.push({ label: 'Make owner',  onClick: () => handleRoleChange(target.id, 'owner') },
                                                  { label: 'Make member', onClick: () => handleRoleChange(target.id, 'member') })
      if (target.role === 'owner')   actions.push({ label: 'Make admin',  onClick: () => handleRoleChange(target.id, 'admin') })
      actions.push({ label: 'Remove', danger: true, onClick: () => handleRemoveMember(target.id) })
    }
    return actions
  }

  const fmt     = (v, d = 2) => v != null ? Number(v).toFixed(d) : '—'
  const fmtTime = (t)        => t ? t.slice(0, 5) : '—'
  const displayFor = (m)     => m.display_name || m.username

  return (
    <div className="content-padding">
      <div className="settings-page">

        <div className="settings-page-header">
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Account and home configuration</p>
        </div>

        {/* Account */}
        <div className="stats-section-card settings-card">
          <h2 className="stats-section-title settings-section-title">Account</h2>
          <div className="settings-row">
            <span className="settings-label">Username</span>
            <span className="settings-value">{user.username}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Email</span>
            <span className="settings-value">{user.email}</span>
          </div>
          <div className="settings-row settings-row-edit">
            <span className="settings-label">Display name</span>
            <div className="settings-inline-edit">
              <input
                className="settings-input settings-input-inline"
                type="text"
                placeholder="Your name (optional)"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setDisplayNameSaved(false) }}
              />
              <button
                className="settings-btn-small"
                onClick={handleSaveDisplayName}
                disabled={displayNameLoading}
              >
                {displayNameSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {/* Add Home — collapsed by default, expands to Create / Join */}
        <div className="stats-section-card settings-card">
          <div className="settings-add-home-header">
            <div>
              <h2 className="stats-section-title settings-section-title">Add a home</h2>
              <p className="stats-section-subtitle" style={{ margin: 0 }}>
                Create a new home or join one with an existing ID.
              </p>
            </div>
            {!addHomePanel && (
              <div className="settings-add-home-btns">
                <button className="settings-btn-primary" onClick={() => setAddHomePanel('create')}>
                  Create new
                </button>
                <button className="settings-btn-secondary" onClick={() => setAddHomePanel('join')}>
                  Join existing
                </button>
              </div>
            )}
          </div>

          {addHomePanel === 'create' && (
            <div className="settings-add-home-panel">
              <div className="settings-panel-tabs">
                <button
                  className={`settings-tab ${addHomePanel === 'create' ? 'active' : ''}`}
                  onClick={() => { setAddHomePanel('create'); setNewHomeCreds(null); setNewHomeError(null) }}
                >
                  Create new
                </button>
                <button
                  className={`settings-tab ${addHomePanel === 'join' ? 'active' : ''}`}
                  onClick={() => { setAddHomePanel('join'); setJoinSuccess(false); setJoinError(null) }}
                >
                  Join existing
                </button>
                <button className="settings-panel-close" onClick={() => { setAddHomePanel(null); setNewHomeCreds(null) }}>✕</button>
              </div>

              {newHomeCreds ? (
                <div className="settings-credentials">
                  <div className="credentials-warning">
                    Save these credentials now — the MQTT password will not be shown again.
                  </div>
                  <div className="settings-row"><span className="settings-label">Home ID</span><code className="credentials-value">{newHomeCreds.id}</code></div>
                  <div className="settings-row"><span className="settings-label">MQTT host</span><code className="credentials-value">{newHomeCreds.mqtt_host}:{newHomeCreds.mqtt_port}</code></div>
                  <div className="settings-row"><span className="settings-label">Username</span><code className="credentials-value">{newHomeCreds.mqtt_username}</code></div>
                  <div className="settings-row"><span className="settings-label">Password</span><code className="credentials-value credentials-password">{newHomeCreds.mqtt_password}</code></div>
                  <button className="settings-btn-secondary" onClick={() => { setNewHomeCreds(null); setAddHomePanel(null) }}>Done</button>
                </div>
              ) : (
                <form className="settings-form" onSubmit={handleCreateHome}>
                  <input
                    className="settings-input"
                    type="text"
                    placeholder="Home name (e.g. My Apartment)"
                    value={newHomeName}
                    onChange={e => setNewHomeName(e.target.value)}
                    required
                    autoFocus
                  />
                  {newHomeError && <p className="settings-error">{newHomeError}</p>}
                  <button className="settings-btn-primary" type="submit" disabled={newHomeLoading}>
                    {newHomeLoading ? 'Creating…' : 'Create home'}
                  </button>
                </form>
              )}
            </div>
          )}

          {addHomePanel === 'join' && (
            <div className="settings-add-home-panel">
              <div className="settings-panel-tabs">
                <button
                  className={`settings-tab ${addHomePanel === 'create' ? 'active' : ''}`}
                  onClick={() => { setAddHomePanel('create'); setNewHomeCreds(null); setNewHomeError(null) }}
                >
                  Create new
                </button>
                <button
                  className={`settings-tab ${addHomePanel === 'join' ? 'active' : ''}`}
                  onClick={() => { setAddHomePanel('join'); setJoinSuccess(false); setJoinError(null) }}
                >
                  Join existing
                </button>
                <button className="settings-panel-close" onClick={() => { setAddHomePanel(null); setJoinSuccess(false) }}>✕</button>
              </div>

              {joinSuccess ? (
                <p className="settings-success">Joined successfully — select the home from the navbar.</p>
              ) : (
                <form className="settings-form" onSubmit={handleJoinHome}>
                  <input
                    className="settings-input"
                    type="text"
                    placeholder="Home ID (e.g. gh-abc12345)"
                    value={joinHomeId}
                    onChange={e => { setJoinHomeId(e.target.value); setJoinError(null) }}
                    required
                    autoFocus
                  />
                  {joinError && <p className="settings-error">{joinError}</p>}
                  <button className="settings-btn-primary" type="submit" disabled={joinLoading}>
                    {joinLoading ? 'Joining…' : 'Join home'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {selectedHome && (
          <>
            {/* Members — full width, visible to everyone, actions depend on role */}
            <div className="stats-section-card settings-card settings-card-full">
              <h2 className="stats-section-title settings-section-title">
                Members — {selectedHome.name}
              </h2>
              <p className="stats-section-subtitle">
                {isOwner ? 'As owner you can promote, demote, or remove members.'
                  : isAdmin ? 'As admin you can remove members.'
                  : 'You can view the members of this home.'}
              </p>
              {memberError && <p className="settings-error" style={{ marginBottom: '0.5rem' }}>{memberError}</p>}
              {membersLoading ? (
                <p className="settings-muted">Loading…</p>
              ) : (
                <div className="settings-members">
                  {members.map(m => {
                    const actions = getActions(m)
                    return (
                      <div key={m.id} className="member-row">
                        <div className="member-info">
                          <span className="member-name">{displayFor(m)}</span>
                          <span className="member-email">@{m.username}{m.display_name ? ` · ${m.email}` : ` · ${m.email}`}</span>
                        </div>
                        <div className="member-actions">
                          <span className={`member-role-badge ${m.role}`}>{m.role}</span>
                          {m.id === user.id && (
                            <span className="member-you-badge">you</span>
                          )}
                          {actions.map((a, i) => (
                            <button
                              key={i}
                              className={`settings-btn-small ${a.danger ? 'settings-btn-remove' : ''}`}
                              onClick={a.onClick}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* MQTT Config — visible to all, regen only for owners */}
            <div className="stats-section-card settings-card">
              <h2 className="stats-section-title settings-section-title">
                MQTT Configuration — {selectedHome.name}
              </h2>
              <p className="stats-section-subtitle">
                Use these credentials in your broker config.
                {!isOwner && ' Ask the home owner to regenerate credentials.'}
              </p>
              <div className="settings-row">
                <span className="settings-label">Home ID</span>
                <code className="credentials-value">{selectedHome.id}</code>
              </div>
              <div className="settings-row">
                <span className="settings-label">Username</span>
                <code className="credentials-value">{selectedHome.id}</code>
              </div>
              {mqttCreds ? (
                <>
                  <div className="settings-row">
                    <span className="settings-label">New password</span>
                    <code className="credentials-value credentials-password">{mqttCreds.mqtt_password}</code>
                  </div>
                  <p className="credentials-warning" style={{ marginTop: '0.5rem' }}>Update your broker config with this password now.</p>
                  <button className="settings-btn-secondary" onClick={() => setMqttCreds(null)}>Done</button>
                </>
              ) : isOwner && (
                <button className="settings-btn-danger" onClick={handleRegenMqtt} disabled={mqttLoading}>
                  {mqttLoading ? 'Generating…' : 'Regenerate MQTT password'}
                </button>
              )}
            </div>

            {/* Energy Tariff */}
            <div className="stats-section-card settings-card">
              <h2 className="stats-section-title settings-section-title">Energy Tariff</h2>
              <p className="stats-section-subtitle">
                Electricity rates for <strong>{selectedHome.name}</strong> — used for cost estimates and ROI calculations.
              </p>
              {config ? (
                <>
                  <div className="settings-row">
                    <span className="settings-label">Flat rate</span>
                    <span className="settings-value">{fmt(config.tariff_flat)} {config.currency}/kWh</span>
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Peak rate</span>
                    <span className="settings-value">
                      {fmt(config.tariff_peak)} {config.currency}/kWh
                      <span className="settings-hint">({fmtTime(config.peak_start)} – {fmtTime(config.peak_end)})</span>
                    </span>
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Off-peak</span>
                    <span className="settings-value">
                      {fmt(config.tariff_offpeak)} {config.currency}/kWh
                      <span className="settings-hint">({fmtTime(config.peak_end)} – {fmtTime(config.peak_start)})</span>
                    </span>
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Weekend</span>
                    <span className="settings-value">
                      {config.tariff_weekend != null
                        ? <>{fmt(config.tariff_weekend)} {config.currency}/kWh</>
                        : <span className="settings-muted">Not set — weekday rates apply</span>
                      }
                    </span>
                  </div>
                </>
              ) : (
                <p className="settings-muted">No tariff configured for this home.</p>
              )}
            </div>
          </>
        )}

        {/* Getting started — always visible */}
        <div className="stats-section-card settings-card settings-card-full">
          <h2 className="stats-section-title settings-section-title">Getting started</h2>
          <div className="home-getting-started" style={{ marginBottom: 0 }}>
            <div className="home-gs-card">
              <div className="home-gs-icon home-gs-icon-demo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="home-gs-body">
                <p className="home-gs-title">Try the demo</p>
                <p className="home-gs-desc">
                  Join the demo home with ID <strong>home1</strong> using the "Join existing" button above — explore charts, anomaly detection, predictions and more with real sample data.
                </p>
              </div>
            </div>

            <div className="home-gs-card">
              <div className="home-gs-icon home-gs-icon-connect">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
                  <path d="M9 21V12h6v9" />
                </svg>
              </div>
              <div className="home-gs-body">
                <p className="home-gs-title">Connect your real home</p>
                <ol className="home-gs-steps">
                  <li>Create a home above — you'll receive a unique home ID and MQTT credentials.</li>
                  <li>
                    Install <strong>GreenNest Local Agent</strong> on your home server.{' '}
                    <span className="home-gs-badge">Coming soon</span>
                  </li>
                  <li>
                    Install <strong>GreenNest Local Broker</strong>.{' '}
                    <span className="home-gs-badge">Coming soon</span>
                  </li>
                  <li>Enter the credentials from the MQTT Configuration section into your config.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Device Configuration */}
        <div className="stats-section-card settings-card settings-card-full">
          <h2 className="stats-section-title settings-section-title">Device Configuration</h2>
          <p className="stats-section-subtitle">
            Set device type and energy efficiency class for each device — used for recommendations and ROI analysis.
          </p>
          <p className="settings-muted-italic">Configure device classes from the Devices page.</p>
        </div>
      </div>
    </div>
  )
}
