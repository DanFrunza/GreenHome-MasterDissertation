import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import '../styles/AttributeChart.css'

export default function AttributeChart({ deviceId, attribute, unit, measurements }) {
  const svgRef = useRef()
  const containerRef = useRef()

  useEffect(() => {
    if (!measurements || measurements.length === 0 || !svgRef.current) return

    const containerWidth = containerRef.current?.getBoundingClientRect().width || 600

    const data = measurements
      .map(m => ({
        timestamp: new Date(m.recorded_at),
        value: m.value_numeric || 0
      }))
      .sort((a, b) => a.timestamp - b.timestamp)

    const margin = { top: 8, right: 16, bottom: 35, left: 45 }
    const width = containerWidth
    const height = 160

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const now = new Date()

    const xScale = d3
      .scaleTime()
      .domain([startOfDay, endOfDay])
      .range([margin.left, width - margin.right])

    const minVal = d3.min(data, d => d.value)
    const maxVal = d3.max(data, d => d.value)
    const padding = (maxVal - minVal) * 0.1 || 1

    const yScale = d3
      .scaleLinear()
      .domain([minVal - padding, maxVal + padding])
      .range([height - margin.bottom, margin.top])

    const line = d3
      .line()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d.value))

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    svg.append('defs').append('clipPath')
      .attr('id', `clip-${deviceId}-${attribute}`)
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)

    const xAxisGroup = svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(8)
          .tickFormat(d3.timeFormat('%H:%M'))
      )
      .style('font-size', '9px')

    xAxisGroup.selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')

    const yAxisGroup = svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(6))
      .style('font-size', '9px')

    // Grilaj vertical (pe baza X ticks)
    svg
      .append('g')
      .attr('class', 'grid-x')
      .attr('opacity', 0.1)
      .call(
        d3.axisBottom(xScale)
          .ticks(8)
          .tickSize(height - margin.top - margin.bottom)
          .tickFormat('')
      )
      .attr('transform', `translate(0,${margin.top})`)
      .selectAll('line')
      .attr('class', 'grid-line')

    // Grilaj orizontal (pe baza Y ticks)
    svg
      .append('g')
      .attr('class', 'grid-y')
      .attr('opacity', 0.1)
      .call(
        d3.axisLeft(yScale)
          .ticks(6)
          .tickSize(-(width - margin.left - margin.right))
          .tickFormat('')
      )
      .attr('transform', `translate(${margin.left},0)`)
      .selectAll('line')
      .attr('class', 'grid-line')

    const chartGroup = svg
      .append('g')
      .attr('clip-path', `url(#clip-${deviceId}-${attribute})`)

    // Linie mai groasă, fără puncte
    const linePath = chartGroup
      .append('path')
      .attr('class', 'chart-line')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', line)

    // Tooltip elements
    const tooltipLine = svg
      .append('line')
      .attr('class', 'tooltip-line')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,2')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('opacity', 0)

    const tooltipDot = svg
      .append('circle')
      .attr('class', 'tooltip-dot')
      .attr('r', 4)
      .attr('opacity', 0)

    const tooltipBox = svg
      .append('g')
      .attr('class', 'tooltip-box')
      .attr('opacity', 0)

    tooltipBox.append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('class', 'tooltip-bg')
      .attr('stroke-width', 1)
      .attr('width', 110)
      .attr('height', 38)

    const tooltipTime = tooltipBox
      .append('text')
      .attr('class', 'tooltip-time')
      .attr('x', 8)
      .attr('y', 14)
      .attr('font-size', '9px')

    const tooltipValue = tooltipBox
      .append('text')
      .attr('class', 'tooltip-value')
      .attr('x', 8)
      .attr('y', 29)
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')

    // Zona interacțiune
    const interactRect = svg
      .append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', width - margin.left - margin.right)
      .attr('height', height - margin.top - margin.bottom)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .style('cursor', 'grab')

    // Bisector pentru găsit cel mai apropiat punct
    const bisect = d3.bisector(d => d.timestamp).left

    interactRect.on('mousemove', function (event) {
      const [mouseX] = d3.pointer(event)
      const currentXScale = interactRect._zoomScale || xScale
      const mouseTime = currentXScale.invert(mouseX)

      const idx = bisect(data, mouseTime)
      const d0 = data[idx - 1]
      const d1 = data[idx]
      if (!d0 && !d1) return

      const d = !d0 ? d1 : !d1 ? d0
        : (mouseTime - d0.timestamp) < (d1.timestamp - mouseTime) ? d0 : d1

      const cx = currentXScale(d.timestamp)
      const cy = yScale(d.value)

      tooltipLine.attr('x1', cx).attr('x2', cx).attr('opacity', 0.6)
      tooltipDot.attr('cx', cx).attr('cy', cy).attr('opacity', 1)

      // Poziționează tooltipul să nu iasă din grafic
      const boxWidth = 110
      const boxX = cx + 10 + boxWidth > width - margin.right
        ? cx - boxWidth - 10
        : cx + 10
      const boxY = cy - 20 < margin.top ? margin.top : cy - 20

      tooltipBox
        .attr('transform', `translate(${boxX},${boxY})`)
        .attr('opacity', 1)

      tooltipTime.text(d3.timeFormat('%H:%M:%S')(d.timestamp))
      tooltipValue.text(`${d.value.toFixed(2)} ${unit || ''}`)
    })

    interactRect.on('mouseleave', () => {
      tooltipLine.attr('opacity', 0)
      tooltipDot.attr('opacity', 0)
      tooltipBox.attr('opacity', 0)
    })

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .translateExtent([
        [xScale(startOfDay), 0],
        [xScale(endOfDay), height]
      ])
      .extent([[margin.left, 0], [width - margin.right, height]])
      .on('zoom', (event) => {
        const newXScale = event.transform.rescaleX(xScale)
        interactRect._zoomScale = newXScale

        xAxisGroup.call(
          d3.axisBottom(newXScale)
            .ticks(8)
            .tickFormat(d3.timeFormat('%H:%M'))
        )
        .style('font-size', '9px')
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .attr('text-anchor', 'end')

        // Update grid X lines
        svg.select('.grid-x').call(
          d3.axisBottom(newXScale)
            .ticks(8)
            .tickSize(height - margin.top - margin.bottom)
            .tickFormat('')
        )
        .selectAll('line')
        .attr('class', 'grid-line')

        const newLine = d3.line()
          .x(d => newXScale(d.timestamp))
          .y(d => yScale(d.value))

        linePath.attr('d', newLine(data))
      })

    // Transform inițial — centrat pe ultima dată
    const latestTime = data.length > 0 ? data[data.length - 1].timestamp : now
    const twoHoursBefore = new Date(latestTime - 2 * 60 * 60 * 1000)
    const twoHoursAfter = new Date(latestTime.getTime() + 2 * 60 * 60 * 1000)

    const visibleRange = xScale(twoHoursAfter) - xScale(twoHoursBefore)
    const chartWidth = width - margin.left - margin.right

    const initialTransform = d3.zoomIdentity
      .scale(chartWidth / visibleRange)
      .translate(-xScale(twoHoursBefore) + margin.left / (chartWidth / visibleRange), 0)

    interactRect
      .call(zoom)
      .call(zoom.transform, initialTransform)

    interactRect.on('mousedown.cursor', () => interactRect.style('cursor', 'grabbing'))
    interactRect.on('mouseup.cursor', () => interactRect.style('cursor', 'grab'))

  }, [measurements, unit])

  const latestValue = measurements?.[0]?.value_numeric

  return (
    <div className="attribute-chart-card" ref={containerRef}>
      <div className="chart-header">
        <h4 className="chart-title">{attribute}</h4>
        <span className="chart-value">{latestValue?.toFixed(2)} {unit}</span>
      </div>
      <svg ref={svgRef} className="chart-svg"></svg>
    </div>
  )
}