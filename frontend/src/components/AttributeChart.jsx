import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import '../styles/AttributeChart.css'

const PERIODS = [
  { key: '1H',  hours: 1,   limit: 500,  fmt: '%H:%M',  ticks: 6  },
  { key: '6H',  hours: 6,   limit: 1000, fmt: '%H:%M',  ticks: 6  },
  { key: '24H', hours: 24,  limit: 2000, fmt: '%H:%M',  ticks: 8  },
  { key: '7D',  hours: 168, limit: 5000, fmt: '%a %d',  ticks: 7  },
  { key: '30D', hours: 720, limit: 8000, fmt: '%d %b',  ticks: 6  },
]

export default function AttributeChart({ homeId, entityId, label, unit }) {
  const svgRef = useRef()
  const containerRef = useRef()
  const [period, setPeriod] = useState('24H')
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!homeId || !entityId) return
    const p = PERIODS.find(p => p.key === period)
    const from = new Date(Date.now() - p.hours * 3600 * 1000).toISOString()
    setLoading(true)
    fetch(`${API_URL}/homes/${homeId}/entities/${entityId}/measurements?limit=${p.limit}&from=${from}`)
      .then(r => r.json())
      .then(data => { setMeasurements(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, period])

  useEffect(() => {
    if (!measurements || measurements.length === 0 || !svgRef.current) return

    const p = PERIODS.find(p => p.key === period)
    const containerWidth = containerRef.current?.getBoundingClientRect().width || 600

    const data = measurements
      .map(m => ({ timestamp: new Date(m.recorded_at), value: m.value_numeric || 0 }))
      .sort((a, b) => a.timestamp - b.timestamp)

    const margin = { top: 8, right: 16, bottom: 35, left: 45 }
    const width = containerWidth
    const height = 160

    const now = new Date()
    const from = new Date(now - p.hours * 3600 * 1000)

    const xScale = d3.scaleTime()
      .domain([from, now])
      .range([margin.left, width - margin.right])

    const minVal = d3.min(data, d => d.value) ?? 0
    const maxVal = d3.max(data, d => d.value) ?? 0
    const padding = (maxVal - minVal) * 0.1 || 1

    const yScale = d3.scaleLinear()
      .domain([minVal - padding, maxVal + padding])
      .range([height - margin.bottom, margin.top])

    const makeLine = (xS) => d3.line()
      .x(d => xS(d.timestamp))
      .y(d => yScale(d.value))

    const line = makeLine(xScale)

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    svg.append('defs').append('clipPath')
      .attr('id', `clip-${entityId}`)
      .append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)

    const xAxisGroup = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(p.ticks).tickFormat(d3.timeFormat(p.fmt)))
      .style('font-size', '9px')

    xAxisGroup.selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(6))
      .style('font-size', '9px')

    svg.append('g').attr('class', 'grid-x').attr('opacity', 0.1)
      .call(d3.axisBottom(xScale).ticks(p.ticks).tickSize(height - margin.top - margin.bottom).tickFormat(''))
      .attr('transform', `translate(0,${margin.top})`)
      .selectAll('line').attr('class', 'grid-line')

    svg.append('g').attr('class', 'grid-y').attr('opacity', 0.1)
      .call(d3.axisLeft(yScale).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(''))
      .attr('transform', `translate(${margin.left},0)`)
      .selectAll('line').attr('class', 'grid-line')

    const chartGroup = svg.append('g').attr('clip-path', `url(#clip-${entityId})`)

    const linePath = chartGroup.append('path')
      .attr('class', 'chart-line')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', line)

    const tooltipLine = svg.append('line').attr('class', 'tooltip-line')
      .attr('stroke-width', 1).attr('stroke-dasharray', '4,2')
      .attr('y1', margin.top).attr('y2', height - margin.bottom).attr('opacity', 0)

    const tooltipDot = svg.append('circle').attr('class', 'tooltip-dot')
      .attr('r', 4).attr('opacity', 0)

    const tooltipBox = svg.append('g').attr('class', 'tooltip-box').attr('opacity', 0)
    tooltipBox.append('rect').attr('rx', 4).attr('ry', 4).attr('class', 'tooltip-bg')
      .attr('stroke-width', 1).attr('width', 120).attr('height', 38)
    const tooltipTime = tooltipBox.append('text').attr('class', 'tooltip-time')
      .attr('x', 8).attr('y', 14).attr('font-size', '9px')
    const tooltipValue = tooltipBox.append('text').attr('class', 'tooltip-value')
      .attr('x', 8).attr('y', 29).attr('font-size', '11px').attr('font-weight', 'bold')

    const interactRect = svg.append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .style('cursor', 'grab')

    const bisect = d3.bisector(d => d.timestamp).left
    const timeFormat = p.hours <= 24 ? d3.timeFormat('%H:%M:%S') : d3.timeFormat('%d %b %H:%M')

    interactRect.on('mousemove', function (event) {
      const [mouseX] = d3.pointer(event)
      const currentXScale = interactRect._zoomScale || xScale
      const mouseTime = currentXScale.invert(mouseX)
      const idx = bisect(data, mouseTime)
      const d0 = data[idx - 1], d1 = data[idx]
      if (!d0 && !d1) return
      const d = !d0 ? d1 : !d1 ? d0
        : (mouseTime - d0.timestamp) < (d1.timestamp - mouseTime) ? d0 : d1
      const cx = currentXScale(d.timestamp)
      const cy = yScale(d.value)
      tooltipLine.attr('x1', cx).attr('x2', cx).attr('opacity', 0.6)
      tooltipDot.attr('cx', cx).attr('cy', cy).attr('opacity', 1)
      const boxWidth = 120
      const boxX = cx + 10 + boxWidth > width - margin.right ? cx - boxWidth - 10 : cx + 10
      const boxY = cy - 20 < margin.top ? margin.top : cy - 20
      tooltipBox.attr('transform', `translate(${boxX},${boxY})`).attr('opacity', 1)
      tooltipTime.text(timeFormat(d.timestamp))
      tooltipValue.text(`${d.value.toFixed(2)} ${unit || ''}`)
    })

    interactRect.on('mouseleave', () => {
      tooltipLine.attr('opacity', 0)
      tooltipDot.attr('opacity', 0)
      tooltipBox.attr('opacity', 0)
    })

    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([[xScale(from), 0], [xScale(now), height]])
      .extent([[margin.left, 0], [width - margin.right, height]])
      .on('zoom', (event) => {
        const newXScale = event.transform.rescaleX(xScale)
        interactRect._zoomScale = newXScale
        xAxisGroup.call(
          d3.axisBottom(newXScale).ticks(p.ticks).tickFormat(d3.timeFormat(p.fmt))
        ).style('font-size', '9px')
          .selectAll('text').attr('transform', 'rotate(-45)').attr('text-anchor', 'end')
        svg.select('.grid-x')
          .call(d3.axisBottom(newXScale).ticks(p.ticks).tickSize(height - margin.top - margin.bottom).tickFormat(''))
          .selectAll('line').attr('class', 'grid-line')
        linePath.attr('d', makeLine(newXScale)(data))
      })

    interactRect.call(zoom)
    interactRect.on('mousedown.cursor', () => interactRect.style('cursor', 'grabbing'))
    interactRect.on('mouseup.cursor', () => interactRect.style('cursor', 'grab'))

  }, [measurements, unit, period])

  const latestValue = measurements?.[0]?.value_numeric

  return (
    <div className="attribute-chart-card" ref={containerRef}>
      <div className="chart-header">
        <div className="chart-header-left">
          <h4 className="chart-title">{label}</h4>
          <span className="chart-value">{latestValue != null ? `${latestValue.toFixed(2)} ${unit || ''}` : '—'}</span>
        </div>
        <div className="chart-period-selector">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`period-btn ${period === p.key ? 'active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>
      {loading
        ? <div className="chart-loading">Loading...</div>
        : <svg ref={svgRef} className="chart-svg"></svg>
      }
    </div>
  )
}
