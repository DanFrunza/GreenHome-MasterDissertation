import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'

const MODEL_LABELS = {
  seasonal_naive:   'Seasonal Forecast',
  ridge_regression: 'Ridge Regression',
  random_forest:    'Random Forest',
}

export default function PredictionChart({ homeId, entityId, unit, deviceClass, uncertaintyPct = 15 }) {
  const svgRef       = useRef()
  const containerRef = useRef()
  const wrapperRef   = useRef()

  const [histData,  setHistData]  = useState([])
  const [predData,  setPredData]  = useState([])
  const [modelType, setModelType] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [noData,    setNoData]    = useState(false)
  const [tooltip,   setTooltip]   = useState(null)

  const isEnergyKwh = deviceClass === 'energy'

  // ── Fetch ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)
    setNoData(false)
    setHistData([])
    setPredData([])

    const from7D = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

    Promise.all([
      apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/aggregations?period=day&from=${from7D}`)
        .then(r => r.json()),
      apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/predictions`)
        .then(r => r.json()),
    ]).then(([aggRows, predRows]) => {
      // Historical daily data
      const hist = (Array.isArray(aggRows) ? aggRows : []).map(r => ({
        date:  new Date(r.period_start),
        value: isEnergyKwh
          ? parseFloat(r.max_value) - parseFloat(r.min_value)
          : parseFloat(r.avg_value),
      })).filter(d => d.value != null && !isNaN(d.value))

      // Aggregate hourly predictions → daily
      const byDay = {}
      ;(Array.isArray(predRows) ? predRows : []).forEach(p => {
        const d   = new Date(p.target_time)
        const key = d.toDateString()
        if (!byDay[key]) {
          const dayStart = new Date(d)
          dayStart.setHours(0, 0, 0, 0)
          byDay[key] = { date: dayStart, values: [], modelType: p.model_type }
        }
        byDay[key].values.push(Math.max(0, parseFloat(p.predicted_value)))
      })

      const pred = Object.values(byDay).map(d => ({
        date:      d.date,
        value:     isEnergyKwh
          ? d.values.reduce((s, v) => s + v, 0)                         // sum deltas → daily kWh
          : d.values.reduce((s, v) => s + v, 0) / d.values.length,      // mean → avg power/value
        modelType: d.modelType,
      })).sort((a, b) => a.date - b.date)

      if (!hist.length && !pred.length) { setNoData(true); setLoading(false); return }

      setHistData(hist)
      setPredData(pred)
      if (pred.length) setModelType(pred[0].modelType)
      setLoading(false)
    }).catch(() => { setNoData(true); setLoading(false) })
  }, [homeId, entityId])

  // ── Draw ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if ((!histData.length && !predData.length) || !svgRef.current || !containerRef.current) return

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 12, right: 16, bottom: 36, left: 52 }
    const width  = containerWidth
    const height = 200

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const allData  = [...histData, ...predData]
    const allDates = allData.map(d => d.date)
    const allVals  = allData.map(d => d.value).filter(v => v != null && !isNaN(v))

    const xScale = d3.scaleTime()
      .domain(d3.extent(allDates))
      .range([margin.left, width - margin.right])

    const [minV, maxV] = d3.extent(allVals)
    const pad    = (maxV - minV) * 0.15 || 1
    const yScale = d3.scaleLinear()
      .domain([Math.max(0, minV - pad), maxV + pad])
      .range([height - margin.bottom, margin.top])

    // Grid
    svg.append('g').selectAll('line')
      .data(yScale.ticks(4)).join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'var(--border)').attr('stroke-width', 1)

    const lineGen = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .defined(d => d.value != null && !isNaN(d.value))
      .curve(d3.curveMonotoneX)

    // Forecast shaded uncertainty band (±uncertaintyPct%)
    if (predData.length > 1) {
      const bandFactor = uncertaintyPct / 100
      const areaGen = d3.area()
        .x(d => xScale(d.date))
        .y0(d => yScale(Math.max(0, d.value * (1 - bandFactor))))
        .y1(d => yScale(d.value * (1 + bandFactor)))
        .defined(d => d.value != null && !isNaN(d.value))
        .curve(d3.curveMonotoneX)
      svg.append('path')
        .datum(predData)
        .attr('fill', 'var(--accent)').attr('opacity', 0.09)
        .attr('d', areaGen)
    }

    // Historical line
    if (histData.length) {
      svg.append('path')
        .datum(histData)
        .attr('fill', 'none')
        .attr('stroke', 'var(--accent)').attr('stroke-width', 2)
        .attr('d', lineGen)
    }

    // Bridge: last historical → first predicted (subtle dashed connector)
    const lastHist = histData[histData.length - 1]
    const firstPred = predData[0]
    if (lastHist && firstPred) {
      svg.append('line')
        .attr('x1', xScale(lastHist.date)).attr('y1', yScale(lastHist.value))
        .attr('x2', xScale(firstPred.date)).attr('y2', yScale(firstPred.value))
        .attr('stroke', 'var(--accent)').attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 3').attr('opacity', 0.45)
    }

    // Forecast line (dashed)
    if (predData.length) {
      svg.append('path')
        .datum(predData)
        .attr('fill', 'none')
        .attr('stroke', 'var(--accent)').attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 3').attr('opacity', 0.7)
        .attr('d', lineGen)
    }

    // "Now" divider
    const nowMidnight = new Date()
    nowMidnight.setHours(0, 0, 0, 0)
    const nowX = xScale(nowMidnight)
    if (nowX >= margin.left && nowX <= width - margin.right) {
      svg.append('line')
        .attr('x1', nowX).attr('x2', nowX)
        .attr('y1', margin.top).attr('y2', height - margin.bottom)
        .attr('stroke', 'var(--muted-foreground)').attr('stroke-width', 1)
        .attr('stroke-dasharray', '3 3').attr('opacity', 0.55)
      svg.append('text')
        .attr('x', nowX + 4).attr('y', margin.top + 11)
        .attr('font-size', '0.6rem').attr('fill', 'var(--muted-foreground)')
        .text('Now')
    }

    // Dots (interactive)
    const allDots = allData.filter(d => d.value != null && !isNaN(d.value))
    svg.append('g').selectAll('circle')
      .data(allDots).join('circle')
      .attr('cx', d => xScale(d.date)).attr('cy', d => yScale(d.value))
      .attr('r', 3.5)
      .attr('fill', 'var(--accent)')
      .attr('opacity', d => d.modelType ? 0.5 : 1)  // predicted dots are dimmer
      .style('cursor', 'crosshair')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('r', 5)
        const box = wrapperRef.current.getBoundingClientRect()
        setTooltip({ x: event.clientX - box.left, y: event.clientY - box.top, d })
      })
      .on('mouseleave', function () {
        d3.select(this).attr('r', 3.5)
        setTooltip(null)
      })

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(7).tickFormat(d3.timeFormat('%b %d')).tickSize(0))
      .call(g => g.select('.domain').attr('stroke', 'var(--border)'))
      .call(g => g.selectAll('text')
        .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.68rem').attr('dy', '1.1em'))

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(4).tickSize(0)
        .tickFormat(v => d3.format('.2~f')(v) + (unit ? ` ${unit}` : '')))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text')
        .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.68rem')
        .attr('x', -6).attr('text-anchor', 'end'))

  }, [histData, predData, unit, deviceClass])

  // ── Render ──────────────────────────────────────────────────────────────────

  const fmtVal = v => `${Number(v).toFixed(2)}${unit ? ` ${unit}` : ''}`

  if (loading) return <p className="stats-loading">Loading...</p>
  if (noData)  return (
    <p className="stats-empty">
      No forecast available yet. The analytics service generates predictions every hour — check back after the next analytics run.
    </p>
  )

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <span className="legend-item">
          <span className="legend-line" />
          Historical (last 7 days)
        </span>
        <span className="legend-item" style={{ opacity: 0.6 }}>
          <span className="legend-line" style={{ borderStyle: 'dashed' }} />
          Forecast (next 7 days)
        </span>
        {modelType && (
          <span style={{
            marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 600,
            color: 'var(--muted-foreground)', background: 'var(--muted)',
            border: '1px solid var(--border)', borderRadius: '999px',
            padding: '0.15rem 0.55rem', whiteSpace: 'nowrap',
          }}>
            {MODEL_LABELS[modelType] ?? modelType}
          </span>
        )}
      </div>

      <div ref={containerRef} style={{ width: '100%' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
      </div>

      {tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          <span className="heatmap-tooltip-label">
            {tooltip.d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            {tooltip.d.modelType ? ' · Forecast' : ' · Historical'}
          </span>
          <span className="heatmap-tooltip-value">{fmtVal(tooltip.d.value)}</span>
        </div>
      )}
    </div>
  )
}
