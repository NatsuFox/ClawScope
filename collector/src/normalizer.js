/**
 * Event Normalizer for ClawScope
 *
 * Transforms OpenClaw raw events into ClawScope normalized spans
 */

import { randomUUID } from 'crypto';

/**
 * Event category mapping
 */
const EVENT_CATEGORY_MAP = {
  // MODEL category
  'model.usage': 'MODEL',

  // TOOL category
  'tool_start': 'TOOL',
  'tool_end': 'TOOL',
  'tool_result': 'TOOL',
  'tool.loop': 'TOOL',

  // AGENT category
  'lifecycle.start': 'AGENT',
  'lifecycle.end': 'AGENT',
  'lifecycle.error': 'AGENT',
  'lifecycle.compaction': 'AGENT',
  'lifecycle': 'AGENT',

  // WEBHOOK category
  'webhook.received': 'WEBHOOK',
  'webhook.processed': 'WEBHOOK',
  'webhook.error': 'WEBHOOK',

  // MESSAGE category
  'message.queued': 'MESSAGE',
  'message.processed': 'MESSAGE',

  // SESSION category
  'session.state': 'SESSION',
  'session.stuck': 'SESSION',

  // QUEUE category
  'queue.lane.enqueue': 'QUEUE',
  'queue.lane.dequeue': 'QUEUE',

  // RUN category
  'run.attempt': 'RUN',

  // SYSTEM category
  'diagnostic.heartbeat': 'SYSTEM',
};

/**
 * Main normalizer class
 */
export class Normalizer {
  constructor(options = {}) {
    this.options = {
      defaultTimeout: 30000, // 30 seconds for missing end events
      ...options
    };
  }

  /**
   * Normalize raw events into spans
   */
  async normalize(events) {
    // Generate a single trace ID for all spans in this batch
    this.currentTraceId = randomUUID();

    // Parse and validate events
    const parsedEvents = events.map(e => this.parseEvent(e));

    // Deduplicate events
    const uniqueEvents = this.deduplicateEvents(parsedEvents);

    // Reorder events by timestamp
    const orderedEvents = this.reorderEvents(uniqueEvents);

    // Correlate events into groups
    const groups = this.correlateEvents(orderedEvents);

    // Build spans from groups
    const spans = [];
    for (const group of groups) {
      const groupSpans = this.buildSpansFromGroup(group);
      spans.push(...groupSpans);
    }

    // Assign consistent trace_id to all spans
    for (const span of spans) {
      span.trace_id = this.currentTraceId;
    }

    // Resolve relationships
    this.resolveRelationships(spans);

    // Validate spans
    for (const span of spans) {
      const validation = this.validateSpan(span);
      if (!validation.valid) {
        console.warn(`Invalid span ${span.record_id}:`, validation.errors);
      }
    }

    return spans;
  }

  /**
   * Parse and normalize event structure
   */
  parseEvent(rawEvent) {
    // Validate required fields
    if (!rawEvent.type || !rawEvent.ts) {
      throw new Error('Invalid event: missing type or ts');
    }

    // Normalize timestamp
    const ts = typeof rawEvent.ts === 'string' ? Date.parse(rawEvent.ts) : rawEvent.ts;

    // Extract correlation IDs (handle both camelCase and snake_case)
    const runId = rawEvent.runId || rawEvent.run_id;
    const sessionKey = rawEvent.sessionKey || rawEvent.session_key;
    const toolCallId = rawEvent.toolCallId || rawEvent.tool_call_id;

    return {
      type: rawEvent.type,
      seq: rawEvent.seq,
      ts,
      runId,
      sessionKey,
      toolCallId,
      channel: rawEvent.channel,
      lane: rawEvent.lane,
      updateType: rawEvent.updateType,
      queueDepth: rawEvent.queueDepth,
      model: rawEvent.model,
      provider: rawEvent.provider,
      tokens: rawEvent.tokens,
      costUsd: rawEvent.costUsd,
      durationMs: rawEvent.durationMs,
      context: rawEvent.context,
      stream: rawEvent.stream,
      data: rawEvent.data,
    };
  }

  /**
   * Deduplicate events
   */
  deduplicateEvents(events) {
    const seen = new Set();
    const unique = [];

    for (const event of events) {
      // Create fingerprint
      const fingerprint = `${event.type}:${event.ts}:${event.runId || ''}:${event.seq || ''}`;

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        unique.push(event);
      }
    }

    return unique;
  }

  /**
   * Reorder events by timestamp and sequence
   */
  reorderEvents(events) {
    return events.sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.seq !== undefined && b.seq !== undefined) return a.seq - b.seq;
      return 0;
    });
  }

  /**
   * Correlate events into groups
   */
  correlateEvents(events) {
    const groups = [];

    // Group by runId
    const runMap = new Map();
    const ungrouped = [];

    for (const event of events) {
      if (event.runId) {
        if (!runMap.has(event.runId)) {
          runMap.set(event.runId, []);
        }
        runMap.get(event.runId).push(event);
      } else {
        ungrouped.push(event);
      }
    }

    // Process run groups
    for (const [runId, runEvents] of runMap) {
      // Within each run, group by toolCallId
      const toolMap = new Map();
      const lifecycleEvents = [];
      const otherEvents = [];

      for (const event of runEvents) {
        if (event.toolCallId) {
          if (!toolMap.has(event.toolCallId)) {
            toolMap.set(event.toolCallId, []);
          }
          toolMap.get(event.toolCallId).push(event);
        } else if (event.type === 'lifecycle' || event.type.startsWith('lifecycle.')) {
          lifecycleEvents.push(event);
        } else {
          otherEvents.push(event);
        }
      }

      groups.push({
        type: 'run',
        id: runId,
        events: runEvents,
        lifecycleEvents,
        toolGroups: Array.from(toolMap.entries()).map(([toolCallId, events]) => ({
          type: 'tool',
          id: toolCallId,
          events,
        })),
        otherEvents,
      });
    }

    // Process ungrouped events (no runId)
    for (const event of ungrouped) {
      groups.push({
        type: 'single',
        id: randomUUID(),
        events: [event],
      });
    }

    return groups;
  }

  /**
   * Build spans from event group
   */
  buildSpansFromGroup(group) {
    const spans = [];

    if (group.type === 'run') {
      // Build lifecycle span (root)
      if (group.lifecycleEvents.length > 0) {
        const lifecycleSpan = this.buildLifecycleSpan(group.lifecycleEvents, group.id, group.events);
        if (lifecycleSpan) spans.push(lifecycleSpan);
      }

      // Build tool spans
      for (const toolGroup of group.toolGroups) {
        const toolSpan = this.buildToolSpan(toolGroup.events, group.id);
        if (toolSpan) spans.push(toolSpan);
      }

      // Build spans from other events
      for (const event of group.otherEvents) {
        const span = this.buildSingleEventSpan(event);
        if (span) spans.push(span);
      }
    } else if (group.type === 'single') {
      // Single event span
      const span = this.buildSingleEventSpan(group.events[0]);
      if (span) spans.push(span);
    }

    return spans;
  }

  /**
   * Build lifecycle span from lifecycle events
   */
  buildLifecycleSpan(events, runId, relatedEvents = events) {
    // Find start and end events
    const startEvent = events.find(e =>
      e.type === 'lifecycle' && e.data?.phase === 'start' ||
      e.type === 'lifecycle.start'
    );
    const endEvent = events.find(e =>
      e.type === 'lifecycle' && e.data?.phase === 'end' ||
      e.type === 'lifecycle.end'
    );
    const errorEvent = events.find(e =>
      e.type === 'lifecycle' && e.data?.phase === 'error' ||
      e.type === 'lifecycle.error'
    );

    if (!startEvent) return null;

    const finalEvent = errorEvent || endEvent;
    const observedEndTs = relatedEvents.reduce((maxTs, event) => {
      const candidateEnd = event.durationMs ? event.ts + event.durationMs : event.ts;
      return Math.max(maxTs, candidateEnd);
    }, startEvent.ts);
    const start_at = new Date(startEvent.ts).toISOString();
    const resolvedEndTs = finalEvent
      ? Math.max(finalEvent.ts, observedEndTs)
      : Math.max(startEvent.ts + this.options.defaultTimeout, observedEndTs);
    const end_at = new Date(resolvedEndTs).toISOString();
    const duration_ms = resolvedEndTs - startEvent.ts;

    return {
      record_id: `span_lifecycle_${runId}`,
      trace_id: this.extractTraceId(events),
      category: 'AGENT',
      subtype: 'lifecycle',
      name: `Agent Run: ${runId}`,
      start_at,
      end_at,
      duration_ms,
      status: errorEvent ? 'error' : (endEvent ? 'success' : 'timeout'),
      fidelity: finalEvent ? 'exact' : 'inferred',
      runId,
      sessionKey: startEvent.sessionKey,
      attributes: {
        startedAt: startEvent.data?.startedAt,
        endedAt: finalEvent?.data?.endedAt,
        error: errorEvent?.data?.error,
      },
    };
  }

  /**
   * Build tool span from tool events
   */
  buildToolSpan(events, runId) {
    // Find start, end, and result events
    const startEvent = events.find(e => e.type === 'tool_start' || e.data?.phase === 'tool_start');
    const endEvent = events.find(e => e.type === 'tool_end' || e.data?.phase === 'tool_end');
    const resultEvent = events.find(e => e.type === 'tool_result' || e.data?.phase === 'tool_result');

    if (!startEvent) return null;

    const finalEvent = endEvent || resultEvent;
    const start_at = new Date(startEvent.ts).toISOString();
    const end_at = finalEvent
      ? new Date(finalEvent.ts).toISOString()
      : new Date(startEvent.ts + this.options.defaultTimeout).toISOString();
    const duration_ms = finalEvent
      ? finalEvent.ts - startEvent.ts
      : this.options.defaultTimeout;

    const toolName = startEvent.data?.toolName || 'Unknown';
    const isError = resultEvent?.data?.isError || false;

    return {
      record_id: `span_tool_${startEvent.toolCallId}`,
      trace_id: this.extractTraceId(events),
      category: 'TOOL',
      subtype: 'tool_execution',
      name: `Tool: ${toolName}`,
      start_at,
      end_at,
      duration_ms,
      status: isError ? 'error' : (finalEvent ? 'success' : 'timeout'),
      fidelity: finalEvent ? 'exact' : 'inferred',
      runId,
      sessionKey: startEvent.sessionKey,
      toolCallId: startEvent.toolCallId,
      tool_name: toolName,
      attributes: {
        args: startEvent.data?.args,
        result: resultEvent?.data?.result,
        isError,
        errorMessage: resultEvent?.data?.errorMessage,
      },
    };
  }

  /**
   * Build span from single event
   */
  buildSingleEventSpan(event) {
    const category = EVENT_CATEGORY_MAP[event.type];
    if (!category) {
      console.warn(`Unknown event type: ${event.type}`);
      return null;
    }

    // Determine timing
    let start_at, end_at, duration_ms;

    if (event.durationMs) {
      // Event has duration metadata
      start_at = new Date(event.ts).toISOString();
      end_at = new Date(event.ts + event.durationMs).toISOString();
      duration_ms = event.durationMs;
    } else {
      // Instant event (use 1ms duration)
      start_at = new Date(event.ts).toISOString();
      end_at = new Date(event.ts + 1).toISOString();
      duration_ms = 1;
    }

    // Extract metadata based on category
    const metadata = this.extractMetadata(event, category);

    // Generate span name
    const name = this.generateSpanName(category, event.type, metadata);

    return {
      record_id: `span_${event.type}_${event.ts}_${randomUUID().slice(0, 8)}`,
      trace_id: this.extractTraceId([event]),
      category,
      subtype: event.type,
      name,
      start_at,
      end_at,
      duration_ms,
      status: this.determineStatus(event),
      fidelity: event.durationMs ? 'exact' : 'derived',
      ...metadata,
      attributes: event.data || {},
    };
  }

  /**
   * Extract metadata from event based on category
   */
  extractMetadata(event, category) {
    const metadata = {};

    // Common correlation fields
    metadata.runId = event.runId;
    metadata.sessionKey = event.sessionKey;
    metadata.seq = event.seq;

    // Category-specific fields
    switch (category) {
      case 'MODEL':
        metadata.model_name = event.model;
        metadata.provider = event.provider;
        metadata.token_reasoning =
          event.tokens?.reasoning ??
          event.tokens?.reasoningTokens ??
          event.tokens?.thinking ??
          event.tokens?.thinkingTokens;
        metadata.token_input = event.tokens?.input;
        metadata.token_output = event.tokens?.output;
        metadata.token_cache = event.tokens?.cacheRead;
        metadata.costUsd = event.costUsd;
        break;

      case 'TOOL':
        metadata.tool_name = event.data?.toolName;
        metadata.toolCallId = event.toolCallId;
        break;

      case 'WEBHOOK':
      case 'MESSAGE':
        metadata.channel = event.channel;
        metadata.updateType = event.updateType;
        metadata.queueDepth = event.queueDepth;
        break;

      case 'SESSION':
      case 'QUEUE':
        metadata.sessionKey = event.sessionKey;
        metadata.queueDepth = event.queueDepth;
        metadata.lane = event.lane;
        break;

      case 'RUN':
        metadata.runId = event.runId;
        break;
    }

    return metadata;
  }

  /**
   * Generate span name
   */
  generateSpanName(category, subtype, metadata) {
    switch (category) {
      case 'MODEL':
        return `Model: ${metadata.model_name || 'Unknown'}`;
      case 'TOOL':
        return `Tool: ${metadata.tool_name || 'Unknown'}`;
      case 'AGENT':
        return `Agent Run: ${metadata.runId || 'Unknown'}`;
      case 'WEBHOOK':
        return `Webhook: ${metadata.channel || 'Unknown'} ${metadata.updateType || ''}`.trim();
      case 'MESSAGE':
        return `Message: ${subtype.replace('message.', '')}`;
      case 'SESSION':
        return `Session: ${subtype.replace('session.', '')}`;
      case 'QUEUE':
        return `Queue: ${subtype.replace('queue.lane.', '')}`;
      case 'RUN':
        return `Run Attempt`;
      case 'SYSTEM':
        return `System: ${subtype}`;
      default:
        return subtype;
    }
  }

  /**
   * Determine span status from event
   */
  determineStatus(event) {
    if (event.type.includes('error')) return 'error';
    if (event.data?.isError) return 'error';
    if (event.data?.phase === 'error') return 'error';
    return 'success';
  }

  /**
   * Extract trace ID from events
   */
  extractTraceId(events) {
    // Try to extract from sessionKey
    const sessionKey = events.find(e => e.sessionKey)?.sessionKey;
    if (sessionKey) {
      // sessionKey format: agent:{channel}:{session_id}
      return sessionKey.split(':').pop() || randomUUID();
    }

    // Try to extract from runId
    const runId = events.find(e => e.runId)?.runId;
    if (runId) {
      return runId;
    }

    // Generate new trace ID
    return randomUUID();
  }

  /**
   * Resolve parent-child and causal relationships
   */
  resolveRelationships(spans) {
    // Sort by start time
    spans.sort((a, b) => a.start_at.localeCompare(b.start_at));

    // Group by runId
    const runGroups = new Map();
    for (const span of spans) {
      if (span.runId) {
        if (!runGroups.has(span.runId)) {
          runGroups.set(span.runId, []);
        }
        runGroups.get(span.runId).push(span);
      }
    }

    // Assign parents within each run
    for (const [runId, runSpans] of runGroups) {
      // Find lifecycle span (root)
      const lifecycleSpan = runSpans.find(s => s.category === 'AGENT' && s.subtype === 'lifecycle');

      for (const span of runSpans) {
        if (span === lifecycleSpan) continue;

        // Find narrowest containing span
        const parent = this.findNarrowestContainer(span, runSpans);
        if (parent) {
          span.parent_span_id = parent.record_id;
        } else if (lifecycleSpan) {
          span.parent_span_id = lifecycleSpan.record_id;
        }
      }
    }

    // Establish causal relationships
    this.resolveCausalRelationships(spans);
  }

  /**
   * Find narrowest containing span
   */
  findNarrowestContainer(span, candidates) {
    let narrowest = null;
    let narrowestDuration = Infinity;

    for (const candidate of candidates) {
      if (candidate.record_id === span.record_id) continue;

      // Check temporal containment
      if (candidate.start_at <= span.start_at && candidate.end_at >= span.end_at) {
        if (span.category === 'TOOL' && candidate.category === 'MODEL') {
          continue;
        }
        if (candidate.duration_ms < narrowestDuration) {
          narrowest = candidate;
          narrowestDuration = candidate.duration_ms;
        }
      }
    }

    return narrowest;
  }

  /**
   * Resolve causal relationships
   */
  resolveCausalRelationships(spans) {
    // Tool calls are caused by model calls
    for (const span of spans) {
      if (span.category === 'TOOL') {
        // Find preceding model call in same run
        const modelCall = spans.find(s =>
          s.category === 'MODEL' &&
          s.runId === span.runId &&
          s.end_at <= span.start_at
        );
        if (modelCall) {
          span.caused_by_span_id = modelCall.record_id;
        }
      }
    }
  }

  /**
   * Validate span
   */
  validateSpan(span) {
    const errors = [];

    // Required fields
    if (!span.record_id) errors.push('Missing record_id');
    if (!span.trace_id) errors.push('Missing trace_id');
    if (!span.category) errors.push('Missing category');
    if (!span.subtype) errors.push('Missing subtype');
    if (!span.start_at) errors.push('Missing start_at');
    if (!span.end_at) errors.push('Missing end_at');

    // Timing validation
    if (span.start_at > span.end_at) {
      errors.push('start_at is after end_at');
    }

    const calculatedDuration = new Date(span.end_at).getTime() - new Date(span.start_at).getTime();
    if (Math.abs(calculatedDuration - span.duration_ms) > 1) {
      errors.push(`duration_ms mismatch: expected ${calculatedDuration}, got ${span.duration_ms}`);
    }

    // Category validation
    const validCategories = ['MODEL', 'TOOL', 'AGENT', 'WEBHOOK', 'MESSAGE', 'SESSION', 'QUEUE', 'RUN', 'CONTEXT', 'SYSTEM'];
    if (!validCategories.includes(span.category)) {
      errors.push(`Invalid category: ${span.category}`);
    }

    // Fidelity validation
    const validFidelities = ['exact', 'derived', 'inferred'];
    if (!validFidelities.includes(span.fidelity)) {
      errors.push(`Invalid fidelity: ${span.fidelity}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default Normalizer;
