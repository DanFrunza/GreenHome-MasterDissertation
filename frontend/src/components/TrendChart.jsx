import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'

export default function TrendChart({ homeId, entityId, unit, aggPeriod, from }) {
  const svgRef       = useRef()
  const containerRef = useRef()
  const wrapperRef   = useRef()
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)
    const params = `period=${aggPeriod}${from ? `&from=${from}` : ''}`
    fetch(`${API_URL}/homes/${homeId}/entities/${entityId}/aggregations?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, aggPeriod, from])

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return

    const parsed = data
      .map(d => ({
        date: new Date(d.period_start),
        avg:  parseFloat(d.avg_value),
        min:  parseFloat(d.min_value),
        max:  parseFloat(d.max_value),
      }))
      .filter(d => !isNaN(d.avg))

    if (!parsed.length) return

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 8, right: 16, bottom: 35, left: 48 }
    const width  = containerWidth
    const height = 180

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const xScale = d3.scaleTime()
      .domain(d3.extent(parsed, d => d.date))
      .range([margin.left, width - margin.right])

    const minVal = d3.min(parsed, d => d.min)
    const maxVal = d3.max(parsed, d => d.max)
    const pad = (maxVal - minVal) * 0.12 || 1

    const yScale = d3.scaleLinear()
      .domain([minVal - pad, maxVal + pad])
      .range([height - margin.bottom, margin.top])

    // Grid lines
    svg.append('g')
      .selectAll('line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'var(--border)').attr('stroke-width', 1)

    // Min-max band
    svg.append('path')
      .datum(parsed)
      .attr('d', d3.area().x(d => xScale(d.date)).y0(d => yScale(d.min)).y1(d => yScale(d.max)).curve(d3.curveMonotoneX))
      .attr('fill', 'var(--accent)').attr('opacity', 0.1)

    // Area under avg
    svg.append('path')
      .datum(parsed)
      .attr('d', d3.area().x(d => xScale(d.date)).y0(height - margin.bottom).y1(d => yScale(d.avg)).curve(d3.curveMonotoneX))
      .attr('fill', 'var(--accent)').attr('opacity', 0.15)

    // Avg line
    svg.append('path')
      .datum(parsed)
      .attr('d', d3.line().x(d => xScale(d.date)).y(d => yScale(d.avg)).curve(d3.curveMonotoneX))
      .attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 2)

    // Dots (when few points)
    const dotsG = svg.append('g')
    if (parsed.length <= 35) {
      dotsG.selectAll('circle')
        .data(parsed)
        .join('circle')
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.avg))
        .attr('r', 3)
        .attr('fill', 'var(--accent)')
    }

    // Crosshair group (hidden by default)
    const crosshair = svg.append('g').attr('display', 'none')
    crosshair.append('line')
      .attr('class', 'crosshair-line')
      .attr('y1', margin.top).attr('y2', height - margin.bottom)
      .attr('stroke', 'var(--muted-foreground)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
    crosshair.append('circle')
      .attr('class', 'crosshair-dot')
      .attr('r', 5)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--card)').attr('stroke-width', 2)

    // Axes
    const tickCount = aggPeriod === 'month' ? 6 : 7
    const timeFmt = aggPeriod === 'month' ? d3.timeFormat('%b %y') : d3.timeFormat('%d %b')
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(tickCount).tickFormat(timeFmt).tickSize(0))
      .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
      .call(g => g.selectAll('text').attr('fill', 'var(--muted-foreground)').attr('font-size', '0.72rem').attr('dy', '1.1em'))

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(4).tickSize(0).tickFormat(v => d3.format('.2~f')(v) + (unit ? ` ${unit}` : '')))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', 'var(--muted-foreground)').attr('font-size', '0.72rem').attr('x', -6).attr('text-anchor', 'end'))

    // Invisible overlay for mouse events
    const bisect = d3.bisector(d => d.date).left
    const dateFmt = aggPeriod === 'month'
      ? d => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

    svg.append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseenter', () => crosshair.attr('display', null))
      .on('mouseleave', () => {
        crosshair.attr('display', 'none')
        setTooltip(null)
      })
      .on('mousemove', function (event) {
        const [mouseX] = d3.pointer(event)
        const x0 = xScale.invert(mouseX)
        const i  = bisect(parsed, x0)
        const d0 = parsed[i - 1]
        const d1 = parsed[i]
        const d  = !d0 ? d1 : !d1 ? d0 : (x0 - d0.date) > (d1.date - x0) ? d1 : d0

        crosshair.select('.crosshair-line').attr('x1', xScale(d.date)).attr('x2', xScale(d.date))
        crosshair.select('.crosshair-dot').attr('cx', xScale(d.date)).attr('cy', yScale(d.avg))

        const box = wrapperRef.current.getBoundingClientRect()
        setTooltip({
          x: event.clientX - box.left,
          y: event.clientY - box.top,
          label: dateFmt(d.date),
          avg: d.avg,
          min: d.min,
          max: d.max,
        })
      })

  }, [data, unit, aggPeriod])

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data.length) return <p className="stats-empty">No aggregated data for this period.</p>

  const fmt = v => `${Number(v).toFixed(2)}${unit ? ` ${unit}` : ''}`

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ width: '100%' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
      </div>
      {tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          <span className="heatmap-tooltip-label">{tooltip.label}</span>
          <span className="heatmap-tooltip-value">{fmt(tooltip.avg)}</span>
          <span className="heatmap-tooltip-count">
            Min {fmt(tooltip.min)} · Max {fmt(tooltip.max)}
          </span>
        </div>
      )}
    </div>
  )
}
