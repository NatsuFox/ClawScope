import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CATEGORY_COLORS, parseTimestamp, formatDuration, formatCost } from '../utils/traceUtils';

export default function WaterfallView({ spans, viewMode = 'time', onSpanClick }) {
  const svgRef = useRef();
  const [tooltip, setTooltip] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });

  useEffect(() => {
    if (!spans || spans.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 20, bottom: 40, left: 200 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const g = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate time range
    const minTime = d3.min(spans, d => parseTimestamp(d.start_at));
    const maxTime = d3.max(spans, d => parseTimestamp(d.end_at));

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, maxTime - minTime])
      .range([0, width]);

    const yScale = d3.scaleBand()
      .domain(spans.map((_, i) => i))
      .range([0, height])
      .padding(0.2);

    // Draw x-axis
    const xAxis = d3.axisTop(xScale)
      .ticks(10)
      .tickFormat(d => formatDuration(d));

    g.append('g')
      .attr('class', 'x-axis')
      .call(xAxis);

    // Draw spans
    const barHeight = Math.min(yScale.bandwidth(), 30);

    spans.forEach((span, i) => {
      const startOffset = parseTimestamp(span.start_at) - minTime;
      const duration = span.duration_ms || 0;
      const barWidth = xScale(duration);

      // Draw span bar
      const bar = g.append('rect')
        .attr('x', xScale(startOffset))
        .attr('y', yScale(i) + (yScale.bandwidth() - barHeight) / 2)
        .attr('width', Math.max(barWidth, 2))
        .attr('height', barHeight)
        .attr('fill', CATEGORY_COLORS[span.category] || '#999')
        .attr('opacity', 0.8)
        .attr('rx', 3)
        .style('cursor', 'pointer')
        .on('mouseenter', (event) => {
          d3.select(event.target).attr('opacity', 1);
          setTooltip({
            x: event.pageX,
            y: event.pageY,
            span
          });
        })
        .on('mouseleave', (event) => {
          d3.select(event.target).attr('opacity', 0.8);
          setTooltip(null);
        })
        .on('click', () => {
          if (onSpanClick) onSpanClick(span);
        });

      // Draw span label
      g.append('text')
        .attr('x', -10)
        .attr('y', yScale(i) + yScale.bandwidth() / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#333')
        .text(span.name.length > 25 ? span.name.substring(0, 25) + '...' : span.name)
        .style('cursor', 'pointer')
        .on('click', () => {
          if (onSpanClick) onSpanClick(span);
        });

      // Draw duration label on bar if wide enough
      if (barWidth > 50) {
        g.append('text')
          .attr('x', xScale(startOffset) + barWidth / 2)
          .attr('y', yScale(i) + yScale.bandwidth() / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '10px')
          .attr('fill', 'white')
          .attr('font-weight', 'bold')
          .text(formatDuration(duration))
          .style('pointer-events', 'none');
      }
    });

    // Draw legend
    const categories = [...new Set(spans.map(s => s.category))];
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${dimensions.height - 20})`);

    categories.forEach((cat, i) => {
      const legendItem = legend.append('g')
        .attr('transform', `translate(${i * 120}, 0)`);

      legendItem.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', CATEGORY_COLORS[cat] || '#999')
        .attr('rx', 2);

      legendItem.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .attr('font-size', '11px')
        .attr('fill', '#666')
        .text(cat);
    });

  }, [spans, dimensions, viewMode, onSpanClick]);

  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'auto' }}>
      <svg ref={svgRef}></svg>
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 10,
            top: tooltip.y + 10,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            maxWidth: '300px',
            fontSize: '13px'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{tooltip.span.name}</div>
          <div><strong>Category:</strong> {tooltip.span.category}</div>
          <div><strong>Duration:</strong> {formatDuration(tooltip.span.duration_ms)}</div>
          {tooltip.span.costUsd && <div><strong>Cost:</strong> ${tooltip.span.costUsd.toFixed(4)}</div>}
          {tooltip.span.runId && <div><strong>Run ID:</strong> {tooltip.span.runId}</div>}
          {tooltip.span.sessionKey && <div><strong>Session:</strong> {tooltip.span.sessionKey}</div>}
          {tooltip.span.channel && <div><strong>Channel:</strong> {tooltip.span.channel}</div>}
          {tooltip.span.lane && <div><strong>Lane:</strong> {tooltip.span.lane}</div>}
          {(tooltip.span.token_input || tooltip.span.token_output || tooltip.span.token_cache) && (
            <div><strong>Tokens:</strong> {tooltip.span.token_input || 0}/{tooltip.span.token_output || 0}/{tooltip.span.token_cache || 0}</div>
          )}
          {tooltip.span.model_name && <div><strong>Model:</strong> {tooltip.span.model_name}</div>}
          {tooltip.span.tool_name && <div><strong>Tool:</strong> {tooltip.span.tool_name}</div>}
          <div><strong>Status:</strong> {tooltip.span.status}</div>
        </div>
      )}
    </div>
  );
}
