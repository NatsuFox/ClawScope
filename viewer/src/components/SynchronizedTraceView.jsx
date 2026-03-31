import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CATEGORY_COLORS,
  formatCost,
  formatDuration,
  getSpanActorId,
  getSpanCost,
  parseTimestamp,
} from '../utils/traceUtils';
import { useI18n } from '../i18n';
import { useLexiconSection } from '../lexicon';

const TRACE_MAP_MIN_SEGMENT_PERCENT = 0;
const TRACE_MAP_MIN_BAR_HEIGHT_PX = 4;
const TRACE_MAP_MIN_TOKEN_UNITS = 6;
const TRACE_MAP_TOKEN_SCALE = 4.2;
const TRACE_MAP_TOKEN_CURVE_POWER = 0.78;
const TRACE_MAP_VERTICAL_PADDING_RATIO = 0.1;
const TRACE_MAP_VERTICAL_PADDING_MAX_PX = 28;
const TRACE_MAP_DRAG_SUPPRESSION_MS = 120;
const TRACE_MAP_DRAG_THRESHOLD_PX = 3;
const TRACE_MAP_MIN_ZOOM = 1;
const TRACE_MAP_MAX_X_ZOOM = 18;
const TRACE_MAP_MAX_Y_ZOOM = 24;
const TRACE_MAP_DEFAULT_X_ZOOM = 1;
const TRACE_MAP_DEFAULT_Y_ZOOM = 2.4;
const TRACE_SYNC_SCROLL_ANIMATION_MS = 320;
const TRACE_SYNC_WHEEL_STEP_UNIT_PX = 72;
const TRACE_SYNC_WHEEL_RESET_MS = 180;
const TRACE_SYNC_MOTION_BASE_RESPONSE_MS = 260;
const TRACE_SYNC_MOTION_FAST_RESPONSE_MS = 180;
const TRACE_SYNC_MOTION_MIN_FRAME_DELTA = 0.01;
const TRACE_SYNC_MOTION_MAX_FRAME_DELTA = 0.28;
const TRACE_SYNC_SOURCE_WHEEL_GAIN = 0.16;
const TRACE_SYNC_SOURCE_WHEEL_RESPONSE_MS = 250;
const TRACE_SYNC_SOURCE_WHEEL_MAX_FRAME_PX = 8;
const TRACE_MAP_CONTENT_PADDING_PX = 24;
const TRACE_MAP_TOKEN_PIXEL_SCALE_PX = 6;
const TRACE_LOG_EDGE_FOCUS_OFFSET_RATIO = 0.18;
const TRACE_LOG_EDGE_FOCUS_MIN_OFFSET_PX = 52;
const TRACE_LOG_EDGE_FOCUS_MAX_OFFSET_PX = 112;

function getEntryRole(span) {
  if (span.category === 'MESSAGE' && span.subtype?.startsWith('user')) {
    return 'user';
  }
  if (
    (span.category === 'MESSAGE' && span.subtype?.startsWith('assistant')) ||
    span.category === 'MODEL'
  ) {
    return 'assistant';
  }
  return 'activity';
}

function getEntryTitle(span, copy) {
  const actor = getSpanActorId(span);
  if (span.category === 'MESSAGE' && span.subtype?.startsWith('user')) {
    return actor === 'unknown' ? copy.user : `${copy.user} · ${actor}`;
  }
  if (
    (span.category === 'MESSAGE' && span.subtype?.startsWith('assistant')) ||
    span.category === 'MODEL'
  ) {
    return actor === 'unknown' ? copy.agent : `${copy.agent} · ${actor}`;
  }
  return `${span.category} · ${span.name}`;
}

function stringifyObject(value) {
  if (!value) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeBodyText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const normalizedParts = value
      .map((item) => normalizeBodyText(item))
      .filter((item) => item && item.trim().length > 0);
    return normalizedParts.length ? normalizedParts.join('\n\n') : stringifyObject(value);
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.summary === 'string') {
      return value.summary;
    }
    if (value.summary !== undefined) {
      const summaryText = normalizeBodyText(value.summary);
      if (summaryText) {
        return summaryText;
      }
    }
    if (typeof value.content === 'string') {
      return value.content;
    }
    if (value.content !== undefined) {
      const contentText = normalizeBodyText(value.content);
      if (contentText) {
        return contentText;
      }
    }
    return stringifyObject(value);
  }
  return String(value);
}

function formatClock(isoString, timeLocale) {
  return new Date(isoString).toLocaleTimeString(timeLocale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildEntryBodyData(span, copy) {
  const attributes = span.attributes || {};
  const role = getEntryRole(span);

  if (span.category === 'MESSAGE') {
    return {
      text: normalizeBodyText(attributes.text ?? attributes.message ?? span.name),
      markdownCapable: true,
    };
  }

  if (span.category === 'MODEL') {
    return {
      text: normalizeBodyText(attributes.text ?? attributes.summary ?? ''),
      markdownCapable: role === 'assistant',
    };
  }

  if (span.category === 'TOOL') {
    const parts = [];
    if (span.tool_name) {
      parts.push(`${copy.tool}: ${span.tool_name}`);
    }
    if (attributes.arguments) {
      parts.push(`${copy.args}:\n${stringifyObject(attributes.arguments)}`);
    } else if (attributes.input) {
      parts.push(`${copy.input}:\n${stringifyObject(attributes.input)}`);
    }
    if (attributes.output) {
      parts.push(
        `${copy.output}:\n${
          typeof attributes.output === 'string'
            ? attributes.output
            : normalizeBodyText(attributes.output)
        }`
      );
    } else if (attributes.tool_result) {
      parts.push(
        `${copy.result}:\n${
          typeof attributes.tool_result === 'string'
            ? attributes.tool_result
            : normalizeBodyText(attributes.tool_result)
        }`
      );
    }
    return {
      text: parts.join('\n\n'),
      markdownCapable: false,
    };
  }

  if (span.category === 'CONTEXT') {
    return {
      text: normalizeBodyText(
        attributes.summary ??
          attributes.content ??
          attributes.message ??
          attributes.text ??
          attributes
      ),
      markdownCapable: true,
    };
  }

  if (span.category === 'SYSTEM') {
    return {
      text: normalizeBodyText(attributes.content ?? attributes.info ?? attributes.summary ?? attributes),
      markdownCapable: false,
    };
  }

  return {
    text: normalizeBodyText(attributes),
    markdownCapable: false,
  };
}

function buildPreview(text, maxChars = 320) {
  const normalized = normalizeBodyText(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function isLongBody(text) {
  const normalized = normalizeBodyText(text);
  const lineCount = normalized.split('\n').length;
  return lineCount > 8 || normalized.length > 360;
}

const TOKEN_COLORS = {
  reasoning: '#f97316',
  input: '#10b981',
  output: '#3b82f6',
  cache: '#a855f7',
};

function getTokenBreakdown(span) {
  const reasoning =
    span.token_reasoning ??
    span.reasoning_tokens ??
    span.reasoning_token_count ??
    span.attributes?.token_reasoning ??
    span.attributes?.reasoning_tokens ??
    span.attributes?.usage?.reasoning ??
    span.attributes?.usage?.reasoning_tokens ??
    0;
  const input = span.token_input ?? 0;
  const output = span.token_output ?? 0;
  const cache = span.token_cache ?? 0;
  const total = reasoning + input + output + cache;
  const hasStructuredTokenFields =
    span.category === 'MODEL' ||
    span.token_reasoning !== undefined ||
    span.reasoning_tokens !== undefined ||
    span.reasoning_token_count !== undefined ||
    span.token_input !== undefined ||
    span.token_output !== undefined ||
    span.token_cache !== undefined ||
    span.attributes?.token_reasoning !== undefined ||
    span.attributes?.reasoning_tokens !== undefined ||
    span.attributes?.usage?.reasoning !== undefined ||
    span.attributes?.usage?.reasoning_tokens !== undefined;

  return {
    reasoning,
    input,
    output,
    cache,
    total,
    hasStructuredTokenFields,
  };
}

function buildTokenDistributionBackground(breakdown) {
  if (!breakdown.total) {
    return 'conic-gradient(from -90deg, rgba(148, 163, 184, 0.35) 0deg 360deg)';
  }

  const segments = [
    ['reasoning', breakdown.reasoning],
    ['input', breakdown.input],
    ['output', breakdown.output],
    ['cache', breakdown.cache],
  ];

  let offset = 0;
  const stops = segments
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const start = offset;
      const size = (value / breakdown.total) * 360;
      offset += size;
      return `${TOKEN_COLORS[key]} ${start}deg ${offset}deg`;
    });

  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
}

function getSpanComplexityScore(span) {
  const breakdown = getTokenBreakdown(span);
  if (breakdown.hasStructuredTokenFields) {
    return Math.max(breakdown.total, 1);
  }
  return 1;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const value = Number.parseInt(expanded, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function brightenColor(hex, amount = 0.2) {
  const { r, g, b } = hexToRgb(hex);
  const brighten = (channel) => Math.round(channel + (255 - channel) * amount);
  const toHex = (channel) => brighten(channel).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampTimelineSegment(
  startPercent,
  widthPercent,
  minPercent = TRACE_MAP_MIN_SEGMENT_PERCENT
) {
  const rawRight = startPercent + widthPercent;
  const left = clampValue(startPercent, 0, 100);
  const right = clampValue(rawRight, 0, 100);
  const available = Math.max(100 - left, 0);
  const visibleWidth = Math.max(right - left, 0);
  const width = visibleWidth > 0 ? Math.max(visibleWidth, minPercent) : 0;
  return {
    left,
    width: Math.min(width, available),
  };
}

function buildEntryCallouts(span, copy) {
  const callouts = [];
  const breakdown = getTokenBreakdown(span);
  const hasTokenMetrics = breakdown.hasStructuredTokenFields;

  if (span.model_name) {
    callouts.push({
      key: 'model',
      label: copy.model,
      value: span.model_name,
      tone: 'model',
    });
  }

  if (span.provider) {
    callouts.push({
      key: 'provider',
      label: copy.provider,
      value: span.provider,
      tone: 'provider',
    });
  }

  if (span.tool_name) {
    callouts.push({
      key: 'tool',
      label: copy.tool,
      value: span.tool_name,
      tone: 'tool',
    });
  }

  if (hasTokenMetrics) {
    callouts.push({
      key: 'token-reasoning',
      label: copy.reasoning,
      value: `${breakdown.reasoning.toLocaleString()} ${copy.tok}`,
      tone: 'token-reasoning',
    });
    callouts.push({
      key: 'token-input',
      label: copy.inputTokens,
      value: `${breakdown.input.toLocaleString()} ${copy.tok}`,
      tone: 'token-input',
    });
    callouts.push({
      key: 'token-output',
      label: copy.outputTokens,
      value: `${breakdown.output.toLocaleString()} ${copy.tok}`,
      tone: 'token-output',
    });
    callouts.push({
      key: 'token-cache',
      label: copy.cacheTokens,
      value: `${breakdown.cache.toLocaleString()} ${copy.tok}`,
      tone: 'token-cache',
    });
  }

  const cost = getSpanCost(span);
  if (cost > 0) {
    callouts.push({
      key: 'cost',
      label: copy.cost,
      value: formatCost(cost),
      tone: 'cost',
    });
  }

  return callouts;
}

function TokenCompositionPanel({ span, copy }) {
  const breakdown = getTokenBreakdown(span);
  if (!breakdown.hasStructuredTokenFields) {
    return null;
  }

  const legendItems = [
    ['reasoning', copy.reasoning, breakdown.reasoning],
    ['input', copy.inputTokens, breakdown.input],
    ['output', copy.outputTokens, breakdown.output],
    ['cache', copy.cacheTokens, breakdown.cache],
  ];

  return (
    <div className="trace-map-token-panel">
      <div
        className="trace-map-token-donut"
        style={{ background: buildTokenDistributionBackground(breakdown) }}
      >
        <div className="trace-map-token-donut-hole">
          <span>{breakdown.total.toLocaleString()}</span>
          <small>{copy.tok}</small>
        </div>
      </div>
      <div className="trace-map-token-legend">
        {legendItems.map(([key, label, value]) => (
          <div key={key} className="trace-map-token-legend-item">
            <span
              className="trace-map-token-swatch"
              style={{ backgroundColor: TOKEN_COLORS[key] }}
            />
            <span className="trace-map-token-label">{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function getContainerFocusOffsetPx(container) {
  if (!container) {
    return 0;
  }

  const viewportHeight = Math.max(container.clientHeight, 1);
  const maxScrollTop = Math.max(container.scrollHeight - viewportHeight, 0);
  const edgeFocusOffsetPx = Math.min(
    TRACE_LOG_EDGE_FOCUS_MAX_OFFSET_PX,
    Math.max(TRACE_LOG_EDGE_FOCUS_MIN_OFFSET_PX, viewportHeight * TRACE_LOG_EDGE_FOCUS_OFFSET_RATIO)
  );

  if (container.scrollTop <= edgeFocusOffsetPx) {
    return Math.min(edgeFocusOffsetPx, viewportHeight);
  }
  if (container.scrollTop >= Math.max(maxScrollTop - edgeFocusOffsetPx, 0)) {
    return Math.max(viewportHeight - edgeFocusOffsetPx, 0);
  }
  return viewportHeight / 2;
}

function clampContainerScrollTop(container, targetTop) {
  if (!container) {
    return 0;
  }

  return clampValue(
    targetTop,
    0,
    Math.max(container.scrollHeight - container.clientHeight, 0)
  );
}

function getElementAnchorRatio(container, element) {
  if (!container || !element) {
    return 0.5;
  }

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const viewportHeight = Math.max(container.clientHeight, 1);
  const centerOffsetPx = clampValue(
    elementRect.top + elementRect.height / 2 - containerRect.top,
    0,
    viewportHeight
  );

  return centerOffsetPx / viewportHeight;
}

function normalizeWheelDelta(event, viewportHeight = 0) {
  const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (event.deltaMode === 1) {
    return dominantDelta * 16;
  }
  if (event.deltaMode === 2) {
    return dominantDelta * Math.max(viewportHeight, 1);
  }
  return dominantDelta;
}

function VerticalTraceMap({
  entries,
  minTime,
  totalDuration,
  activeSpanId,
  onFocusSpan,
  onScroll,
  scrollRef,
  waterfallLayouts,
  contentHeightPx,
  scrollTop,
  viewportHeightPx,
  copy,
  timeLocale,
}) {
  const markerStops = [0, 0.25, 0.5, 0.75, 1];
  const safeViewportHeightPx = Math.max(viewportHeightPx, 1);
  const activeSpan = activeSpanId
    ? entries.find((entry) => entry.record_id === activeSpanId) || null
    : null;
  const activeColor = activeSpan
    ? brightenColor(CATEGORY_COLORS[activeSpan.category] || '#3b82f6', 0.22)
    : brightenColor('#3b82f6', 0.22);
  const activeTokenLayout = activeSpan ? waterfallLayouts.get(activeSpan.record_id) || null : null;
  const activeCenterPx = activeTokenLayout
    ? activeTokenLayout.centerPx - scrollTop
    : null;
  const activeTimeMs = activeSpan
    ? parseTimestamp(activeSpan.start_at) + (activeSpan.duration_ms || 0) / 2
    : minTime + totalDuration / 2;
  const activeCenterPercent = totalDuration > 0
    ? clampValue(((activeTimeMs - minTime) / totalDuration) * 100, 0, 100)
    : 50;
  const isActiveVisible = activeCenterPx !== null && activeCenterPx >= 0 && activeCenterPx <= safeViewportHeightPx;

  return (
    <div className="trace-map">
      <div className="trace-map-header">
        <h4>{copy.verticalWaterfall}</h4>
        <p>{copy.verticalWaterfallBody}</p>
        <div className="trace-map-meta">
          <span>{formatClock(new Date(minTime).toISOString(), timeLocale)}</span>
          <span>{formatDuration(totalDuration)}</span>
          <span>{formatClock(new Date(minTime + totalDuration).toISOString(), timeLocale)}</span>
        </div>
      </div>

      <div
        className="trace-map-scroll"
        ref={scrollRef}
        onScroll={onScroll}
      >
        <div
          className="trace-map-canvas"
          style={{ height: `${Math.max(contentHeightPx, safeViewportHeightPx)}px` }}
        >
          <div className="trace-map-track">
            {markerStops.map((stop) => {
              const markerTime = minTime + totalDuration * stop;
              return (
                <div key={stop} className="trace-map-marker" style={{ left: `${stop * 100}%` }}>
                  <span>{formatDuration(Math.max(markerTime - minTime, 0))}</span>
                </div>
              );
            })}

            {activeSpan && isActiveVisible && (
              <>
                <div
                  className="trace-map-focus-line trace-map-focus-line-horizontal"
                  style={{
                    top: `${activeCenterPx}px`,
                    background: withAlpha(activeColor, 0.34),
                    boxShadow: `0 0 0 1px ${withAlpha(activeColor, 0.14)}`,
                  }}
                />
                <div
                  className="trace-map-focus-line trace-map-focus-line-vertical"
                  style={{
                    left: `${activeCenterPercent}%`,
                    background: withAlpha(activeColor, 0.42),
                    boxShadow: `0 0 0 1px ${withAlpha(activeColor, 0.16)}`,
                  }}
                />
                <div
                  className="trace-map-focus-point"
                  style={{
                    top: `${activeCenterPx}px`,
                    left: `${activeCenterPercent}%`,
                    borderColor: withAlpha(activeColor, 0.8),
                    background: withAlpha(activeColor, 0.22),
                    boxShadow: `0 0 18px ${withAlpha(activeColor, 0.24)}`,
                  }}
                />
              </>
            )}

            {entries.map((span) => {
              const layout = waterfallLayouts.get(span.record_id);
              if (!layout) {
                return null;
              }

              const barColor = brightenColor(
                CATEGORY_COLORS[span.category] || '#999999',
                span.record_id === activeSpanId ? 0.28 : 0.24
              );
              const left = totalDuration ? ((parseTimestamp(span.start_at) - minTime) / totalDuration) * 100 : 0;
              const width = totalDuration ? (span.duration_ms / totalDuration) * 100 : 100;
              const boundedSegment = clampTimelineSegment(left, width);
              if (boundedSegment.width <= 0) {
                return null;
              }

              const isHighlighted = span.record_id === activeSpanId;
              const opacity = isHighlighted ? 1 : 0.66;
              const verticalInsetPx = isHighlighted ? 0 : Math.min(Math.max(layout.heightPx * 0.1, 1.5), 6);
              const horizontalInsetPercent = isHighlighted ? 0 : Math.min(Math.max(boundedSegment.width * 0.06, 0.2), 1.8);
              const borderColor = isHighlighted
                ? withAlpha(barColor, 0.78)
                : withAlpha(barColor, 0.28);
              const shapeShadow = isHighlighted
                ? `0 0 24px ${withAlpha(barColor, 0.34)}, 0 10px 22px ${withAlpha(barColor, 0.18)}`
                : 'none';

              return (
                <button
                  key={span.record_id}
                  type="button"
                  className={`trace-map-bar ${isHighlighted ? 'is-highlighted' : 'is-dimmed'}`}
                  style={{
                    top: `${layout.topPx}px`,
                    height: `${layout.heightPx}px`,
                    left: `${boundedSegment.left}%`,
                    width: `${boundedSegment.width}%`,
                    zIndex: isHighlighted ? 3 : 1,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onFocusSpan(span, event.currentTarget);
                  }}
                  title={`${span.name} · ${formatDuration(span.duration_ms)}`}
                  aria-label={`${getEntryTitle(span, copy)} · ${formatDuration(span.duration_ms)}`}
                >
                  <span
                    className="trace-map-bar-shape"
                    aria-hidden="true"
                    style={{
                      top: `${verticalInsetPx}px`,
                      bottom: `${verticalInsetPx}px`,
                      left: `${horizontalInsetPercent}%`,
                      right: `${horizontalInsetPercent}%`,
                      backgroundColor: barColor,
                      opacity,
                      borderColor,
                      boxShadow: shapeShadow,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EntryBody({
  span,
  isCollapsed,
  renderMode,
  isHighlighted,
  onFocusSpan,
  onOpenDetails,
  onToggleCollapsed,
  onToggleRenderMode,
  copy,
  timeLocale,
}) {
  const body = buildEntryBodyData(span, copy);
  const callouts = buildEntryCallouts(span, copy);
  const collapsible = isLongBody(body.text);
  const preview = buildPreview(body.text);
  const canToggleMarkdown = body.markdownCapable;
  const showCollapsedPreview = collapsible && isCollapsed;
  const accentHex = brightenColor(CATEGORY_COLORS[span.category] || '#94a3b8', 0.1);
  const entryAccentStyle = {
    '--entry-accent-line': accentHex,
    '--entry-accent-soft': withAlpha(accentHex, 0.08),
    '--entry-accent-hover': withAlpha(accentHex, 0.14),
    '--entry-accent-highlight': withAlpha(accentHex, 0.18),
    '--entry-accent-border': withAlpha(accentHex, 0.28),
    '--entry-accent-glow': withAlpha(accentHex, 0.14),
    '--entry-accent-overlay-strong': withAlpha(accentHex, 0.18),
    '--entry-accent-overlay-soft': withAlpha(accentHex, 0.08),
  };

  return (
    <div
      data-record-id={span.record_id}
      className={`trace-entry-card role-${getEntryRole(span)} ${isHighlighted ? 'is-highlighted' : ''}`}
      style={entryAccentStyle}
      onClick={(event) => onFocusSpan(span, event.currentTarget)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onFocusSpan(span, event.currentTarget);
        }
      }}
    >
      <div className="trace-entry-shadow" aria-hidden="true" />
      <div className="trace-entry-topline">
        <div className="trace-entry-meta">
          <span
            className="trace-entry-category"
            style={{ backgroundColor: CATEGORY_COLORS[span.category] || '#999' }}
          >
            {span.category}
          </span>
          <span className="trace-entry-time">{formatClock(span.start_at, timeLocale)}</span>
          <span className="trace-entry-duration">{formatDuration(span.duration_ms)}</span>
          {getSpanCost(span) > 0 && (
            <span className="trace-entry-cost">{formatCost(getSpanCost(span))}</span>
          )}
        </div>

        <div className="trace-entry-controls">
          <button
            type="button"
            className="trace-control-button trace-control-button-primary"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails(span);
            }}
          >
            {copy.detail}
          </button>
          {canToggleMarkdown && (
            <button
              type="button"
              className="trace-control-button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleRenderMode(span.record_id);
            }}
          >
            {renderMode === 'markdown' ? copy.raw : copy.markdown}
          </button>
          )}
          {collapsible && (
            <button
              type="button"
              className="trace-control-button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapsed(span.record_id);
            }}
          >
            {isCollapsed ? copy.expand : copy.collapse}
          </button>
          )}
        </div>
      </div>

      <h4>{getEntryTitle(span, copy)}</h4>
      <div className="trace-entry-name">{span.name}</div>
      {callouts.length > 0 && (
        <div className="trace-entry-callouts">
          {callouts.map((callout) => (
            <span
              key={callout.key}
              className={`trace-entry-callout tone-${callout.tone}`}
            >
              <strong>{callout.label}</strong>
              <span>{callout.value}</span>
            </span>
          ))}
        </div>
      )}

      {showCollapsedPreview ? (
        <div className="trace-entry-preview">{preview}</div>
      ) : renderMode === 'markdown' && canToggleMarkdown ? (
        <div className="trace-entry-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body.text}</ReactMarkdown>
        </div>
      ) : (
        <pre className="trace-entry-body">{body.text}</pre>
      )}
    </div>
  );
}

export default function SynchronizedTraceView({
  spans,
  focusedSpan,
  onSpanFocus,
  onOpenDetails,
}) {
  const { timeLocale } = useI18n();
  const copy = useLexiconSection('synchronizedTraceView');
  const entries = useMemo(
    () =>
      [...spans].sort((a, b) => {
        const timeDelta = parseTimestamp(a.start_at) - parseTimestamp(b.start_at);
        if (timeDelta !== 0) return timeDelta;
        return (a.duration_ms || 0) - (b.duration_ms || 0);
      }),
    [spans]
  );
  const entryById = useMemo(
    () => new Map(entries.map((span) => [span.record_id, span])),
    [entries]
  );
  const entryIndexById = useMemo(
    () => new Map(entries.map((span, index) => [span.record_id, index])),
    [entries]
  );

  const listScrollRef = useRef(null);
  const mapScrollRef = useRef(null);
  const rowRefs = useRef(new Map());
  const syncAnimationFrameRef = useRef(null);
  const listFollowFrameRef = useRef(null);
  const mapFollowFrameRef = useRef(null);
  const listWheelFrameRef = useRef(null);
  const mapWheelFrameRef = useRef(null);
  const listProgrammaticScrollRef = useRef(false);
  const mapProgrammaticScrollRef = useRef(false);
  const hasInitializedScrollRef = useRef(false);
  const wheelInputStateRef = useRef({
    source: null,
    lastEventTime: 0,
  });
  const logicalMotionRef = useRef({
    current: 0,
    target: 0,
    source: 'external',
    anchorRatio: 0.5,
    skipSource: false,
    lastTime: 0,
  });
  const sourceWheelMotionRef = useRef({
    list: { targetTop: null, lastTime: 0 },
    map: { targetTop: null, lastTime: 0 },
  });
  const lastPublishedActiveSpanIdRef = useRef(null);

  const [collapsedEntries, setCollapsedEntries] = useState({});
  const [renderModes, setRenderModes] = useState({});
  const [activeSpanId, setActiveSpanId] = useState(null);
  const [rowLayouts, setRowLayouts] = useState(new Map());
  const [mapViewport, setMapViewport] = useState({
    scrollTop: 0,
    viewportHeight: 1,
  });

  const minTime = entries.length
    ? Math.min(...entries.map((span) => parseTimestamp(span.start_at)))
    : Date.now();
  const maxTime = entries.length
    ? Math.max(...entries.map((span) => parseTimestamp(span.end_at)))
    : minTime + 1;
  const totalDuration = Math.max(maxTime - minTime, 1);
  const focusedSpanId = focusedSpan?.record_id || null;
  const resolvedActiveSpanId =
    (activeSpanId && entryById.has(activeSpanId) && activeSpanId) ||
    (focusedSpanId && entryById.has(focusedSpanId) && focusedSpanId) ||
    entries[0]?.record_id ||
    null;

  const { waterfallLayouts, contentHeightPx } = useMemo(() => {
    let nextTokenCursor = 0;
    const layouts = new Map();

    for (const span of entries) {
      const rawTokenTotal = Math.max(getTokenBreakdown(span).total || 0, 0);
      const visualTokenTotal = rawTokenTotal > 0
        ? Math.max(
            TRACE_MAP_MIN_TOKEN_UNITS,
            Math.pow(Math.log2(rawTokenTotal + 1), TRACE_MAP_TOKEN_CURVE_POWER) * TRACE_MAP_TOKEN_SCALE
          )
        : 0;
      const startToken = nextTokenCursor;
      const endToken = nextTokenCursor + visualTokenTotal;
      const heightPx = visualTokenTotal > 0
        ? Math.max(visualTokenTotal * TRACE_MAP_TOKEN_PIXEL_SCALE_PX, TRACE_MAP_MIN_BAR_HEIGHT_PX)
        : TRACE_MAP_MIN_BAR_HEIGHT_PX;
      const topPx = TRACE_MAP_CONTENT_PADDING_PX + startToken * TRACE_MAP_TOKEN_PIXEL_SCALE_PX;

      layouts.set(span.record_id, {
        topPx,
        heightPx,
        centerPx: topPx + heightPx / 2,
      });

      nextTokenCursor = endToken;
    }

    return {
      waterfallLayouts: layouts,
      contentHeightPx: Math.max(
        TRACE_MAP_CONTENT_PADDING_PX * 2 + nextTokenCursor * TRACE_MAP_TOKEN_PIXEL_SCALE_PX,
        mapViewport.viewportHeight
      ),
    };
  }, [entries, mapViewport.viewportHeight]);

  useEffect(() => {
    hasInitializedScrollRef.current = false;
    lastPublishedActiveSpanIdRef.current = null;
    wheelInputStateRef.current = {
      source: null,
      lastEventTime: 0,
    };
    setCollapsedEntries((current) => {
      const next = { ...current };
      for (const span of entries) {
        if (next[span.record_id] !== undefined) continue;
        next[span.record_id] = isLongBody(buildEntryBodyData(span, copy).text);
      }
      return next;
    });
    setRenderModes((current) => {
      const next = { ...current };
      for (const span of entries) {
        if (next[span.record_id]) continue;
        next[span.record_id] = 'markdown';
      }
      return next;
    });
    setActiveSpanId((current) => {
      if (current && entryById.has(current)) {
        return current;
      }
      if (focusedSpanId && entryById.has(focusedSpanId)) {
        return focusedSpanId;
      }
      return entries[0]?.record_id || null;
    });
  }, [copy, entries, entryById, focusedSpanId]);

  const stopLogicalMotion = useCallback(() => {
    if (syncAnimationFrameRef.current) {
      cancelAnimationFrame(syncAnimationFrameRef.current);
      syncAnimationFrameRef.current = null;
    }
    logicalMotionRef.current.lastTime = 0;
  }, []);

  const releaseProgrammaticScrollFlags = useCallback(() => {
    requestAnimationFrame(() => {
      listProgrammaticScrollRef.current = false;
      mapProgrammaticScrollRef.current = false;
    });
  }, []);

  const stopPanelFollowAnimation = useCallback((frameRef, programmaticRef) => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    programmaticRef.current = false;
  }, []);

  const stopSourceWheelAnimation = useCallback((panel) => {
    const frameRef = panel === 'list' ? listWheelFrameRef : mapWheelFrameRef;
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    sourceWheelMotionRef.current[panel].lastTime = 0;
    sourceWheelMotionRef.current[panel].targetTop = null;
  }, []);

  const animateSourceWheelScroll = useCallback(
    (panel, deltaPx) => {
      const containerRef = panel === 'list' ? listScrollRef : mapScrollRef;
      const frameRef = panel === 'list' ? listWheelFrameRef : mapWheelFrameRef;
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const motion = sourceWheelMotionRef.current[panel];
      const baseTop = motion.targetTop ?? container.scrollTop;
      motion.targetTop = clampContainerScrollTop(
        container,
        baseTop + deltaPx * TRACE_SYNC_SOURCE_WHEEL_GAIN
      );

      if (frameRef.current) {
        return;
      }

      motion.lastTime = performance.now();
      const step = (now) => {
        const currentMotion = sourceWheelMotionRef.current[panel];
        const currentContainer = containerRef.current;
        if (!currentContainer || currentMotion.targetTop === null) {
          frameRef.current = null;
          return;
        }

        const deltaTimeMs = Math.min(now - currentMotion.lastTime, 32);
        currentMotion.lastTime = now;
        const distance = currentMotion.targetTop - currentContainer.scrollTop;

        if (Math.abs(distance) < 0.35) {
          currentContainer.scrollTop = currentMotion.targetTop;
          frameRef.current = null;
          currentMotion.targetTop = null;
          currentMotion.lastTime = 0;
          return;
        }

        const alpha = 1 - Math.exp(-deltaTimeMs / TRACE_SYNC_SOURCE_WHEEL_RESPONSE_MS);
        const rawTravel = distance * alpha;
        const frameDelta = clampValue(
          rawTravel,
          -TRACE_SYNC_SOURCE_WHEEL_MAX_FRAME_PX,
          TRACE_SYNC_SOURCE_WHEEL_MAX_FRAME_PX
        );
        currentContainer.scrollTop += frameDelta;
        frameRef.current = requestAnimationFrame(step);
      };

      frameRef.current = requestAnimationFrame(step);
    },
    []
  );

  const animatePanelFollow = useCallback(
    (panel, targetTop, durationMs = TRACE_SYNC_SCROLL_ANIMATION_MS) => {
      const containerRef = panel === 'list' ? listScrollRef : mapScrollRef;
      const frameRef = panel === 'list' ? listFollowFrameRef : mapFollowFrameRef;
      const programmaticRef = panel === 'list' ? listProgrammaticScrollRef : mapProgrammaticScrollRef;
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const clampedTarget = clampContainerScrollTop(container, targetTop);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const startTop = container.scrollTop;
      const delta = clampedTarget - startTop;
      if (Math.abs(delta) < 0.5) {
        return;
      }

      const startTime = performance.now();
      const step = (now) => {
        programmaticRef.current = true;
        const progress = Math.min((now - startTime) / Math.max(durationMs, 1), 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        container.scrollTop = startTop + delta * eased;

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step);
        } else {
          container.scrollTop = clampedTarget;
          frameRef.current = null;
          requestAnimationFrame(() => {
            programmaticRef.current = false;
          });
        }
      };

      frameRef.current = requestAnimationFrame(step);
    },
    []
  );

  const getContainerFocusRatio = useCallback((container) => {
    if (!container) {
      return 0.5;
    }
    return getContainerFocusOffsetPx(container) / Math.max(container.clientHeight, 1);
  }, []);

  const measureRows = useCallback(() => {
    const listContainer = listScrollRef.current;
    const nextLayouts = new Map();

    if (listContainer) {
      for (const span of entries) {
        const row = rowRefs.current.get(span.record_id);
        if (!row) continue;
        nextLayouts.set(span.record_id, {
          topPx: row.offsetTop,
          heightPx: row.offsetHeight,
          centerPx: row.offsetTop + row.offsetHeight / 2,
        });
      }
    }

    setRowLayouts(nextLayouts);

    const mapContainer = mapScrollRef.current;
    if (mapContainer) {
      const nextScrollTop = mapContainer.scrollTop;
      const nextViewportHeight = Math.max(mapContainer.clientHeight, 1);
      setMapViewport((current) => {
        if (
          Math.abs(current.scrollTop - nextScrollTop) < 1 &&
          current.viewportHeight === nextViewportHeight
        ) {
          return current;
        }
        return {
          scrollTop: nextScrollTop,
          viewportHeight: nextViewportHeight,
        };
      });
    }
  }, [entries]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(measureRows);
    const handleResize = () => {
      measureRows();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
      stopLogicalMotion();
      stopSourceWheelAnimation('list');
      stopSourceWheelAnimation('map');
      stopPanelFollowAnimation(listFollowFrameRef, listProgrammaticScrollRef);
      stopPanelFollowAnimation(mapFollowFrameRef, mapProgrammaticScrollRef);
    };
  }, [
    measureRows,
    entries,
    collapsedEntries,
    renderModes,
    stopLogicalMotion,
    stopPanelFollowAnimation,
    stopSourceWheelAnimation,
  ]);

  const getMaxLogicalPosition = useCallback(
    () => Math.max(entries.length - 0.001, 0),
    [entries.length]
  );

  const getLogicalPositionForSpan = useCallback(
    (spanId, fraction = 0.5) => {
      const index = entryIndexById.get(spanId);
      if (index === undefined) {
        return 0;
      }

      return clampValue(index + clampValue(fraction, 0, 0.999), 0, getMaxLogicalPosition());
    },
    [entryIndexById, getMaxLogicalPosition]
  );

  const getLogicalPositionFromPanel = useCallback(
    (panel, anchorRatio = null) => {
      const container = panel === 'list' ? listScrollRef.current : mapScrollRef.current;
      const layouts = panel === 'list' ? rowLayouts : waterfallLayouts;
      if (!container || entries.length === 0) {
        return 0;
      }

      const resolvedAnchorRatio = anchorRatio ?? getContainerFocusRatio(container);
      const anchorContentPx = container.scrollTop + resolvedAnchorRatio * Math.max(container.clientHeight, 1);
      let nearestLogicalPosition = 0.5;
      let nearestDelta = Infinity;

      for (const span of entries) {
        const layout = layouts.get(span.record_id);
        if (!layout) continue;

        const bottomPx = layout.topPx + layout.heightPx;
        if (anchorContentPx >= layout.topPx && anchorContentPx <= bottomPx) {
          const fraction = layout.heightPx > 0
            ? (anchorContentPx - layout.topPx) / layout.heightPx
            : 0.5;
          return getLogicalPositionForSpan(span.record_id, fraction);
        }

        const delta = Math.abs(layout.centerPx - anchorContentPx);
        if (delta < nearestDelta) {
          nearestDelta = delta;
          nearestLogicalPosition = getLogicalPositionForSpan(span.record_id, 0.5);
        }
      }

      return clampValue(nearestLogicalPosition, 0, getMaxLogicalPosition());
    },
    [entries, getContainerFocusRatio, getLogicalPositionForSpan, getMaxLogicalPosition, rowLayouts, waterfallLayouts]
  );

  const getPanelTargetScrollTop = useCallback(
    (panel, logicalPosition, anchorRatio) => {
      const container = panel === 'list' ? listScrollRef.current : mapScrollRef.current;
      const layouts = panel === 'list' ? rowLayouts : waterfallLayouts;
      if (!container || entries.length === 0) {
        return 0;
      }

      const index = clampValue(Math.floor(logicalPosition), 0, entries.length - 1);
      const spanId = entries[index]?.record_id;
      const layout = spanId ? layouts.get(spanId) : null;
      if (!layout) {
        return container.scrollTop;
      }

      const fraction = clampValue(logicalPosition - index, 0, 0.999);
      const contentPx = layout.topPx + layout.heightPx * fraction;
      const anchorPx = anchorRatio * Math.max(container.clientHeight, 1);
      return clampContainerScrollTop(container, contentPx - anchorPx);
    },
    [entries, rowLayouts, waterfallLayouts]
  );

  const publishActiveSpan = useCallback(
    (spanId) => {
      if (!spanId) {
        return;
      }

      if (lastPublishedActiveSpanIdRef.current === spanId) {
        return;
      }

      lastPublishedActiveSpanIdRef.current = spanId;
      setActiveSpanId((current) => (current === spanId ? current : spanId));
      const nextSpan = entryById.get(spanId);
      if (nextSpan && focusedSpanId !== spanId) {
        onSpanFocus(nextSpan);
      }
    },
    [entryById, focusedSpanId, onSpanFocus]
  );

  const applyLogicalPosition = useCallback(
    (
      logicalPosition,
      { source = 'external', anchorRatio = 0.5, skipSource = false } = {}
    ) => {
      const clampedPosition = clampValue(logicalPosition, 0, getMaxLogicalPosition());
      logicalMotionRef.current.current = clampedPosition;

      if (entries.length > 0) {
        const activeIndex = clampValue(Math.floor(clampedPosition + 1e-6), 0, entries.length - 1);
        const activeId = entries[activeIndex]?.record_id || null;
        publishActiveSpan(activeId);
      }

      const updatePanel = (panel) => {
        if (skipSource && source === panel) {
          return;
        }

        const container = panel === 'list' ? listScrollRef.current : mapScrollRef.current;
        if (!container) {
          return;
        }

        const targetTop = getPanelTargetScrollTop(panel, clampedPosition, anchorRatio);
        const programmaticRef = panel === 'list' ? listProgrammaticScrollRef : mapProgrammaticScrollRef;
        programmaticRef.current = true;
        container.scrollTop = targetTop;

        if (panel === 'map') {
          const nextViewportHeight = Math.max(container.clientHeight, 1);
          setMapViewport((current) => {
            if (
              Math.abs(current.scrollTop - targetTop) < 1 &&
              current.viewportHeight === nextViewportHeight
            ) {
              return current;
            }
            return {
              scrollTop: targetTop,
              viewportHeight: nextViewportHeight,
            };
          });
        }
      };

      updatePanel('list');
      updatePanel('map');
      return clampedPosition;
    },
    [entries, getMaxLogicalPosition, getPanelTargetScrollTop, publishActiveSpan]
  );

  const startLogicalMotion = useCallback(() => {
    if (syncAnimationFrameRef.current) {
      return;
    }

    logicalMotionRef.current.lastTime = performance.now();
    const step = (now) => {
      const motion = logicalMotionRef.current;
      const deltaTimeMs = Math.min(now - motion.lastTime, 32);
      motion.lastTime = now;

      const distance = motion.target - motion.current;
      const responseMs = clampValue(
        TRACE_SYNC_MOTION_BASE_RESPONSE_MS - Math.abs(distance) * 14,
        TRACE_SYNC_MOTION_FAST_RESPONSE_MS,
        TRACE_SYNC_MOTION_BASE_RESPONSE_MS
      );
      const alpha = 1 - Math.exp(-deltaTimeMs / responseMs);
      const rawTravel = distance * alpha;
      const maxFrameDelta = clampValue(
        TRACE_SYNC_MOTION_MIN_FRAME_DELTA + Math.abs(distance) * 0.18,
        TRACE_SYNC_MOTION_MIN_FRAME_DELTA,
        TRACE_SYNC_MOTION_MAX_FRAME_DELTA
      );
      const nextPosition = motion.current + clampValue(rawTravel, -maxFrameDelta, maxFrameDelta);
      const hasSettled = Math.abs(motion.target - nextPosition) < 0.0015;
      const appliedPosition = applyLogicalPosition(
        hasSettled ? motion.target : nextPosition,
        {
          source: motion.source,
          anchorRatio: motion.anchorRatio,
          skipSource: motion.skipSource,
        }
      );
      motion.current = appliedPosition;

      if (hasSettled) {
        motion.current = appliedPosition;
        motion.target = appliedPosition;
        syncAnimationFrameRef.current = null;
        releaseProgrammaticScrollFlags();
        return;
      }

      syncAnimationFrameRef.current = requestAnimationFrame(step);
    };

    syncAnimationFrameRef.current = requestAnimationFrame(step);
  }, [applyLogicalPosition, releaseProgrammaticScrollFlags]);

  const setLogicalPositionImmediate = useCallback(
    (
      logicalPosition,
      { source = 'external', anchorRatio = 0.5, skipSource = false } = {}
    ) => {
      stopLogicalMotion();
      const clampedPosition = clampValue(logicalPosition, 0, getMaxLogicalPosition());
      logicalMotionRef.current.current = clampedPosition;
      logicalMotionRef.current.target = clampedPosition;
      logicalMotionRef.current.source = source;
      logicalMotionRef.current.anchorRatio = anchorRatio;
      logicalMotionRef.current.skipSource = skipSource;
      applyLogicalPosition(clampedPosition, { source, anchorRatio, skipSource });
      releaseProgrammaticScrollFlags();
    },
    [applyLogicalPosition, getMaxLogicalPosition, releaseProgrammaticScrollFlags, stopLogicalMotion]
  );

  const animateLogicalPositionTo = useCallback(
    (
      logicalPosition,
      { source = 'external', anchorRatio = 0.5, rebaseCurrent = false, skipSource = false } = {}
    ) => {
      const clampedPosition = clampValue(logicalPosition, 0, getMaxLogicalPosition());
      if (rebaseCurrent) {
        logicalMotionRef.current.current = getLogicalPositionFromPanel(source, anchorRatio);
      }
      logicalMotionRef.current.target = clampedPosition;
      logicalMotionRef.current.source = source;
      logicalMotionRef.current.anchorRatio = anchorRatio;
      logicalMotionRef.current.skipSource = skipSource;
      startLogicalMotion();
    },
    [getLogicalPositionFromPanel, getMaxLogicalPosition, startLogicalMotion]
  );

  const resetWheelInputState = useCallback(() => {
    wheelInputStateRef.current = {
      source: null,
      lastEventTime: 0,
    };
  }, []);

  const syncFromSourceScroll = useCallback(
    (source, logicalPosition, anchorRatio) => {
      const clampedPosition = clampValue(logicalPosition, 0, getMaxLogicalPosition());
      stopLogicalMotion();
      logicalMotionRef.current.current = clampedPosition;
      logicalMotionRef.current.target = clampedPosition;
      logicalMotionRef.current.source = source;
      logicalMotionRef.current.anchorRatio = anchorRatio;
      logicalMotionRef.current.skipSource = true;

      const activeIndex = clampValue(Math.floor(clampedPosition + 1e-6), 0, entries.length - 1);
      const activeId = entries[activeIndex]?.record_id || null;
      publishActiveSpan(activeId);

      const followPanel = source === 'list' ? 'map' : 'list';
      const targetTop = getPanelTargetScrollTop(followPanel, clampedPosition, anchorRatio);
      animatePanelFollow(followPanel, targetTop, TRACE_SYNC_SCROLL_ANIMATION_MS);
    },
    [animatePanelFollow, entries, getMaxLogicalPosition, getPanelTargetScrollTop, publishActiveSpan, stopLogicalMotion]
  );

  useEffect(() => {
    if (focusedSpanId && entryById.has(focusedSpanId)) {
      resetWheelInputState(focusedSpanId);
      setActiveSpanId((current) => (current === focusedSpanId ? current : focusedSpanId));
    }
  }, [entryById, focusedSpanId, resetWheelInputState]);

  useEffect(() => {
    if (hasInitializedScrollRef.current) {
      return;
    }
    if (!entries.length || rowLayouts.size === 0) {
      return;
    }

    hasInitializedScrollRef.current = true;
    const initialSpanId =
      (focusedSpanId && entryById.has(focusedSpanId) && focusedSpanId) ||
      entries[0].record_id;
    const initialAnchorRatio = getContainerFocusRatio(listScrollRef.current);
    resetWheelInputState(initialSpanId);
    setLogicalPositionImmediate(
      getLogicalPositionForSpan(initialSpanId, 0.5),
      {
        source: 'external',
        anchorRatio: initialAnchorRatio,
        skipSource: false,
      }
    );
  }, [
    entries,
    rowLayouts,
    focusedSpanId,
    entryById,
    getContainerFocusRatio,
    getLogicalPositionForSpan,
    resetWheelInputState,
    setLogicalPositionImmediate,
  ]);

  useEffect(() => {
    if (!focusedSpanId || !entryById.has(focusedSpanId)) {
      return;
    }
    if (focusedSpanId === lastPublishedActiveSpanIdRef.current) {
      return;
    }
    if (focusedSpanId === resolvedActiveSpanId) {
      return;
    }

    resetWheelInputState(focusedSpanId);
    animateLogicalPositionTo(
      getLogicalPositionForSpan(focusedSpanId, 0.5),
      {
        source: 'external',
        anchorRatio: getContainerFocusRatio(listScrollRef.current),
        rebaseCurrent: true,
      }
    );
  }, [
    animateLogicalPositionTo,
    entryById,
    focusedSpanId,
    getContainerFocusRatio,
    getLogicalPositionForSpan,
    resetWheelInputState,
    resolvedActiveSpanId,
  ]);

  const handleListScroll = useCallback(() => {
    const container = listScrollRef.current;
    if (!container || listProgrammaticScrollRef.current) {
      return;
    }

    const anchorRatio = getContainerFocusRatio(container);
    resetWheelInputState();
    syncFromSourceScroll('list', getLogicalPositionFromPanel('list', anchorRatio), anchorRatio);
  }, [getContainerFocusRatio, getLogicalPositionFromPanel, resetWheelInputState, syncFromSourceScroll]);

  const handleSourceWheel = useCallback(
    (panel) => (event) => {
      event.preventDefault();
      event.stopPropagation();

      const container = panel === 'list' ? listScrollRef.current : mapScrollRef.current;
      const normalizedDelta = normalizeWheelDelta(event, container?.clientHeight || 0);
      if (Math.abs(normalizedDelta) < 0.01) {
        return;
      }

      resetWheelInputState();
      animateSourceWheelScroll(panel, normalizedDelta);
    },
    [animateSourceWheelScroll, resetWheelInputState]
  );

  const handleMapScroll = useCallback(() => {
    const container = mapScrollRef.current;
    if (!container) {
      return;
    }

    const nextScrollTop = container.scrollTop;
    const nextViewportHeight = Math.max(container.clientHeight, 1);
    setMapViewport((current) => {
      if (
        Math.abs(current.scrollTop - nextScrollTop) < 1 &&
        current.viewportHeight === nextViewportHeight
      ) {
        return current;
      }
      return {
        scrollTop: nextScrollTop,
        viewportHeight: nextViewportHeight,
      };
    });

    if (mapProgrammaticScrollRef.current) {
      return;
    }

    const anchorRatio = getContainerFocusRatio(container);
    resetWheelInputState();
    syncFromSourceScroll('map', getLogicalPositionFromPanel('map', anchorRatio), anchorRatio);
  }, [getContainerFocusRatio, getLogicalPositionFromPanel, resetWheelInputState, syncFromSourceScroll]);

  const handleEntryFocus = useCallback(
    (span, element) => {
      stopSourceWheelAnimation('list');
      resetWheelInputState();
      animateLogicalPositionTo(
        getLogicalPositionForSpan(span.record_id, 0.5),
        {
          source: 'list',
          anchorRatio: getElementAnchorRatio(listScrollRef.current, element),
          rebaseCurrent: true,
          skipSource: true,
        }
      );
    },
    [animateLogicalPositionTo, getLogicalPositionForSpan, resetWheelInputState, stopSourceWheelAnimation]
  );

  const handleMapSpanFocus = useCallback(
    (span, element) => {
      stopSourceWheelAnimation('map');
      resetWheelInputState();
      animateLogicalPositionTo(
        getLogicalPositionForSpan(span.record_id, 0.5),
        {
          source: 'map',
          anchorRatio: getElementAnchorRatio(mapScrollRef.current, element),
          rebaseCurrent: true,
          skipSource: true,
        }
      );
    },
    [animateLogicalPositionTo, getLogicalPositionForSpan, resetWheelInputState, stopSourceWheelAnimation]
  );

  const toggleCollapsed = (recordId) => {
    setCollapsedEntries((current) => ({
      ...current,
      [recordId]: !current[recordId],
    }));
  };

  const toggleRenderMode = (recordId) => {
    setRenderModes((current) => ({
      ...current,
      [recordId]: current[recordId] === 'raw' ? 'markdown' : 'raw',
    }));
  };

  if (!entries.length) {
    return <div className="trace-sync-empty">{copy.noSpans}</div>;
  }

  return (
    <div className="trace-sync-layout">
      <div className="trace-sync-columns">
        <div className="trace-sync-columns-header">
          <div>{copy.chatActivity}</div>
          <div>{copy.verticalWaterfall}</div>
        </div>

        <div className="trace-sync-columns-body">
          <div className="trace-log-panel">
            <div
              className="trace-log-scroll"
              ref={listScrollRef}
              onScroll={handleListScroll}
              onWheel={handleSourceWheel('list')}
            >
              <div className="trace-log-content">
                {entries.map((span) => (
                  <div
                    key={span.record_id}
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(span.record_id, node);
                      } else {
                        rowRefs.current.delete(span.record_id);
                      }
                    }}
                    className="trace-log-entry"
                  >
                    <EntryBody
                      span={span}
                      isCollapsed={Boolean(collapsedEntries[span.record_id])}
                      renderMode={renderModes[span.record_id] || 'markdown'}
                      isHighlighted={resolvedActiveSpanId === span.record_id}
                      onFocusSpan={handleEntryFocus}
                      onOpenDetails={onOpenDetails}
                      onToggleCollapsed={toggleCollapsed}
                      onToggleRenderMode={toggleRenderMode}
                      copy={copy}
                      timeLocale={timeLocale}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="trace-map-column">
            <VerticalTraceMap
              entries={entries}
              minTime={minTime}
              totalDuration={totalDuration}
              activeSpanId={resolvedActiveSpanId}
              onFocusSpan={handleMapSpanFocus}
              onScroll={handleMapScroll}
              onWheelStep={handleSourceWheel('map')}
              scrollRef={mapScrollRef}
              waterfallLayouts={waterfallLayouts}
              contentHeightPx={contentHeightPx}
              scrollTop={mapViewport.scrollTop}
              viewportHeightPx={mapViewport.viewportHeight}
              copy={copy}
              timeLocale={timeLocale}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
