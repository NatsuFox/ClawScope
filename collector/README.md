# ClawScope Collector

The collector ingests harness-specific runtime artifacts, normalizes them into ClawScope spans, and stores them in the three-tier storage system.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ClawScope Collector                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Harness Artifacts  →  Adapter/Normalizer  →  Storage      │
│                                                              │
│  OpenClaw JSONL / Claude Code JSONL / Codex rollout JSONL    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Storage Structure

```
~/.clawscope/traces/{trace_id}/
├── raw/
│   ├── diagnostic_events.jsonl    # Raw diagnostic events
│   ├── agent_events.jsonl         # Raw agent events
│   └── otel_export.jsonl          # Optional OTEL export
├── normalized.db                   # SQLite database with spans
└── derived/
    ├── {trace_id}_summary.json    # Generated summary
    └── {trace_id}_report.json     # Optional detailed report
```

## Installation

```bash
cd collector
npm install
```

## Usage

### Supported harnesses

- `openclaw`
- `claude-code`
- `codex`

For the design rationale behind this split, see [docs/design/harness-adapters.md](../docs/design/harness-adapters.md).

### Import a harness session

```bash
cd collector

# OpenClaw directory with diagnostic_events.jsonl + agent_events.jsonl
node src/cli.js import openclaw ./raw-events ../traces/openclaw-trace

# Claude Code session JSONL
node src/cli.js import claude-code ~/.claude/projects/<project>/<session>.jsonl ../traces/claude-session

# Codex rollout JSONL
node src/cli.js import codex ~/.codex/sessions/2026/03/20/rollout-....jsonl ../traces/codex-session
```

### Discover local sessions

```bash
cd collector

node src/cli.js discover claude-code --limit 5
node src/cli.js discover codex --limit 5
```

### Compatibility alias

`normalize` remains as an alias for importing OpenClaw traces:

```bash
node src/cli.js normalize ./raw-events ../traces/openclaw-trace
```

### Initialize Storage

```javascript
import { TraceStorage } from './src/storage.js';

const storage = new TraceStorage('~/.clawscope/traces/trace_001');
await storage.initialize();
```

### Write Raw Events

```javascript
const events = [
  {
    type: 'model.usage',
    ts: 1710778500000,
    runId: 'run_001',
    model: 'claude-opus-4',
    tokens: { input: 100, output: 50, total: 150 },
    costUsd: 0.005,
    durationMs: 2500
  },
  // ... more events
];

await storage.writeRawEvents(events, 'agent_events.jsonl');
```

### Read Raw Events

```javascript
// Read specific file
const diagnosticEvents = await storage.readRawEvents('diagnostic_events.jsonl');

// Read all events (merged and sorted)
const allEvents = await storage.readAllRawEvents();
```

### Write Normalized Spans

```javascript
const spans = [
  {
    record_id: 'span_001',
    trace_id: 'trace_001',
    category: 'MODEL',
    subtype: 'model.usage',
    name: 'Model: claude-opus-4',
    start_at: '2026-03-18T10:00:00.000Z',
    end_at: '2026-03-18T10:00:02.500Z',
    duration_ms: 2500,
    status: 'success',
    fidelity: 'exact',
    runId: 'run_001',
    model_name: 'claude-opus-4',
    token_input: 100,
    token_output: 50,
    costUsd: 0.005,
    attributes: {}
  },
  // ... more spans
];

await storage.writeSpans(spans);
```

### Query Spans

```javascript
// By trace ID
const traceSpans = storage.readSpansByTrace('trace_001');

// By run ID
const runSpans = storage.readSpansByRun('run_001');

// By session key
const sessionSpans = storage.readSpansBySession('agent:discord:session_123');

// By category
const modelSpans = storage.readSpansByCategory('trace_001', 'MODEL');

// With filters
const expensiveSpans = storage.querySpans({
  trace_id: 'trace_001',
  min_cost: 0.01,
  min_duration_ms: 1000,
  limit: 10
});
```

### Generate Summary

```javascript
// Generate summary from spans
const summary = storage.generateSummary('trace_001');

// Save summary
await storage.writeSummary('trace_001', summary);

// Read summary
const savedSummary = await storage.readSummary('trace_001');
```

### Trace Metadata

```javascript
// Write trace metadata
await storage.writeTrace({
  trace_id: 'trace_001',
  trace_name: 'OpenClaw Basic Execution',
  start_at: '2026-03-18T10:00:00.000Z',
  end_at: '2026-03-18T10:00:10.000Z',
  duration_ms: 10000,
  total_cost: 0.025,
  total_agents: 1,
  total_spans: 15,
  status: 'complete'
});

// Read trace metadata
const trace = storage.readTrace('trace_001');

// List all traces
const traces = storage.listTraces();
```

## Database Schema

### spans table

```sql
CREATE TABLE spans (
  record_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subtype TEXT NOT NULL,
  name TEXT NOT NULL,

  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,

  parent_span_id TEXT,
  caused_by_span_id TEXT,
  origin_agent_id TEXT,
  target_agent_id TEXT,

  status TEXT NOT NULL,
  fidelity TEXT NOT NULL,

  -- OpenClaw correlation fields
  runId TEXT,
  sessionKey TEXT,
  toolCallId TEXT,
  channel TEXT,
  lane TEXT,
  seq INTEGER,

  -- Category-specific fields
  model_name TEXT,
  provider TEXT,
  tool_name TEXT,
  token_input INTEGER,
  token_output INTEGER,
  token_cache INTEGER,
  costUsd REAL,
  queueDepth INTEGER,
  updateType TEXT,

  -- Metadata
  attributes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes

The storage layer creates optimized indexes for common OpenClaw query patterns:

- Core indexes: trace_id, category, start_at, parent_span_id
- OpenClaw indexes: runId, sessionKey, toolCallId, channel, lane
- Composite indexes: trace+category, trace+start, run+category, session+category
- Analysis indexes: costUsd, duration_ms

## Performance

### Bulk Insert Optimization

For large traces, use transactions:

```javascript
// Disable indexes during bulk insert
await storage.db.exec('PRAGMA synchronous = OFF');
await storage.db.exec('PRAGMA journal_mode = MEMORY');

// Insert spans
await storage.writeSpans(largeSpanArray);

// Re-enable and optimize
await storage.db.exec('PRAGMA synchronous = FULL');
await storage.optimize();
```

### Memory Management

For very large traces (>100K events), process in chunks:

```javascript
const CHUNK_SIZE = 1000;
for (let i = 0; i < events.length; i += CHUNK_SIZE) {
  const chunk = events.slice(i, i + CHUNK_SIZE);
  const spans = await normalizer.normalize(chunk);
  await storage.writeSpans(spans);
}
```

## Testing

```bash
npm test
```

## References

- [Storage Design](../docs/design/storage-design.md)
- [Normalizer Design](../docs/design/normalizer-design.md)
- [Harness Adapters](../docs/design/harness-adapters.md)
- [Architecture](../docs/foundation/architecture.md)
