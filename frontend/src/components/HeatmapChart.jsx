import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { HOUR_LABELS } from '../utils/chartUtils'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function HeatmapChart({ homeId, entityId, unit, from, deviceClass }) {
  const svgRef    = useRef()
  const containerRef = useRef()
  const wrapperRef   = useRef()
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

    if (deviceClass === 'energy') {
      const params = new URLSearchParams({ period: 'hour' })
      if (from) params.set('from', from)
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
            const get = t => parseInt(parts.find(p => p.type === t)?.value ?? '0')
            const hour = get('hour') % 24
            const dow  = new Date(get('year'), get('month') - 1, get('day')).getDay()
            const key  = `${dow}_${hour}`
            if (!grid[key]) grid[key] = { sum: 0, count: 0 }
            grid[key].sum += delta
            grid[key].count++
          })
          const cells = []
          for (let dow = 0; dow < 7; dow++) {
            for (let hour = 0; hour < 24; hour++) {
              const cell = grid[`${dow}_${hour}`]
              cells.push({ dow, hour, avg_value: cell ? cell.sum / cell.count : null, count: cell?.count ?? 0 })
            }
          }
          setData(cells)
          setLoading(false)
        })
        .catch(() => setLoading(false))
      return
    }

    const params = new URLSearchParams({ tz })
    if (from) params.set('from', from)
    apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/heatmap?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, from, deviceClass])

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return
    const filled = data.filter(d => d.avg_value != null)
    if (!filled.length) return

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 8, right: 16, bottom: 52, left: 36 }
    const width  = containerWidth
    const cellW  = (width - margin.left - margin.right) / 24
    const cellH  = 30
    const height = cellH * 7 + margin.top + margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const minVal = d3.min(filled, d => d.avg_value)
    const maxVal = d3.max(filled, d => d.avg_value)
    const colorScale = d3.scaleSequential()
      .domain([minVal, maxVal])
      .interpolator(t => d3.interpolateBlues(0.12 + t * 0.88))

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => d.hour * cellW + 1)
      .attr('y', d => d.dow  * cellH + 1)
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

    // y-axis — day labels
    DOW_LABELS.forEach((label, i) => {
      svg.append('text')
        .attr('x', margin.left - 6)
        .attr('y', margin.top + i * cellH + cellH / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .text(label)
    })

    // x-axis — every 3 hours
    const xG = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top + cellH * 7 + 10})`)
    ;[0, 3, 6, 9, 12, 15, 18, 21].forEach(h => {
      xG.append('text')
        .attr('x', h * cellW + cellW / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .text(HOUR_LABELS[h])
    })

    // color legend
    const legendW = Math.min(220, width - margin.left - margin.right)
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

    const fmt = v => `${d3.format('.2~f')(v)}${unit ? ` ${unit}` : ''}`
    svg.append('text')
      .attr('x', margin.left).attr('y', legendY + legendH + 13)
      .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.65rem')
      .text(fmt(minVal))
    svg.append('text')
      .attr('x', margin.left + legendW).attr('y', legendY + legendH + 13)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.65rem')
      .text(fmt(maxVal))

  }, [data, unit])

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data.filter(d => d.avg_value != null).length)
    return <p className="stats-empty">No data for this period.</p>

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ width: '100%' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
      </div>
      {tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          <span className="heatmap-tooltip-label">
            {DOW_LABELS[tooltip.d.dow]}, {HOUR_LABELS[tooltip.d.hour]}
          </span>
          <span className="heatmap-tooltip-value">
            {Number(tooltip.d.avg_value).toFixed(2)}{unit ? ` ${unit}` : ''}
          </span>
          <span className="heatmap-tooltip-count">{tooltip.d.count} samples</span>
        </div>
      )}
    </div>
  )
}
