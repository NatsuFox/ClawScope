# ClawScope Event Model

This document defines the normalized event/span model for the OpenClaw-first MVP, based on direct source code analysis of OpenClaw's event emission architecture.

See [philosophy.md](../foundation/philosophy.md) for the product constraints behind this model, [architecture.md](../foundation/architecture.md) for where this model sits in the system, and [openclaw-source-analysis.md](../research/openclaw-source-analysis.md) for the source-level findings that inform this model.

## Modeling stance

This trace model is driven by **observable OpenClaw runtime behavior** as documented in the source code analysis. OpenClaw implements a dual-event architecture with two independent systems:

1. **Diagnostic Events** (`src/infra/diagnostic-events.ts`) - Infrastructure-level telemetry for operations, performance, and system health
2. **Agent Events** (`src/infra/agent-events.ts`) - Agent runtime lifecycle, tool execution, and assistant streaming

Both systems use an in-process event emitter pattern with listener registration, and are instrumented via the `diagnostics-otel` extension which exports to OpenTelemetry (OTLP) for traces, metrics, and logs.

## Core modeling rules

### 1. Spans and instant events are distinct

The waterfall UI is driven primarily by **spans** rather than point events.

- **span**: occupies time, has `start_at` and `end_at`
- **instant event**: occurs at a single point in time

Examples:

- `model_request` is a span
- `tool_execution` is a span
- `subagent_execution` is a span
- `subagent_spawned` is an instant event
- `response_emitted` is an instant event

### 2. Use coarse categories plus fine-grained subtypes

The model should support two layers at once:

- **coarse category** for stable viewer grouping
- **fine-grained subtype** for deeper analysis

This keeps the primary UI legible without losing analytical depth.

### 3. Preserve temporal and causal structure

Chronology alone is not enough for multi-agent systems. The normalized model should preserve:

- parent/child nesting
- cause/effect links
- agent-to-agent delegation relationships

### 4. Preserve fidelity metadata

Some records will come from direct instrumentation, some from reconstruction, and some from inference. Each normalized record should state its observability quality explicitly.

## Draft normalized record shape

Not every field is required on every record, but the normalized model should support at least the following.

| Field | Purpose |
| --- | --- |
| `trace_id` | Identifies the top-level execution trace |
| `record_id` | Unique ID for the normalized event/span |
| `record_kind` | `span` or `instant` |
| `category` | Coarse viewer grouping such as `MODEL`, `TOOL`, `AGENT`, `WEBHOOK`, `MESSAGE`, `SESSION`, `QUEUE` |
| `subtype` | Fine-grained runtime subtype such as `model.usage`, `tool_start`, `webhook.received` |
| `name` | Human-readable label for the viewer |
| `start_at` | Start timestamp for spans |
| `end_at` | End timestamp for spans |
| `timestamp` | Timestamp for instant events |
| `duration_ms` | Duration for spans |
| `parent_span_id` | Structural nesting relationship |
| `caused_by_span_id` | Causal relationship when different from structural nesting |
| `run_id` | Unique run identifier (OpenClaw `runId`) |
| `session_key` | Session correlation identifier (OpenClaw `sessionKey`) |
| `tool_call_id` | Tool execution identifier (OpenClaw `toolCallId`) |
| `seq` | Monotonic sequence number (per runId or global) |
| `ts` | Unix timestamp in milliseconds |
| `agent_id` | Runtime actor that emitted or owns the record |
| `origin_agent_id` | Agent that initiated the action |
| `target_agent_id` | Target agent in delegation/handoff flows |
| `status` | Success, error, cancelled, partial, retried |
| `model_name` | Model identifier when applicable |
| `provider` | Model provider (e.g., "anthropic", "openai") |
| `tool_name` | Tool identifier when applicable |
| `tokens.input` | Input token count |
| `tokens.output` | Output token count |
| `tokens.cache_read` | Cache read token count |
| `tokens.cache_write` | Cache write token count |
| `tokens.total` | Total token count |
| `cost_usd` | Monetary cost in USD |
| `context.limit` | Context window limit |
| `context.used` | Context tokens used |
| `channel` | Messaging channel (e.g., "discord", "telegram") |
| `update_type` | Webhook update type |
| `queue_depth` | Queue depth at event time |
| `lane` | Queue lane identifier |
| `attempt` | Retry attempt number |
| `fidelity` | `exact`, `derived`, or `inferred` |
| `raw_refs` | Pointers to raw records used to construct this item |
| `attributes` | Extensible metadata bag for source-specific details |

## Coarse categories

These categories are derived from OpenClaw's actual event emission architecture and drive visualization grouping.

| Category | Meaning | OpenClaw Source |
| --- | --- | --- |
| `MODEL` | Model request, streaming, completion, token usage | Diagnostic events: `model.usage` |
| `TOOL` | Tool selection and execution | Agent events: `tool` stream |
| `AGENT` | Agent lifecycle, delegation, termination | Agent events: `lifecycle` stream |
| `WEBHOOK` | External webhook ingress from messaging platforms | Diagnostic events: `webhook.*` |
| `MESSAGE` | Message queueing and processing | Diagnostic events: `message.*` |
| `SESSION` | Session state transitions and health | Diagnostic events: `session.*` |
| `QUEUE` | Command queue operations | Diagnostic events: `queue.lane.*` |
| `RUN` | Agent run retry attempts | Diagnostic events: `run.attempt` |
| `CONTEXT` | Context assembly, window usage | Model usage metadata: `context.*` |
| `SYSTEM` | System health, heartbeat, diagnostics | Diagnostic events: `diagnostic.heartbeat` |

## OpenClaw event subtypes

These subtypes are derived from actual OpenClaw source code analysis and represent the real event emission points.

### MODEL

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `model.usage` - LLM token usage and cost tracking (emitted after API call completion)

**Metadata:**
- `provider` (string) - Model provider (e.g., "anthropic", "openai")
- `model` (string) - Model name (e.g., "claude-opus-4")
- `usage.input` (number) - Input tokens
- `usage.output` (number) - Output tokens
- `usage.cacheRead` (number) - Cache read tokens
- `usage.cacheWrite` (number) - Cache write tokens
- `usage.total` (number) - Total tokens
- `costUsd` (number) - Estimated cost in USD
- `durationMs` (number) - Request duration
- `context.limit` (number) - Context window limit
- `context.used` (number) - Context tokens used
- `sessionKey` (string) - Session identifier
- `channel` (string) - Messaging channel

**Fidelity:** Exact (directly from LLM API response)

### TOOL

**Source:** Agent events (`src/infra/agent-events.ts`, stream: `tool`)

- `tool_start` - Tool execution begins
- `tool_end` - Tool execution completes
- `tool_result` - Tool result available
- `tool.loop` - Tool loop detection warning (diagnostic event)

**Metadata:**
- `runId` (string) - Unique run identifier
- `toolCallId` (string) - Tool call identifier
- `toolName` (string) - Normalized tool name
- `args` (unknown) - Tool arguments
- `meta` (string) - Tool metadata
- `durationMs` (number) - Execution duration
- `result` (unknown) - Tool result (sanitized)
- `isError` (boolean) - Error flag
- `errorMessage` (string) - Error message
- `sessionKey` (string) - Session identifier

**Fidelity:** Exact (directly from tool runtime)

### AGENT

**Source:** Agent events (`src/infra/agent-events.ts`, stream: `lifecycle`)

- `lifecycle.start` - Agent run begins
- `lifecycle.end` - Agent run completes successfully
- `lifecycle.error` - Agent run terminates with error
- `lifecycle.compaction` - Context compaction event

**Metadata:**
- `runId` (string) - Unique run identifier
- `phase` (string) - "start", "end", "error", "compaction"
- `startedAt` (number) - Start timestamp
- `endedAt` (number) - End timestamp
- `error` (string) - Error message (if phase=error)
- `sessionKey` (string) - Session identifier

**Fidelity:** Exact (directly from agent runtime)

### WEBHOOK

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `webhook.received` - Incoming webhook from messaging platform
- `webhook.processed` - Webhook processing completion
- `webhook.error` - Webhook processing failure

**Metadata:**
- `channel` (string) - Messaging channel
- `updateType` (string) - Webhook update type
- `chatId` (string) - Platform-specific chat identifier
- `durationMs` (number) - Processing duration
- `error` (string) - Error message (if error)

**Fidelity:** Exact (directly from channel handlers)

### MESSAGE

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `message.queued` - Message added to processing queue
- `message.processed` - Message processing completion

**Metadata:**
- `channel` (string) - Messaging channel
- `source` (string) - Message source
- `queueDepth` (number) - Queue depth at enqueue time
- `outcome` (string) - "completed", "skipped", or "error"
- `durationMs` (number) - Processing duration
- `sessionKey` (string) - Session identifier
- `messageId` (string) - Platform-specific message identifier
- `chatId` (string) - Platform-specific chat identifier
- `reason` (string) - Outcome reason
- `error` (string) - Error message (if error)

**Fidelity:** Exact (directly from queue and session manager)

### SESSION

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `session.state` - Session state transition
- `session.stuck` - Session stuck in processing

**Metadata:**
- `prevState` (string) - Previous state
- `state` (string) - Current state ("idle", "processing", "waiting")
- `reason` (string) - Transition reason
- `queueDepth` (number) - Queue depth
- `sessionKey` (string) - Session identifier
- `ageMs` (number) - Session age (for stuck events)

**Fidelity:** Exact (directly from session manager)

### QUEUE

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `queue.lane.enqueue` - Command queue lane enqueue
- `queue.lane.dequeue` - Command queue lane dequeue

**Metadata:**
- `lane` (string) - Queue lane identifier
- `queueSize` (number) - Queue size after operation
- `waitMs` (number) - Wait time before dequeue

**Fidelity:** Exact (directly from queue state)

### RUN

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `run.attempt` - Agent run retry attempt

**Metadata:**
- `runId` (string) - Unique run identifier
- `attempt` (number) - Attempt number

**Fidelity:** Exact (directly from retry logic)

### CONTEXT

**Source:** Model usage metadata (embedded in `model.usage` events)

Context events are not emitted as separate events but are tracked as metadata within model usage events:

- `context.limit` - Context window limit
- `context.used` - Context tokens used

Context compaction events appear in the agent lifecycle stream as `lifecycle.compaction`.

**Fidelity:** Exact (directly from LLM API response)

### SYSTEM

**Source:** Diagnostic events (`src/infra/diagnostic-events.ts`)

- `diagnostic.heartbeat` - Periodic system health snapshot

**Metadata:**
- `webhooks` (number) - Active webhook count
- `active` (number) - Active session count
- `waiting` (number) - Waiting session count
- `queued` (number) - Queued message count

**Fidelity:** Derived (aggregated from system state)

## Span candidates vs instant-event candidates

Based on OpenClaw's actual event emission patterns:

| Likely span | Likely instant event |
| --- | --- |
| model request lifecycle (start to completion) | model.usage (point-in-time cost/token snapshot) |
| tool execution lifecycle (tool_start to tool_end) | tool_result (result availability) |
| agent run lifecycle (lifecycle.start to lifecycle.end) | lifecycle.error (error occurrence) |
| webhook processing (webhook.received to webhook.processed) | webhook.error (error occurrence) |
| message processing (message.queued to message.processed) | session.state (state transition) |
| - | session.stuck (stuck detection) |
| - | queue.lane.enqueue (enqueue event) |
| - | queue.lane.dequeue (dequeue event) |
| - | run.attempt (retry attempt) |
| - | diagnostic.heartbeat (health snapshot) |

**Note:** OpenClaw emits primarily instant events with duration metadata rather than explicit span start/end pairs. ClawScope's normalization layer should reconstruct spans from correlated instant events where appropriate (e.g., pairing `tool_start` with `tool_end` using `toolCallId`).

## Causality and multi-agent relationships

For multi-agent traces, the model must preserve at least two different relationships:

### Structural nesting

Represented by `parent_span_id`, this captures containment such as a tool span nested under a model-driven decision span.

### Causal linkage

Represented by `caused_by_span_id`, this captures situations where one span caused another even if the two are not neatly nested in the same structural hierarchy.

### Agent relationships

Use `origin_agent_id` and `target_agent_id` to show delegation, handoff, or sub-agent spawning. These fields support the hierarchy/DAG view described in [visualization.md](../visualization/visualization.md).

### Event correlation in OpenClaw

OpenClaw provides multiple correlation identifiers:

| Identifier | Scope | Description |
|------------|-------|-------------|
| `runId` | Agent Run | Unique identifier for a single agent execution |
| `sessionKey` | Session | Persistent session identifier across runs |
| `toolCallId` | Tool Call | Unique identifier for a tool execution |
| `chatId` | Chat | Platform-specific chat identifier |
| `messageId` | Message | Platform-specific message identifier |
| `seq` | Event | Monotonic sequence number (per runId or global) |
| `ts` | Event | Unix timestamp (milliseconds) |

**Correlation Strategy:**
- Use `runId` as primary correlation key for agent runs
- Use `sessionKey` for cross-run session correlation
- Use `toolCallId` for tool execution correlation
- Use `seq` for event ordering within a run
- Use `ts` for global chronological ordering

## Fidelity markers

Each normalized item should carry a fidelity marker:

| Fidelity | Meaning |
| --- | --- |
| `exact` | directly observed from runtime instrumentation or unambiguous raw source data |
| `derived` | computed from multiple direct records with high confidence |
| `inferred` | reconstructed from indirect evidence or partial signals |

### OpenClaw fidelity classification

Based on source code analysis:

**Exact Fidelity Events:**
- Model Usage - Direct from LLM API response (tokens, cost, duration)
- Webhook Events - Direct from messaging platform webhooks
- Tool Execution - Direct from tool runtime (args, result, duration)
- Queue Events - Direct from queue state (depth, wait time)
- Session State - Direct from session manager (state transitions)
- Agent Lifecycle - Direct from agent runtime (start, end, error)

**Derived Fidelity Events:**
- Session Stuck - Derived from session age and state
- Tool Loop Detection - Derived from tool call history analysis
- Diagnostic Heartbeat - Aggregated from system state

**Inferred Fidelity Events:**
- Agent Error Classification - Inferred from error message patterns
- Failover Reason - Inferred from API error codes

This classification is important because the OpenClaw-first MVP starts with high-quality observability for most events, with only a small subset requiring reconstruction or inference.

## Reconstructability requirement

The event model is only sufficient if persisted normalized records can fully reconstruct the intended replay viewer. That means the stored model must be rich enough to support:

- waterfall timeline positioning
- cost and time aggregation
- multi-agent swimlanes
- sub-agent hierarchy or DAG views
- drill-down from summaries to exact trace records

## Example event structures from OpenClaw

These examples are derived from actual OpenClaw source code.

### Model Usage Event

```typescript
{
  type: "model.usage",
  seq: 42,
  ts: 1710789123456,
  provider: "anthropic",
  model: "claude-opus-4",
  usage: {
    input: 1500,
    output: 300,
    cacheRead: 500,
    cacheWrite: 200,
    total: 2500
  },
  costUsd: 0.0375,
  durationMs: 2340,
  context: {
    limit: 200000,
    used: 2000
  },
  sessionKey: "discord:123456789:987654321",
  channel: "discord"
}
```

### Tool Execution Sequence

```typescript
// Tool Start
{
  runId: "run_abc123",
  stream: "tool",
  seq: 5,
  ts: 1710789123456,
  data: {
    phase: "tool_start",
    toolCallId: "call_xyz789",
    toolName: "read_file",
    args: { path: "/path/to/file.ts" },
    meta: "Reading source file"
  },
  sessionKey: "discord:123456789:987654321"
}

// Tool End
{
  runId: "run_abc123",
  stream: "tool",
  seq: 6,
  ts: 1710789125796,
  data: {
    phase: "tool_end",
    toolCallId: "call_xyz789",
    toolName: "read_file",
    durationMs: 2340
  },
  sessionKey: "discord:123456789:987654321"
}

// Tool Result
{
  runId: "run_abc123",
  stream: "tool",
  seq: 7,
  ts: 1710789125800,
  data: {
    phase: "tool_result",
    toolCallId: "call_xyz789",
    toolName: "read_file",
    result: "export function example() { ... }",
    isError: false
  },
  sessionKey: "discord:123456789:987654321"
}
```

### Agent Lifecycle Sequence

```typescript
// Agent Start
{
  runId: "run_abc123",
  stream: "lifecycle",
  seq: 1,
  ts: 1710789120000,
  data: {
    phase: "start",
    startedAt: 1710789120000
  },
  sessionKey: "discord:123456789:987654321"
}

// Agent End (Success)
{
  runId: "run_abc123",
  stream: "lifecycle",
  seq: 15,
  ts: 1710789130000,
  data: {
    phase: "end",
    endedAt: 1710789130000
  },
  sessionKey: "discord:123456789:987654321"
}

// Agent End (Error)
{
  runId: "run_abc123",
  stream: "lifecycle",
  seq: 15,
  ts: 1710789130000,
  data: {
    phase: "error",
    error: "API rate limit exceeded",
    endedAt: 1710789130000
  },
  sessionKey: "discord:123456789:987654321"
}
```

### Webhook Processing Sequence

```typescript
// Webhook Received
{
  type: "webhook.received",
  seq: 100,
  ts: 1710789100000,
  channel: "discord",
  updateType: "message",
  chatId: "987654321"
}

// Webhook Processed
{
  type: "webhook.processed",
  seq: 101,
  ts: 1710789130000,
  channel: "discord",
  updateType: "message",
  durationMs: 30000,
  chatId: "987654321"
}

// Webhook Error
{
  type: "webhook.error",
  seq: 101,
  ts: 1710789130000,
  channel: "discord",
  updateType: "message",
  error: "Failed to process webhook: timeout",
  chatId: "987654321"
}
```

### Message Processing Sequence

```typescript
// Message Queued
{
  type: "message.queued",
  seq: 200,
  ts: 1710789100500,
  channel: "discord",
  source: "webhook",
  queueDepth: 3,
  sessionKey: "discord:123456789:987654321"
}

// Message Processed
{
  type: "message.processed",
  seq: 201,
  ts: 1710789130500,
  channel: "discord",
  outcome: "completed",
  durationMs: 30000,
  sessionKey: "discord:123456789:987654321",
  messageId: "msg_123",
  chatId: "987654321"
}
```

### Session State Transition

```typescript
{
  type: "session.state",
  seq: 300,
  ts: 1710789100600,
  prevState: "idle",
  state: "processing",
  reason: "message_received",
  queueDepth: 2,
  sessionKey: "discord:123456789:987654321"
}
```

### Queue Operations

```typescript
// Enqueue
{
  type: "queue.lane.enqueue",
  seq: 400,
  ts: 1710789100700,
  lane: "default",
  queueSize: 5
}

// Dequeue
{
  type: "queue.lane.dequeue",
  seq: 401,
  ts: 1710789100800,
  lane: "default",
  queueSize: 4,
  waitMs: 100
}
```

## What this document is not

This document is not a generic agent framework event model. It is specifically grounded in OpenClaw's actual event emission architecture as documented in [openclaw-source-analysis.md](../research/openclaw-source-analysis.md).

The event model is based on:
- Direct source code analysis of OpenClaw's event systems
- Actual event emission points in the codebase
- Real metadata fields from runtime instrumentation
- Production-grade OpenTelemetry integration patterns

Future refinements should continue to track OpenClaw's event architecture as it evolves.
