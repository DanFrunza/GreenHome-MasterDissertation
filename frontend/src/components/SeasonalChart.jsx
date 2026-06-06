import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { getThresholds } from '../utils/thresholds'

const SEASONS = [
  { key: 'Spring', color: '#22c55e', months: 'Mar – May' },
  { key: 'Summer', color: '#f59e0b', months: 'Jun – Aug' },
  { key: 'Autumn', color: '#f97316', months: 'Sep – Nov' },
  { key: 'Winter', color: '#3b82f6', months: 'Dec – Feb' },
]

export default function SeasonalChart({ homeId, entityId, unit, from, deviceClass }) {
  const svgRef       = useRef()
  const containerRef = useRef()
  const wrapperRef   = useRef()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)

    if (deviceClass === 'energy') {
      // No `from` filter — use all historical data to capture all seasons
      apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/aggregations?period=hour`)
        .then(r => r.json())
        .then(rows => {
          const SEASON = m => [3,4,5].includes(m) ? 'Spring' : [6,7,8].includes(m) ? 'Summer' : [9,10,11].includes(m) ? 'Autumn' : 'Winter'
          const grid = {}
          rows.forEach(r => {
            const delta = Math.max(0, parseFloat(r.max_value) - parseFloat(r.min_value))
            if (isNaN(delta) || !isFinite(delta)) return
            const parts = new Intl.DateTimeFormat('en-US', {
              timeZone: tz, year: 'numeric', month: 'numeric',
              day: 'numeric', hour: 'numeric', hour12: false,
            }).formatToParts(new Date(r.period_start))
            const get = t => parseInt(parts.find(p => p.type === t)?.value ?? '0')
            const hour   = get('hour') % 24
            const season = SEASON(get('month'))
            if (!grid[season]) grid[season] = {}
            if (!grid[season][hour]) grid[season][hour] = { sum: 0, count: 0 }
            grid[season][hour].sum += delta
            grid[season][hour].count++
          })
          const out = {}
          ;['Spring', 'Summer', 'Autumn', 'Winter'].forEach(s => {
            if (!grid[s]) return
            out[s] = Array.from({ length: 24 }, (_, h) => ({
              hour: h,
              avg_value: grid[s][h]?.count ? grid[s][h].sum / grid[s][h].count : null,
              count: grid[s][h]?.count ?? 0,
            }))
          })
          setData(out)
          setLoading(false)
        })
        .catch(() => setLoading(false))
      return
    }

    const params = new URLSearchParams({ tz })
    if (from) params.set('from', from)
    apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/seasonal-profile?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, from, deviceClass])

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return

    const presentSeasons = SEASONS.filter(s => data[s.key])
    if (!presentSeasons.length) return

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 12, right: 16, bottom: 36, left: 52 }
    const width  = containerWidth
    const height = 200

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const xScale = d3.scaleLinear().domain([0, 23]).range([margin.left, width - margin.right])

    const allValues = presentSeasons.flatMap(s =>
      data[s.key].map(d => d.avg_value).filter(v => v != null)
    )
    const [minV, maxV] = d3.extent(allValues)
    const pad = (maxV - minV) * 0.12 || 1
    const yScale = d3.scaleLinear().domain([minV - pad, maxV + pad]).range([height - margin.bottom, margin.top])

    // Grid
    svg.append('g').selectAll('line')
      .data(yScale.ticks(4)).join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'var(--border)').attr('stroke-width', 1)

    // Reference threshold lines
    const thr = getThresholds(deviceClass)
    if (thr) {
      const [yDomMin, yDomMax] = yScale.domain()
      thr.lines.forEach(line => {
        if (line.value < yDomMin || line.value > yDomMax) return
        const y = yScale(line.value)
        svg.append('line')
          .attr('x1', margin.left).attr('x2', width - margin.right)
          .attr('y1', y).attr('y2', y)
          .attr('stroke', line.color).attr('stroke-width', 1)
          .attr('stroke-dasharray', line.dash ? '5 3' : 'none')
          .attr('opacity', 0.7)
        svg.append('text')
          .attr('x', margin.left + 4).attr('y', y - 3)
          .attr('font-size', '0.62rem').attr('fill', line.color).attr('opacity', 0.9)
          .text(line.chartLabel)
      })
    }

    // Lines per season
    const lineGen = d3.line()
      .x(d => xScale(d.hour))
      .y(d => yScale(d.avg_value))
      .defined(d => d.avg_value != null)
      .curve(d3.curveMonotoneX)

    presentSeasons.forEach(s => {
      svg.append('path')
        .datum(data[s.key])
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', 2)
        .attr('d', lineGen)
    })

    // Dots per season (visible)
    presentSeasons.forEach(s => {
      svg.append('g').selectAll('circle')
        .data(data[s.key].filter(d => d.avg_value != null))
        .join('circle')
        .attr('cx', d => xScale(d.hour))
        .attr('cy', d => yScale(d.avg_value))
        .attr('r', 3)
        .attr('fill', s.color)
    })

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(12).tickFormat(h => `${h}:00`).tickSize(0))
      .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
      .call(g => g.selectAll('text').attr('fill', 'var(--muted-foreground)').attr('font-size', '0.68rem').attr('dy', '1.1em'))

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(4).tickSize(0)
        .tickFormat(v => d3.format('.2~f')(v) + (unit ? ` ${unit}` : '')))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', 'var(--muted-foreground)').attr('font-size', '0.68rem').attr('x', -6).attr('text-anchor', 'end'))

    // Invisible overlay for crosshair
    svg.append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseleave', () => setTooltip(null))
      .on('mousemove', function (event) {
        const [mouseX] = d3.pointer(event)
        const h = Math.round(xScale.invert(mouseX))
        const clampedH = Math.max(0, Math.min(23, h))
        const box = wrapperRef.current.getBoundingClientRect()
        const values = presentSeasons.map(s => ({
          season: s.key,
          color:  s.color,
          value:  data[s.key][clampedH]?.avg_value ?? null,
        })).filter(v => v.value != null)
        if (!values.length) return
        setTooltip({ x: event.clientX - box.left, y: event.clientY - box.top, hour: clampedH, values })
      })

  }, [data, unit, deviceClass])

  const presentCount = data ? SEASONS.filter(s => data[s.key]).length : 0

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data || presentCount === 0) return <p className="stats-empty">No data available. Seasonal comparison requires readings across multiple seasons.</p>

  const isEnergy = deviceClass === 'energy'
  const isWatt   = unit === 'W' && !isEnergy

  const seasonalSummary = SEASONS
    .filter(s => data[s.key])
    .map(s => {
      const hours = data[s.key]
      if (isEnergy || isWatt) {
        const dailyKwh = hours.reduce((acc, h) => acc + (isEnergy ? (h.avg_value ?? 0) : (h.avg_value ?? 0) / 1000), 0)
        return { key: s.key, color: s.color, val: dailyKwh.toFixed(2), unit: 'kWh/day', label: 'avg daily' }
      }
      const valid = hours.filter(h => h.avg_value != null)
      if (!valid.length) return null
      const avg = valid.reduce((acc, h) => acc + h.avg_value, 0) / valid.length
      return { key: s.key, color: s.color, val: Number(avg).toFixed(2), unit: unit || '', label: 'seasonal avg' }
    })
    .filter(Boolean)

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div className="chart-legend" style={{ marginBottom: '0.5rem' }}>
        {SEASONS.filter(s => data[s.key]).map(s => (
          <span key={s.key} className="legend-item">
            <span style={{ display: 'inline-block', width: 28, height: 3, background: s.color, borderRadius: 2, verticalAlign: 'middle', marginRight: 5 }} />
            {s.key} <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginLeft: 2 }}>({s.months})</span>
          </span>
        ))}
        {presentCount < 4 && (() => {
          const missing = SEASONS.filter(s => !data[s.key]).map(s => s.key)
          return (
            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              — no data yet for {missing.join(', ')}. A full comparison requires at least one reading in each season.
            </span>
          )
        })()}
      </div>
      <div ref={containerRef} style={{ width: '100%' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
      </div>
      {tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10, minWidth: 140 }}>
          <span className="heatmap-tooltip-label">{tooltip.hour}:00 – {tooltip.hour}:59</span>
          {tooltip.values.map(v => (
            <span key={v.season} className="heatmap-tooltip-value" style={{ color: v.color }}>
              {v.season}: {Number(v.value).toFixed(2)}{unit ? ` ${unit}` : ''}
            </span>
          ))}
        </div>
      )}
      {seasonalSummary.length > 0 && (
        <div className="seasonal-summary">
          <span className="seasonal-summary-label">{seasonalSummary[0].label}:</span>
          {seasonalSummary.map(s => (
            <span key={s.key} className="seasonal-chip">
              <span className="seasonal-chip-dot" style={{ background: s.color }} />
              <span className="seasonal-chip-name">{s.key}</span>
              <span className="seasonal-chip-sep">—</span>
              <span>
                <strong>{s.val}</strong>
                {s.unit && <span className="seasonal-chip-unit">{s.unit}</span>}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
