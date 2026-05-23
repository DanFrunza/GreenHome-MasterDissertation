import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'

export default function TrendChart({ homeId, entityId, unit, aggPeriod, from }) {
  const svgRef = useRef()
  const containerRef = useRef()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

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
    const width = containerWidth
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

    svg.append('g')
      .selectAll('line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'var(--border)').attr('stroke-width', 1)

    const areaRange = d3.area()
      .x(d => xScale(d.date))
      .y0(d => yScale(d.min))
      .y1(d => yScale(d.max))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(parsed)
      .attr('d', areaRange)
      .attr('fill', 'var(--accent)')
      .attr('opacity', 0.1)

    const area = d3.area()
      .x(d => xScale(d.date))
      .y0(height - margin.bottom)
      .y1(d => yScale(d.avg))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(parsed)
      .attr('d', area)
      .attr('fill', 'var(--accent)')
      .attr('opacity', 0.15)

    const line = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.avg))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(parsed)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 2)

    if (parsed.length <= 35) {
      svg.append('g')
        .selectAll('circle')
        .data(parsed)
        .join('circle')
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d.avg))
        .attr('r', 3)
        .attr('fill', 'var(--accent)')
    }

    const tickCount = aggPeriod === 'month' ? 6 : 7
    const timeFmt = aggPeriod === 'month'
      ? d3.timeFormat('%b %y')
      : d3.timeFormat('%d %b')

    const xAxis = d3.axisBottom(xScale).ticks(tickCount).tickFormat(timeFmt).tickSize(0)
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(xAxis)
      .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
      .call(g => g.selectAll('text')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .attr('dy', '1.1em'))

    const yAxis = d3.axisLeft(yScale).ticks(4).tickSize(0)
      .tickFormat(v => d3.format('.2~f')(v) + (unit ? ` ${unit}` : ''))
    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(yAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .attr('x', -6)
        .attr('text-anchor', 'end'))

  }, [data, unit, aggPeriod])

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data.length) return <p className="stats-empty">No aggregated data for this period.</p>

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
    </div>
  )
}
