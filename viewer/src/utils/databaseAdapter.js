/**
 * Database Adapter for ClawScope Viewer
 *
 * Client-side adapter that fetches normalized traces from the viewer server
 */

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:3101`;
  }
  return 'http://127.0.0.1:3101';
}

const API_BASE_URL = resolveApiBaseUrl();

async function assertOk(response) {
  if (response.ok) {
    return response;
  }
  const statusText = response.statusText?.trim();
  throw new Error(statusText ? `${response.status} ${statusText}` : `HTTP ${response.status}`);
}

/**
 * Database adapter class
 */
export class DatabaseAdapter {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * List all available traces
   */
  async listTraces() {
    const response = await fetch(`${this.baseUrl}/api/traces`);
    await assertOk(response);
    const data = await response.json();
    return data.traces;
  }

  /**
   * Get trace metadata
   */
  async getTrace(traceId) {
    const response = await fetch(`${this.baseUrl}/api/traces/${traceId}`);
    await assertOk(response);
    const data = await response.json();
    return data.trace;
  }

  /**
   * Get trace spans
   */
  async getSpans(traceId) {
    const response = await fetch(`${this.baseUrl}/api/traces/${traceId}/spans`);
    await assertOk(response);
    const data = await response.json();
    return data.spans;
  }

  /**
   * Get trace summary
   */
  async getSummary(traceId) {
    const response = await fetch(`${this.baseUrl}/api/traces/${traceId}/summary`);
    await assertOk(response);
    const data = await response.json();
    return data.summary;
  }

  /**
   * Load complete trace (metadata + spans + summary)
   */
  async loadTrace(traceId) {
    const [trace, spans, summary] = await Promise.all([
      this.getTrace(traceId),
      this.getSpans(traceId),
      this.getSummary(traceId),
    ]);

    return {
      metadata: trace,
      spans,
      summary,
    };
  }
}

/**
 * Convert database spans to viewer format
 */
export function convertToViewerFormat(spans) {
  const explicitAgentIds = new Set(
    spans.flatMap((span) => [span.agent_id, span.origin_agent_id, span.target_agent_id].filter(Boolean))
  );
  const runIds = new Set(spans.filter((span) => span.runId).map((span) => span.runId));
  const minStart = spans.length
    ? Math.min(...spans.map((span) => new Date(span.start_at).getTime()))
    : 0;
  const maxEnd = spans.length
    ? Math.max(...spans.map((span) => new Date(span.end_at).getTime()))
    : 0;

  return {
    trace_id: spans[0]?.trace_id || 'unknown',
    spans: spans.map(span => ({
      record_id: span.record_id,
      trace_id: span.trace_id,
      category: span.category,
      subtype: span.subtype,
      name: span.name,
      start_at: span.start_at,
      end_at: span.end_at,
      duration_ms: span.duration_ms,
      parent_span_id: span.parent_span_id,
      caused_by_span_id: span.caused_by_span_id,
      agent_id: span.agent_id,
      origin_agent_id: span.origin_agent_id,
      target_agent_id: span.target_agent_id,
      status: span.status,
      fidelity: span.fidelity,
      runId: span.runId,
      sessionKey: span.sessionKey,
      toolCallId: span.toolCallId,
      channel: span.channel,
      lane: span.lane,
      seq: span.seq,
      model_name: span.model_name,
      provider: span.provider,
      tool_name: span.tool_name,
      token_reasoning: span.token_reasoning,
      token_input: span.token_input,
      token_output: span.token_output,
      token_cache: span.token_cache,
      costUsd: span.costUsd,
      queueDepth: span.queueDepth,
      updateType: span.updateType,
      attributes: span.attributes,
    })),
    summary: {
      total_duration_ms: maxEnd - minStart,
      total_cost: spans.reduce((sum, s) => sum + (s.costUsd || 0), 0),
      total_agents: explicitAgentIds.size || runIds.size,
      total_spans: spans.length,
    },
  };
}

export default DatabaseAdapter;
