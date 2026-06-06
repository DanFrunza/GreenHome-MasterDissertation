import { useEffect, useState, useCallback } from 'react'
import '../styles/Automations.css'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { useHome } from '../context/HomeContext'
import NoHomeSelected from '../components/NoHomeSelected'
import { usePolling } from '../hooks/usePolling'

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
  if (a.service) {
    const parts = a.service.split('.')
    const svc   = parts[1]?.replace(/_/g, ' ') || a.service
    const label = svc.charAt(0).toUpperCase() + svc.slice(1)
    return { type: label, entity, detail: parts[0] }
  }
  if (a.action_type === 'delay') return { type: 'Delay', entity: '', detail: a.delay || '' }
  return { type: a.action_type || 'Action', entity, detail: '' }
}

function PipelineStep({ label, icon, content }) {
  return (
    <div className="pipeline-step">
      <span className="pipeline-step-label">{label}</span>
      <div className="pipeline-step-body">
        <span className="pipeline-step-icon">{icon}</span>
        <div className="pipeline-step-content">
          <span className="pipeline-step-type">{content.type}</span>
          {content.entity && <span className="pipeline-step-entity">{content.entity}</span>}
          {content.detail && <span className="pipeline-step-detail">{content.detail}</span>}
        </div>
      </div>
    </div>
  )
}

function PipelineArrow() {
  return <span className="pipeline-arrow">→</span>
}

export default function Automations() {
  const { selectedHome } = useHome()
  const [automations, setAutomations] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [toggling, setToggling]       = useState({})

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
    if (selectedHome) setLoading(true)
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
    } finally {
      setToggling(prev => ({ ...prev, [automationId]: false }))
    }
  }

  const handleRefresh = async () => {
    try {
      await apiFetch(`${API_URL}/homes/${selectedHome.id}/automations/refresh`, { method: 'POST' })
      setTimeout(fetchAutomations, 2000)
    } catch { /* silent */ }
  }

    if (!selectedHome) return <NoHomeSelected />
  if (loading && !automations.length) return <div className="content-padding"><p>Loading...</p></div>
  if (error   && !automations.length) return <div className="content-padding"><p className="automations-error">{error}</p></div>

  return (
    <div className="content-padding">
      <div className="automations-container">
        <div className="automations-header">
          <div>
            <h1 className="automations-title">Automations</h1>
            <p className="automations-subtitle">Manage your home automation rules</p>
          </div>
          <button className="refresh-btn" onClick={handleRefresh}>Sync from HA</button>
        </div>
      </div>

      <div className="automations-list">
        {automations.map(auto => {
          const trigger   = auto.triggers?.[0]
          const condition = auto.conditions?.[0]
          const action    = auto.actions?.[0]

          return (
            <div key={auto.automation_id} className={`automation-card ${auto.enabled ? 'enabled' : 'disabled'}`}>
              <div className="automation-card-header">
                <div className="automation-title-row">
                  <span className={`automation-status-dot ${auto.enabled ? 'on' : 'off'}`} />
                  <h2 className="automation-name">{auto.alias}</h2>
                </div>
                <label className={`toggle-switch ${toggling[auto.automation_id] ? 'toggle-loading' : ''}`}>
                  <input
                    type="checkbox"
                    checked={auto.enabled}
                    onChange={() => handleToggle(auto.automation_id, auto.enabled)}
                    disabled={toggling[auto.automation_id]}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="automation-pipeline">
                {trigger && <PipelineStep label="WHEN" icon="●" content={formatTrigger(trigger)} />}
                {auto.conditions?.length > 0 && condition && (
                  <>
                    <PipelineArrow />
                    <PipelineStep label="IF" icon="◆" content={formatCondition(condition)} />
                  </>
                )}
                {action && (
                  <>
                    <PipelineArrow />
                    <PipelineStep label="THEN" icon="▶" content={formatAction(action)} />
                  </>
                )}
              </div>

              <div className="automation-footer">
                <span className="automation-footer-item">
                  <span className="footer-label">mode</span> {auto.mode}
                </span>
                {auto.last_triggered && (
                  <>
                    <span className="footer-separator">•</span>
                    <span className="automation-footer-item">
                      <span className="footer-label">last triggered</span>{' '}
                      {new Date(auto.last_triggered).toLocaleString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
