# ClawScope Storage Design

This document defines the persistence layer for ClawScope's three-tier data model: raw, normalized, and derived storage. It supports the reconstructability requirement from [philosophy.md](../foundation/philosophy.md) and the architectural separation defined in [architecture.md](../foundation/architecture.md).

## Design goals

The storage layer must support:

1. **Live/replay parity**: incremental writes during live collection, full reads during replay
2. **Reconstructability**: replay can fully recreate the live viewer state from persisted data
3. **Auditability**: preserve raw evidence and fidelity markers for debugging
4. **Local-first**: no cloud dependencies, works entirely on local filesystem
5. **Efficient filtering**: query by time range, agent, category, status without full scans
6. **Size management**: handle large traces through chunking and retention policies

## Directory structure

```
~/.clawscope/
├── traces/
│   ├── {trace_id}/
│   │   ├── metadata.json
│   │   ├── raw/
│   │   │   ├── diagnostic_events.jsonl
│   │   │   ├── agent_events.jsonl
│   │   │   └── otel_export.jsonl
│   │   ├── normalized/
│   │   │   ├── spans.db
│   │   │   └── events.db
│   │   └── derived/
│   │       ├── summaries.json
│   │       ├── cost_rollup.json
│   │       └── bottlenecks.json
│   └── index.db
├── config/
│   └── retention.json
└── temp/
    └── {trace_id}/
        └── live_buffer.jsonl
```

### Directory responsibilities

| Path | Purpose | Retention |
| --- | --- | --- |
| `traces/{trace_id}/metadata.json` | Trace-level metadata: start time, end time, root agent, status | permanent |
| `traces/{trace_id}/raw/` | Immutable raw runtime signals as captured | configurable, default 30 days |
| `traces/{trace_id}/normalized/` | Unified span/event model for viewer | permanent |
| `traces/{trace_id}/derived/` | Cached analysis results | regenerable, can be deleted |
| `traces/index.db` | Cross-trace index for filtering and search | permanent |
| `temp/{trace_id}/` | Live collection buffer before finalization | deleted on trace completion |

## Raw storage layer

### Purpose

Preserve original OpenClaw runtime signals exactly as observed, enabling:
- reprocessing if normalization logic changes
- debugging normalization issues
- auditability of fidelity claims

### File format: JSONL

Each raw source writes to its own append-only JSONL file:

**diagnostic_events.jsonl:**
```jsonl
{"source":"diagnostic","type":"webhook.received","seq":1,"ts":1710756225123,"payload":{"channel":"discord","updateType":"message","chatId":"123456"}}
{"source":"diagnostic","type":"message.queued","seq":2,"ts":1710756225145,"payload":{"channel":"discord","source":"webhook","queueDepth":1,"sessionKey":"session-xyz123"}}
{"source":"diagnostic","type":"model.usage","seq":3,"ts":1710756227456,"payload":{"provider":"anthropic","model":"claude-opus-4-6","usage":{"input":1500,"output":800},"costUsd":0.045,"durationMs":2333,"sessionKey":"session-xyz123","channel":"discord"}}
```

**agent_events.jsonl:**
```jsonl
{"source":"agent","runId":"run-abc789","seq":1,"stream":"lifecycle","ts":1710756225200,"sessionKey":"session-xyz123","data":{"phase":"start","startedAt":1710756225200}}
{"source":"agent","runId":"run-abc789","seq":2,"stream":"tool","ts":1710756225500,"sessionKey":"session-xyz123","data":{"phase":"tool_start","toolCallId":"call-123","toolName":"read_file","args":{"path":"/file.ts"}}}
{"source":"agent","runId":"run-abc789","seq":3,"stream":"tool","ts":1710756226000,"sessionKey":"session-xyz123","data":{"phase":"tool_end","toolCallId":"call-123","toolName":"read_file","durationMs":500}}
```

**Rationale**: JSONL supports incremental writes during live collection and is human-readable for debugging.

### Raw record schema

OpenClaw events have a consistent structure with enrichment:

**Diagnostic event example:**
```json
{
  "source": "diagnostic",
  "type": "model.usage",
  "seq": 12345,
  "ts": 1710756225123,
  "payload": {
    "provider": "anthropic",
    "model": "claude-opus-4-6",
    "usage": {
      "input": 1500,
      "output": 800,
      "cacheRead": 200,
      "cacheWrite": 100,
      "total": 2600
    },
    "costUsd": 0.045,
    "durationMs": 2333,
    "context": {
      "limit": 200000,
      "used": 2600
    },
    "sessionKey": "session-xyz123",
    "channel": "discord"
  }
}
```

**Agent event example:**
```json
{
  "source": "agent",
  "runId": "run-abc789",
  "seq": 42,
  "stream": "tool",
  "ts": 1710756226456,
  "sessionKey": "session-xyz123",
  "data": {
    "phase": "tool_start",
    "toolCallId": "call-123",
    "toolName": "read_file",
    "args": {
      "path": "/path/to/file.ts"
    }
  }
}
```

**Common fields:**
- `source` - Event source ("diagnostic" or "agent")
- `seq` - Sequence number (global for diagnostic, per-run for agent)
- `ts` - Unix timestamp in milliseconds
- `type` or `stream` - Event type/stream identifier
- `payload` or `data` - Event-specific data

**Correlation fields:**
- `runId` - Agent run identifier (agent events only)
- `sessionKey` - Session identifier (both event types)
- `channel` - Messaging platform (diagnostic events)

### Raw file organization

Based on OpenClaw's dual-event architecture:

| File | Content | Source |
| --- | --- | --- |
| `diagnostic_events.jsonl` | Infrastructure telemetry events | `src/infra/diagnostic-events.ts` |
| `agent_events.jsonl` | Agent runtime lifecycle events | `src/infra/agent-events.ts` |
| `otel_export.jsonl` | OpenTelemetry export data (optional) | `extensions/diagnostics-otel/` |

**Event categories by file**:

**diagnostic_events.jsonl**:
- MODEL: `model.usage`
- WEBHOOK: `webhook.received`, `webhook.processed`, `webhook.error`
- MESSAGE: `message.queued`, `message.processed`
- SESSION: `session.state`, `session.stuck`
- QUEUE: `queue.lane.enqueue`, `queue.lane.dequeue`
- RUN: `run.attempt`
- SYSTEM: `diagnostic.heartbeat`
- TOOL: `tool.loop`

**agent_events.jsonl**:
- lifecycle: `start`, `end`, `error`, `compaction`
- tool: `tool_start`, `tool_end`, `tool_result`
- assistant: `text_delta`, `message_end`
- error: runtime errors, API failures

### Live collection pattern

During live collection:
1. Write to `temp/{trace_id}/live_buffer.jsonl` with fsync after each batch
2. On trace completion or checkpoint, move to `traces/{trace_id}/raw/`
3. Delete temp buffer after successful move

### Retention strategy

Raw data is the largest storage consumer. Default retention:
- **30 days** for completed traces
- **7 days** for abandoned/incomplete traces
- **indefinite** if trace is marked for preservation

Configurable in `config/retention.json`:

```json
{
  "raw_retention_days": 30,
  "raw_retention_incomplete_days": 7,
  "preserve_traces": ["trace-uuid-1", "trace-uuid-2"]
}
```

## Normalized storage layer

### Purpose

Provide the stable, unified trace model that the viewer depends on. This is the source of truth for replay.

### File format: SQLite

Use SQLite for normalized storage because:
- supports efficient indexed queries for filtering
- ACID transactions for consistency
- single-file portability
- no server dependencies
- excellent tooling for inspection

### Schema: spans.db

```sql
CREATE TABLE spans (
  record_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK(record_kind IN ('span', 'instant')),
  category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  name TEXT NOT NULL,
  start_at INTEGER,  -- Unix timestamp in microseconds
  end_at INTEGER,
  duration_ms REAL,
  parent_span_id TEXT,
  caused_by_span_id TEXT,
  agent_id TEXT,
  origin_agent_id TEXT,
  target_agent_id TEXT,
  status TEXT,
  model_name TEXT,
  tool_name TEXT,
  token_input INTEGER,
  token_output INTEGER,
  cost REAL,
  fidelity TEXT CHECK(fidelity IN ('exact', 'derived', 'inferred')),
  raw_refs TEXT,  -- JSON array of raw record pointers
  attributes TEXT,  -- JSON blob for extensible metadata
  created_at INTEGER NOT NULL,
  -- OpenClaw-specific fields
  channel TEXT,  -- Messaging channel (discord, slack, etc.)
  session_key TEXT,  -- Session correlation identifier
  run_id TEXT,  -- Agent run identifier
  lane TEXT,  -- Queue lane identifier
  update_type TEXT,  -- Webhook update type
  seq INTEGER,  -- Event sequence number (per run or global)
  FOREIGN KEY (parent_span_id) REFERENCES spans(record_id)
);

-- Core indexes
CREATE INDEX idx_spans_trace ON spans(trace_id);
CREATE INDEX idx_spans_start ON spans(start_at);
CREATE INDEX idx_spans_category ON spans(category);
CREATE INDEX idx_spans_agent ON spans(agent_id);
CREATE INDEX idx_spans_parent ON spans(parent_span_id);
CREATE INDEX idx_spans_status ON spans(status);

-- OpenClaw-specific indexes for actual event types
CREATE INDEX idx_spans_channel ON spans(channel) WHERE channel IS NOT NULL;
CREATE INDEX idx_spans_session_key ON spans(session_key) WHERE session_key IS NOT NULL;
CREATE INDEX idx_spans_run_id ON spans(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_spans_lane ON spans(lane) WHERE lane IS NOT NULL;
CREATE INDEX idx_spans_update_type ON spans(update_type) WHERE update_type IS NOT NULL;
CREATE INDEX idx_spans_seq ON spans(run_id, seq) WHERE run_id IS NOT NULL AND seq IS NOT NULL;

-- Composite indexes for common OpenClaw query patterns
CREATE INDEX idx_spans_channel_category ON spans(channel, category) WHERE channel IS NOT NULL;
CREATE INDEX idx_spans_session_timeline ON spans(session_key, start_at) WHERE session_key IS NOT NULL;
CREATE INDEX idx_spans_run_timeline ON spans(run_id, seq) WHERE run_id IS NOT NULL;
```

### Schema: events.db

Instant events use the same schema but with `record_kind='instant'` and `timestamp` instead of `start_at/end_at`. For simplicity, both can live in the same table, or split into separate tables if query patterns differ significantly.

**Recommendation**: Use a single `spans` table for both, with nullable `start_at/end_at` for instants.

### Normalized record example

```json
{
  "record_id": "span-abc123",
  "trace_id": "trace-xyz789",
  "record_kind": "span",
  "category": "MODEL",
  "subtype": "model.usage",
  "name": "Claude Opus 4.6 request",
  "start_at": 1710756225123000,
  "end_at": 1710756227456000,
  "duration_ms": 2333.0,
  "parent_span_id": "span-parent456",
  "caused_by_span_id": null,
  "agent_id": "agent-main",
  "origin_agent_id": "agent-main",
  "target_agent_id": null,
  "status": "success",
  "model_name": "claude-opus-4-6",
  "tool_name": null,
  "token_input": 1500,
  "token_output": 800,
  "cost": 0.045,
  "fidelity": "exact",
  "raw_refs": "[\"diagnostic_events.jsonl:123\", \"agent_events.jsonl:456\"]",
  "attributes": "{\"cache_hit\":false,\"retry_count\":0,\"provider\":\"anthropic\"}",
  "created_at": 1710756227500000,
  "channel": "discord",
  "session_key": "session-xyz123",
  "run_id": "run-abc789",
  "lane": null,
  "update_type": null,
  "seq": 42
}
```

### Write patterns

**Live mode (incremental)**:
1. Normalizer processes raw records in batches
2. INSERT normalized spans/events into SQLite with transaction batching
3. Commit every 100 records or 1 second, whichever comes first
4. Use WAL mode for concurrent reads during writes

**Replay mode (read-only)**:
1. Open SQLite in read-only mode
2. Query with filters for time range, category, agent
3. Reconstruct viewer state from query results

### Reconstructability guarantee

The normalized store must contain sufficient data to recreate:
- waterfall timeline: `start_at`, `end_at`, `duration_ms`, `parent_span_id`
- swimlanes: `agent_id`, `start_at`, `end_at`
- hierarchy/DAG: `parent_span_id`, `caused_by_span_id`, `origin_agent_id`, `target_agent_id`
- cost analysis: `cost`, `token_input`, `token_output`, `model_name`
- drill-down: `raw_refs` to link back to raw evidence

**Test**: A replay viewer should produce identical visual output to live mode at any checkpoint where both have processed the same raw data.

## Derived storage layer

### Purpose

Cache expensive computations without polluting the normalized model. Derived data can always be regenerated from normalized data.

### File format: JSON

Use simple JSON files for derived artifacts:

```
derived/
├── summaries.json
├── cost_rollup.json
├── bottlenecks.json
└── semantic_summary.json
```

### Derived artifact examples

**summaries.json**:
```json
{
  "total_duration_ms": 45230,
  "total_cost": 1.23,
  "total_tokens_input": 15000,
  "total_tokens_output": 8000,
  "span_count": 234,
  "agent_count": 3,
  "model_requests": 12,
  "tool_executions": 45,
  "error_count": 2,
  "generated_at": "2026-03-18T10:30:00Z"
}
```

**cost_rollup.json**:
```json
{
  "by_category": {
    "MODEL": 1.15,
    "TOOL": 0.08
  },
  "by_agent": {
    "agent-main": 0.95,
    "agent-sub1": 0.28
  },
  "by_model": {
    "claude-opus-4-6": 1.15
  }
}
```

**bottlenecks.json**:
```json
{
  "slowest_spans": [
    {
      "record_id": "span-abc123",
      "name": "Large file context load",
      "duration_ms": 8500,
      "category": "CONTEXT"
    }
  ],
  "most_expensive_spans": [
    {
      "record_id": "span-def456",
      "name": "Claude Opus 4.6 request",
      "cost": 0.45,
      "category": "MODEL"
    }
  ]
}
```

### Invalidation strategy

Derived data is invalidated when:
- normalized data is reprocessed (e.g., after normalizer logic update)
- user explicitly requests regeneration
- derived file is missing

**Implementation**: Store `derived_from_version` in each derived file:

```json
{
  "derived_from_version": "normalizer-v1.2.0",
  "derived_at": "2026-03-18T10:30:00Z",
  "data": {...}
}
```

If normalizer version changes, regenerate all derived data.

## Cross-trace index

### Purpose

Enable efficient filtering across all traces without opening every SQLite database.

### Schema: index.db

```sql
CREATE TABLE traces (
  trace_id TEXT PRIMARY KEY,
  start_at INTEGER NOT NULL,
  end_at INTEGER,
  duration_ms REAL,
  root_agent_id TEXT,
  status TEXT,  -- 'running', 'completed', 'failed', 'abandoned'
  span_count INTEGER,
  total_cost REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_traces_start ON traces(start_at);
CREATE INDEX idx_traces_status ON traces(status);
CREATE INDEX idx_traces_agent ON traces(root_agent_id);

CREATE TABLE trace_agents (
  trace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (trace_id, agent_id),
  FOREIGN KEY (trace_id) REFERENCES traces(trace_id)
);

CREATE TABLE trace_categories (
  trace_id TEXT NOT NULL,
  category TEXT NOT NULL,
  span_count INTEGER,
  PRIMARY KEY (trace_id, category),
  FOREIGN KEY (trace_id) REFERENCES traces(trace_id)
);
```

### Index update pattern

**Live mode**:
- Update index on trace start (INSERT into `traces`)
- Update index on trace completion (UPDATE `traces` with final stats)
- Update index incrementally as new agents/categories appear

**Replay mode**:
- Index is read-only

### Query examples

**Find all traces in the last 7 days:**
```sql
SELECT * FROM traces
WHERE start_at >= unixepoch('now', '-7 days') * 1000000
ORDER BY start_at DESC;
```

**Find traces involving a specific agent:**
```sql
SELECT t.* FROM traces t
JOIN trace_agents ta ON t.trace_id = ta.trace_id
WHERE ta.agent_id = 'agent-main';
```

**Find expensive traces:**
```sql
SELECT * FROM traces
WHERE total_cost > 1.0
ORDER BY total_cost DESC
LIMIT 10;
```

## OpenClaw-specific query patterns

The normalized storage is optimized for actual OpenClaw event types and correlation patterns.

### Query by channel (webhook/message events)

**Find all webhook errors for Discord channel:**
```sql
SELECT * FROM spans
WHERE category = 'WEBHOOK'
  AND subtype = 'webhook.error'
  AND channel = 'discord'
ORDER BY start_at DESC;
```

**Get message processing timeline for a channel:**
```sql
SELECT * FROM spans
WHERE category IN ('WEBHOOK', 'MESSAGE')
  AND channel = 'discord'
  AND start_at >= ?
ORDER BY start_at ASC;
```

### Query by session key (session correlation)

**Get all events for a session:**
```sql
SELECT * FROM spans
WHERE session_key = 'session-xyz123'
ORDER BY start_at ASC;
```

**Track message processing timeline for session:**
```sql
SELECT
  subtype,
  name,
  start_at,
  end_at,
  duration_ms,
  status
FROM spans
WHERE session_key = 'session-xyz123'
  AND category IN ('MESSAGE', 'SESSION', 'MODEL', 'TOOL')
ORDER BY start_at ASC;
```

### Query by run ID (agent execution tracking)

**Get all events for an agent run:**
```sql
SELECT * FROM spans
WHERE run_id = 'run-abc789'
ORDER BY seq ASC;
```

**Track model.usage events for a run:**
```sql
SELECT
  name,
  token_input,
  token_output,
  cost,
  duration_ms,
  model_name
FROM spans
WHERE run_id = 'run-abc789'
  AND category = 'MODEL'
  AND subtype = 'model.usage'
ORDER BY seq ASC;
```

**Reconstruct tool execution sequence for a run:**
```sql
SELECT
  tool_name,
  subtype,
  start_at,
  duration_ms,
  status,
  attributes
FROM spans
WHERE run_id = 'run-abc789'
  AND category = 'TOOL'
ORDER BY seq ASC;
```

### Query by queue lane (queue analysis)

**Analyze queue depth over time for a lane:**
```sql
SELECT
  start_at,
  subtype,
  JSON_EXTRACT(attributes, '$.queueSize') as queue_size,
  JSON_EXTRACT(attributes, '$.waitMs') as wait_ms
FROM spans
WHERE category = 'QUEUE'
  AND lane = 'default'
ORDER BY start_at ASC;
```

**Find queue bottlenecks:**
```sql
SELECT
  lane,
  AVG(CAST(JSON_EXTRACT(attributes, '$.waitMs') AS REAL)) as avg_wait_ms,
  MAX(CAST(JSON_EXTRACT(attributes, '$.waitMs') AS REAL)) as max_wait_ms,
  COUNT(*) as dequeue_count
FROM spans
WHERE category = 'QUEUE'
  AND subtype = 'queue.lane.dequeue'
GROUP BY lane
ORDER BY avg_wait_ms DESC;
```

### Cross-category correlation queries

**Correlate webhook to model usage via session:**
```sql
SELECT
  w.start_at as webhook_time,
  w.channel,
  w.update_type,
  m.start_at as model_time,
  m.model_name,
  m.token_input,
  m.token_output,
  m.cost
FROM spans w
JOIN spans m ON w.session_key = m.session_key
WHERE w.category = 'WEBHOOK'
  AND w.subtype = 'webhook.received'
  AND m.category = 'MODEL'
  AND m.subtype = 'model.usage'
ORDER BY w.start_at DESC;
```

**Track full message lifecycle:**
```sql
SELECT
  category,
  subtype,
  name,
  start_at,
  duration_ms,
  status
FROM spans
WHERE session_key = ?
  AND category IN ('WEBHOOK', 'MESSAGE', 'SESSION', 'RUN', 'MODEL', 'TOOL')
ORDER BY start_at ASC;
```

## Trace metadata

### metadata.json

Each trace has a metadata file for quick inspection without opening SQLite:

```json
{
  "trace_id": "trace-xyz789",
  "version": "1.0",
  "created_at": "2026-03-18T10:23:45Z",
  "completed_at": "2026-03-18T10:35:12Z",
  "status": "completed",
  "root_agent_id": "agent-main",
  "openclaw_version": "0.5.2",
  "collector_version": "0.1.0",
  "normalizer_version": "0.1.0",
  "tags": ["production", "user-123"],
  "description": "User query: analyze codebase structure"
}
```

## OpenClaw-specific storage considerations

### Dual-event architecture

OpenClaw implements two independent event systems that must be captured:

1. **Diagnostic Events** (`diagnostic-events.ts`) - Infrastructure telemetry
   - Categories: MODEL, WEBHOOK, MESSAGE, SESSION, QUEUE, RUN, SYSTEM, TOOL
   - Global sequence numbering (`seq` field)
   - Emitted synchronously to all registered listeners

2. **Agent Events** (`agent-events.ts`) - Agent runtime lifecycle
   - Streams: lifecycle, tool, assistant, error
   - Per-run sequence numbering (`seq` per `runId`)
   - Includes `sessionKey` for correlation

**Storage implication**: Raw storage must preserve both event streams separately to maintain fidelity. The normalizer must merge them into a unified timeline using timestamps and correlation identifiers.

### Event correlation strategy

OpenClaw events can be correlated using multiple identifiers:

| Identifier | Scope | Usage | Storage field |
|------------|-------|-------|---------------|
| `runId` | Agent run | Primary key for agent execution events | `run_id` |
| `sessionKey` | Session | Cross-run correlation for user sessions | `session_key` |
| `toolCallId` | Tool call | Tool execution lifecycle (start/end/result) | Store in `attributes` JSON |
| `chatId` | Chat | Platform-specific chat identifier | Store in `attributes` JSON |
| `messageId` | Message | Platform-specific message identifier | Store in `attributes` JSON |
| `seq` | Event ordering | Monotonic sequence (global or per-run) | `seq` |
| `ts` | Timestamp | Unix milliseconds | `start_at` / `end_at` |

**Storage implication**: Indexes on `run_id`, `session_key`, and `seq` enable efficient event reconstruction and correlation queries.

### Sequence number ordering

OpenClaw uses two sequence numbering schemes:

1. **Diagnostic events**: Global monotonic sequence across all events
2. **Agent events**: Per-run sequence (`seq` per `runId`)

**Storage implication**: The `seq` field must be interpreted in context:
- For diagnostic events (WEBHOOK, MESSAGE, SESSION, QUEUE): global ordering
- For agent events (TOOL, AGENT lifecycle): per-run ordering (requires `run_id` + `seq` composite index)

**Query pattern**: To reconstruct event order within a run, use:
```sql
SELECT * FROM spans
WHERE run_id = ?
ORDER BY seq ASC;
```

### Category-based event types

OpenClaw emits events in these categories (validated from source):

| Category | Event Types | Key Fields |
|----------|-------------|------------|
| MODEL | `model.usage` | `provider`, `model`, `tokens`, `cost`, `duration`, `sessionKey`, `channel` |
| WEBHOOK | `webhook.received`, `webhook.processed`, `webhook.error` | `channel`, `updateType`, `chatId`, `duration` |
| MESSAGE | `message.queued`, `message.processed` | `channel`, `source`, `outcome`, `sessionKey`, `messageId` |
| SESSION | `session.state`, `session.stuck` | `prevState`, `state`, `reason`, `queueDepth`, `sessionKey` |
| QUEUE | `queue.lane.enqueue`, `queue.lane.dequeue` | `lane`, `queueSize`, `waitMs` |
| RUN | `run.attempt` | `runId`, `attempt` |
| TOOL | `tool_start`, `tool_end`, `tool_result`, `tool.loop` | `toolName`, `toolCallId`, `args`, `result`, `duration` |
| SYSTEM | `diagnostic.heartbeat` | `webhooks`, `active`, `waiting`, `queued` |

**Storage implication**: The `category` and `subtype` fields must match OpenClaw's actual event types. Indexes on `category` enable efficient filtering by event type.

### Channel and platform metadata

OpenClaw tracks messaging platform context in events:

- `channel` - Platform identifier (e.g., "discord", "slack", "telegram")
- `updateType` - Webhook update type (platform-specific)
- `chatId` - Platform chat identifier
- `messageId` - Platform message identifier

**Storage implication**: Index on `channel` enables filtering by platform. Store platform-specific identifiers in `attributes` JSON for drill-down.

### Session and run lifecycle

OpenClaw sessions have distinct lifecycle states:

**Session states**: `idle`, `processing`, `waiting`

**Run lifecycle phases**: `start`, `end`, `error`, `compaction`

**Storage implication**: The `status` field should map to these lifecycle states. Session state transitions can be reconstructed by querying `session.state` events ordered by timestamp.

### Performance considerations

Based on OpenClaw's event emission patterns:

1. **High-frequency events**: `model.usage`, `tool_*`, `assistant` streaming
   - Expect 10-100 events per second during active agent runs
   - Batch writes to SQLite (100 records or 1 second)

2. **Low-frequency events**: `webhook.*`, `message.*`, `session.*`
   - Expect 1-10 events per second
   - Can write immediately for low latency

3. **Correlation queries**: Session and run correlation are common
   - Composite indexes on `(session_key, start_at)` and `(run_id, seq)` are critical

4. **Event size**: Most events are small (<1KB), but tool results can be large
   - Consider truncating large tool results in normalized storage
   - Store full results in raw storage only

## Size management

### Chunking strategy for large traces

For traces exceeding 10,000 spans, split normalized storage into chunks:

```
normalized/
├── spans_00000.db  (spans 0-9999)
├── spans_00001.db  (spans 10000-19999)
└── spans_00002.db  (spans 20000-29999)
```

**Chunk boundaries**: Use span sequence number, not time, to ensure deterministic chunking.

**Query pattern**: Viewer opens all chunk files and unions results. SQLite ATTACH can merge multiple databases in a single query.

### Size limits

| Limit | Value | Rationale |
| --- | --- | --- |
| Max spans per trace | 1,000,000 | Prevents unbounded growth |
| Max raw file size | 1 GB | Triggers chunking |
| Max normalized DB size | 500 MB per chunk | Keeps query performance reasonable |
| Max derived file size | 10 MB | Derived data should be summaries, not raw dumps |

### Cleanup triggers

Automatic cleanup runs when:
- total storage exceeds 10 GB
- trace count exceeds 1000
- user explicitly requests cleanup

Cleanup priority:
1. Delete raw data for traces older than retention period
2. Delete derived data (can be regenerated)
3. Delete abandoned traces (status='abandoned', older than 7 days)
4. Warn user if normalized data exceeds limits

## Migration strategy

### Schema versioning

Each storage layer includes a version marker:

**Raw**: `{"version":"raw-v1","..."}` in first line of each JSONL file

**Normalized**: `PRAGMA user_version = 1;` in SQLite

**Derived**: `{"derived_from_version":"..."}` in each JSON file

### Migration process

When schema changes:
1. Increment version number
2. Write migration script: `migrations/normalize_v1_to_v2.py`
3. On first run with new version, detect old schema and run migration
4. Preserve old data in `traces/{trace_id}/normalized.v1.backup.db`

### Backward compatibility

Viewer should support reading N-1 schema version for graceful upgrades. If schema is too old, prompt user to run migration tool.

## Read/write patterns summary

### Live collection

```
Raw signals → temp buffer (JSONL)
  ↓ (batch every 1s)
Normalizer → normalized DB (SQLite INSERT)
  ↓ (batch every 10s)
Derived generator → derived JSON
  ↓ (on completion)
Move temp → permanent raw storage
Update index.db
```

### Replay

```
User selects trace → read metadata.json
  ↓
Load normalized DB (SQLite SELECT with filters)
  ↓
Reconstruct viewer state
  ↓ (on demand)
Load derived summaries
  ↓ (on drill-down)
Load raw records via raw_refs
```

### Reprocessing

```
Read raw JSONL
  ↓
Run updated normalizer
  ↓
Write new normalized DB (overwrite or version bump)
  ↓
Invalidate derived data
  ↓
Regenerate derived summaries
```

## Implementation checklist

Phase 2 (current) should deliver:

- [ ] Directory structure creation utilities
- [ ] Raw JSONL writer with fsync and rotation
- [ ] Normalized SQLite schema definition
- [ ] Normalizer that writes to SQLite with batching
- [ ] Index.db schema and update logic
- [ ] metadata.json writer
- [ ] Retention policy configuration
- [ ] Size limit checks and warnings
- [ ] Migration framework skeleton

Phase 3 (replay viewer) will validate:

- [ ] Normalized DB can fully reconstruct waterfall
- [ ] Normalized DB can fully reconstruct swimlanes
- [ ] Normalized DB can fully reconstruct hierarchy
- [ ] raw_refs enable drill-down to evidence
- [ ] Filtering by time/category/agent is efficient

Phase 4 (live collection) will validate:

- [ ] Incremental writes don't block viewer
- [ ] Live and replay produce identical output
- [ ] Temp buffer cleanup on completion
- [ ] Index updates don't cause race conditions

## Validation results from OpenClaw source analysis

These questions were answered through OpenClaw source code analysis (2026-03-18):

### 1. Expected span rate during typical OpenClaw execution

**Answer**: 10-100 events per second during active agent runs

- **High-frequency events** (10-100/sec): `model.usage`, `tool_*`, `assistant` text streaming
- **Medium-frequency events** (1-10/sec): `webhook.*`, `message.*`, `session.*`
- **Low-frequency events** (<1/sec): `diagnostic.heartbeat`, `session.stuck`, `run.attempt`

**Storage implication**: Batch writes to SQLite (100 records or 1 second) to avoid write contention.

### 2. Largest trace size observed in practice

**Answer**: Not directly observable from source, but OpenClaw implements safeguards:

- Recursion guard at 100 dispatch depth for diagnostic events
- Tool loop detection to prevent infinite tool calls
- Context window limits enforced by model providers

**Estimated bounds**:
- Typical agent run: 100-1,000 events
- Complex multi-agent run: 10,000-100,000 events
- Pathological cases (loops): Could exceed 1M events without safeguards

**Storage implication**: Chunking strategy (10,000 spans per chunk) is appropriate.

### 3. Natural checkpoint boundaries for chunking

**Answer**: Yes, OpenClaw provides clear boundaries:

- **Run boundaries**: Each `runId` represents a complete agent execution
- **Session boundaries**: Each `sessionKey` represents a user session
- **Message boundaries**: Each message processing cycle (webhook → message → run → response)

**Storage implication**: Chunk by run or session boundaries rather than arbitrary span counts for better query locality.

### 4. Raw signal sources beyond logs and hooks

**Answer**: OpenClaw has two primary event sources:

1. **Diagnostic Events** (`src/infra/diagnostic-events.ts`)
   - Emitted via `emitDiagnosticEvent()`
   - 30+ call sites across codebase
   - Categories: MODEL, WEBHOOK, MESSAGE, SESSION, QUEUE, RUN, SYSTEM, TOOL

2. **Agent Events** (`src/infra/agent-events.ts`)
   - Emitted via `emitAgentEvent()`
   - 50+ call sites across codebase
   - Streams: lifecycle, tool, assistant, error

3. **OpenTelemetry Export** (`extensions/diagnostics-otel/`)
   - Exports to OTLP (traces, metrics, logs)
   - Includes sensitive data redaction
   - Configurable sampling rate

**Storage implication**: Raw storage should have separate files for diagnostic and agent events:
```
raw/
├── diagnostic_events.jsonl
├── agent_events.jsonl
└── otel_export.jsonl  (optional, if capturing OTLP data)
```

### 5. Metadata needed for multi-session traces

**Answer**: OpenClaw provides rich correlation metadata:

**Session-level**:
- `sessionKey` - Persistent session identifier
- `sessionId` - Short session identifier
- Session state transitions (idle/processing/waiting)

**Run-level**:
- `runId` - Unique agent execution identifier
- `seq` - Per-run sequence number
- Run context (verboseLevel, isHeartbeat, isControlUiVisible)

**Platform-level**:
- `channel` - Messaging platform (discord, slack, etc.)
- `chatId` - Platform chat identifier
- `messageId` - Platform message identifier
- `updateType` - Webhook update type

**Storage implication**: The normalized schema already captures these fields. Multi-session traces can be reconstructed by querying on `sessionKey` or `channel`.

## References

- [philosophy.md](../foundation/philosophy.md) — reconstructability requirement
- [architecture.md](../foundation/architecture.md) — three-tier data model
- [event-model.md](event-model.md) — normalized record schema
- [roadmap.md](../foundation/roadmap.md) — Phase 2 scope
- [openclaw-source-analysis.md](../research/openclaw-source-analysis.md) — OpenClaw event architecture analysis
