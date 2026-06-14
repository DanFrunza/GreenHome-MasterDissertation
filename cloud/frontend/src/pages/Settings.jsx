import { useEffect, useRef, useState } from 'react'
import { useUser } from '../context/UserContext'
import { useHome } from '../context/HomeContext'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { useToast } from '../context/ToastContext'
import { usePageTitle } from '../hooks/usePageTitle'
import '../styles/Settings.css'
import '../styles/Home.css'

// ── Searchable dropdown ────────────────────────────────────────────────────────
function SearchableSelect({ value, onChange, options, placeholder }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const match = options.find(o => o.value === value)
    setSearch(match ? match.label : value || '')
  }, [value, options])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="searchable-select" ref={ref}>
      <input
        className="settings-input"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filtered.slice(0, 30).map(o => (
            <li
              key={o.value}
              className={o.value === value ? 'active' : ''}
              onMouseDown={() => { onChange(o.value); setSearch(o.label); setOpen(false) }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Data ───────────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'Europe/Bucharest',    label: 'Europe/Bucharest (EET, UTC+2)' },
  { value: 'Europe/London',       label: 'Europe/London (GMT, UTC+0)' },
  { value: 'Europe/Paris',        label: 'Europe/Paris (CET, UTC+1)' },
  { value: 'Europe/Berlin',       label: 'Europe/Berlin (CET, UTC+1)' },
  { value: 'Europe/Madrid',       label: 'Europe/Madrid (CET, UTC+1)' },
  { value: 'Europe/Rome',         label: 'Europe/Rome (CET, UTC+1)' },
  { value: 'Europe/Amsterdam',    label: 'Europe/Amsterdam (CET, UTC+1)' },
  { value: 'Europe/Warsaw',       label: 'Europe/Warsaw (CET, UTC+1)' },
  { value: 'Europe/Budapest',     label: 'Europe/Budapest (CET, UTC+1)' },
  { value: 'Europe/Athens',       label: 'Europe/Athens (EET, UTC+2)' },
  { value: 'Europe/Helsinki',     label: 'Europe/Helsinki (EET, UTC+2)' },
  { value: 'Europe/Sofia',        label: 'Europe/Sofia (EET, UTC+2)' },
  { value: 'Europe/Kiev',         label: 'Europe/Kiev (EET, UTC+2)' },
  { value: 'Europe/Moscow',       label: 'Europe/Moscow (MSK, UTC+3)' },
  { value: 'Europe/Istanbul',     label: 'Europe/Istanbul (TRT, UTC+3)' },
  { value: 'America/New_York',    label: 'America/New_York (EST, UTC-5)' },
  { value: 'America/Chicago',     label: 'America/Chicago (CST, UTC-6)' },
  { value: 'America/Denver',      label: 'America/Denver (MST, UTC-7)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST, UTC-8)' },
  { value: 'America/Toronto',     label: 'America/Toronto (EST, UTC-5)' },
  { value: 'America/Vancouver',   label: 'America/Vancouver (PST, UTC-8)' },
  { value: 'America/Sao_Paulo',   label: 'America/Sao_Paulo (BRT, UTC-3)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (CST, UTC-6)' },
  { value: 'America/Buenos_Aires',label: 'America/Buenos_Aires (ART, UTC-3)' },
  { value: 'Asia/Dubai',          label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'Asia/Kolkata',        label: 'Asia/Kolkata (IST, UTC+5:30)' },
  { value: 'Asia/Dhaka',          label: 'Asia/Dhaka (BST, UTC+6)' },
  { value: 'Asia/Bangkok',        label: 'Asia/Bangkok (ICT, UTC+7)' },
  { value: 'Asia/Singapore',      label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Shanghai',       label: 'Asia/Shanghai (CST, UTC+8)' },
  { value: 'Asia/Tokyo',          label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'Asia/Seoul',          label: 'Asia/Seoul (KST, UTC+9)' },
  { value: 'Australia/Sydney',    label: 'Australia/Sydney (AEST, UTC+10)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEST, UTC+10)' },
  { value: 'Pacific/Auckland',    label: 'Pacific/Auckland (NZST, UTC+12)' },
  { value: 'UTC',                 label: 'UTC (UTC+0)' },
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'hu', label: 'Magyar' },
  { value: 'cs', label: 'Čeština' },
  { value: 'sk', label: 'Slovenčina' },
  { value: 'hr', label: 'Hrvatski' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
]

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`credentials-copy-btn ${copied ? 'copied' : ''}`}
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }}
      title="Copy to clipboard"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Settings() {
  usePageTitle('Settings')
  const { user, updateUser } = useUser()
  const { selectedHome, fetchHomes } = useHome()
  const { toast } = useToast()
  const [config, setConfig] = useState(null)

  // Profile fields
  const [displayName,   setDisplayName]   = useState('')
  const [phone,         setPhone]         = useState('')
  const [timezone,      setTimezone]      = useState('Europe/Bucharest')
  const [language,      setLanguage]      = useState('en')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Add home panel: 'create' | 'join'
  const [addHomePanel, setAddHomePanel] = useState('create')

  const [newHomeName,    setNewHomeName]    = useState('')
  const [newHomeLoading, setNewHomeLoading] = useState(false)
  const [newHomeCreds,   setNewHomeCreds]   = useState(null)

  const [joinHomeId,  setJoinHomeId]  = useState('')
  const [joinLoading, setJoinLoading] = useState(false)

  const [members,        setMembers]        = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  const [mqttLoading, setMqttLoading] = useState(false)
  const [mqttCreds,   setMqttCreds]   = useState(null)

  // Home rename
  const [homeName,        setHomeName]        = useState('')
  const [homeNameLoading, setHomeNameLoading] = useState(false)

  // Tariff form
  const [tariffFlat,    setTariffFlat]    = useState('')
  const [tariffPeak,    setTariffPeak]    = useState('')
  const [tariffOffpeak, setTariffOffpeak] = useState('')
  const [tariffWeekend, setTariffWeekend] = useState('')
  const [peakStart,     setPeakStart]     = useState('07:00')
  const [peakEnd,       setPeakEnd]       = useState('22:00')
  const [currency,      setCurrency]      = useState('RON')
  const [tariffLoading, setTariffLoading] = useState(false)

  // Inline confirmations
  const [confirmRemoveId,        setConfirmRemoveId]        = useState(null)
  const [confirmOwnerTransferId, setConfirmOwnerTransferId] = useState(null)
  const [confirmRegen,           setConfirmRegen]           = useState(false)
  const [confirmLeave,           setConfirmLeave]           = useState(false)

  // Item 6 — getting started collapse
  const [gsCollapsed, setGsCollapsed] = useState(
    () => localStorage.getItem('settings-gs-collapsed') === 'true'
  )
  const toggleGs = () => {
    const next = !gsCollapsed
    setGsCollapsed(next)
    localStorage.setItem('settings-gs-collapsed', String(next))
  }

  const myRole  = selectedHome?.role
  const isOwner = myRole === 'owner'
  const isAdmin = myRole === 'admin'

  // Sync profile fields from user context
  useEffect(() => {
    if (!user) return
    setDisplayName(user.display_name || '')
    setPhone(user.phone || '')
    setTimezone(user.timezone || 'Europe/Bucharest')
    setLanguage(user.language || 'en')
    setNotificationsEnabled(user.notifications_enabled ?? true)
  }, [user?.id])

  useEffect(() => {
    setHomeName(selectedHome?.name || '')
  }, [selectedHome?.id])

  useEffect(() => {
    if (!selectedHome) return
    apiFetch(`${API_URL}/homes/${selectedHome.id}/config`)
      .then(r => r.json())
      .then(data => {
        setConfig(data)
        if (data) {
          setTariffFlat(data.tariff_flat    ?? '')
          setTariffPeak(data.tariff_peak    ?? '')
          setTariffOffpeak(data.tariff_offpeak ?? '')
          setTariffWeekend(data.tariff_weekend ?? '')
          setPeakStart(data.peak_start ? data.peak_start.slice(0, 5) : '07:00')
          setPeakEnd(data.peak_end   ? data.peak_end.slice(0, 5)   : '22:00')
          setCurrency(data.currency  ?? 'RON')
        }
      })
      .catch(() => setConfig(null))
  }, [selectedHome])

  useEffect(() => {
    if (!selectedHome) { setMembers([]); return }
    setMembersLoading(true)
    apiFetch(`${API_URL}/homes/${selectedHome.id}/members`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setMembers(data) : setMembers([]))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))
  }, [selectedHome])

  // Fix 1 — detect unsaved profile changes
  const profileDirty =
    displayName          !== (user?.display_name || '') ||
    phone                !== (user?.phone || '') ||
    timezone             !== (user?.timezone || 'Europe/Bucharest') ||
    language             !== (user?.language || 'en') ||
    notificationsEnabled !== (user?.notifications_enabled ?? true)

  const handleSaveProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/auth/me`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name:          displayName,
          phone:                 phone,
          timezone:              timezone,
          language:              language,
          notifications_enabled: notificationsEnabled,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        updateUser(data)
        toast.success('Profile saved')
      } else {
        toast.error(data.error || 'Failed to save profile')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPw !== confirmPw) { toast.error('New passwords do not match'); return }
    if (newPw.length < 8)   { toast.error('New password must be at least 8 characters'); return }
    setPwLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/auth/me/password`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      const data = await res.json()
      if (res.ok) {
        setCurrentPw(''); setNewPw(''); setConfirmPw('')
        toast.success('Password changed successfully')
      } else {
        toast.error(data.error || 'Failed to change password')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setPwLoading(false)
    }
  }

  const handleCreateHome = async (e) => {
    e.preventDefault()
    if (!newHomeName.trim()) return
    setNewHomeLoading(true)
    try {
      const res  = await apiFetch(`${API_URL}/homes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newHomeName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to create home'); return }
      setNewHomeCreds(data)
      setNewHomeName('')
      fetchHomes()
    } catch {
      toast.error('Failed to create home')
    } finally {
      setNewHomeLoading(false)
    }
  }

  const handleJoinHome = async (e) => {
    e.preventDefault()
    if (!joinHomeId.trim()) return
    setJoinLoading(true)
    try {
      const res  = await apiFetch(`${API_URL}/homes/${joinHomeId.trim()}/join`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to join home'); return }
      setJoinHomeId('')
      fetchHomes()
      toast.success('Joined successfully — select the home from the navbar.')
    } catch {
      toast.error('Failed to join home')
    } finally {
      setJoinLoading(false)
    }
  }

  // Fix 3 — no window.confirm, state drives inline confirmation
  const handleRegenMqtt = async () => {
    setConfirmRegen(false)
    setMqttLoading(true)
    try {
      const res  = await apiFetch(`${API_URL}/homes/${selectedHome.id}/mqtt-config`)
      const data = await res.json()
      setMqttCreds(data)
    } catch { /* silent */ }
    finally { setMqttLoading(false) }
  }

  const handleRenameHome = async () => {
    if (!homeName.trim() || homeName.trim() === selectedHome.name) return
    setHomeNameLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/homes/${selectedHome.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: homeName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        fetchHomes()
        toast.success('Home renamed')
      } else {
        toast.error(data.error || 'Failed to rename')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setHomeNameLoading(false)
    }
  }

  const handleSaveTariff = async (e) => {
    e.preventDefault()
    setTariffLoading(true)
    try {
      const res = await apiFetch(`${API_URL}/homes/${selectedHome.id}/config`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tariff_flat:    tariffFlat    !== '' ? parseFloat(tariffFlat)    : null,
          tariff_peak:    tariffPeak    !== '' ? parseFloat(tariffPeak)    : null,
          tariff_offpeak: tariffOffpeak !== '' ? parseFloat(tariffOffpeak) : null,
          tariff_weekend: tariffWeekend !== '' ? parseFloat(tariffWeekend) : null,
          peak_start:     peakStart || null,
          peak_end:       peakEnd   || null,
          currency,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setConfig(data)
        toast.success('Tariff saved')
      } else {
        toast.error(data.error || 'Failed to save tariff')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setTariffLoading(false)
    }
  }

  // Fix 3 — no window.confirm for role changes
  const handleRoleChange = async (memberId, newRole) => {
    if (newRole === 'owner' && confirmOwnerTransferId !== memberId) {
      setConfirmOwnerTransferId(memberId)
      return
    }
    setConfirmOwnerTransferId(null)
    const res = await apiFetch(
      `${API_URL}/homes/${selectedHome.id}/members/${memberId}/role`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }) }
    )
    if (res.ok) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to update role')
    }
  }

  const handleLeaveHome = async () => {
    setConfirmLeave(false)
    const res = await apiFetch(
      `${API_URL}/homes/${selectedHome.id}/members/${user.id}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      toast.success(`Left ${selectedHome.name}`)
      fetchHomes()
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to leave home')
    }
  }

  // no window.confirm for remove
  const handleRemoveMember = async (memberId) => {
    setConfirmRemoveId(null)
    const res = await apiFetch(
      `${API_URL}/homes/${selectedHome.id}/members/${memberId}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to remove member')
    }
  }

  const getActions = (target) => {
    if (target.id === user.id) return []
    if (!isOwner && !isAdmin) return []
    if (isAdmin && target.role !== 'member') return []
    const actions = []
    if (isAdmin) {
      actions.push({ label: 'Remove', danger: true, onClick: () => handleRemoveMember(target.id) })
    }
    if (isOwner) {
      if (target.role === 'member') actions.push({ label: 'Make admin', onClick: () => handleRoleChange(target.id, 'admin') })
      if (target.role === 'admin')  actions.push(
        { label: 'Make owner',  transferOwner: true, onClick: () => handleRoleChange(target.id, 'owner') },
        { label: 'Make member', onClick: () => handleRoleChange(target.id, 'member') }
      )
      if (target.role === 'owner') actions.push({ label: 'Make admin', onClick: () => handleRoleChange(target.id, 'admin') })
      actions.push({ label: 'Remove', danger: true, onClick: () => handleRemoveMember(target.id) })
    }
    return actions
  }

  const fmt        = (v, d = 2) => v != null ? Number(v).toFixed(d) : '—'
  const fmtTime    = (t)        => t ? t.slice(0, 5) : '—'
  const displayFor = (m)        => m.display_name || m.username
  const fmtDate    = (d)        => d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
  const fmtMonth   = (d)        => d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : null

  const timeAgo = (ts) => {
    if (!ts) return null
    const diff = (Date.now() - new Date(ts).getTime()) / 1000
    if (diff < 60)    return 'just now'
    if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return `${Math.floor(diff / 86400)} days ago`
  }

  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw

  // Item 1 — tariff unsaved indicator
  const numOrNull = (v) => v !== '' ? parseFloat(v) : null
  const tariffDirty = isOwner && config != null && (
    numOrNull(tariffFlat)    !== (config.tariff_flat    ?? null) ||
    numOrNull(tariffPeak)    !== (config.tariff_peak    ?? null) ||
    numOrNull(tariffOffpeak) !== (config.tariff_offpeak ?? null) ||
    numOrNull(tariffWeekend) !== (config.tariff_weekend ?? null) ||
    peakStart !== (config.peak_start ? config.peak_start.slice(0, 5) : '07:00') ||
    peakEnd   !== (config.peak_end   ? config.peak_end.slice(0, 5)   : '22:00') ||
    currency  !== (config.currency   ?? 'RON')
  )

  // Item 5 — avatar
  const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']
  const avatarColor = AVATAR_COLORS[(user?.username?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const initials = (user?.display_name || user?.username || '?')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  // helper: show saved tariff value as hint
  const tariffHint = (field, label) => {
    if (!config || config[field] == null) return null
    return <span className="settings-field-current">Saved: {Number(config[field]).toFixed(4)} {config.currency ?? 'RON'}{label}</span>
  }

  return (
    <div className="content-padding">
      <div className="settings-page">

        <div className="settings-page-header">
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Account and home configuration</p>
        </div>

        {/* Account — read-only info */}
        <div className="stats-section-card settings-card">
          <h2 className="stats-section-title settings-section-title">Account</h2>
          <div className="settings-account-header">
            <div className="settings-avatar" style={{ backgroundColor: avatarColor }}>
              {initials}
            </div>
            <div className="settings-avatar-info">
              <p className="settings-avatar-name">{user?.display_name || user?.username}</p>
              <p className="settings-avatar-sub">{user?.email}</p>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label">Username</span>
            <span className="settings-value">{user?.username}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Email</span>
            <span className="settings-value">{user?.email}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Member since</span>
            <span className="settings-value">{fmtDate(user?.created_at)}</span>
          </div>
          {user?.updated_at && user.updated_at !== user.created_at && (
            <div className="settings-row">
              <span className="settings-label">Last updated</span>
              <span className="settings-value">{fmtDate(user.updated_at)}</span>
            </div>
          )}
        </div>

        {/* Add Home */}
        <div className="stats-section-card settings-card">
          <h2 className="stats-section-title settings-section-title">Add a home</h2>
          <p className="stats-section-subtitle settings-no-margin">
            Create a new home or join one with an existing ID.
          </p>

          <div className="settings-add-home-panel">
            <div className="settings-panel-tabs">
              <button className={`settings-tab ${addHomePanel === 'create' ? 'active' : ''}`}
                onClick={() => { setAddHomePanel('create'); setNewHomeCreds(null) }}>Create new</button>
              <button className={`settings-tab ${addHomePanel === 'join' ? 'active' : ''}`}
                onClick={() => setAddHomePanel('join')}>Join existing</button>
            </div>

            {addHomePanel === 'create' && (
              newHomeCreds ? (
                <div className="settings-credentials">
                  <div className="credentials-warning">Save these credentials now — the MQTT password will not be shown again.</div>
                  <div className="settings-row"><span className="settings-label">Home ID</span><div className="credentials-copy-row"><code className="credentials-value">{newHomeCreds.id}</code><CopyBtn text={newHomeCreds.id} /></div></div>
                  <div className="settings-row"><span className="settings-label">MQTT host</span><div className="credentials-copy-row"><code className="credentials-value">{newHomeCreds.mqtt_host}:{newHomeCreds.mqtt_port}</code><CopyBtn text={`${newHomeCreds.mqtt_host}:${newHomeCreds.mqtt_port}`} /></div></div>
                  <div className="settings-row"><span className="settings-label">Username</span><div className="credentials-copy-row"><code className="credentials-value">{newHomeCreds.mqtt_username}</code><CopyBtn text={newHomeCreds.mqtt_username} /></div></div>
                  <div className="settings-row"><span className="settings-label">Password</span><div className="credentials-copy-row"><code className="credentials-value credentials-password">{newHomeCreds.mqtt_password}</code><CopyBtn text={newHomeCreds.mqtt_password} /></div></div>
                  <button className="settings-btn-secondary" onClick={() => setNewHomeCreds(null)}>Done</button>
                </div>
              ) : (
                <form className="settings-form" onSubmit={handleCreateHome}>
                  <input className="settings-input" type="text" placeholder="Home name (e.g. My Apartment)"
                    value={newHomeName} onChange={e => setNewHomeName(e.target.value)} required />
                  <button className="settings-btn-primary" type="submit" disabled={newHomeLoading}>
                    {newHomeLoading ? 'Creating…' : 'Create home'}
                  </button>
                </form>
              )
            )}

            {addHomePanel === 'join' && (
              <form className="settings-form" onSubmit={handleJoinHome}>
                <input className="settings-input" type="text" placeholder="Home ID (e.g. gh-abc12345)"
                  value={joinHomeId} onChange={e => setJoinHomeId(e.target.value)} required />
                <button className="settings-btn-primary" type="submit" disabled={joinLoading}>
                  {joinLoading ? 'Joining…' : 'Join home'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Profile — editable */}
        <div className="stats-section-card settings-card">
          <h2 className="stats-section-title settings-section-title">Profile</h2>

          <div className="settings-profile-grid">
            <div className="settings-profile-field">
              <label className="settings-field-label">Display name</label>
              <input
                className="settings-input"
                type="text"
                placeholder="Your name (optional)"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>

            <div className="settings-profile-field">
              <label className="settings-field-label">Phone</label>
              <input
                className="settings-input"
                type="tel"
                placeholder="+40 700 000 000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>

            <div className="settings-profile-field">
              <label className="settings-field-label">Timezone</label>
              <SearchableSelect
                value={timezone}
                onChange={v => setTimezone(v)}
                options={TIMEZONES}
                placeholder="Search timezone…"
              />
            </div>

            <div className="settings-profile-field">
              <label className="settings-field-label">Language</label>
              <SearchableSelect
                value={language}
                onChange={v => setLanguage(v)}
                options={LANGUAGES}
                placeholder="Search language…"
              />
            </div>
          </div>

          <div className="settings-toggle-row">
            <div>
              <span className="settings-field-label">Email notifications</span>
              <p className="settings-muted settings-muted-top">Receive alerts when anomalies are detected</p>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={e => setNotificationsEnabled(e.target.checked)}
              />
              <span className="settings-toggle-track">
                <span className="settings-toggle-thumb" />
              </span>
            </label>
          </div>

          {/* Fix 1 — unsaved indicator + save button */}
          <div className="settings-save-row">
            <button
              className="settings-btn-primary"
              onClick={handleSaveProfile}
              disabled={profileLoading}
            >
              {profileLoading ? 'Saving…' : 'Save profile'}
            </button>
            {profileDirty && !profileLoading && (
              <span className="settings-unsaved">Unsaved changes</span>
            )}
          </div>
        </div>

        {/* Security — password change */}
        <div className="stats-section-card settings-card">
          <h2 className="stats-section-title settings-section-title">Security</h2>
          <p className="stats-section-subtitle">Change your account password.</p>

          <form className="settings-form" onSubmit={handleChangePassword}>
            <div className="settings-profile-field">
              <label className="settings-field-label">Current password</label>
              <input
                className="settings-input"
                type="password"
                placeholder="Enter current password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="settings-profile-field">
              <label className="settings-field-label">New password</label>
              <input
                className="settings-input"
                type="password"
                placeholder="At least 8 characters"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="settings-profile-field">
              <label className="settings-field-label">Confirm new password</label>
              <input
                className={`settings-input ${pwMismatch ? 'settings-input-error' : ''}`}
                type="password"
                placeholder="Repeat new password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
              />
              {pwMismatch && <span className="settings-error">Passwords don't match</span>}
            </div>
            <button className="settings-btn-primary" type="submit" disabled={pwLoading}>
              {pwLoading ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </div>

        {selectedHome && (
          <>
            {/* Members */}
            <div className="stats-section-card settings-card settings-card-full">
              <h2 className="stats-section-title settings-section-title">
                Members — {selectedHome.name}
                {!membersLoading && <span className="settings-member-count">({members.length})</span>}
              </h2>
              <p className="stats-section-subtitle">
                {isOwner ? 'As owner you can promote, demote, or remove members.'
                  : isAdmin ? 'As admin you can remove members.'
                  : 'You can view the members of this home.'}
              </p>
              {/* Item 3 — your role */}
              {!membersLoading && myRole && (
                <div className="settings-your-role">
                  Your role in this home: <span className={`member-role-badge ${myRole}`}>{myRole}</span>
                </div>
              )}

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
                          {/* Item 2 — joined date */}
                          <span className="member-email">
                            @{m.username} · {m.email}
                            {m.joined_at && <span className="member-joined"> · joined {fmtMonth(m.joined_at)}</span>}
                          </span>
                        </div>
                        <div className="member-actions">
                          <span className={`member-role-badge ${m.role}`}>{m.role}</span>
                          {m.id === user.id && <span className="member-you-badge">you</span>}
                          {confirmRemoveId === m.id ? (
                            <span className="settings-confirm-inline">
                              Remove {displayFor(m)}?
                              <button className="settings-btn-small settings-btn-remove"
                                onClick={() => handleRemoveMember(m.id)}>Yes</button>
                              <button className="settings-btn-small"
                                onClick={() => setConfirmRemoveId(null)}>Cancel</button>
                            </span>
                          ) : confirmOwnerTransferId === m.id ? (
                            <span className="settings-confirm-inline">
                              Transfer ownership to {displayFor(m)}?
                              <button className="settings-btn-small"
                                onClick={() => handleRoleChange(m.id, 'owner')}>Yes</button>
                              <button className="settings-btn-small"
                                onClick={() => setConfirmOwnerTransferId(null)}>Cancel</button>
                            </span>
                          ) : (
                            actions.map((a, i) => (
                              <button key={i}
                                className={`settings-btn-small ${a.danger ? 'settings-btn-remove' : ''}`}
                                onClick={
                                  a.danger        ? () => setConfirmRemoveId(m.id) :
                                  a.transferOwner ? () => setConfirmOwnerTransferId(m.id) :
                                  a.onClick
                                }
                              >{a.label}</button>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Item 1 — Leave home (non-owners only) */}
              {!isOwner && (
                <div className="settings-leave-row">
                  {confirmLeave ? (
                    <span className="settings-confirm-inline">
                      Leave {selectedHome.name}?
                      <button className="settings-btn-small settings-btn-remove" onClick={handleLeaveHome}>Yes, leave</button>
                      <button className="settings-btn-small" onClick={() => setConfirmLeave(false)}>Cancel</button>
                    </span>
                  ) : (
                    <button className="settings-btn-danger" onClick={() => setConfirmLeave(true)}>
                      Leave this home
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* MQTT Config */}
            <div className="stats-section-card settings-card">
              <h2 className="stats-section-title settings-section-title">MQTT Configuration — {selectedHome.name}</h2>
              <p className="stats-section-subtitle">
                Use these credentials in your broker config. The Home ID also serves as the MQTT username.
                {!isOwner && ' Ask the home owner to regenerate credentials.'}
              </p>

              {isOwner && (
                <div className="settings-row settings-row-edit">
                  <span className="settings-label">Home name</span>
                  <div className="settings-inline-edit">
                    <input
                      className="settings-input settings-input-inline"
                      type="text"
                      value={homeName}
                      onChange={e => setHomeName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRenameHome()}
                    />
                    <button className="settings-btn-small" onClick={handleRenameHome} disabled={homeNameLoading}>
                      {homeNameLoading ? 'Renaming…' : 'Rename'}
                    </button>
                  </div>
                </div>
              )}
              <div className="settings-row">
                <span className="settings-label">Home ID</span>
                <div className="credentials-copy-row">
                  <code className="credentials-value">{selectedHome.id}</code>
                  <CopyBtn text={selectedHome.id} />
                </div>
              </div>
              <div className="settings-row">
                <span className="settings-label">Data</span>
                <span className={`home-card-badge ${selectedHome.status === 'online' ? 'online' : 'offline'}`}>
                  {selectedHome.status === 'online' ? 'Online' : 'Offline'}
                </span>
                {selectedHome.status === 'offline' && selectedHome.last_seen && (
                  <span className="settings-last-seen">last seen {timeAgo(selectedHome.last_seen)}</span>
                )}
              </div>
              <div className="settings-row">
                <span className="settings-label">Local agent</span>
                <span className={`home-card-badge ${selectedHome.agent_status === 'online' ? 'online' : 'offline'}`}>
                  {selectedHome.agent_status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
              {mqttCreds ? (
                <>
                  <div className="settings-row">
                    <span className="settings-label">New password</span>
                    <div className="credentials-copy-row">
                      <code className="credentials-value credentials-password">{mqttCreds.mqtt_password}</code>
                      <CopyBtn text={mqttCreds.mqtt_password} />
                    </div>
                  </div>
                  <p className="credentials-warning credentials-warning-top">Update your broker config with this password now.</p>
                  <button className="settings-btn-secondary" onClick={() => setMqttCreds(null)}>Done</button>
                </>
              ) : isOwner && (
                /* Fix 3 — inline confirmation for MQTT regen */
                confirmRegen ? (
                  <div className="settings-confirm-regen">
                    <p className="settings-muted">This will invalidate the current MQTT password and disconnect your local agent until you update the config.</p>
                    <div className="settings-confirm-regen-btns">
                      <button className="settings-btn-danger" onClick={handleRegenMqtt} disabled={mqttLoading}>
                        {mqttLoading ? 'Generating…' : 'Yes, regenerate'}
                      </button>
                      <button className="settings-btn-secondary" onClick={() => setConfirmRegen(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="settings-btn-danger" onClick={() => setConfirmRegen(true)} disabled={mqttLoading}>
                    Regenerate MQTT password
                  </button>
                )
              )}
            </div>

            {/* Energy Tariff */}
            <div className="stats-section-card settings-card">
              <h2 className="stats-section-title settings-section-title">Energy Tariff</h2>
              <p className="stats-section-subtitle">
                Electricity rates for <strong>{selectedHome.name}</strong> — used for cost estimates and ROI calculations.
                {!isOwner && ' Only the home owner can edit these values.'}
              </p>

              {isOwner ? (
                <form className="settings-form" onSubmit={handleSaveTariff}>
                  <div className="settings-profile-grid">
                    <div className="settings-profile-field">
                      <label className="settings-field-label">Currency</label>
                      <select
                        className="settings-input settings-select"
                        value={currency}
                        onChange={e => setCurrency(e.target.value)}
                      >
                        {['RON', 'EUR', 'USD', 'GBP', 'CHF', 'HUF', 'PLN'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Fix 2 — show saved value as hint under each tariff field */}
                    <div className="settings-profile-field">
                      <label className="settings-field-label">Flat rate ({currency}/kWh)</label>
                      <input className="settings-input" type="number" step="0.0001" min="0"
                        placeholder="e.g. 0.9500" value={tariffFlat} onChange={e => setTariffFlat(e.target.value)} />
                      {tariffHint('tariff_flat', '/kWh')}
                    </div>

                    <div className="settings-profile-field">
                      <label className="settings-field-label">Peak rate ({currency}/kWh)</label>
                      <input className="settings-input" type="number" step="0.0001" min="0"
                        placeholder="e.g. 1.2000" value={tariffPeak} onChange={e => setTariffPeak(e.target.value)} />
                      {tariffHint('tariff_peak', '/kWh')}
                    </div>

                    <div className="settings-profile-field">
                      <label className="settings-field-label">Off-peak rate ({currency}/kWh)</label>
                      <input className="settings-input" type="number" step="0.0001" min="0"
                        placeholder="e.g. 0.6000" value={tariffOffpeak} onChange={e => setTariffOffpeak(e.target.value)} />
                      {tariffHint('tariff_offpeak', '/kWh')}
                    </div>

                    <div className="settings-profile-field">
                      <label className="settings-field-label">Peak start (local time)</label>
                      <input className="settings-input" type="time" value={peakStart}
                        onChange={e => setPeakStart(e.target.value)} />
                      {config?.peak_start && <span className="settings-field-current">Saved: {fmtTime(config.peak_start)}</span>}
                    </div>

                    <div className="settings-profile-field">
                      <label className="settings-field-label">Peak end (local time)</label>
                      <input className="settings-input" type="time" value={peakEnd}
                        onChange={e => setPeakEnd(e.target.value)} />
                      {config?.peak_end && <span className="settings-field-current">Saved: {fmtTime(config.peak_end)}</span>}
                    </div>

                    <div className="settings-profile-field">
                      <label className="settings-field-label">
                        Weekend rate ({currency}/kWh) <span className="settings-hint-inline">optional</span>
                      </label>
                      <input className="settings-input" type="number" step="0.0001" min="0"
                        placeholder="Leave empty to use flat rate" value={tariffWeekend}
                        onChange={e => setTariffWeekend(e.target.value)} />
                      {config?.tariff_weekend != null
                        ? tariffHint('tariff_weekend', '/kWh')
                        : config && <span className="settings-field-current">Saved: not set</span>
                      }
                    </div>
                  </div>

                  <div className="settings-save-row">
                    <button className="settings-btn-primary" type="submit" disabled={tariffLoading}>
                      {tariffLoading ? 'Saving…' : 'Save tariff'}
                    </button>
                    {tariffDirty && !tariffLoading && (
                      <span className="settings-unsaved">Unsaved changes</span>
                    )}
                  </div>
                </form>
              ) : config ? (
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

        {/* Getting started */}
        <div className="stats-section-card settings-card settings-card-full">
          <div className="settings-gs-header">
            <h2 className="stats-section-title settings-section-title">Getting started</h2>
            <button className="settings-collapse-btn" onClick={toggleGs}>
              {gsCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>
          {!gsCollapsed && <div className="home-getting-started settings-gs-no-margin">
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
                  <li>Install <strong>GreenNest Local Agent</strong> on your home server. <span className="home-gs-badge">Coming soon</span></li>
                  <li>Install <strong>GreenNest Local Broker</strong>. <span className="home-gs-badge">Coming soon</span></li>
                  <li>Enter the credentials from the MQTT Configuration section into your config.</li>
                </ol>
              </div>
            </div>
          </div>}
        </div>

      </div>
    </div>
  )
}
