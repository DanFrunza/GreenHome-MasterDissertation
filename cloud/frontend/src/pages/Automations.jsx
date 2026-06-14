import { useEffect, useState, useCallback } from 'react'
import '../styles/Automations.css'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { useHome } from '../context/HomeContext'
import { usePageTitle } from '../hooks/usePageTitle'
import NoHomeSelected from '../components/NoHomeSelected'
import { usePolling } from '../hooks/usePolling'
import { useToast } from '../context/ToastContext'

const COMPLEX_TYPES = new Set(['choose', 'repeat', 'parallel', 'other'])
const MAX_VISIBLE = 2

function formatTrigger(t) {
  const entity = t.entity_id?.split('.')[1] || t.entity_id || ''
  if (t.trigger_type === 'numeric_state') {
    const detail = t.above != null ? `above ${t.above}` : t.below != null ? `below ${t.below}` : ''
    return { type: 'Numeric State', entity, detail }
  }
  if (t.trigger_type === 'state') {
    const detail = t.from_state && t.to_state ? `${t.from_state} → ${t.to_state}` : t.to_state || ''
    return { type: 'State Change', entity, detail }
  }
  if (t.trigger_type === 'time') {
    return { type: 'Time', entity: '', detail: t.at_time || '' }
  }
  if (t.trigger_type === 'event') {
    return { type: 'Event', entity: '', detail: t.event_type || 'state_changed' }
  }
  return { type: t.trigger_type || 'Trigger', entity, detail: '' }
}

function formatCondition(c) {
  const entity = c.entity_id?.split('.')[1] || c.entity_id || ''
  if (c.condition_type === 'numeric_state') {
    const detail = c.above != null ? `above ${c.above}` : c.below != null ? `below ${c.below}` : ''
    return { type: 'Numeric State', entity, detail }
  }
  if (c.condition_type === 'state') {
    return { type: 'State', entity, detail: c.state_value || '' }
  }
  if (c.condition_type === 'template') {
    return { type: 'Template', entity: '', detail: '' }
  }
  if (c.condition_type === 'time') {
    const detail = [c.after_time && `after ${c.after_time}`, c.before_time && `before ${c.before_time}`].filter(Boolean).join(', ')
    return { type: 'Time', entity: '', detail }
  }
  return { type: c.condition_type || 'Condition', entity, detail: '' }
}

function formatAction(a) {
  const entity = a.entity_id?.split('.')[1] || a.entity_id || ''
  if (COMPLEX_TYPES.has(a.action_type)) {
    const label = a.action_type.charAt(0).toUpperCase() + a.action_type.slice(1)
    return { type: label, entity: '', detail: 'see raw config', isComplex: true }
  }
  if (a.service) {
    const parts = a.service.split('.')
    const svc   = parts[1]?.replace(/_/g, ' ') || a.service
    const label = svc.charAt(0).toUpperCase() + svc.slice(1)
    return { type: label, entity, detail: parts[0] }
  }
  if (a.action_type === 'delay') return { type: 'Delay', entity: '', detail: a.delay || '' }
  return { type: a.action_type || 'Action', entity, detail: '' }
}

function PipelineSection({ label, icon, items, variant }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null
  const visible = expanded ? items : items.slice(0, MAX_VISIBLE)
  const hidden  = items.length - MAX_VISIBLE

  return (
    <div className="pipeline-step">
      <span className={`pipeline-step-label pipeline-label-${variant}`}>{label}</span>
      <div className="pipeline-section-items">
        {visible.map((item, i) => (
          <div key={i} className={`pipeline-step-body pipeline-body-${variant}${item.isComplex ? ' pipeline-step-complex' : ''}`}>
            <span className="pipeline-step-icon">{item.isComplex ? '⚠' : icon}</span>
            <div className="pipeline-step-content">
              <span className="pipeline-step-type">{item.type}</span>
              {item.entity && <span className="pipeline-step-entity">{item.entity}</span>}
              {item.detail && <span className="pipeline-step-detail">{item.detail}</span>}
            </div>
          </div>
        ))}
        {!expanded && hidden > 0 && (
          <button className="pipeline-more-btn" onClick={e => { e.stopPropagation(); setExpanded(true) }}>
            +{hidden} more
          </button>
        )}
        {expanded && items.length > MAX_VISIBLE && (
          <button className="pipeline-more-btn" onClick={e => { e.stopPropagation(); setExpanded(false) }}>
            Show less
          </button>
        )}
      </div>
    </div>
  )
}

function PipelineArrow() {
  return <span className="pipeline-arrow">→</span>
}

const AUTO_MODE_TIPS = {
  single:   'Single: only one run at a time — new triggers are ignored while running',
  restart:  'Restart: if triggered again while running, the current run stops and restarts',
  queued:   'Queued: new triggers wait in a queue until the current run finishes',
  parallel: 'Parallel: every trigger starts a new independent run simultaneously',
}

function relativeTime(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff <= 0) return 'just now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Automations() {
  usePageTitle('Automations')
  const { selectedHome } = useHome()
  const isOwner = selectedHome?.role === 'owner'
  const { toast } = useToast()
  const [automations, setAutomations] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [toggling, setToggling]       = useState({})
  const [syncing, setSyncing]         = useState(false)
  const [search, setSearch]           = useState('')
  const [enabledCollapsed,  setEnabledCollapsed]  = useState(false)
  const [disabledCollapsed, setDisabledCollapsed] = useState(false)
  const [rawConfigModal, setRawConfigModal]       = useState(null)
  const [copied, setCopied]                       = useState(false)

  useEffect(() => {
    if (!rawConfigModal) return
    const onKey = (e) => { if (e.key === 'Escape') { setRawConfigModal(null); setCopied(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rawConfigModal])

  const fetchAutomations = useCallback(async () => {
    if (!selectedHome) return
    try {
      const res  = await apiFetch(`${API_URL}/homes/${selectedHome.id}/automations`)
      const data = await res.json()
      setAutomations(
        data
          .filter(a => a.triggers?.length > 0 && !a.actions?.some(ac => ac.service === 'mqtt.publish'))
          .sort((a, b) => (a.alias || '').localeCompare(b.alias || ''))
      )
      setError(null)
    } catch {
      setError('Failed to load automations')
    } finally {
      setLoading(false)
    }
  }, [selectedHome])

  useEffect(() => {
    if (selectedHome) {
      setLoading(true)
      setSearch('')
      setToggling({})
      setEnabledCollapsed(false)
      setDisabledCollapsed(false)
    }
  }, [selectedHome])

  usePolling(selectedHome ? fetchAutomations : null, 15000, [selectedHome])

  const handleToggle = async (automationId, currentEnabled) => {
    const action = currentEnabled ? 'disable' : 'enable'
    setToggling(prev => ({ ...prev, [automationId]: true }))
    setAutomations(prev =>
      prev.map(a => a.automation_id === automationId ? { ...a, enabled: !currentEnabled } : a)
    )
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/automations/${automationId}/${action}`, { method: 'POST' })
    } catch {
      setAutomations(prev =>
        prev.map(a => a.automation_id === automationId ? { ...a, enabled: currentEnabled } : a)
      )
      toast.error('Failed to toggle automation')
    } finally {
      setToggling(prev => ({ ...prev, [automationId]: false }))
    }
  }

  const handleRefresh = async () => {
    setSyncing(true)
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/automations/refresh`, { method: 'POST' })
      setTimeout(() => {
        fetchAutomations()
        setSyncing(false)
        toast.success('Synced from Home Assistant')
      }, 2000)
    } catch {
      setSyncing(false)
      toast.error('Sync failed')
    }
  }

    if (!selectedHome) return <NoHomeSelected />
  if (loading && !automations.length) return <div className="content-padding"><p>Loading...</p></div>
  if (error   && !automations.length) return <div className="content-padding"><p className="automations-error">{error}</p></div>
  if (!loading && !automations.length) return (
    <div className="content-padding">
      <div className="automations-container">
        <div className="automations-header">
          <div>
            <h1 className="automations-title">Automations</h1>
            <p className="automations-subtitle">No automations found</p>
          </div>
          <button className="refresh-btn" onClick={handleRefresh} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync from HA'}
          </button>
        </div>
      </div>
      <p className="automations-empty-state">No automations have been synced yet. Click <strong>Sync from HA</strong> to import from Home Assistant.</p>
    </div>
  )

  const q = search.trim().toLowerCase()
  const visibleAutomations = q
    ? automations.filter(a =>
        (a.alias || '').toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q)
      )
    : automations
  const enabledAutomations  = visibleAutomations.filter(a => a.enabled)
  const disabledAutomations = visibleAutomations.filter(a => !a.enabled)

  const renderCard = (auto) => {
    const triggers   = auto.triggers   || []
    const conditions = auto.conditions || []
    const actions    = auto.actions    || []
    const lastTriggered = relativeTime(auto.last_triggered)

    return (
      <div key={auto.automation_id} className={`automation-card ${auto.enabled ? 'enabled' : 'disabled'}`}>
        <div className="automation-card-header">
          <div className="automation-title-row">
            <span className={`automation-status-dot ${auto.enabled ? 'on' : 'off'}`} />
            <div>
              <h2 className="automation-name">{auto.alias}</h2>
              {auto.description && (
                <p className="automation-description">{auto.description}</p>
              )}
            </div>
          </div>
          <div className="automation-header-actions">
            <button
              className="automation-raw-btn"
              onClick={() => setRawConfigModal(auto)}
              title="View raw config (JSON)"
            >
              {'{ }'}
            </button>
            <label
              className={`toggle-switch ${toggling[auto.automation_id] ? 'toggle-loading' : ''} ${!isOwner ? 'toggle-disabled' : ''}`}
              title={!isOwner ? 'Only the home owner can control automations' : undefined}
            >
              <input
                type="checkbox"
                checked={auto.enabled}
                onChange={() => handleToggle(auto.automation_id, auto.enabled)}
                disabled={toggling[auto.automation_id] || !isOwner}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        <div className="automation-pipeline">
          <PipelineSection label="WHEN" icon="●" variant="when" items={triggers.map(formatTrigger)} />
          {conditions.length > 0 && (
            <>
              <PipelineArrow />
              <PipelineSection label="IF" icon="◆" variant="if" items={conditions.map(formatCondition)} />
            </>
          )}
          {actions.length > 0 && (
            <>
              <PipelineArrow />
              <PipelineSection label="THEN" icon="▶" variant="then" items={actions.map(formatAction)} />
            </>
          )}
        </div>

        <div className="automation-footer">
          <span className="automation-footer-item">
            <span className="footer-label">mode</span>{' '}
            <span className="automation-mode" title={AUTO_MODE_TIPS[auto.mode] || auto.mode}>{auto.mode}</span>
          </span>
          <span className="footer-separator">•</span>
          <span className="automation-footer-item automation-pipeline-counts">
            {triggers.length} trigger{triggers.length !== 1 ? 's' : ''}
            {conditions.length > 0 && ` · ${conditions.length} condition${conditions.length !== 1 ? 's' : ''}`}
            {` · ${actions.length} action${actions.length !== 1 ? 's' : ''}`}
          </span>
          <span className="footer-separator">•</span>
          {lastTriggered ? (
            <span
              className="automation-footer-item"
              title={new Date(auto.last_triggered).toLocaleString()}
            >
              <span className="footer-label">last triggered</span>{' '}{lastTriggered}
            </span>
          ) : (
            <span className="automation-footer-item automation-never-triggered">never triggered</span>
          )}
          {auto.ha_entity_id && (
            <>
              <span className="footer-separator">•</span>
              <span className="automation-footer-item automation-ha-id" title="Home Assistant entity ID">
                {auto.ha_entity_id}
              </span>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="content-padding">
      {selectedHome?.agent_status === 'offline' && (
        <div className="agent-offline-banner">
          <span>⚠</span>
          <span>Local agent is offline — automation commands may not work.</span>
        </div>
      )}
      {!isOwner && (
        <div className="agent-offline-banner">
          <span>ℹ</span>
          <span>Automation control is restricted to the home owner. Permission management will be available in a future update.</span>
        </div>
      )}
      <div className="automations-container">
        <div className="automations-header">
          <div>
            <h1 className="automations-title">Automations</h1>
            <p className="automations-subtitle">Manage your home automation rules</p>
            {automations.length > 0 && (
              <p className="page-stats">
                {automations.length} automation{automations.length !== 1 ? 's' : ''}&nbsp;&middot;&nbsp;
                <span className="automations-summary-enabled">{automations.filter(a => a.enabled).length} enabled</span>
                {automations.filter(a => !a.enabled).length > 0 && (
                  <>&nbsp;&middot;&nbsp;<span className="automations-summary-disabled">{automations.filter(a => !a.enabled).length} disabled</span></>
                )}
              </p>
            )}
          </div>
          <div className="automations-header-right">
            <div className="automations-search-wrap">
              <input
                className="automations-search-input"
                type="text"
                placeholder="Search automation…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="automations-search-clear" onClick={() => setSearch('')}>×</button>
              )}
            </div>
            <button className="refresh-btn" onClick={handleRefresh} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync from HA'}
            </button>
          </div>
        </div>
        {search && (
          <p className="automations-search-info">
            {visibleAutomations.length === 0
              ? 'No automations match your search.'
              : `Showing ${visibleAutomations.length} of ${automations.length} automation${automations.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <div className="automations-list">
        {q ? (
          visibleAutomations.length > 0 ? visibleAutomations.map(renderCard) : null
        ) : (
          <>
            {enabledAutomations.length > 0 && (
              <div className="automations-section">
                <button className="automations-section-toggle" onClick={() => setEnabledCollapsed(p => !p)}>
                  <span className="automations-section-title enabled">Enabled <span className="automations-section-count">({enabledAutomations.length})</span></span>
                  <span className="automations-section-chevron">{enabledCollapsed ? '▶' : '▼'}</span>
                </button>
                {!enabledCollapsed && enabledAutomations.map(renderCard)}
              </div>
            )}
            {disabledAutomations.length > 0 && (
              <div className="automations-section">
                <button className="automations-section-toggle" onClick={() => setDisabledCollapsed(p => !p)}>
                  <span className="automations-section-title disabled">Disabled <span className="automations-section-count">({disabledAutomations.length})</span></span>
                  <span className="automations-section-chevron">{disabledCollapsed ? '▶' : '▼'}</span>
                </button>
                {!disabledCollapsed && disabledAutomations.map(renderCard)}
              </div>
            )}
          </>
        )}
      </div>

      {rawConfigModal && (
        <div className="raw-config-overlay" onClick={() => { setRawConfigModal(null); setCopied(false) }}>
          <div className="raw-config-modal" onClick={e => e.stopPropagation()}>
            <div className="raw-config-modal-header">
              <span className="raw-config-modal-title">{rawConfigModal.alias}</span>
              <div className="raw-config-modal-actions">
                <button
                  className="raw-config-copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(rawConfigModal.raw_config, null, 2))
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button className="raw-config-modal-close" onClick={() => { setRawConfigModal(null); setCopied(false) }}>×</button>
              </div>
            </div>
            <pre className="raw-config-modal-body">
              {rawConfigModal.raw_config
                ? JSON.stringify(rawConfigModal.raw_config, null, 2)
                : 'No raw config available.'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
