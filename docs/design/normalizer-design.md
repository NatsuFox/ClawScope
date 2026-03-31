# Normalizer Design

**Status**: Phase 2 - Design
**Last Updated**: 2026-03-18

## Overview

The normalizer is the core component that transforms OpenClaw's raw event streams into ClawScope's normalized span model. It bridges the gap between OpenClaw's dual-event architecture (diagnostic + agent events) and ClawScope's unified trace visualization.

## Design Principles

1. **Lossless transformation**: All raw event data must be preserved in normalized spans
2. **Correlation-driven**: Use runId, sessionKey, toolCallId to reconstruct relationships
3. **Span reconstruction**: Convert instant events with duration metadata into proper spans
4. **Fidelity tracking**: Mark each span with its observability fidelity (exact, derived, inferred)
5. **Incremental processing**: Support both batch (replay) and streaming (live) modes
6. **Idempotent**: Processing the same events multiple times produces identical output

## Input: OpenClaw Raw Events

### Dual-Event Architecture

OpenClaw emits two event streams:

**1. Diagnostic Events** (`diagnostic_events.jsonl`)
- Infrastructure-level events
- Categories: WEBHOOK, MESSAGE, SESSION, QUEUE, SYSTEM
- Emitted by: `src/infra/diagnostic-events.ts`

**2. Agent Events** (`agent_events.jsonl`)
- Execution-level events
- Categories: MODEL, TOOL, AGENT, RUN
- Emitted by: `src/infra/agent-events.ts`

### Event Structure

```typescript
interface OpenClawEvent {
  type: string;           // e.g., "model.usage", "tool_start", "webhook.received"
  seq: number;            // Sequence number (global or per-run)
  ts: number;             // Timestamp (milliseconds since epoch)

  // Correlation identifiers
  runId?: string;         // Agent execution identifier
  sessionKey?: string;    // Session correlation key
  toolCallId?: string;    // Tool invocation identifier

  // Category-specific fields
  channel?: string;       // Communication channel (discord, slack, telegram)
  lane?: string;          // Queue lane identifier
  updateType?: string;    // Webhook update type
  queueDepth?: number;    // Current queue depth

  // Model-specific fields
  model?: string;         // Model name
  provider?: string;      // Model provider
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  costUsd?: number;       // Cost in USD
  durationMs?: number;    // Duration in milliseconds
  context?: {
    limit: number;
    used: number;
  };

  // Tool-specific fields
  stream?: string;        // Event stream (tool, lifecycle)
  data?: any;             // Event-specific data
}
```

## Output: ClawScope Normalized Spans

### Span Structure

```typescript
interface NormalizedSpan {
  // Identity
  record_id: string;           // Unique span identifier
  trace_id: string;            // Trace identifier

  // Classification
  category: string;            // MODEL, TOOL, AGENT, WEBHOOK, MESSAGE, SESSION, QUEUE, RUN, CONTEXT, SYSTEM
  subtype: string;             // e.g., "model.usage", "tool_start", "webhook.received"
  name: string;                // Human-readable span name

  // Timing
  start_at: string;            // ISO 8601 timestamp
  end_at: string;              // ISO 8601 timestamp
  duration_ms: number;         // Duration in milliseconds

  // Relationships
  parent_span_id?: string;     // Parent span (hierarchical)
  caused_by_span_id?: string;  // Causal predecessor (not hierarchical)
  origin_agent_id?: string;    // Agent that initiated this span
  target_agent_id?: string;    // Agent that executed this span

  // Status
  status: string;              // success, error, timeout, cancelled
  fidelity: string;            // exact, derived, inferred

  // Correlation (from OpenClaw)
  runId?: string;
  sessionKey?: string;
  toolCallId?: string;
  channel?: string;
  lane?: string;
  seq?: number;

  // Category-specific fields
  model_name?: string;
  provider?: string;
  tool_name?: string;
  token_input?: number;
  token_output?: number;
  token_cache?: number;
  costUsd?: number;
  queueDepth?: number;
  updateType?: string;

  // Metadata
  attributes: Record<string, any>;  // Additional event-specific data
}
```

## Normalization Strategy

### 1. Event Categorization

Map OpenClaw event types to ClawScope categories:

```typescript
const EVENT_CATEGORY_MAP: Record<string, string> = {
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
```

### 2. Span Reconstruction

OpenClaw emits instant events with duration metadata. The normalizer reconstructs spans:

**Pattern 1: Single event with duration**
```typescript
// Input: model.usage event
{
  type: "model.usage",
  ts: 1710778500000,
  durationMs: 2500,
  runId: "run_001",
  // ... other fields
}

// Output: MODEL span
{
  record_id: "span_model_001",
  category: "MODEL",
  subtype: "model.usage",
  start_at: "2026-03-18T10:00:00.000Z",  // ts
  end_at: "2026-03-18T10:00:02.500Z",    // ts + durationMs
  duration_ms: 2500,
  fidelity: "exact",
  // ... other fields
}
```

**Pattern 2: Start/end event pairs**
```typescript
// Input: tool_start + tool_end events
{
  type: "tool_start",
  seq: 1,
  ts: 1710778500000,
  toolCallId: "toolu_001",
  data: { toolName: "Bash", args: {...} }
}
{
  type: "tool_end",
  seq: 2,
  ts: 1710778502500,
  toolCallId: "toolu_001",
  data: { durationMs: 2500 }
}

// Output: TOOL span
{
  record_id: "span_tool_001",
  category: "TOOL",
  subtype: "tool_execution",  // Synthesized
  start_at: "2026-03-18T10:00:00.000Z",
  end_at: "2026-03-18T10:00:02.500Z",
  duration_ms: 2500,
  fidelity: "exact",
  toolCallId: "toolu_001",
  tool_name: "Bash",
  // ... other fields
}
```

**Pattern 3: Lifecycle events**
```typescript
// Input: lifecycle.start + lifecycle.end events
{
  type: "lifecycle",
  seq: 1,
  ts: 1710778500000,
  runId: "run_001",
  data: { phase: "start", startedAt: 1710778500000 }
}
{
  type: "lifecycle",
  seq: 10,
  ts: 1710778510000,
  runId: "run_001",
  data: { phase: "end", endedAt: 1710778510000 }
}

// Output: AGENT span
{
  record_id: "span_agent_001",
  category: "AGENT",
  subtype: "lifecycle",
  start_at: "2026-03-18T10:00:00.000Z",
  end_at: "2026-03-18T10:00:10.000Z",
  duration_ms: 10000,
  fidelity: "exact",
  runId: "run_001",
  // ... other fields
}
```

### 3. Correlation Strategy

Use OpenClaw's correlation identifiers to establish relationships:

**runId**: Groups all events within a single agent execution
- All spans with the same runId belong to the same agent run
- Used to build parent-child relationships within a run

**sessionKey**: Groups all events within a session
- Tracks message processing across multiple runs
- Format: `agent:{channel}:{session_id}`

**toolCallId**: Links tool invocation events
- Correlates tool_start, tool_end, tool_result events
- Unique per tool invocation

**Correlation Algorithm**:
```typescript
function correlateEvents(events: OpenClawEvent[]): SpanGroup[] {
  // Group by runId
  const runGroups = groupBy(events, 'runId');

  // Within each run, correlate by toolCallId
  for (const run of runGroups) {
    const toolSpans = correlateToolEvents(run.events);
    const lifecycleSpan = correlateLifecycleEvents(run.events);
    // ... other correlations
  }

  // Group by sessionKey for cross-run correlation
  const sessionGroups = groupBy(events, 'sessionKey');

  return { runGroups, sessionGroups };
}
```

### 4. Parent-Child Relationships

Establish hierarchical relationships between spans:

**Rule 1: Run contains all execution spans**
- AGENT lifecycle span is the root
- MODEL, TOOL, CONTEXT spans are children of the run

**Rule 2: Tool invocations are children of model calls**
- When a model call results in tool use, tool spans are children of the model span
- Correlation: tool events occur after model.usage event with same runId

**Rule 3: Sub-agent spawning creates delegation**
- When an agent spawns a sub-agent, the sub-agent's run is a child of the parent's run
- Correlation: Look for agent spawn events or infer from runId hierarchy

**Parent Assignment Algorithm**:
```typescript
function assignParents(spans: NormalizedSpan[]): void {
  // Sort by start time
  spans.sort((a, b) => a.start_at.localeCompare(b.start_at));

  // Find lifecycle span (root)
  const lifecycleSpan = spans.find(s => s.category === 'AGENT' && s.subtype === 'lifecycle');

  // Assign parents based on temporal containment
  for (const span of spans) {
    if (span === lifecycleSpan) continue;

    // Find the narrowest containing span
    const parent = findNarrowestContainer(span, spans);
    if (parent) {
      span.parent_span_id = parent.record_id;
    } else if (lifecycleSpan) {
      span.parent_span_id = lifecycleSpan.record_id;
    }
  }
}

function findNarrowestContainer(span: NormalizedSpan, candidates: NormalizedSpan[]): NormalizedSpan | null {
  let narrowest: NormalizedSpan | null = null;
  let narrowestDuration = Infinity;

  for (const candidate of candidates) {
    if (candidate.record_id === span.record_id) continue;

    // Check if candidate contains span
    if (candidate.start_at <= span.start_at && candidate.end_at >= span.end_at) {
      if (candidate.duration_ms < narrowestDuration) {
        narrowest = candidate;
        narrowestDuration = candidate.duration_ms;
      }
    }
  }

  return narrowest;
}
```

### 5. Fidelity Classification

Mark each span with its observability fidelity:

**exact**: Directly emitted by OpenClaw with precise timing
- model.usage events (have exact duration)
- tool events with start/end pairs
- lifecycle events with start/end
- webhook, message, session, queue events

**derived**: Reconstructed from multiple events with high confidence
- Tool execution spans from tool_start + tool_end + tool_result
- Agent run spans from lifecycle.start + lifecycle.end
- Context spans inferred from model.usage context metadata

**inferred**: Estimated from indirect signals
- Missing tool_end events (use timeout or next event)
- Incomplete lifecycle spans (use last event timestamp)
- Parent-child relationships based on temporal containment

```typescript
function determineFidelity(span: NormalizedSpan, sourceEvents: OpenClawEvent[]): string {
  // Exact: Single event with duration
  if (sourceEvents.length === 1 && sourceEvents[0].durationMs) {
    return 'exact';
  }

  // Exact: Start/end pair with matching correlation ID
  if (sourceEvents.length === 2) {
    const [start, end] = sourceEvents;
    if (start.toolCallId === end.toolCallId || start.runId === end.runId) {
      return 'exact';
    }
  }

  // Derived: Multiple events with correlation
  if (sourceEvents.length > 2 && hasCorrelation(sourceEvents)) {
    return 'derived';
  }

  // Inferred: Estimated from context
  return 'inferred';
}
```

## Normalizer Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Normalizer                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │ Event Reader │─────▶│ Event Parser │                    │
│  └──────────────┘      └──────────────┘                    │
│         │                      │                             │
│         │                      ▼                             │
│         │              ┌──────────────┐                     │
│         │              │ Correlator   │                     │
│         │              └──────────────┘                     │
│         │                      │                             │
│         │                      ▼                             │
│         │              ┌──────────────┐                     │
│         │              │ Span Builder │                     │
│         │              └──────────────┘                     │
│         │                      │                             │
│         │                      ▼                             │
│         │              ┌──────────────┐                     │
│         │              │ Relationship │                     │
│         │              │   Resolver   │                     │
│         │              └──────────────┘                     │
│         │                      │                             │
│         ▼                      ▼                             │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │ Raw Storage  │      │ Span Writer  │                    │
│  │   (JSONL)    │      │  (SQLite)    │                    │
│  └──────────────┘      └──────────────┘                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Event Reader

Reads raw events from JSONL files:

```typescript
class EventReader {
  async readDiagnosticEvents(filePath: string): Promise<OpenClawEvent[]> {
    const lines = await readLines(filePath);
    return lines.map(line => JSON.parse(line));
  }

  async readAgentEvents(filePath: string): Promise<OpenClawEvent[]> {
    const lines = await readLines(filePath);
    return lines.map(line => JSON.parse(line));
  }

  async readAllEvents(traceDir: string): Promise<OpenClawEvent[]> {
    const diagnostic = await this.readDiagnosticEvents(`${traceDir}/diagnostic_events.jsonl`);
    const agent = await this.readAgentEvents(`${traceDir}/agent_events.jsonl`);

    // Merge and sort by timestamp
    return [...diagnostic, ...agent].sort((a, b) => a.ts - b.ts);
  }
}
```

### Event Parser

Validates and normalizes event structure:

```typescript
class EventParser {
  parse(rawEvent: any): OpenClawEvent {
    // Validate required fields
    if (!rawEvent.type || !rawEvent.ts) {
      throw new Error('Invalid event: missing type or ts');
    }

    // Normalize timestamp
    const ts = typeof rawEvent.ts === 'string' ? Date.parse(rawEvent.ts) : rawEvent.ts;

    // Extract correlation IDs
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
      // ... copy other fields
    };
  }
}
```

### Correlator

Groups related events:

```typescript
class Correlator {
  correlate(events: OpenClawEvent[]): EventGroup[] {
    const groups: EventGroup[] = [];

    // Group by runId
    const runMap = new Map<string, OpenClawEvent[]>();
    for (const event of events) {
      if (event.runId) {
        if (!runMap.has(event.runId)) {
          runMap.set(event.runId, []);
        }
        runMap.get(event.runId)!.push(event);
      }
    }

    // Within each run, group by toolCallId
    for (const [runId, runEvents] of runMap) {
      const toolMap = new Map<string, OpenClawEvent[]>();
      for (const event of runEvents) {
        if (event.toolCallId) {
          if (!toolMap.has(event.toolCallId)) {
            toolMap.set(event.toolCallId, []);
          }
          toolMap.get(event.toolCallId)!.push(event);
        }
      }

      groups.push({
        type: 'run',
        id: runId,
        events: runEvents,
        subgroups: Array.from(toolMap.entries()).map(([toolCallId, events]) => ({
          type: 'tool',
          id: toolCallId,
          events,
        })),
      });
    }

    return groups;
  }
}
```

### Span Builder

Constructs normalized spans from event groups:

```typescript
class SpanBuilder {
  buildSpan(events: OpenClawEvent[], category: string, subtype: string): NormalizedSpan {
    // Determine timing
    const startEvent = events[0];
    const endEvent = events[events.length - 1];

    let start_at: string;
    let end_at: string;
    let duration_ms: number;

    if (events.length === 1 && startEvent.durationMs) {
      // Single event with duration
      start_at = new Date(startEvent.ts).toISOString();
      end_at = new Date(startEvent.ts + startEvent.durationMs).toISOString();
      duration_ms = startEvent.durationMs;
    } else {
      // Start/end pair
      start_at = new Date(startEvent.ts).toISOString();
      end_at = new Date(endEvent.ts).toISOString();
      duration_ms = endEvent.ts - startEvent.ts;
    }

    // Extract metadata
    const metadata = this.extractMetadata(events, category);

    // Determine fidelity
    const fidelity = this.determineFidelity(events);

    return {
      record_id: generateSpanId(),
      trace_id: extractTraceId(events),
      category,
      subtype,
      name: this.generateSpanName(category, subtype, metadata),
      start_at,
      end_at,
      duration_ms,
      status: this.determineStatus(events),
      fidelity,
      ...metadata,
      attributes: this.extractAttributes(events),
    };
  }

  private extractMetadata(events: OpenClawEvent[], category: string): Partial<NormalizedSpan> {
    const metadata: Partial<NormalizedSpan> = {};

    // Extract category-specific fields
    switch (category) {
      case 'MODEL':
        metadata.model_name = events[0].model;
        metadata.provider = events[0].provider;
        metadata.token_input = events[0].tokens?.input;
        metadata.token_output = events[0].tokens?.output;
        metadata.token_cache = events[0].tokens?.cacheRead;
        metadata.costUsd = events[0].costUsd;
        break;

      case 'TOOL':
        metadata.tool_name = events[0].data?.toolName;
        metadata.toolCallId = events[0].toolCallId;
        break;

      case 'WEBHOOK':
      case 'MESSAGE':
        metadata.channel = events[0].channel;
        metadata.updateType = events[0].updateType;
        break;

      case 'SESSION':
      case 'QUEUE':
        metadata.sessionKey = events[0].sessionKey;
        metadata.queueDepth = events[0].queueDepth;
        metadata.lane = events[0].lane;
        break;

      case 'RUN':
        metadata.runId = events[0].runId;
        break;
    }

    // Extract common correlation fields
    metadata.runId = events[0].runId;
    metadata.sessionKey = events[0].sessionKey;
    metadata.seq = events[0].seq;

    return metadata;
  }
}
```

### Relationship Resolver

Establishes parent-child and causal relationships:

```typescript
class RelationshipResolver {
  resolve(spans: NormalizedSpan[]): void {
    // Sort by start time
    spans.sort((a, b) => a.start_at.localeCompare(b.start_at));

    // Group by runId
    const runGroups = groupBy(spans, 'runId');

    for (const [runId, runSpans] of Object.entries(runGroups)) {
      // Find lifecycle span (root)
      const lifecycleSpan = runSpans.find(s => s.category === 'AGENT' && s.subtype === 'lifecycle');

      // Assign parents
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

  private findNarrowestContainer(span: NormalizedSpan, candidates: NormalizedSpan[]): NormalizedSpan | null {
    let narrowest: NormalizedSpan | null = null;
    let narrowestDuration = Infinity;

    for (const candidate of candidates) {
      if (candidate.record_id === span.record_id) continue;

      // Check temporal containment
      if (candidate.start_at <= span.start_at && candidate.end_at >= span.end_at) {
        if (candidate.duration_ms < narrowestDuration) {
          narrowest = candidate;
          narrowestDuration = candidate.duration_ms;
        }
      }
    }

    return narrowest;
  }

  private resolveCausalRelationships(spans: NormalizedSpan[]): void {
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
}
```

### Span Writer

Writes normalized spans to SQLite:

```typescript
class SpanWriter {
  async writeSpans(spans: NormalizedSpan[], db: Database): Promise<void> {
    const stmt = db.prepare(`
      INSERT INTO spans (
        record_id, trace_id, category, subtype, name,
        start_at, end_at, duration_ms,
        parent_span_id, caused_by_span_id,
        status, fidelity,
        runId, sessionKey, toolCallId, channel, lane, seq,
        model_name, provider, tool_name,
        token_input, token_output, token_cache, costUsd,
        queueDepth, updateType,
        attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const span of spans) {
      stmt.run(
        span.record_id,
        span.trace_id,
        span.category,
        span.subtype,
        span.name,
        span.start_at,
        span.end_at,
        span.duration_ms,
        span.parent_span_id || null,
        span.caused_by_span_id || null,
        span.status,
        span.fidelity,
        span.runId || null,
        span.sessionKey || null,
        span.toolCallId || null,
        span.channel || null,
        span.lane || null,
        span.seq || null,
        span.model_name || null,
        span.provider || null,
        span.tool_name || null,
        span.token_input || null,
        span.token_output || null,
        span.token_cache || null,
        span.costUsd || null,
        span.queueDepth || null,
        span.updateType || null,
        JSON.stringify(span.attributes)
      );
    }

    stmt.finalize();
  }
}
```

## Processing Modes

### Batch Mode (Replay)

Process complete trace files:

```typescript
async function normalizeBatch(traceDir: string, outputDb: string): Promise<void> {
  // Read all events
  const reader = new EventReader();
  const events = await reader.readAllEvents(traceDir);

  // Parse events
  const parser = new EventParser();
  const parsedEvents = events.map(e => parser.parse(e));

  // Correlate events
  const correlator = new Correlator();
  const groups = correlator.correlate(parsedEvents);

  // Build spans
  const builder = new SpanBuilder();
  const spans: NormalizedSpan[] = [];
  for (const group of groups) {
    const groupSpans = builder.buildSpansFromGroup(group);
    spans.push(...groupSpans);
  }

  // Resolve relationships
  const resolver = new RelationshipResolver();
  resolver.resolve(spans);

  // Write to database
  const db = await openDatabase(outputDb);
  const writer = new SpanWriter();
  await writer.writeSpans(spans, db);
}
```

### Streaming Mode (Live)

Process events incrementally:

```typescript
class StreamingNormalizer {
  private eventBuffer: OpenClawEvent[] = [];
  private pendingSpans: Map<string, Partial<NormalizedSpan>> = new Map();

  async processEvent(event: OpenClawEvent): Promise<NormalizedSpan[]> {
    // Add to buffer
    this.eventBuffer.push(event);

    // Try to complete pending spans
    const completedSpans: NormalizedSpan[] = [];

    // Check for span completion
    if (event.type === 'tool_end' && event.toolCallId) {
      const span = this.completeToolSpan(event.toolCallId);
      if (span) completedSpans.push(span);
    }

    if (event.type === 'lifecycle' && event.data?.phase === 'end') {
      const span = this.completeLifecycleSpan(event.runId);
      if (span) completedSpans.push(span);
    }

    // Single-event spans (model.usage, etc.)
    if (event.type === 'model.usage') {
      const span = this.buildModelSpan(event);
      completedSpans.push(span);
    }

    return completedSpans;
  }

  private completeToolSpan(toolCallId: string): NormalizedSpan | null {
    // Find tool_start event
    const startEvent = this.eventBuffer.find(e =>
      e.type === 'tool_start' && e.toolCallId === toolCallId
    );
    const endEvent = this.eventBuffer.find(e =>
      e.type === 'tool_end' && e.toolCallId === toolCallId
    );

    if (!startEvent || !endEvent) return null;

    // Build span
    const builder = new SpanBuilder();
    return builder.buildSpan([startEvent, endEvent], 'TOOL', 'tool_execution');
  }
}
```

## Error Handling

### Missing Events

Handle incomplete event sequences:

```typescript
function handleMissingEnd(startEvent: OpenClawEvent, timeout: number = 30000): NormalizedSpan {
  // Estimate end time
  const estimatedEnd = startEvent.ts + timeout;

  return {
    record_id: generateSpanId(),
    category: categorizeEvent(startEvent.type),
    subtype: startEvent.type,
    start_at: new Date(startEvent.ts).toISOString(),
    end_at: new Date(estimatedEnd).toISOString(),
    duration_ms: timeout,
    status: 'timeout',
    fidelity: 'inferred',
    attributes: {
      incomplete: true,
      reason: 'missing_end_event',
    },
  };
}
```

### Duplicate Events

Handle duplicate event emissions:

```typescript
function deduplicateEvents(events: OpenClawEvent[]): OpenClawEvent[] {
  const seen = new Set<string>();
  const unique: OpenClawEvent[] = [];

  for (const event of events) {
    // Create fingerprint
    const fingerprint = `${event.type}:${event.ts}:${event.runId}:${event.seq}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(event);
    }
  }

  return unique;
}
```

### Out-of-Order Events

Handle events arriving out of sequence:

```typescript
function reorderEvents(events: OpenClawEvent[]): OpenClawEvent[] {
  // Sort by timestamp, then by sequence number
  return events.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.seq !== undefined && b.seq !== undefined) return a.seq - b.seq;
    return 0;
  });
}
```

## Validation

### Span Validation

Ensure normalized spans are valid:

```typescript
function validateSpan(span: NormalizedSpan): ValidationResult {
  const errors: string[] = [];

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
    errors.push('duration_ms does not match start_at/end_at');
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
```

### Relationship Validation

Ensure parent-child relationships are valid:

```typescript
function validateRelationships(spans: NormalizedSpan[]): ValidationResult {
  const errors: string[] = [];
  const spanMap = new Map(spans.map(s => [s.record_id, s]));

  for (const span of spans) {
    // Validate parent exists
    if (span.parent_span_id) {
      const parent = spanMap.get(span.parent_span_id);
      if (!parent) {
        errors.push(`Span ${span.record_id} references non-existent parent ${span.parent_span_id}`);
      } else {
        // Validate temporal containment
        if (parent.start_at > span.start_at || parent.end_at < span.end_at) {
          errors.push(`Parent ${parent.record_id} does not temporally contain child ${span.record_id}`);
        }
      }
    }

    // Validate caused_by exists
    if (span.caused_by_span_id) {
      const cause = spanMap.get(span.caused_by_span_id);
      if (!cause) {
        errors.push(`Span ${span.record_id} references non-existent cause ${span.caused_by_span_id}`);
      } else {
        // Validate causal ordering
        if (cause.end_at > span.start_at) {
          errors.push(`Cause ${cause.record_id} ends after effect ${span.record_id} starts`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

## Performance Considerations

### Memory Management

For large traces, process in chunks:

```typescript
async function normalizeInChunks(events: OpenClawEvent[], chunkSize: number = 1000): Promise<NormalizedSpan[]> {
  const spans: NormalizedSpan[] = [];

  for (let i = 0; i < events.length; i += chunkSize) {
    const chunk = events.slice(i, i + chunkSize);
    const chunkSpans = await normalizeChunk(chunk);
    spans.push(...chunkSpans);

    // Allow garbage collection
    if (i % (chunkSize * 10) === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return spans;
}
```

### Indexing Strategy

Create indexes before bulk insert:

```typescript
async function optimizeForBulkInsert(db: Database): Promise<void> {
  // Drop indexes
  await db.exec('DROP INDEX IF EXISTS idx_spans_trace_id');
  await db.exec('DROP INDEX IF EXISTS idx_spans_category');
  // ... drop other indexes

  // Disable synchronous mode for faster writes
  await db.exec('PRAGMA synchronous = OFF');
  await db.exec('PRAGMA journal_mode = MEMORY');
}

async function restoreIndexes(db: Database): Promise<void> {
  // Recreate indexes
  await db.exec('CREATE INDEX idx_spans_trace_id ON spans(trace_id)');
  await db.exec('CREATE INDEX idx_spans_category ON spans(category)');
  // ... recreate other indexes

  // Restore synchronous mode
  await db.exec('PRAGMA synchronous = FULL');
  await db.exec('PRAGMA journal_mode = DELETE');
}
```

## Testing Strategy

### Unit Tests

Test individual components:

```typescript
describe('SpanBuilder', () => {
  it('should build MODEL span from model.usage event', () => {
    const event: OpenClawEvent = {
      type: 'model.usage',
      ts: 1710778500000,
      durationMs: 2500,
      runId: 'run_001',
      model: 'claude-opus-4',
      tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
      costUsd: 0.005,
    };

    const builder = new SpanBuilder();
    const span = builder.buildSpan([event], 'MODEL', 'model.usage');

    expect(span.category).toBe('MODEL');
    expect(span.duration_ms).toBe(2500);
    expect(span.model_name).toBe('claude-opus-4');
    expect(span.costUsd).toBe(0.005);
  });

  it('should build TOOL span from tool_start + tool_end events', () => {
    const startEvent: OpenClawEvent = {
      type: 'tool_start',
      ts: 1710778500000,
      toolCallId: 'toolu_001',
      runId: 'run_001',
      data: { toolName: 'Bash', args: { command: 'ls' } },
    };

    const endEvent: OpenClawEvent = {
      type: 'tool_end',
      ts: 1710778502500,
      toolCallId: 'toolu_001',
      runId: 'run_001',
      data: { durationMs: 2500 },
    };

    const builder = new SpanBuilder();
    const span = builder.buildSpan([startEvent, endEvent], 'TOOL', 'tool_execution');

    expect(span.category).toBe('TOOL');
    expect(span.duration_ms).toBe(2500);
    expect(span.tool_name).toBe('Bash');
  });
});
```

### Integration Tests

Test end-to-end normalization:

```typescript
describe('Normalizer Integration', () => {
  it('should normalize complete OpenClaw trace', async () => {
    // Load sample trace
    const events = await loadSampleTrace('openclaw-basic-trace.json');

    // Normalize
    const normalizer = new Normalizer();
    const spans = await normalizer.normalize(events);

    // Validate
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every(s => validateSpan(s).valid)).toBe(true);
    expect(validateRelationships(spans).valid).toBe(true);
  });
});
```

## Next Steps

1. Implement normalizer components in TypeScript/JavaScript
2. Create comprehensive test suite with sample OpenClaw traces
3. Validate against Phase 2 exit criteria
4. Integrate with storage layer (Task #15)
5. Test with viewer (Phase 3)

## References

- [OpenClaw Source Analysis](../research/openclaw-source-analysis.md)
- [Event Model](event-model.md)
- [Storage Design](storage-design.md)
- [Architecture](../foundation/architecture.md)
