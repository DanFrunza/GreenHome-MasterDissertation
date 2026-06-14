import { useToast } from '../context/ToastContext'
import '../styles/Toaster.css'

const ICONS = { success: '✓', error: '✕', info: 'ℹ' }

export default function Toaster() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null
  return (
    <div className="toaster">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{ICONS[t.type]}</span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}
