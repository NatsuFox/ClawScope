import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

export async function readJsonl(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export async function readJsonlIfExists(filePath) {
  try {
    return await readJsonl(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function walkFiles(dirPath, predicate) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath, predicate)));
      continue;
    }
    if (predicate(fullPath, entry)) {
      results.push(fullPath);
    }
  }

  return results;
}

export async function statSafe(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

export function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function toIso(value) {
  const ts = toTimestampMs(value);
  if (ts === null) {
    return null;
  }
  return new Date(ts).toISOString();
}

export function normalizeRange(startValue, endValue, fallbackDurationMs = 1) {
  const startMs = toTimestampMs(startValue);
  const endMs = toTimestampMs(endValue);

  if (startMs === null && endMs === null) {
    const now = Date.now();
    return {
      start_at: new Date(now).toISOString(),
      end_at: new Date(now + fallbackDurationMs).toISOString(),
      duration_ms: fallbackDurationMs,
    };
  }

  if (startMs !== null && endMs !== null) {
    const boundedEnd = endMs > startMs ? endMs : startMs + fallbackDurationMs;
    return {
      start_at: new Date(startMs).toISOString(),
      end_at: new Date(boundedEnd).toISOString(),
      duration_ms: boundedEnd - startMs,
    };
  }

  if (startMs !== null) {
    return {
      start_at: new Date(startMs).toISOString(),
      end_at: new Date(startMs + fallbackDurationMs).toISOString(),
      duration_ms: fallbackDurationMs,
    };
  }

  return {
    start_at: new Date(endMs - fallbackDurationMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    duration_ms: fallbackDurationMs,
  };
}

export function makeSpan({
  record_id,
  trace_id,
  category,
  subtype,
  name,
  start_at,
  end_at,
  duration_ms,
  parent_span_id,
  caused_by_span_id,
  agent_id,
  origin_agent_id,
  target_agent_id,
  status = 'success',
  fidelity = 'derived',
  runId,
  sessionKey,
  toolCallId,
  channel,
  lane,
  seq,
  model_name,
  provider,
  tool_name,
  token_reasoning,
  token_input,
  token_output,
  token_cache,
  costUsd,
  queueDepth,
  updateType,
  attributes = {},
}) {
  return {
    record_id: record_id || `span_${randomUUID()}`,
    trace_id,
    category,
    subtype,
    name,
    start_at,
    end_at,
    duration_ms,
    parent_span_id,
    caused_by_span_id,
    agent_id,
    origin_agent_id,
    target_agent_id,
    status,
    fidelity,
    runId,
    sessionKey,
    toolCallId,
    channel,
    lane,
    seq,
    model_name,
    provider,
    tool_name,
    token_reasoning,
    token_input,
    token_output,
    token_cache,
    costUsd,
    queueDepth,
    updateType,
    attributes,
  };
}

function collectSpanValues(spans, keys) {
  const values = new Set();
  for (const span of spans) {
    for (const key of keys) {
      const value = span?.[key];
      if (value !== undefined && value !== null && value !== '') {
        values.add(value);
      }
    }
  }
  return values;
}

export function inferTraceCapabilities(spans) {
  const explicitAgentIds = collectSpanValues(spans, ['agent_id', 'origin_agent_id', 'target_agent_id']);
  const runIds = collectSpanValues(spans, ['runId']);
  const sessionKeys = collectSpanValues(spans, ['sessionKey']);
  const hasDelegationEdges = spans.some((span) => span.origin_agent_id || span.target_agent_id);

  let agent_identity_mode = 'none';
  let trace_semantics = 'span-only';

  if (hasDelegationEdges && explicitAgentIds.size > 1) {
    agent_identity_mode = 'explicit';
    trace_semantics = 'delegation-aware';
  } else if (explicitAgentIds.size > 0) {
    agent_identity_mode = 'explicit';
    trace_semantics = explicitAgentIds.size > 1 ? 'multi-actor' : 'single-actor';
  } else if (runIds.size > 0) {
    agent_identity_mode = 'run_id';
    trace_semantics = runIds.size > 1 ? 'multi-run' : 'single-run';
  } else if (sessionKeys.size > 0) {
    agent_identity_mode = 'session_key';
    trace_semantics = sessionKeys.size > 1 ? 'multi-session' : 'session-scoped';
  }

  const supports_cost_analysis = spans.some(
    (span) =>
      span.category === 'MODEL' ||
      span.costUsd !== undefined ||
      span.token_reasoning !== undefined ||
      span.token_input !== undefined ||
      span.token_output !== undefined ||
      span.token_cache !== undefined
  );
  const supports_message_log = spans.some((span) =>
    ['MESSAGE', 'MODEL', 'TOOL', 'CONTEXT', 'SYSTEM'].includes(span.category)
  );
  const total_agents =
    explicitAgentIds.size || runIds.size || sessionKeys.size || (spans.length > 0 ? 1 : 0);

  return {
    schema_version: 2,
    trace_contract_version: 'clawscope-trace/v2',
    trace_semantics,
    agent_identity_mode,
    supports_waterfall: spans.length > 0,
    supports_cost_analysis,
    supports_message_log,
    supports_multi_agent: trace_semantics === 'delegation-aware',
    total_agents,
  };
}

export function buildTraceMetadata({
  trace_id,
  trace_name,
  spans,
  source_harness,
  source_session_id,
  source_path,
  cwd,
  git_branch,
  status = 'complete',
  total_agents,
  attributes = {},
}) {
  const inferred = inferTraceCapabilities(spans);
  const ordered = [...spans].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const start_at = ordered[0]?.start_at || new Date().toISOString();
  const end_at = ordered[ordered.length - 1]?.end_at || start_at;
  const duration_ms = Math.max(1, new Date(end_at).getTime() - new Date(start_at).getTime());
  const total_cost = ordered.reduce((sum, span) => sum + (span.costUsd || 0), 0);

  return {
    trace_id,
    trace_name,
    start_at,
    end_at,
    duration_ms,
    total_cost,
    total_agents: total_agents ?? inferred.total_agents,
    total_spans: spans.length,
    status,
    source_harness,
    source_session_id,
    source_path,
    cwd,
    git_branch,
    schema_version: inferred.schema_version,
    trace_contract_version: inferred.trace_contract_version,
    trace_semantics: inferred.trace_semantics,
    agent_identity_mode: inferred.agent_identity_mode,
    supports_waterfall: inferred.supports_waterfall,
    supports_cost_analysis: inferred.supports_cost_analysis,
    supports_message_log: inferred.supports_message_log,
    supports_multi_agent: inferred.supports_multi_agent,
    attributes,
  };
}

export function safeJsonParse(value) {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function snippet(value, maxLength = 80) {
  if (!value) {
    return '';
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function decodeClaudeProjectDir(encodedDir) {
  if (!encodedDir) {
    return '';
  }
  return `/${encodedDir.replace(/^-/, '').replace(/-/g, '/')}`;
}

export function getDefaultClaudeProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function getDefaultCodexSessionsDir() {
  return path.join(os.homedir(), '.codex', 'sessions');
}
