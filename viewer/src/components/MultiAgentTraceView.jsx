import React, { useEffect, useMemo, useState } from 'react';
import {
  CATEGORY_COLORS,
  formatCost,
  formatDuration,
  getSpanCost,
  parseTimestamp,
} from '../utils/traceUtils';
import { formatLexiconText, useLexiconSection } from '../lexicon';

const ACTOR_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#ea580c', '#db2777', '#059669'];
const TIMELINE_SIDE_PADDING = 56;

function humanizeActorId(actorId, fallbackLabel, unknownLabel) {
  if (fallbackLabel) {
    return fallbackLabel;
  }
  if (!actorId) {
    return unknownLabel;
  }
  if (actorId.startsWith('agent:')) {
    return actorId;
  }
  return actorId
    .replace(/^run_/, '')
    .replace(/^run-/, '')
    .replace(/^agent_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFilterLabel(filterMode, copy) {
  switch (filterMode) {
    case 'model':
      return copy.filterModel;
    case 'tool':
      return copy.filterTool;
    case 'agent':
      return copy.filterAgent;
    default:
      return copy.filterAll;
  }
}

function detectActorMode(spans) {
  const explicitActorIds = new Set(
    spans.flatMap((span) =>
      [span.agent_id, span.origin_agent_id, span.target_agent_id].filter(Boolean)
    )
  );
  if (explicitActorIds.size > 1) {
    return 'explicit';
  }

  const lifecycleRunIds = new Set(
    spans
      .filter((span) => span.category === 'AGENT' && span.runId)
      .map((span) => span.runId)
  );

  if (lifecycleRunIds.size > 1) {
    return 'run';
  }

  return null;
}

export function hasMultiAgentSignals(spans) {
  return Boolean(detectActorMode(spans || []));
}

function createActorRecord(actorMap, actorId, label, copy) {
  if (!actorId) {
    return null;
  }
  if (!actorMap.has(actorId)) {
    actorMap.set(actorId, {
      id: actorId,
      label: label || humanizeActorId(actorId, null, copy.unknownActor),
      parentId: null,
      childIds: new Set(),
      spans: [],
      totalCost: 0,
      totalDuration: 0,
      earliestStart: Number.POSITIVE_INFINITY,
      latestEnd: Number.NEGATIVE_INFINITY,
    });
  }
  const record = actorMap.get(actorId);
  if (label && record.label === humanizeActorId(actorId, null, copy.unknownActor)) {
    record.label = label;
  }
  return record;
}

function getActorIdForSpan(span, actorMode, fallbackActorId) {
  if (span.agent_id) {
    return span.agent_id;
  }
  if (actorMode === 'explicit') {
    return span.target_agent_id || span.origin_agent_id || fallbackActorId;
  }
  if (actorMode === 'run') {
    return span.runId || fallbackActorId;
  }
  return fallbackActorId;
}

function calculateNestingLevels(spans) {
  const sorted = [...spans].sort((left, right) => {
    const delta = parseTimestamp(left.start_at) - parseTimestamp(right.start_at);
    if (delta !== 0) {
      return delta;
    }
    return (left.duration_ms || 0) - (right.duration_ms || 0);
  });

  const active = [];
  const result = [];

  sorted.forEach((span) => {
    const spanStart = parseTimestamp(span.start_at);
    const stillActive = active.filter((entry) => parseTimestamp(entry.span.end_at) > spanStart);
    const usedLevels = new Set(stillActive.map((entry) => entry.level));
    let level = 0;
    while (usedLevels.has(level)) {
      level += 1;
    }
    result.push({ span, level });
    stillActive.push({ span, level });
    active.length = 0;
    active.push(...stillActive);
  });

  return result;
}

function buildActorModel(spans, traceData, copy) {
  const actorMode = detectActorMode(spans);
  if (!actorMode) {
    return null;
  }

  const actorMap = new Map();
  const agentDefinitions = new Map(
    (traceData?.agents || []).map((agent) => [agent.agent_id, agent.name || humanizeActorId(agent.agent_id)])
  );

  const sessionFallbackId =
    spans.find((span) => span.sessionKey)?.sessionKey || '__session-envelope__';

  if (actorMode === 'explicit') {
    spans.forEach((span) => {
      [span.agent_id, span.origin_agent_id, span.target_agent_id]
        .filter(Boolean)
        .forEach((actorId) => {
          createActorRecord(actorMap, actorId, agentDefinitions.get(actorId), copy);
        });
    });
  } else {
    spans
      .filter((span) => span.category === 'AGENT' && span.runId)
      .forEach((span) => {
        createActorRecord(
          actorMap,
          span.runId,
          span.name.replace(/^Agent Run:\s*/, '') || humanizeActorId(span.runId, null, copy.unknownActor),
          copy
        );
      });
    createActorRecord(actorMap, sessionFallbackId, copy.sessionEnvelope, copy);
  }

  spans.forEach((span) => {
    const actorId = getActorIdForSpan(span, actorMode, sessionFallbackId);
    const actor = createActorRecord(
      actorMap,
      actorId,
      agentDefinitions.get(actorId) || (actorId === sessionFallbackId ? copy.sessionEnvelope : null),
      copy
    );
    if (!actor) {
      return;
    }

    actor.spans.push(span);
    actor.totalCost += getSpanCost(span);
    actor.totalDuration += span.duration_ms || 0;
    actor.earliestStart = Math.min(actor.earliestStart, parseTimestamp(span.start_at));
    actor.latestEnd = Math.max(actor.latestEnd, parseTimestamp(span.end_at));

    if (span.origin_agent_id && span.target_agent_id && span.origin_agent_id !== span.target_agent_id) {
      const parent = createActorRecord(
        actorMap,
        span.origin_agent_id,
        agentDefinitions.get(span.origin_agent_id),
        copy
      );
      const child = createActorRecord(
        actorMap,
        span.target_agent_id,
        agentDefinitions.get(span.target_agent_id),
        copy
      );
      if (parent && child) {
        parent.childIds.add(child.id);
        if (!child.parentId) {
          child.parentId = parent.id;
        }
      }
    }
  });

  if (actorMode === 'run' && actorMap.has(sessionFallbackId)) {
    const sessionActor = actorMap.get(sessionFallbackId);
    for (const actor of actorMap.values()) {
      if (actor.id === sessionFallbackId) {
        continue;
      }
      if (!actor.parentId) {
        actor.parentId = sessionFallbackId;
        sessionActor.childIds.add(actor.id);
      }
    }
  }

  const actors = Array.from(actorMap.values()).sort((left, right) => {
    if (left.parentId && !right.parentId) {
      return 1;
    }
    if (!left.parentId && right.parentId) {
      return -1;
    }
    return left.earliestStart - right.earliestStart;
  });

  const actorIds = actors.map((actor) => actor.id);
  const actorColorMap = Object.fromEntries(
    actorIds.map((actorId, index) => [actorId, ACTOR_COLORS[index % ACTOR_COLORS.length]])
  );

  return {
    actorMode,
    actors,
    actorColorMap,
  };
}

function buildActorTree(actors) {
  const actorMap = new Map(actors.map((actor) => [actor.id, { ...actor, children: [] }]));
  const roots = [];

  actorMap.forEach((actor) => {
    if (actor.parentId && actorMap.has(actor.parentId)) {
      actorMap.get(actor.parentId).children.push(actor);
    } else {
      roots.push(actor);
    }
  });

  return roots;
}

function renderActorTree(nodes, selectedActorId, setSelectedActorId, copy, depth = 0) {
  return nodes.map((actor) => (
    <div key={actor.id} className="multi-agent-actor-tree-node" style={{ '--tree-depth': depth }}>
      <button
        type="button"
        className={`multi-agent-actor-card ${selectedActorId === actor.id ? 'is-active' : ''}`}
        onClick={() => setSelectedActorId((current) => (current === actor.id ? null : actor.id))}
      >
        <div>
          <strong>{actor.label || copy.unnamedActor}</strong>
          <span>{formatLexiconText(copy.spanCount, { count: actor.spans.length })}</span>
        </div>
        <div className="multi-agent-actor-card-meta">
          <span>{formatDuration(actor.totalDuration)}</span>
          <span>{formatCost(actor.totalCost)}</span>
        </div>
      </button>
      {actor.children.length > 0 && renderActorTree(actor.children, selectedActorId, setSelectedActorId, copy, depth + 1)}
    </div>
  ));
}

export default function MultiAgentTraceView({
  spans,
  traceData,
  focusedSpan,
  onSpanFocus,
  onOpenDetails,
}) {
  const copy = useLexiconSection('multiAgentTraceView');
  const [colorMode, setColorMode] = useState('category');
  const [filterMode, setFilterMode] = useState('all');
  const [selectedActorId, setSelectedActorId] = useState(null);

  const filteredSpans = useMemo(() => {
    if (!spans.length) {
      return [];
    }
    if (filterMode === 'all') {
      return spans;
    }
    const expectedCategory = filterMode === 'model' ? 'MODEL' : filterMode === 'tool' ? 'TOOL' : 'AGENT';
    return spans.filter((span) => span.category === expectedCategory);
  }, [filterMode, spans]);

  const actorModel = useMemo(
    () => buildActorModel(filteredSpans, traceData, copy),
    [copy, filteredSpans, traceData]
  );

  const actorTree = useMemo(
    () => (actorModel ? buildActorTree(actorModel.actors) : []),
    [actorModel]
  );

  useEffect(() => {
    if (!selectedActorId || !actorModel) {
      return;
    }
    if (!actorModel.actors.some((actor) => actor.id === selectedActorId)) {
      setSelectedActorId(null);
    }
  }, [actorModel, selectedActorId]);

  if (!spans.length) {
    return <div className="trace-sync-empty">{copy.noSpans}</div>;
  }

  if (!actorModel || actorModel.actors.length < 2) {
    return <div className="trace-sync-empty">{copy.noSignals}</div>;
  }

  const activeActors = selectedActorId
    ? actorModel.actors.filter((actor) => actor.id === selectedActorId)
    : actorModel.actors;

  const minTime = Math.min(...filteredSpans.map((span) => parseTimestamp(span.start_at)));
  const maxTime = Math.max(...filteredSpans.map((span) => parseTimestamp(span.end_at)));
  const totalDuration = Math.max(maxTime - minTime, 1);
  const timelineWidth = Math.max(980, totalDuration / 6);
  const timelineInnerWidth = timelineWidth + TIMELINE_SIDE_PADDING * 2;
  const markerStops = [0, 0.2, 0.4, 0.6, 0.8, 1];

  return (
    <div className="multi-agent-view">
      <aside className="multi-agent-sidebar">
        <div className="multi-agent-sidebar-intro">
          <span className="multi-agent-kicker">{copy.overview}</span>
          <p>{copy.intro}</p>
        </div>

        <div className="multi-agent-stat-grid">
          <article>
            <strong>{actorModel.actors.length}</strong>
            <span>{copy.actorStats}</span>
          </article>
          <article>
            <strong>{filteredSpans.length}</strong>
            <span>{copy.visibleSpans}</span>
          </article>
          <article>
            <strong>{getFilterLabel(filterMode, copy)}</strong>
            <span>{copy.activeFilter}</span>
          </article>
        </div>

        <div className="multi-agent-control-block">
          <span>{copy.colorMode}</span>
          <div className="multi-agent-chip-row">
            <button
              type="button"
              className={colorMode === 'category' ? 'is-active' : ''}
              onClick={() => setColorMode('category')}
            >
              {copy.colorByCategory}
            </button>
            <button
              type="button"
              className={colorMode === 'actor' ? 'is-active' : ''}
              onClick={() => setColorMode('actor')}
            >
              {copy.colorByActor}
            </button>
          </div>
        </div>

        <div className="multi-agent-control-block">
          <span>{copy.filterMode}</span>
          <div className="multi-agent-chip-row">
            {[
              ['all', copy.filterAll],
              ['model', copy.filterModel],
              ['tool', copy.filterTool],
              ['agent', copy.filterAgent],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filterMode === value ? 'is-active' : ''}
                onClick={() => setFilterMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="multi-agent-directory">
          <div className="multi-agent-directory-header">
            <strong>{copy.actorDirectory}</strong>
            <button type="button" onClick={() => setSelectedActorId(null)}>
              {copy.allActors}
            </button>
          </div>
          <p>{copy.actorDirectoryHint}</p>
          {actorTree.some((actor) => actor.children.length > 0) ? (
            renderActorTree(actorTree, selectedActorId, setSelectedActorId, copy)
          ) : (
            <>
              <div className="multi-agent-hint">{copy.hierarchyUnavailable}</div>
              {renderActorTree(actorTree, selectedActorId, setSelectedActorId, copy)}
            </>
          )}
        </div>
      </aside>

      <div className="multi-agent-main">
        <div className="multi-agent-main-header">
          <div>
            <h4>{copy.actorTimeline}</h4>
            <p>
              {copy.axisStart}: {formatDuration(0)} · {copy.axisEnd}: {formatDuration(totalDuration)}
            </p>
          </div>
        </div>

        <div className="multi-agent-timeline-scroll">
          <div className="multi-agent-time-axis" style={{ width: `${timelineInnerWidth}px` }}>
            {markerStops.map((stop) => (
              <div
                key={stop}
                className="multi-agent-time-marker"
                style={{ left: `${TIMELINE_SIDE_PADDING + stop * timelineWidth}px` }}
              >
                {formatDuration(totalDuration * stop)}
              </div>
            ))}
          </div>

          {activeActors.map((actor) => {
            const spanStack = calculateNestingLevels(actor.spans);
            const maxLevel = Math.max(0, ...spanStack.map((entry) => entry.level));

            return (
              <div key={actor.id} className="multi-agent-lane">
                <div className="multi-agent-lane-header">
                  <span
                    className="multi-agent-lane-dot"
                    style={{ backgroundColor: actorModel.actorColorMap[actor.id] }}
                  />
                  <div>
                    <strong>{actor.label || copy.unnamedActor}</strong>
                    <span>{formatLexiconText(copy.spanCount, { count: actor.spans.length })}</span>
                  </div>
                </div>

                <div
                  className="multi-agent-lane-track"
                  style={{
                    width: `${timelineInnerWidth}px`,
                    minHeight: `${76 + maxLevel * 22}px`,
                  }}
                >
                  {spanStack.map(({ span, level }) => {
                    const startOffset = parseTimestamp(span.start_at) - minTime;
                    const barLeft = TIMELINE_SIDE_PADDING + (startOffset / totalDuration) * timelineWidth;
                    const barWidth = Math.max(6, ((span.duration_ms || 1) / totalDuration) * timelineWidth);
                    const isFocused = focusedSpan?.record_id === span.record_id;
                    const barColor =
                      colorMode === 'category'
                        ? CATEGORY_COLORS[span.category] || '#64748b'
                        : actorModel.actorColorMap[actor.id];

                    return (
                      <button
                        key={span.record_id}
                        type="button"
                        className={`multi-agent-span-bar ${isFocused ? 'is-focused' : ''}`}
                        style={{
                          left: `${barLeft}px`,
                          width: `${barWidth}px`,
                          top: `${14 + level * 20}px`,
                          backgroundColor: barColor,
                        }}
                        onClick={() => onSpanFocus(span)}
                        onDoubleClick={() => onOpenDetails(span)}
                        title={`${span.name} · ${formatDuration(span.duration_ms || 0)} · ${formatCost(getSpanCost(span))}`}
                      >
                        {barWidth > 132 && <span>{span.name}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
