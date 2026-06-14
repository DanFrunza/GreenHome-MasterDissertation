import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { API_URL } from '../config'
import { apiFetch } from '../utils/api'
import { getThresholds } from '../utils/thresholds'
import { useConfig } from '../hooks/useConfig'
import { HOUR_LABELS } from '../utils/chartUtils'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const NIGHT_HOURS = new Set([0,1,2,3,4,5,22,23])
const isNight = h => NIGHT_HOURS.has(h)

const COLOR_WEEKDAY = 'var(--accent)'
const COLOR_WEEKEND = '#f59e0b'

export default function HourlyProfileChart({ homeId, entityId, unit, from, to, deviceClass }) {
  const { thresholds: thresholdsData = null } = useConfig()
  const svgRef       = useRef()
  const containerRef = useRef()
  const wrapperRef   = useRef()
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [tooltip, setTooltip]   = useState(null)
  const [dayNight, setDayNight] = useState(null)
  const [weekSplit, setWeekSplit] = useState(null)

  useEffect(() => {
    if (!homeId || !entityId) return
    setLoading(true)

    if (deviceClass === 'energy') {
      const params = new URLSearchParams({ tz: TZ })
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/hourly-agg-split?${params}`)
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
      return
    }

    const params = new URLSearchParams({ tz: TZ })
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    apiFetch(`${API_URL}/homes/${homeId}/entities/${entityId}/hourly-profile-split?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [homeId, entityId, from, to, deviceClass])

  useEffect(() => {
    if (!data.length || !svgRef.current || !containerRef.current) return

    const hasWeekday = data.some(d => d.weekday_avg != null)
    const hasWeekend = data.some(d => d.weekend_avg != null)
    if (!hasWeekday && !hasWeekend) return

    // Day/night summary (from overall avg = weighted mean of weekday+weekend)
    const overallAvg = h => {
      const d = data[h]
      const wdA = d.weekday_avg, wdC = d.weekday_count
      const weA = d.weekend_avg, weC = d.weekend_count
      if (wdA != null && weA != null) return (wdA * wdC + weA * weC) / (wdC + weC)
      return wdA ?? weA
    }
    const dayHours   = data.filter(d => !isNight(d.hour))
    const nightHours = data.filter(d =>  isNight(d.hour))
    const dayAvg   = d3.mean(dayHours.map(d => overallAvg(d.hour)).filter(v => v != null))
    const nightAvg = d3.mean(nightHours.map(d => overallAvg(d.hour)).filter(v => v != null))
    setDayNight({ dayAvg: dayAvg ?? null, nightAvg: nightAvg ?? null })

    // Weekday/weekend summary
    const wdAvgs = data.map(d => d.weekday_avg).filter(v => v != null)
    const weAvgs = data.map(d => d.weekend_avg).filter(v => v != null)
    setWeekSplit({
      weekdayAvg: wdAvgs.length ? d3.mean(wdAvgs) : null,
      weekendAvg: weAvgs.length ? d3.mean(weAvgs) : null,
    })

    const containerWidth = containerRef.current.getBoundingClientRect().width || 600
    const margin = { top: 8, right: 16, bottom: 40, left: 48 }
    const width  = containerWidth
    const height = 200

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height).style('font-family', 'inherit')

    const xOuter = d3.scaleBand()
      .domain(data.map(d => d.hour))
      .range([margin.left, width - margin.right])
      .padding(0.18)

    const xInner = d3.scaleBand()
      .domain(['weekday', 'weekend'])
      .range([0, xOuter.bandwidth()])
      .padding(0.08)

    const allVals = data.flatMap(d => [d.weekday_avg, d.weekend_avg]).filter(v => v != null)
    const maxVal  = d3.max(allVals) || 1
    const yScale  = d3.scaleLinear()
      .domain([0, maxVal * 1.12])
      .range([height - margin.bottom, margin.top])

    // Night zone shading
    const nightZone = (startH, endH) => {
      const x = xOuter(startH) - xOuter.step() * xOuter.paddingInner() / 2
      const w = xOuter(endH) + xOuter.bandwidth() + xOuter.step() * xOuter.paddingInner() / 2 - x
      svg.append('rect')
        .attr('x', x).attr('y', margin.top)
        .attr('width', w).attr('height', height - margin.top - margin.bottom)
        .attr('fill', 'var(--muted)').attr('opacity', 0.5).attr('rx', 3)
    }
    nightZone(0, 5)
    nightZone(22, 23)

    // Grid lines
    svg.append('g').selectAll('line')
      .data(yScale.ticks(4)).join('line')
      .attr('x1', margin.left).attr('x2', width - margin.right)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'var(--border)').attr('stroke-width', 1)

    // Reference threshold lines
    const thr = getThresholds(deviceClass, thresholdsData)
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

    // Grouped bars
    const hourG = svg.append('g')
    data.forEach(d => {
      const gx = xOuter(d.hour)
      const bars = [
        { type: 'weekday', val: d.weekday_avg, count: d.weekday_count, color: COLOR_WEEKDAY },
        { type: 'weekend', val: d.weekend_avg, count: d.weekend_count, color: COLOR_WEEKEND },
      ]
      bars.forEach(b => {
        if (b.val == null) return
        hourG.append('rect')
          .attr('x', gx + xInner(b.type))
          .attr('y', yScale(b.val))
          .attr('width', xInner.bandwidth())
          .attr('height', (height - margin.bottom) - yScale(b.val))
          .attr('fill', b.color)
          .attr('opacity', isNight(d.hour) ? 0.45 : 0.82)
          .attr('rx', 2)
          .style('cursor', 'crosshair')
          .on('mouseenter', function (event) {
            d3.select(this).attr('opacity', 1)
            const box = wrapperRef.current.getBoundingClientRect()
            setTooltip({
              x: event.clientX - box.left,
              y: event.clientY - box.top,
              hour: d.hour,
              type: b.type,
              val: b.val,
              count: b.count,
              otherVal: b.type === 'weekday' ? d.weekend_avg : d.weekday_avg,
            })
          })
          .on('mousemove', function (event) {
            const box = wrapperRef.current.getBoundingClientRect()
            setTooltip(t => t ? { ...t, x: event.clientX - box.left, y: event.clientY - box.top } : t)
          })
          .on('mouseleave', function () {
            d3.select(this).attr('opacity', isNight(d.hour) ? 0.45 : 0.82)
            setTooltip(null)
          })
      })
    })

    // x-axis
    const xAxisG = svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`)
    xAxisG.append('line').attr('x1', margin.left).attr('x2', width - margin.right).attr('stroke', 'var(--border)')
    data.filter(d => d.hour % 3 === 0).forEach(d => {
      xAxisG.append('text')
        .attr('x', xOuter(d.hour) + xOuter.bandwidth() / 2)
        .attr('y', 16).attr('text-anchor', 'middle')
        .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.72rem')
        .text(HOUR_LABELS[d.hour])
    })

    // y-axis
    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(4).tickSize(0)
        .tickFormat(v => d3.format('.2~f')(v) + (unit ? ` ${unit}` : '')))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text')
        .attr('fill', 'var(--muted-foreground)').attr('font-size', '0.72rem')
        .attr('x', -6).attr('text-anchor', 'end'))

  }, [data, unit, deviceClass])

  if (loading) return <p className="stats-loading">Loading...</p>
  if (!data.some(d => d.weekday_avg != null || d.weekend_avg != null))
    return <p className="stats-empty">No data for this period.</p>

  const hasWeekday = data.some(d => d.weekday_avg != null)
  const hasWeekend = data.some(d => d.weekend_avg != null)

  const fmt = v => v != null ? `${Number(v).toFixed(2)}${unit ? ` ${unit}` : ''}` : '—'

  const dayDiff = (() => {
    if (dayNight?.dayAvg == null || dayNight?.nightAvg == null) return null
    const higher = dayNight.dayAvg >= dayNight.nightAvg ? 'day' : 'night'
    const higherVal = higher === 'day' ? dayNight.dayAvg : dayNight.nightAvg
    const lower     = higher === 'day' ? dayNight.nightAvg : dayNight.dayAvg
    if (lower <= 1e-6) return null
    return { pct: ((higherVal - lower) / lower * 100).toFixed(0), higher }
  })()

  const weekDiff = (() => {
    if (weekSplit?.weekdayAvg == null || weekSplit?.weekendAvg == null) return null
    const higher = weekSplit.weekdayAvg >= weekSplit.weekendAvg ? 'weekdays' : 'weekends'
    const higherVal = higher === 'weekdays' ? weekSplit.weekdayAvg : weekSplit.weekendAvg
    const lower     = higher === 'weekdays' ? weekSplit.weekendAvg : weekSplit.weekdayAvg
    if (lower <= 1e-6) return null
    return { pct: ((higherVal - lower) / lower * 100).toFixed(0), higher }
  })()

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ width: '100%' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />
      </div>

      {/* Legend */}
      <div className="chart-legend" style={{ marginTop: '0.5rem' }}>
        {hasWeekday && (
          <span className="legend-item">
            <span className="legend-band" style={{ background: COLOR_WEEKDAY, opacity: 1, border: 'none' }} />
            Weekday (Mon–Fri)
          </span>
        )}
        {hasWeekend && (
          <span className="legend-item">
            <span className="legend-band" style={{ background: COLOR_WEEKEND, opacity: 1, border: 'none' }} />
            Weekend (Sat–Sun)
          </span>
        )}
        <span className="legend-item">
          <span className="legend-band" style={{ background: 'var(--muted)', opacity: 1, border: 'none' }} />
          Night zone (22:00–06:00)
        </span>
        {hasWeekday && !hasWeekend && (
          <span className="legend-note">No weekend data in selected period</span>
        )}
        {hasWeekend && !hasWeekday && (
          <span className="legend-note">No weekday data in selected period</span>
        )}
      </div>

      {/* Day/Night + Weekday/Weekend summaries */}
      {(dayNight || weekSplit) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>

          {(dayNight?.dayAvg != null || dayNight?.nightAvg != null) && (
            <div className="daynight-stats">
              {dayNight?.dayAvg != null && (
                <div className="daynight-stat">
                  <span className="daynight-period">Day avg</span>
                  <span className="daynight-value">{fmt(dayNight.dayAvg)}</span>
                  <span className="daynight-range">06:00 – 22:00</span>
                </div>
              )}
              {dayNight?.dayAvg != null && dayNight?.nightAvg != null && <div className="daynight-divider" />}
              {dayNight?.nightAvg != null && (
                <div className="daynight-stat">
                  <span className="daynight-period">Night avg</span>
                  <span className="daynight-value">{fmt(dayNight.nightAvg)}</span>
                  <span className="daynight-range">22:00 – 06:00</span>
                </div>
              )}
              {dayDiff
                ? <div className="daynight-diff">↑ +{dayDiff.pct}% during {dayDiff.higher}</div>
                : dayNight?.dayAvg != null && dayNight?.nightAvg == null
                  ? <div className="daynight-diff">No night data in period</div>
                  : dayNight?.nightAvg != null && dayNight?.dayAvg == null
                    ? <div className="daynight-diff">No day data in period</div>
                    : null
              }
            </div>
          )}

          {(weekSplit?.weekdayAvg != null || weekSplit?.weekendAvg != null) && (
            <div className="daynight-stats">
              {weekSplit?.weekdayAvg != null && (
                <div className="daynight-stat">
                  <span className="daynight-period" style={{ color: COLOR_WEEKDAY }}>Weekday avg</span>
                  <span className="daynight-value">{fmt(weekSplit.weekdayAvg)}</span>
                  <span className="daynight-range">Mon – Fri</span>
                </div>
              )}
              {weekSplit?.weekdayAvg != null && weekSplit?.weekendAvg != null && <div className="daynight-divider" />}
              {weekSplit?.weekendAvg != null && (
                <div className="daynight-stat">
                  <span className="daynight-period" style={{ color: COLOR_WEEKEND }}>Weekend avg</span>
                  <span className="daynight-value">{fmt(weekSplit.weekendAvg)}</span>
                  <span className="daynight-range">Sat – Sun</span>
                </div>
              )}
              {weekDiff
                ? <div className="daynight-diff">↑ +{weekDiff.pct}% on {weekDiff.higher}</div>
                : weekSplit?.weekdayAvg != null && weekSplit?.weekendAvg == null
                  ? <div className="daynight-diff">No weekend data in period</div>
                  : weekSplit?.weekendAvg != null && weekSplit?.weekdayAvg == null
                    ? <div className="daynight-diff">No weekday data in period</div>
                    : null
              }
            </div>
          )}

        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
          <span className="heatmap-tooltip-label">
            {HOUR_LABELS[tooltip.hour]} — {isNight(tooltip.hour) ? 'Night' : 'Day'} · {tooltip.type === 'weekday' ? 'Weekday' : 'Weekend'}
          </span>
          <span className="heatmap-tooltip-value">{fmt(tooltip.val)}</span>
          <span className="heatmap-tooltip-count">
            {tooltip.count} {deviceClass === 'energy' ? 'days' : 'readings'}
            {tooltip.otherVal != null && (
              <> · {tooltip.type === 'weekday' ? 'Weekend' : 'Weekday'}: {fmt(tooltip.otherVal)}</>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
