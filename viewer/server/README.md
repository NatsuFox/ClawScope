# ClawScope Viewer Server

HTTP server that exposes normalized traces to the browser-based viewer.

## Installation

```bash
cd viewer/server
npm install
```

## Usage

### Start Server

```bash
npm start
```

The server will start on port 3001 by default.

### Environment Variables

- `PORT`: Server port (default: 3001)
- `TRACES_DIR`: Directory containing normalized traces (default: `../../traces`)

Example:
```bash
PORT=8080 TRACES_DIR=/path/to/traces npm start
```

## API Endpoints

### List Traces

```
GET /api/traces
```

Returns list of all available traces.

The list payload includes harness and capability metadata so the frontend can
route traces into the right debugger surface without inferring semantics from
spans alone.

**Response**:
```json
{
  "traces": [
    {
      "trace_id": "session_001",
      "trace_name": "Basic Trace",
      "start_at": "2026-03-18T10:00:00.000Z",
      "end_at": "2026-03-18T10:00:07.200Z",
      "duration_ms": 7200,
      "total_cost": 0.007,
      "total_agents": 1,
      "total_spans": 10,
      "source_harness": "openclaw",
      "trace_contract_version": "clawscope-trace/v2",
      "trace_semantics": "single-run",
      "agent_identity_mode": "run_id",
      "supports_waterfall": true,
      "supports_cost_analysis": true,
      "supports_message_log": true,
      "supports_multi_agent": false,
      "directory": "trace_001"
    }
  ]
}
```

### Get Trace Metadata

```
GET /api/traces/:id
```

Returns metadata for a specific trace.

**Response**:
```json
{
  "trace": {
    "trace_id": "session_001",
    "trace_name": "Basic Trace",
    "start_at": "2026-03-18T10:00:00.000Z",
    "end_at": "2026-03-18T10:00:07.200Z",
    "duration_ms": 7200,
    "total_cost": 0.007,
    "total_agents": 1,
    "total_spans": 10,
    "source_harness": "openclaw",
    "trace_contract_version": "clawscope-trace/v2",
    "trace_semantics": "single-run",
    "agent_identity_mode": "run_id",
    "supports_waterfall": true,
    "supports_cost_analysis": true,
    "supports_message_log": true,
    "supports_multi_agent": false,
    "attributes": {},
    "status": "complete"
  }
}
```

### Get Trace Spans

```
GET /api/traces/:id/spans
```

Returns all spans for a trace.

**Response**:
```json
{
  "spans": [
    {
      "record_id": "span_001",
      "trace_id": "session_001",
      "category": "MODEL",
      "subtype": "model.usage",
      "name": "Model: claude-opus-4",
      "start_at": "2026-03-18T10:00:00.000Z",
      "end_at": "2026-03-18T10:00:02.500Z",
      "duration_ms": 2500,
      "status": "success",
      "fidelity": "exact",
      "model_name": "claude-opus-4",
      "token_input": 100,
      "token_output": 50,
      "costUsd": 0.005,
      "attributes": {}
    }
  ]
}
```

### Get Trace Summary

```
GET /api/traces/:id/summary
```

Returns summary statistics for a trace.

**Response**:
```json
{
  "summary": {
    "trace_id": "session_001",
    "source_harness": "openclaw",
    "trace_semantics": "single-run",
    "agent_identity_mode": "run_id",
    "supports_waterfall": true,
    "supports_cost_analysis": true,
    "supports_message_log": true,
    "supports_multi_agent": false,
    "total_spans": 10,
    "total_cost": 0.007,
    "total_tokens": 1170,
    "category_stats": {
      "MODEL": {
        "count": 2,
        "total_duration_ms": 6000,
        "total_cost": 0.007
      },
      "TOOL": {
        "count": 1,
        "total_duration_ms": 150,
        "total_cost": 0
      }
    }
  }
}
```

## Development

The server automatically enables CORS for development. In production, configure appropriate CORS settings.

## Integration with Viewer

The React viewer uses the `DatabaseAdapter` class to fetch traces:

```javascript
import { DatabaseAdapter } from './utils/databaseAdapter.js';

const adapter = new DatabaseAdapter();

// List traces
const traces = await adapter.listTraces();

// Load complete trace
const trace = await adapter.loadTrace('session_001');
```

## Directory Structure

The server expects traces to be organized as:

```
traces/
├── trace_001/
│   ├── normalized.db
│   ├── raw/
│   │   ├── diagnostic_events.jsonl
│   │   └── agent_events.jsonl
│   └── derived/
│       └── session_001_summary.json
├── trace_002/
│   └── normalized.db
└── ...
```

## Notes

- The server is read-only and does not modify traces
- SQLite databases are opened in readonly mode
- Summaries are generated on-the-fly if not found
- The server scans the traces directory on each request
