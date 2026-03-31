# OpenClaw Source Code Analysis: Event Emission Architecture

**Analysis Date:** 2026-03-18
**Repository:** https://github.com/openclaw/openclaw
**Commit:** 0e9b899aee38614287a92ee1e2a0f790002504a7
**Commit Date:** 2026-03-18 15:54:02 +0530
**Version:** 2026.3.14
**Source Files Analyzed:** 4,761 TypeScript files in `src/`, 1,817 in `extensions/`

---

## Executive Summary

OpenClaw implements a **dual-event architecture** with two independent event systems:

1. **Diagnostic Events** (`src/infra/diagnostic-events.ts`) - Infrastructure-level telemetry for operations, performance, and system health
2. **Agent Events** (`src/infra/agent-events.ts`) - Agent runtime lifecycle, tool execution, and assistant streaming

Both systems use an **in-process event emitter pattern** with listener registration, and are instrumented via the **diagnostics-otel extension** (`extensions/diagnostics-otel/`) which exports to OpenTelemetry (OTLP) for traces, metrics, and logs.

---

## Repository Structure

```
openclaw-source/
├── src/                          # Core source (4,761 .ts files)
│   ├── agents/                   # Agent runtime & Pi integration
│   ├── gateway/                  # WebSocket/HTTP gateway server
│   ├── infra/                    # Infrastructure (events, diagnostics)
│   ├── auto-reply/               # Auto-reply agent execution
│   ├── channels/                 # Messaging channel integrations
│   ├── commands/                 # CLI commands
│   ├── config/                   # Configuration management
│   ├── plugins/                  # Plugin system
│   └── ...
├── extensions/                   # Plugin extensions (1,817 .ts files)
│   ├── diagnostics-otel/         # OpenTelemetry exporter
│   ├── anthropic/                # Anthropic provider
│   ├── discord/                  # Discord channel
│   └── ...
├── package.json                  # Main package manifest
└── tsconfig.json                 # TypeScript configuration
```

---

## Event System Architecture

### 1. Diagnostic Events System

**Location:** `src/infra/diagnostic-events.ts`

**Purpose:** Infrastructure-level telemetry for operations, performance, and system health monitoring.

**Event Types:**

| Event Type | Category | Description | Key Metadata |
|------------|----------|-------------|--------------|
| `model.usage` | MODEL | LLM token usage and cost tracking | tokens (input/output/cache), cost, duration, model, provider |
| `webhook.received` | WEBHOOK | Incoming webhook from messaging platform | channel, updateType, chatId |
| `webhook.processed` | WEBHOOK | Webhook processing completion | channel, updateType, durationMs |
| `webhook.error` | WEBHOOK | Webhook processing failure | channel, error message |
| `message.queued` | MESSAGE | Message added to processing queue | channel, source, queueDepth |
| `message.processed` | MESSAGE | Message processing completion | channel, outcome, durationMs, sessionKey |
| `session.state` | SESSION | Session state transition | prevState, state, reason, queueDepth |
| `session.stuck` | SESSION | Session stuck in processing | state, ageMs, queueDepth |
| `queue.lane.enqueue` | QUEUE | Command queue lane enqueue | lane, queueSize |
| `queue.lane.dequeue` | QUEUE | Command queue lane dequeue | lane, queueSize, waitMs |
| `run.attempt` | RUN | Agent run retry attempt | runId, attempt number |
| `diagnostic.heartbeat` | SYSTEM | Periodic system health snapshot | webhooks, active, waiting, queued |
| `tool.loop` | TOOL | Tool loop detection warning | toolName, level, action, detector, count |

**Emission Pattern:**

```typescript
// src/infra/diagnostic-events.ts:195-227
export function emitDiagnosticEvent(event: DiagnosticEventInput) {
  const state = getDiagnosticEventsState();

  // Recursion guard
  if (state.dispatchDepth > 100) {
    console.error(`[diagnostic-events] recursion guard tripped`);
    return;
  }

  // Enrich with sequence number and timestamp
  const enriched = {
    ...event,
    seq: (state.seq += 1),
    ts: Date.now(),
  } satisfies DiagnosticEventPayload;

  // Dispatch to all registered listeners
  state.dispatchDepth += 1;
  for (const listener of state.listeners) {
    try {
      listener(enriched);
    } catch (err) {
      console.error(`[diagnostic-events] listener error`);
    }
  }
  state.dispatchDepth -= 1;
}
```

**Listener Registration:**

```typescript
// src/infra/diagnostic-events.ts:229-235
export function onDiagnosticEvent(
  listener: (evt: DiagnosticEventPayload) => void
): () => void {
  const state = getDiagnosticEventsState();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
```

**Global State Management:**

```typescript
// src/infra/diagnostic-events.ts:177-189
function getDiagnosticEventsState(): DiagnosticEventsGlobalState {
  const globalStore = globalThis as typeof globalThis & {
    __openclawDiagnosticEventsState?: DiagnosticEventsGlobalState;
  };
  if (!globalStore.__openclawDiagnosticEventsState) {
    globalStore.__openclawDiagnosticEventsState = {
      seq: 0,
      listeners: new Set<(evt: DiagnosticEventPayload) => void>(),
      dispatchDepth: 0,
    };
  }
  return globalStore.__openclawDiagnosticEventsState;
}
```

---

### 2. Agent Events System

**Location:** `src/infra/agent-events.ts`

**Purpose:** Agent runtime lifecycle, tool execution, and assistant streaming events.

**Event Streams:**

| Stream | Description | Example Events |
|--------|-------------|----------------|
| `lifecycle` | Agent run lifecycle phases | start, end, error, compaction |
| `tool` | Tool execution events | tool_start, tool_end, tool_result |
| `assistant` | Assistant text streaming | text deltas, message chunks |
| `error` | Error events | runtime errors, API failures |

**Event Structure:**

```typescript
// src/infra/agent-events.ts:5-12
export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: AgentEventStream;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};
```

**Run Context Tracking:**

```typescript
// src/infra/agent-events.ts:14-20
export type AgentRunContext = {
  sessionKey?: string;
  verboseLevel?: VerboseLevel;
  isHeartbeat?: boolean;
  isControlUiVisible?: boolean;
};
```

**Emission Pattern:**

```typescript
// src/infra/agent-events.ts:62-83
export function emitAgentEvent(event: Omit<AgentEventPayload, "seq" | "ts">) {
  const nextSeq = (seqByRun.get(event.runId) ?? 0) + 1;
  seqByRun.set(event.runId, nextSeq);

  const context = runContextById.get(event.runId);
  const isControlUiVisible = context?.isControlUiVisible ?? true;
  const sessionKey = isControlUiVisible
    ? (event.sessionKey ?? context?.sessionKey)
    : undefined;

  const enriched: AgentEventPayload = {
    ...event,
    sessionKey,
    seq: nextSeq,
    ts: Date.now(),
  };

  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch {
      /* ignore */
    }
  }
}
```

---

## Event Emission Points (Source Code Analysis)

### Model Usage Events

**Location:** `src/auto-reply/reply/agent-runner-execution.ts`

**Emitted After:** LLM API call completion

**Metadata Available:**
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

---

### Webhook Events

**Location:** `src/channels/plugins/` (various channel implementations)

**Webhook Received:**
- **File:** Channel-specific webhook handlers
- **Event:** `webhook.received`
- **Metadata:** `channel`, `updateType`, `chatId`
- **Fidelity:** Exact

**Webhook Processed:**
- **File:** Channel-specific webhook handlers
- **Event:** `webhook.processed`
- **Metadata:** `channel`, `updateType`, `durationMs`, `chatId`
- **Fidelity:** Exact

**Webhook Error:**
- **File:** Channel-specific webhook handlers
- **Event:** `webhook.error`
- **Metadata:** `channel`, `updateType`, `error`, `chatId`
- **Fidelity:** Exact

---

### Message Processing Events

**Location:** `src/auto-reply/reply/queue.ts`

**Message Queued:**
- **Event:** `message.queued`
- **Metadata:** `channel`, `source`, `queueDepth`, `sessionKey`
- **Fidelity:** Exact

**Message Processed:**
- **Event:** `message.processed`
- **Metadata:** `channel`, `outcome` (completed/skipped/error), `durationMs`, `sessionKey`, `messageId`, `chatId`, `reason`, `error`
- **Fidelity:** Exact

---

### Session State Events

**Location:** `src/auto-reply/reply/` (session management)

**Session State Transition:**
- **Event:** `session.state`
- **Metadata:** `prevState`, `state` (idle/processing/waiting), `reason`, `queueDepth`, `sessionKey`
- **Fidelity:** Exact

**Session Stuck:**
- **Event:** `session.stuck`
- **Metadata:** `state`, `ageMs`, `queueDepth`, `sessionKey`
- **Fidelity:** Exact

---

### Queue Events

**Location:** `src/process/command-queue.ts`

**Lane Enqueue:**
- **Event:** `queue.lane.enqueue`
- **Metadata:** `lane`, `queueSize`
- **Fidelity:** Exact

**Lane Dequeue:**
- **Event:** `queue.lane.dequeue`
- **Metadata:** `lane`, `queueSize`, `waitMs`
- **Fidelity:** Exact

---

### Agent Lifecycle Events

**Location:** `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts`

**Agent Start:**
```typescript
// Line 17-31
export function handleAgentStart(ctx: EmbeddedPiSubscribeContext) {
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "lifecycle",
    data: {
      phase: "start",
      startedAt: Date.now(),
    },
  });
}
```

**Agent End:**
```typescript
// Line 33-95
export function handleAgentEnd(ctx: EmbeddedPiSubscribeContext) {
  const isError = isAssistantMessage(lastAssistant)
    && lastAssistant.stopReason === "error";

  if (isError) {
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: {
        phase: "error",
        error: safeErrorText,
        endedAt: Date.now(),
      },
    });
  } else {
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "lifecycle",
      data: {
        phase: "end",
        endedAt: Date.now(),
      },
    });
  }
}
```

**Metadata Available:**
- `runId` (string) - Unique run identifier
- `phase` (string) - "start", "end", "error"
- `startedAt` (number) - Start timestamp
- `endedAt` (number) - End timestamp
- `error` (string) - Error message (if phase=error)
- `sessionKey` (string) - Session identifier

**Fidelity:** Exact

---

### Tool Execution Events

**Location:** `src/agents/pi-embedded-subscribe.handlers.tools.ts`

**Tool Start:**
```typescript
// Line 342-345
emitAgentEvent({
  runId: ctx.params.runId,
  stream: "tool",
  data: {
    phase: "tool_start",
    toolCallId: evt.toolCallId,
    toolName: normalizedToolName,
    args: evt.args,
    meta: extendedMeta,
  },
});
```

**Tool End:**
```typescript
// Line 352-356
emitAgentEvent({
  runId: ctx.params.runId,
  stream: "tool",
  data: {
    phase: "tool_end",
    toolCallId: evt.toolCallId,
    toolName: normalizedToolName,
    durationMs: Date.now() - startRecord.startTime,
  },
});
```

**Tool Result:**
```typescript
// Line 403-407
emitAgentEvent({
  runId: ctx.params.runId,
  stream: "tool",
  data: {
    phase: "tool_result",
    toolCallId: evt.toolCallId,
    toolName: normalizedToolName,
    result: sanitizedResult,
    isError: isError,
    errorMessage: errorMessage,
  },
});
```

**Metadata Available:**
- `runId` (string) - Unique run identifier
- `phase` (string) - "tool_start", "tool_end", "tool_result"
- `toolCallId` (string) - Tool call identifier
- `toolName` (string) - Normalized tool name
- `args` (unknown) - Tool arguments
- `meta` (string) - Tool metadata
- `durationMs` (number) - Execution duration
- `result` (unknown) - Tool result
- `isError` (boolean) - Error flag
- `errorMessage` (string) - Error message
- `sessionKey` (string) - Session identifier

**Fidelity:** Exact

---

### Assistant Streaming Events

**Location:** `src/agents/pi-embedded-subscribe.handlers.messages.ts`

**Text Delta:**
```typescript
emitAgentEvent({
  runId: ctx.params.runId,
  stream: "assistant",
  data: {
    phase: "text_delta",
    delta: textDelta,
  },
});
```

**Message End:**
```typescript
emitAgentEvent({
  runId: ctx.params.runId,
  stream: "assistant",
  data: {
    phase: "message_end",
    text: fullText,
  },
});
```

**Metadata Available:**
- `runId` (string) - Unique run identifier
- `phase` (string) - "text_delta", "message_end"
- `delta` (string) - Text delta chunk
- `text` (string) - Full message text
- `sessionKey` (string) - Session identifier

**Fidelity:** Exact

---

## OpenTelemetry Instrumentation

### Extension: diagnostics-otel

**Location:** `extensions/diagnostics-otel/src/service.ts`

**Purpose:** Export diagnostic and agent events to OpenTelemetry (OTLP) for traces, metrics, and logs.

**Configuration:**

```typescript
// Config schema (from source analysis)
{
  diagnostics: {
    enabled: boolean,
    otel: {
      enabled: boolean,
      endpoint: string,  // OTLP endpoint
      protocol: "http/protobuf",
      headers: Record<string, string>,
      serviceName: string,
      sampleRate: number,  // 0.0 to 1.0
      traces: boolean,
      metrics: boolean,
      logs: boolean,
      flushIntervalMs: number
    }
  }
}
```

**Metrics Exported:**

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|--------|
| `openclaw.tokens` | Counter | Token usage by type | channel, provider, model, token (input/output/cache_read/cache_write/prompt/total) |
| `openclaw.cost.usd` | Counter | Estimated model cost (USD) | channel, provider, model |
| `openclaw.run.duration_ms` | Histogram | Agent run duration | channel, provider, model |
| `openclaw.context.tokens` | Histogram | Context window size and usage | channel, provider, model, context (limit/used) |
| `openclaw.webhook.received` | Counter | Webhook requests received | channel, webhook |
| `openclaw.webhook.error` | Counter | Webhook processing errors | channel, webhook |
| `openclaw.webhook.duration_ms` | Histogram | Webhook processing duration | channel, webhook |
| `openclaw.message.queued` | Counter | Messages queued for processing | channel, source |
| `openclaw.message.processed` | Counter | Messages processed by outcome | channel, outcome |
| `openclaw.message.duration_ms` | Histogram | Message processing duration | channel, outcome |
| `openclaw.queue.depth` | Histogram | Queue depth on enqueue/dequeue | channel/lane |
| `openclaw.queue.wait_ms` | Histogram | Queue wait time before execution | lane |
| `openclaw.queue.lane.enqueue` | Counter | Command queue lane enqueue events | lane |
| `openclaw.queue.lane.dequeue` | Counter | Command queue lane dequeue events | lane |
| `openclaw.session.state` | Counter | Session state transitions | state, reason |
| `openclaw.session.stuck` | Counter | Sessions stuck in processing | state |
| `openclaw.session.stuck_age_ms` | Histogram | Age of stuck sessions | state |
| `openclaw.run.attempt` | Counter | Run attempts | attempt |

**Traces (Spans) Exported:**

| Span Name | Description | Attributes |
|-----------|-------------|------------|
| `openclaw.model.usage` | LLM API call | channel, provider, model, sessionKey, sessionId, tokens.* |
| `openclaw.webhook.processed` | Webhook processing | channel, webhook, chatId |
| `openclaw.webhook.error` | Webhook error | channel, webhook, chatId, error |
| `openclaw.message.processed` | Message processing | channel, outcome, sessionKey, sessionId, chatId, messageId, reason |
| `openclaw.session.stuck` | Session stuck | state, sessionKey, sessionId, queueDepth, ageMs |

**Logs Exported:**

All OpenClaw logs are exported to OTLP with the following attributes:
- `openclaw.log.level` - Log level (TRACE/DEBUG/INFO/WARN/ERROR/FATAL)
- `openclaw.logger` - Logger name
- `openclaw.logger.parents` - Parent logger names
- `code.filepath` - Source file path
- `code.lineno` - Source line number
- `code.function` - Function name
- `openclaw.code.location` - Full source location

**Sensitive Data Redaction:**

```typescript
// extensions/diagnostics-otel/src/service.ts:57-63
function redactOtelAttributes(attributes: Record<string, string | number | boolean>) {
  const redactedAttributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    redactedAttributes[key] = typeof value === "string"
      ? redactSensitiveText(value)
      : value;
  }
  return redactedAttributes;
}
```

All string fields are redacted before export to prevent leaking sensitive data (API keys, tokens, user data).

---

## Event Hierarchy and Relationships

### Parent-Child Relationships

```
Gateway Server Start
  └─> Channel Start (per channel)
       └─> Webhook Received
            └─> Message Queued
                 └─> Session State: idle → processing
                      └─> Agent Run Start (runId)
                           ├─> Tool Start (toolCallId)
                           │    └─> Tool End
                           │         └─> Tool Result
                           ├─> Assistant Text Delta (streaming)
                           └─> Agent Run End
                                └─> Session State: processing → idle
                                     └─> Message Processed
                                          └─> Webhook Processed
```

### Event Correlation

Events can be correlated using the following identifiers:

| Identifier | Scope | Description |
|------------|-------|-------------|
| `runId` | Agent Run | Unique identifier for a single agent execution |
| `sessionKey` | Session | Persistent session identifier across runs |
| `sessionId` | Session | Short session identifier |
| `toolCallId` | Tool Call | Unique identifier for a tool execution |
| `chatId` | Chat | Platform-specific chat identifier |
| `messageId` | Message | Platform-specific message identifier |
| `seq` | Event | Monotonic sequence number (per runId or global) |
| `ts` | Event | Unix timestamp (milliseconds) |

---

## Event Fidelity Analysis

### Exact Fidelity Events

These events are emitted with exact data from the source:

- **Model Usage** - Direct from LLM API response (tokens, cost, duration)
- **Webhook Events** - Direct from messaging platform webhooks
- **Tool Execution** - Direct from tool runtime (args, result, duration)
- **Queue Events** - Direct from queue state (depth, wait time)
- **Session State** - Direct from session manager (state transitions)

### Derived Fidelity Events

These events are computed or derived:

- **Session Stuck** - Derived from session age and state
- **Tool Loop Detection** - Derived from tool call history analysis
- **Diagnostic Heartbeat** - Aggregated from system state

### Inferred Fidelity Events

These events are inferred from behavior:

- **Agent Error Classification** - Inferred from error message patterns
- **Failover Reason** - Inferred from API error codes

---

## Event Model Validation

### Comparison with ClawScope Event Model

**File:** `/root/Workspace/PROJECTS/powers/ClawScope/docs/design/event-model.md`

**Findings:**

1. **MODEL Category:**
   - ✅ OpenClaw emits `model.usage` events with exact token counts
   - ✅ Cost tracking is available (`costUsd`)
   - ✅ Duration tracking is available (`durationMs`)
   - ✅ Provider and model metadata are exact

2. **TOOL Category:**
   - ✅ OpenClaw emits `tool_start`, `tool_end`, `tool_result` events
   - ✅ Tool arguments are captured
   - ✅ Tool results are captured (with sanitization)
   - ✅ Duration tracking is available
   - ⚠️ Tool approval events are separate (not in diagnostic events)

3. **AGENT Category:**
   - ✅ OpenClaw emits `lifecycle` events (start, end, error)
   - ✅ Run identifiers are unique (`runId`)
   - ✅ Session correlation is available (`sessionKey`)
   - ⚠️ Agent thinking/reasoning is not explicitly tracked

4. **CONTEXT Category:**
   - ✅ Context window usage is tracked (`context.limit`, `context.used`)
   - ⚠️ Context compaction events are in lifecycle stream (not diagnostic)
   - ⚠️ Context overflow detection is implicit (not explicit event)

5. **WEBHOOK Category:**
   - ✅ OpenClaw emits `webhook.received`, `webhook.processed`, `webhook.error`
   - ✅ Channel and update type are tracked
   - ✅ Duration tracking is available

6. **MESSAGE Category:**
   - ✅ OpenClaw emits `message.queued`, `message.processed`
   - ✅ Outcome tracking is available (completed/skipped/error)
   - ✅ Duration tracking is available

7. **SESSION Category:**
   - ✅ OpenClaw emits `session.state`, `session.stuck`
   - ✅ State transitions are tracked
   - ✅ Queue depth is tracked

8. **QUEUE Category:**
   - ✅ OpenClaw emits `queue.lane.enqueue`, `queue.lane.dequeue`
   - ✅ Queue size and wait time are tracked

---

## Recommendations for ClawScope

### 1. Event Model Alignment

**Update ClawScope's event model to match OpenClaw's actual implementation:**

- Add `tool.loop` event type for loop detection
- Add `diagnostic.heartbeat` event type for system health
- Add `run.attempt` event type for retry tracking
- Clarify that context events are in lifecycle stream, not diagnostic stream

### 2. Event Correlation Strategy

**Implement correlation using OpenClaw's identifiers:**

- Use `runId` as primary correlation key for agent runs
- Use `sessionKey` for cross-run session correlation
- Use `toolCallId` for tool execution correlation
- Use `seq` for event ordering within a run

### 3. Instrumentation Approach

**Leverage OpenClaw's dual-event architecture:**

- Subscribe to diagnostic events for infrastructure telemetry
- Subscribe to agent events for runtime behavior
- Use OpenTelemetry extension for export (already implemented)
- Implement custom listeners for ClawScope-specific analysis

### 4. Data Collection Points

**Focus on these high-value emission points:**

- `src/infra/diagnostic-events.ts:195` - Diagnostic event emission
- `src/infra/agent-events.ts:62` - Agent event emission
- `extensions/diagnostics-otel/src/service.ts:612` - OTLP export

### 5. Event Sampling Strategy

**Implement sampling to reduce overhead:**

- Use OpenClaw's `sampleRate` config (0.0 to 1.0)
- Sample by `runId` hash for consistent sampling
- Always capture error events (no sampling)
- Sample heartbeat events aggressively (low value)

### 6. Sensitive Data Handling

**Follow OpenClaw's redaction patterns:**

- Redact all string fields before export
- Use `redactSensitiveText()` from plugin SDK
- Never log raw API keys, tokens, or user data
- Sanitize tool arguments and results

### 7. Performance Considerations

**Minimize instrumentation overhead:**

- Use async listeners (don't block event emission)
- Batch events before export (use OTLP batch processor)
- Set reasonable flush intervals (default: 1000ms)
- Implement circuit breakers for failing exporters

---

## Source Code References

### Key Files for Event Emission

| File Path | Purpose | Lines of Code |
|-----------|---------|---------------|
| `src/infra/diagnostic-events.ts` | Diagnostic event system | 243 |
| `src/infra/agent-events.ts` | Agent event system | 89 |
| `extensions/diagnostics-otel/src/service.ts` | OpenTelemetry exporter | 679 |
| `src/agents/pi-embedded-subscribe.handlers.lifecycle.ts` | Agent lifecycle events | 114 |
| `src/agents/pi-embedded-subscribe.handlers.tools.ts` | Tool execution events | 600+ |
| `src/auto-reply/reply/agent-runner-execution.ts` | Agent execution orchestration | 200+ |
| `src/gateway/server.impl.ts` | Gateway server runtime | 1155 |

### Event Emission Call Sites

**Diagnostic Events:**
```bash
$ grep -r "emitDiagnosticEvent" src/ | wc -l
30
```

**Agent Events:**
```bash
$ grep -r "emitAgentEvent" src/ | wc -l
50+
```

### Event Listener Registration

**Diagnostic Listeners:**
- `extensions/diagnostics-otel/src/service.ts:612` - OTLP exporter
- `src/logging/diagnostic.ts` - Diagnostic heartbeat

**Agent Listeners:**
- `src/gateway/server.impl.ts:786` - Gateway broadcast
- `src/gateway/server-chat.ts` - Chat event handler

---

## Conclusion

OpenClaw implements a **production-grade event architecture** with:

1. **Dual-event systems** for infrastructure and runtime telemetry
2. **In-process event emitters** with listener registration
3. **OpenTelemetry integration** for traces, metrics, and logs
4. **Sensitive data redaction** for security
5. **Event correlation** via runId, sessionKey, and toolCallId
6. **Exact fidelity** for most events (direct from source)

ClawScope can leverage this architecture by:

1. Subscribing to diagnostic and agent events
2. Using OpenTelemetry extension for export
3. Implementing custom listeners for profiling
4. Following OpenClaw's correlation and redaction patterns

The event model is **well-documented in source code** and **actively maintained** as part of OpenClaw's core infrastructure.

---

**Analysis Completed:** 2026-03-18
**Analyst:** Claude (Opus 4.6)
**Source:** OpenClaw repository (commit 0e9b899)
