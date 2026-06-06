import '../styles/InfoTooltip.css'

export default function InfoTooltip({ children }) {
  return (
    <span className="info-tooltip-wrap">
      <span className="info-icon">i</span>
      <span className="info-tooltip-box">{children}</span>
    </span>
  )
}
