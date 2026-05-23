import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'

const HOUR_LABELS = [
  '12am','1am','2am','3am','4am','5am','6am','7am',
  '8am','9am','10am','11am','12pm','1pm','2pm','3pm',
  '4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
]

export default function HourlyProfileChart({ homeId, entityId, unit, from }) {
  const svgRef = useRef()
  const containerRef = useRef()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const params = new URLSearchParams({ tz })
    if (from) params.set('from', from)
    fetch(`${API_URL}/homes/${homeId}/entities/${entityId}/hourly-profile?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, from])

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return
    const filled = data.filter(d => d.avg_value != null)
    if (!filled.length) return

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 8, right: 16, bottom: 40, left: 48 }
    const width = containerWidth
    const height = 180

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const xScale = d3.scaleBand()
      .domain(data.map(d => d.hour))
      .range([margin.left, width - margin.right])
      .padding(0.2)

    const maxVal = d3.max(filled, d => d.avg_value) || 1
    const yScale = d3.scaleLinear()
      .domain([0, maxVal * 1.12])
      .range([height - margin.bottom, margin.top])

    svg.append('g')
      .selectAll('line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'var(--border)').attr('stroke-width', 1)

    svg.append('g')
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', d => xScale(d.hour))
      .attr('y', d => d.avg_value != null ? yScale(d.avg_value) : height - margin.bottom)
      .attr('width', xScale.bandwidth())
      .attr('height', d => d.avg_value != null ? (height - margin.bottom) - yScale(d.avg_value) : 0)
      .attr('fill', 'var(--accent)')
      .attr('opacity', 0.8)
      .attr('rx', 2)

    const xAxisG = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)

    xAxisG.append('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('stroke', 'var(--border)')

    data.filter(d => d.hour % 3 === 0).forEach(d => {
      xAxisG.append('text')
        .attr('x', xScale(d.hour) + xScale.bandwidth() / 2)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)')
        .attr('font-size', '0.72rem')
        .text(HOUR_LABELS[d.hour])
    })

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

  }, [data, unit])

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data.filter(d => d.avg_value != null).length)
    return <p className="stats-empty">No data for this period.</p>

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
    </div>
  )
}
