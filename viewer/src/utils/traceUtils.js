// Category color mapping - OpenClaw event categories
export const CATEGORY_COLORS = {
  MODEL: '#3b82f6',
  TOOL: '#eab308',
  AGENT: '#8b5cf6',
  WEBHOOK: '#06b6d4',
  MESSAGE: '#10b981',
  SESSION: '#f59e0b',
  QUEUE: '#ec4899',
  RUN: '#6366f1',
  CONTEXT: '#f97316',
  SYSTEM: '#84cc16',
  ERROR: '#ef4444'
};

// Parse ISO timestamp to milliseconds since epoch
export function parseTimestamp(isoString) {
  return new Date(isoString).getTime();
}

// Build hierarchy from flat span list
export function buildSpanHierarchy(spans) {
  const spanMap = new Map();
  const roots = [];

  // First pass: create map
  spans.forEach(span => {
    spanMap.set(span.record_id, { ...span, children: [] });
  });

  // Second pass: build tree
  spans.forEach(span => {
    const node = spanMap.get(span.record_id);
    if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
      spanMap.get(span.parent_span_id).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return { spanMap, roots };
}

// Calculate depth for each span
export function calculateDepths(roots) {
  const depths = new Map();

  function traverse(node, depth) {
    depths.set(node.record_id, depth);
    node.children.forEach(child => traverse(child, depth + 1));
  }

  roots.forEach(root => traverse(root, 0));
  return depths;
}

// Group spans by agent
export function groupByAgent(spans) {
  const agentGroups = new Map();

  spans.forEach(span => {
    const agentId = getSpanActorId(span);
    if (!agentGroups.has(agentId)) {
      agentGroups.set(agentId, []);
    }
    agentGroups.get(agentId).push(span);
  });

  return agentGroups;
}

// Calculate summary statistics
export function calculateSummary(spans) {
  const validStartTimes = spans
    .map((span) => parseTimestamp(span.start_at))
    .filter(Number.isFinite);
  const validEndTimes = spans
    .map((span) => parseTimestamp(span.end_at))
    .filter(Number.isFinite);
  const totalDuration =
    validStartTimes.length > 0 && validEndTimes.length > 0
      ? Math.max(Math.max(...validEndTimes) - Math.min(...validStartTimes), 0)
      : 0;

  let totalCost = 0;
  const categoryCounts = {};
  const slowestSpans = [];
  const costliestSpans = [];

  spans.forEach(span => {
    const spanCost = getSpanCost(span);
    if (spanCost) {
      totalCost += spanCost;
    }

    categoryCounts[span.category] = (categoryCounts[span.category] || 0) + 1;

    slowestSpans.push(span);
    if (spanCost) {
      costliestSpans.push(span);
    }
  });

  slowestSpans.sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0));
  costliestSpans.sort((a, b) => getSpanCost(b) - getSpanCost(a));

  return {
    totalDuration,
    totalCost,
    spanCount: spans.length,
    categoryCounts,
    slowestSpans: slowestSpans.slice(0, 5),
    costliestSpans: costliestSpans.slice(0, 5)
  };
}

// Format duration for display
export function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

// Format cost for display
export function formatCost(cost) {
  if (!cost) return '$0.00';
  return `$${cost.toFixed(4)}`;
}

export function getSpanCost(span) {
  return span?.costUsd ?? span?.cost ?? 0;
}

export function getSpanActorId(span) {
  return (
    span?.agent_id ||
    span?.target_agent_id ||
    span?.origin_agent_id ||
    span?.runId ||
    span?.sessionKey ||
    'unknown'
  );
}
