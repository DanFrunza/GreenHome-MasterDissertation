import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { getThresholds } from '../utils/thresholds'
import InfoTooltip from './InfoTooltip'
import '../styles/AttributeChart.css'

const PERIODS = [
  { key: '1H',  hours: 1,   limit: 1000, fmt: '%H:%M', ticks: 6, agg: null   },
  { key: '6H',  hours: 6,   limit: 3000, fmt: '%H:%M', ticks: 6, agg: null   },
  { key: '24H', hours: 24,  limit: null, fmt: '%H:00', ticks: 8, agg: 'hour' },
  { key: '7D',  hours: 168, limit: null, fmt: '%a %d', ticks: 7, agg: 'hour' },
  { key: '30D', hours: 720, limit: null, fmt: '%d %b', ticks: 6, agg: 'day'  },
]

export default function AttributeChart({ homeId, entityId, label, unit, deviceClass }) {
  const svgRef        = useRef()
  const containerRef  = useRef()
  const zoomScaleRef  = useRef(null)
  const [period, setPeriod]           = useState('7D')
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading]         = useState(true)

  const p = PERIODS.find(pp => pp.key === period)
  const isEnergyDelta = deviceClass === 'energy'

  useEffect(() => {
    if (!homeId || !entityId) return
    const from = new Date(Date.now() - p.hours * 3600 * 1000).toISOString()
    setLoading(true)
    setMeasurements([])

    const url = p.agg
      ? `${API_URL}/homes/${homeId}/entities/${entityId}/aggregations?period=${p.agg}&from=${from}`
      : `${API_URL}/homes/${homeId}/entities/${entityId}/measurements?limit=${p.limit}&from=${from}`

    apiFetch(url)
      .then(r => r.json())
      .then(data => { setMeasurements(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, period])

  useEffect(() => {
    if (!measurements?.length || !svgRef.current || !containerRef.current) return

    // Normalise both raw and aggregated into the same shape
    // For kWh cumulative sensors (energy device_class): show delta, not absolute value
    let data = measurements
      .map(m => {
        if (p.agg) {
          return isEnergyDelta
            ? { timestamp: new Date(m.period_start), value: Math.max(0, parseFloat(m.max_value) - parseFloat(m.min_value)), min: null, max: null }
            : { timestamp: new Date(m.period_start), value: parseFloat(m.avg_value), min: parseFloat(m.min_value), max: parseFloat(m.max_value) }
        }
        return { timestamp: new Date(m.recorded_at), value: parseFloat(m.value_numeric), min: null, max: null }
      })
      .filter(d => !isNaN(d.value))
      .sort((a, b) => a.timestamp - b.timestamp)

    // Raw energy: subtract base so chart shows "consumed since start of period"
    if (isEnergyDelta && !p.agg && data.length > 1) {
      const base = data[0].value
      data = data.map(d => ({ ...d, value: Math.max(0, d.value - base) }))
    }

    if (!data.length) return

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 8, right: 16, bottom: 35, left: 45 }
    const width  = containerWidth
    const height = 160

    const now  = new Date()
    const from = new Date(now - p.hours * 3600 * 1000)

    const xScale = d3.scaleTime()
      .domain([from, now])
      .range([margin.left, width - margin.right])

    // Y domain: energy delta always starts at 0; others include band extent
    const minVal = isEnergyDelta ? 0 : (d3.min(data, d => d.min ?? d.value) ?? 0)
    const maxVal = d3.max(data, d => d.max ?? d.value) ?? 0
    const padding = (maxVal - minVal) * 0.1 || 0.1

    const yScale = d3.scaleLinear()
      .domain([minVal, maxVal + padding])
      .range([height - margin.bottom, margin.top])

    const makeLine = xS => d3.line()
      .x(d => xS(d.timestamp))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX)

    zoomScaleRef.current = null

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    svg.append('defs').append('clipPath')
      .attr('id', `clip-${entityId}`)
      .append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)

    // Grid
    svg.append('g').attr('class', 'grid-x').attr('opacity', 0.1)
      .call(d3.axisBottom(xScale).ticks(p.ticks).tickSize(height - margin.top - margin.bottom).tickFormat(''))
      .attr('transform', `translate(0,${margin.top})`)
      .selectAll('line').attr('class', 'grid-line')

    svg.append('g').attr('class', 'grid-y').attr('opacity', 0.1)
      .call(d3.axisLeft(yScale).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(''))
      .attr('transform', `translate(${margin.left},0)`)
      .selectAll('line').attr('class', 'grid-line')

    // Axes
    const xAxisGroup = svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(p.ticks).tickFormat(d3.timeFormat(p.fmt)))
      .style('font-size', '9px')
    xAxisGroup.selectAll('text').attr('transform', 'rotate(-45)').attr('text-anchor', 'end')

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(6))
      .style('font-size', '9px')

    // Reference threshold lines (drawn outside chartGroup so they're not clipped on zoom)
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

    const chartGroup = svg.append('g').attr('clip-path', `url(#clip-${entityId})`)

    // Min-max band (aggregated periods only)
    const bandData = data.filter(d => d.min != null && d.max != null && !isNaN(d.min) && !isNaN(d.max))
    if (p.agg && bandData.length) {
      chartGroup.append('path')
        .datum(bandData)
        .attr('fill', 'var(--accent)')
        .attr('opacity', 0.13)
        .attr('d', d3.area()
          .x(d => xScale(d.timestamp))
          .y0(d => yScale(d.min))
          .y1(d => yScale(d.max))
          .curve(d3.curveMonotoneX)
        )
    }

    // Avg / value line
    const linePath = chartGroup.append('path')
      .attr('class', 'chart-line')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', makeLine(xScale))

    // Tooltip elements
    const tooltipLine = svg.append('line').attr('class', 'tooltip-line')
      .attr('stroke-width', 1).attr('stroke-dasharray', '4,2')
      .attr('y1', margin.top).attr('y2', height - margin.bottom).attr('opacity', 0)

    const tooltipDot = svg.append('circle').attr('class', 'tooltip-dot').attr('r', 4).attr('opacity', 0)

    const tooltipH = p.agg ? 52 : 38
    const tooltipBox = svg.append('g').attr('class', 'tooltip-box').attr('opacity', 0)
    tooltipBox.append('rect').attr('rx', 4).attr('ry', 4).attr('class', 'tooltip-bg')
      .attr('stroke-width', 1).attr('width', 130).attr('height', tooltipH)
    const tooltipTime  = tooltipBox.append('text').attr('class', 'tooltip-time')
      .attr('x', 8).attr('y', 14).attr('font-size', '9px')
    const tooltipValue = tooltipBox.append('text').attr('class', 'tooltip-value')
      .attr('x', 8).attr('y', 29).attr('font-size', '11px').attr('font-weight', 'bold')
    const tooltipRange = p.agg
      ? tooltipBox.append('text').attr('class', 'tooltip-time')
          .attr('x', 8).attr('y', 44).attr('font-size', '9px')
      : null

    // Interaction overlay
    const bisect    = d3.bisector(d => d.timestamp).left
    const timeFmt   = p.hours <= 24
      ? d3.timeFormat('%H:%M:%S')
      : d3.timeFormat('%d %b %H:%M')

    const interactRect = svg.append('rect')
      .attr('x', margin.left).attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .style('cursor', 'grab')

    interactRect.on('mousemove', function (event) {
      const [mouseX] = d3.pointer(event)
      const currentXS = zoomScaleRef.current ?? xScale
      const mouseTime = currentXS.invert(mouseX)
      const idx = bisect(data, mouseTime)
      const d0 = data[idx - 1], d1 = data[idx]
      if (!d0 && !d1) return
      const d = !d0 ? d1 : !d1 ? d0
        : (mouseTime - d0.timestamp) < (d1.timestamp - mouseTime) ? d0 : d1
      const cx = currentXS(d.timestamp)
      const cy = yScale(d.value)

      tooltipLine.attr('x1', cx).attr('x2', cx).attr('opacity', 0.6)
      tooltipDot.attr('cx', cx).attr('cy', cy).attr('opacity', 1)

      const boxW = 130
      const boxX = cx + 10 + boxW > width - margin.right ? cx - boxW - 10 : cx + 10
      const boxY = cy - 20 < margin.top ? margin.top : cy - 20
      tooltipBox.attr('transform', `translate(${boxX},${boxY})`).attr('opacity', 1)

      tooltipTime.text(timeFmt(d.timestamp))
      tooltipValue.text(`${d.value.toFixed(2)} ${unit || ''}`)
      if (tooltipRange && d.min != null && d.max != null) {
        tooltipRange.text(`min ${d.min.toFixed(2)} · max ${d.max.toFixed(2)}`)
      }
    })

    interactRect.on('mouseleave', () => {
      tooltipLine.attr('opacity', 0)
      tooltipDot.attr('opacity', 0)
      tooltipBox.attr('opacity', 0)
    })

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([[xScale(from), 0], [xScale(now), height]])
      .extent([[margin.left, 0], [width - margin.right, height]])
      .on('zoom', event => {
        const newXS = event.transform.rescaleX(xScale)
        zoomScaleRef.current = newXS
        xAxisGroup
          .call(d3.axisBottom(newXS).ticks(p.ticks).tickFormat(d3.timeFormat(p.fmt)))
          .style('font-size', '9px')
          .selectAll('text').attr('transform', 'rotate(-45)').attr('text-anchor', 'end')
        svg.select('.grid-x')
          .call(d3.axisBottom(newXS).ticks(p.ticks).tickSize(height - margin.top - margin.bottom).tickFormat(''))
          .selectAll('line').attr('class', 'grid-line')
        linePath.attr('d', makeLine(newXS)(data))
        if (p.agg && bandData.length) {
          chartGroup.select('path').attr('d',
            d3.area()
              .x(d => newXS(d.timestamp))
              .y0(d => yScale(d.min))
              .y1(d => yScale(d.max))
              .curve(d3.curveMonotoneX)(bandData)
          )
        }
      })

    interactRect.call(zoom)
    interactRect.on('mousedown.cursor', () => interactRect.style('cursor', 'grabbing'))
    interactRect.on('mouseup.cursor',   () => interactRect.style('cursor', 'grab'))

  }, [measurements, unit, period, deviceClass])

  // Header display value
  // Energy delta: show total consumption in the period, not the last absolute reading
  const latestValue = (() => {
    if (!measurements?.length) return null
    if (isEnergyDelta) {
      if (p.agg) {
        // Sum of (max-min) per bucket = total in period
        return measurements.reduce((s, m) => s + Math.max(0, parseFloat(m.max_value) - parseFloat(m.min_value)), 0)
      }
      // Raw DESC: newest - oldest = total consumed in period
      const newest = parseFloat(measurements[0]?.value_numeric)
      const oldest = parseFloat(measurements[measurements.length - 1]?.value_numeric)
      return !isNaN(newest) && !isNaN(oldest) ? Math.max(0, newest - oldest) : null
    }
    return p.agg
      ? parseFloat(measurements[measurements.length - 1]?.avg_value)
      : measurements[0]?.value_numeric
  })()

  const dataInfo = (() => {
    if (loading || !measurements.length) return null
    const n    = measurements.length
    const buck = p.agg === 'hour' ? 'hourly' : 'daily'
    if (isEnergyDelta) {
      return p.agg
        ? `${n} ${buck} buckets · kWh consumed per ${p.agg} (max − min)`
        : `${n} readings · kWh consumed since start of period (delta)`
    }
    return p.agg
      ? `${n} ${buck} averages · shaded band = min–max range`
      : `${n} raw readings`
  })()

  const thr = getThresholds(deviceClass)

  const tooltipContent = (
    <>
      {isEnergyDelta
        ? p.agg
          ? <>This is a <strong>cumulative energy meter</strong>. The absolute value only increases over time so the raw number is hard to interpret on a chart. Instead, each {p.agg === 'hour' ? 'hourly' : 'daily'} point shows <strong>energy consumed within that {p.agg === 'hour' ? 'hour' : 'day'}</strong> (maximum minus minimum cumulative reading in the bucket). The header value is the total consumed in the selected period.</>
          : <>This is a <strong>cumulative energy meter</strong>. The chart shows <strong>cumulative consumption since the start of the {p.key} window</strong> — the absolute value is subtracted from the first reading so the line starts at 0 and grows as energy is consumed. The header value is the total consumed in the period.</>
        : p.agg === null
        ? <>Raw sensor readings for the last <strong>{p.key}</strong>. Up to {p.limit} most recent data points fetched directly from the database.</>
        : p.agg === 'hour'
        ? <>Hourly averages pre-computed by the analytics service. Each point is the mean of all readings in that hour. The <strong>shaded band</strong> shows the min–max range.</>
        : <>Daily averages pre-computed by the analytics service. Each point is the mean of all readings in that day. The <strong>shaded band</strong> shows the min–max range.</>
      }
      {thr && (
        <>
          <hr />
          <strong>Reference lines</strong> — {thr.source}.<br />
          {thr.summary}<br />
          {thr.lines.map((l, i) => (
            <span key={i}>• <strong>{l.chartLabel}</strong>: {l.description}{i < thr.lines.length - 1 ? <br /> : null}</span>
          ))}
        </>
      )}
    </>
  )

  return (
    <div className="attribute-chart-card" ref={containerRef}>
      <div className="chart-header">
        <div className="chart-header-left">
          <h4 className="chart-title">
            {label}
            <InfoTooltip>{tooltipContent}</InfoTooltip>
          </h4>
          <span className="chart-value">
            {latestValue != null
              ? isEnergyDelta
                ? `${latestValue.toFixed(3)} ${unit || ''} consumed`
                : `${latestValue.toFixed(2)} ${unit || ''}`
              : '—'}
          </span>
        </div>
        <div className="chart-period-selector">
          {PERIODS.map(pp => (
            <button
              key={pp.key}
              className={`period-btn ${period === pp.key ? 'active' : ''}`}
              onClick={() => setPeriod(pp.key)}
            >
              {pp.key}
            </button>
          ))}
        </div>
      </div>

      {dataInfo && <p className="chart-data-info">{dataInfo}</p>}

      {loading
        ? <div className="chart-loading">Loading...</div>
        : <svg ref={svgRef} className="chart-svg"></svg>
      }
    </div>
  )
}
