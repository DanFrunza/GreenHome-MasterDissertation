import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { HOUR_LABELS } from '../utils/chartUtils'
import { formatSensorValue } from '../utils/formatValue'

// Săptămâna începe luni (standard EU/ISO)
const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0]
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isPeakHour(h, tariff) {
  if (!tariff?.peak_start || !tariff?.peak_end) return false
  const s = parseInt(tariff.peak_start.slice(0, 2))
  const e = parseInt(tariff.peak_end.slice(0, 2))
  return e > s ? h >= s && h < e : h >= s || h < e
}

export default function HeatmapChart({ homeId, entityId, unit, from, to, deviceClass, tariff }) {
  const svgRef       = useRef()
  const containerRef = useRef()
  const wrapperRef   = useRef()
  const [data, setData]                   = useState([])
  const [loading, setLoading]             = useState(true)
  const [tooltip, setTooltip]             = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // ResizeObserver — rulează și când loading devine false (atunci apare containerRef în DOM)
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [loading])

  // Fetch date
  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)
    setData([])
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

    if (deviceClass === 'energy') {
      const params = new URLSearchParams({ period: 'hour' })
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/aggregations?${params}`)
        .then(r => r.json())
        .then(rows => {
          const grid = {}
          rows.forEach(r => {
            const delta = Math.max(0, parseFloat(r.max_value) - parseFloat(r.min_value))
            if (isNaN(delta) || !isFinite(delta)) return
            const parts = new Intl.DateTimeFormat('en-US', {
              timeZone: tz, year: 'numeric', month: 'numeric',
              day: 'numeric', hour: 'numeric', hour12: false,
            }).formatToParts(new Date(r.period_start))
            const get  = t => parseInt(parts.find(p => p.type === t)?.value ?? '0')
            const hour = get('hour') % 24
            const dow  = new Date(get('year'), get('month') - 1, get('day')).getDay()
            const key  = `${dow}_${hour}`
            if (!grid[key]) grid[key] = { sum: 0, count: 0 }
            grid[key].sum += delta
            grid[key].count++
          })
          const cells = []
          for (let dow = 0; dow < 7; dow++)
            for (let hour = 0; hour < 24; hour++) {
              const cell = grid[`${dow}_${hour}`]
              cells.push({ dow, hour, avg_value: cell ? cell.sum / cell.count : null, count: cell?.count ?? 0 })
            }
          setData(cells)
          setLoading(false)
        })
        .catch(() => setLoading(false))
      return
    }

    const params = new URLSearchParams({ tz })
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/heatmap?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, from, to, deviceClass])

  // Draw cu D3
  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current || !containerWidth) return
    const filled = data.filter(d => d.avg_value != null)
    if (!filled.length) return

    const margin = { top: 8, right: 16, bottom: 64, left: 40 }
    const width  = containerWidth
    const cellW  = (width - margin.left - margin.right) / 24
    const cellH  = 30
    const height = cellH * 7 + margin.top + margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const minVal = d3.min(filled, d => d.avg_value)
    const maxVal = d3.max(filled, d => d.avg_value)
    // Guard: dacă toate valorile sunt identice, domain([x,x]) produce NaN în colorScale
    const domainMin = maxVal - minVal < 1e-10 ? minVal - 1 : minVal
    const domainMax = maxVal - minVal < 1e-10 ? maxVal + 1 : maxVal
    const colorScale = d3.scaleSequential()
      .domain([domainMin, domainMax])
      .interpolator(t => d3.interpolateBlues(0.15 + t * 0.85))

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Fundal peak hours (bandă verticală subtilă)
    const hasPeak = tariff?.peak_start && tariff?.peak_end
    if (hasPeak) {
      for (let h = 0; h < 24; h++) {
        if (isPeakHour(h, tariff)) {
          g.append('rect')
            .attr('x', h * cellW).attr('y', 0)
            .attr('width', cellW).attr('height', cellH * 7)
            .attr('fill', 'rgba(245,158,11,0.07)')
            .attr('pointer-events', 'none')
        }
      }
    }

    // Celule
    g.selectAll('rect.cell')
      .data(data)
      .join(enter => enter.append('rect').attr('class', 'cell'))
      .attr('x', d => d.hour * cellW + 1)
      .attr('y', d => DOW_ORDER.indexOf(d.dow) * cellH + 1)
      .attr('width',  cellW - 2)
      .attr('height', cellH - 2)
      .attr('rx', 3)
      .attr('fill', d => d.avg_value != null ? colorScale(d.avg_value) : 'var(--muted)')
      .on('mouseenter', function (event, d) {
        if (d.avg_value == null) return
        const box = wrapperRef.current.getBoundingClientRect()
        setTooltip({ x: event.clientX - box.left, y: event.clientY - box.top, d })
      })
      .on('mousemove', function (event) {
        const box = wrapperRef.current.getBoundingClientRect()
        setTooltip(t => t ? { ...t, x: event.clientX - box.left, y: event.clientY - box.top } : t)
      })
      .on('mouseleave', () => setTooltip(null))

    // Separator weekday / weekend — linie punctată între Vineri (row 4) și Sâmbătă (row 5)
    g.append('line')
      .attr('x1', 0).attr('y1', cellH * 5)
      .attr('x2', cellW * 24).attr('y2', cellH * 5)
      .attr('stroke', 'var(--border)').attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,3')
      .attr('pointer-events', 'none')

    // Etichete y (zile) — weekend cu accent
    DOW_LABELS.forEach((label, i) => {
      svg.append('text')
        .attr('x', margin.left - 6)
        .attr('y', margin.top + i * cellH + cellH / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', i >= 5 ? 'var(--accent)' : 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .attr('font-weight', i >= 5 ? '600' : 'normal')
        .text(label)
    })

    // Etichete x (ore) — peak cu accent dacă tariful e configurat
    const xG = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top + cellH * 7 + 10})`)
    ;[0, 3, 6, 9, 12, 15, 18, 21].forEach(h => {
      xG.append('text')
        .attr('x', h * cellW + cellW / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', hasPeak && isPeakHour(h, tariff) ? 'rgba(245,158,11,0.9)' : 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .text(HOUR_LABELS[h])
    })

    // ── Legendă ──────────────────────────────────────────────────────────
    const legendW = Math.max(60, Math.min(200, width - margin.left - margin.right - 120))
    const legendH = 8
    const legendY = margin.top + cellH * 7 + 28

    const gradId = `hm-grad-${entityId}`
    const grad = svg.append('defs').append('linearGradient').attr('id', gradId)
    grad.append('stop').attr('offset', '0%').attr('stop-color', colorScale(minVal))
    grad.append('stop').attr('offset', '100%').attr('stop-color', colorScale(maxVal))

    svg.append('rect')
      .attr('x', margin.left).attr('y', legendY)
      .attr('width', legendW).attr('height', legendH)
      .attr('rx', 3).attr('fill', `url(#${gradId})`)

    const fmtLeg = v => `${formatSensorValue(v, deviceClass)}${unit ? ` ${unit}` : ''}`
    ;[
      { x: margin.left,              anchor: 'start', val: minVal },
      { x: margin.left + legendW / 2, anchor: 'middle', val: (minVal + maxVal) / 2 },
      { x: margin.left + legendW,    anchor: 'end',   val: maxVal },
    ].forEach(({ x, anchor, val }) => {
      svg.append('text')
        .attr('x', x).attr('y', legendY + legendH + 13)
        .attr('text-anchor', anchor)
        .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.65rem')
        .text(fmtLeg(val))
    })

    // Indicator „No data"
    const ndX = margin.left + legendW + 14
    svg.append('rect')
      .attr('x', ndX).attr('y', legendY)
      .attr('width', 16).attr('height', legendH)
      .attr('rx', 2).attr('fill', 'var(--muted)')
    svg.append('text')
      .attr('x', ndX + 20).attr('y', legendY + legendH / 2)
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.65rem')
      .text('No data')

    // Indicator „Peak hours" (dacă există)
    if (hasPeak) {
      const pkX = ndX + 72
      svg.append('rect')
        .attr('x', pkX).attr('y', legendY)
        .attr('width', 16).attr('height', legendH)
        .attr('rx', 2).attr('fill', 'rgba(245,158,11,0.3)')
      svg.append('text')
        .attr('x', pkX + 20).attr('y', legendY + legendH / 2)
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.65rem')
        .text('Peak hours')
    }

  }, [data, unit, deviceClass, tariff, containerWidth])

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data.filter(d => d.avg_value != null).length)
    return <p className="stats-empty">No data for this period.</p>

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ width: '100%' }}>
        <svg ref={svgRef} style={{ display: 'block' }} />
      </div>
      {tooltip && (
        <div className="heatmap-tooltip" style={{
          left: tooltip.x + 14 + 150 > containerWidth ? Math.max(0, tooltip.x - 164) : tooltip.x + 14,
          top:  tooltip.y - 10,
        }}>
          <span className="heatmap-tooltip-label">
            {DOW_LABELS[DOW_ORDER.indexOf(tooltip.d.dow)]}, {HOUR_LABELS[tooltip.d.hour]}
          </span>
          <span className="heatmap-tooltip-value">
            {formatSensorValue(tooltip.d.avg_value, deviceClass)}{unit ? ` ${unit}` : ''}
          </span>
          <span className="heatmap-tooltip-count">{tooltip.d.count} samples</span>
        </div>
      )}
    </div>
  )
}
