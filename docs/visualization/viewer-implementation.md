# ClawScope Viewer Implementation

This document describes the current viewer stack, not just the original Phase 3 milestone. The primary product workflow is now the server-backed debugger in `viewer/index.html`, while the landing demo remains a separate surface built around the same normalized-trace story. The multi-agent swimlane and actor-relationship view is now integrated into the backend debugger itself.

## Current surfaces

- `viewer/index.html`: primary backend debugger for normalized traces in `../traces`
- `viewer/landing.html`: bundled product/demo surface with replay examples
- integrated multi-agent swimlane/relationship mode inside `viewer/index.html`

## Architecture

### Tech stack

- **React 18** for the debugger shell and shared viewer components
- **D3.js v7** for visualization primitives
- **react-markdown + remark-gfm** for rich span/message rendering in the synchronized trace view
- **Vite** for the frontend build and dev server
- **Node.js HTTP + `node:sqlite`** for the read-only trace server in `viewer/server/server.js`
- **Vanilla CSS** for the debugger and landing surfaces

### Design principles

1. **Replay-first**: persisted traces remain the canonical way to validate the viewer contract
2. **Backend-first for real traces**: actual debugging runs through the trace server and normalized SQLite traces
3. **Sample/file fallback**: bundled demos and optional JSON upload remain available for quick inspection and frontend iteration
4. **Waterfall-first**: time, cost, ordering, and causal structure stay central
5. **One normalized contract**: OpenClaw, Claude Code, and Codex traces all land in the same viewer-facing model

## Component architecture

```text
viewer/
├── index.html                     # mounts src/App.jsx
├── landing.html                   # mounts src/LandingPage.jsx
├── server/
│   ├── package.json
│   ├── README.md
│   └── server.js                  # read-only trace API over normalized.db files
└── src/
    ├── App.jsx                    # backend debugger surface
    ├── LandingPage.jsx            # product/demo surface
    ├── components/
    │   ├── TraceStudio.jsx        # shared shell for database/sample/file sources
    │   ├── MultiAgentTraceView.jsx
    │   ├── SynchronizedTraceView.jsx
    │   ├── SummaryPanel.jsx
    │   ├── FilterPanel.jsx
    │   ├── SpanDetailModal.jsx
    │   └── WaterfallView.jsx      # earlier D3-only component retained in repo
    ├── constants/demoTraces.js
    ├── utils/
    │   ├── databaseAdapter.js
    │   └── traceUtils.js
    └── styles/
        ├── Debugger.css
        └── App.css
```

### Primary responsibilities

#### `App.jsx`

- makes database mode the default operating path
- explains how to bring up the backend debugger
- links the debugger to the landing demo and hosts the integrated multi-agent mode toggle

#### `LandingPage.jsx`

- presents ClawScope positioning and architecture to first-time users
- embeds bundled replay traces through the same `TraceStudio` shell
- hands users off to the backend debugger for actual work

#### `TraceStudio.jsx`

- switches between `database` and `sample` modes
- groups available backend traces by harness (`openclaw`, `claude-code`, `codex`)
- supports optional local JSON upload as a fallback path
- coordinates summary, filters, focus state, reloads, and detail-modal open state

#### `SynchronizedTraceView.jsx`

- renders the main synchronized execution surface used by the debugger and demo
- supports focused-span interaction, rich message rendering, and synchronized navigation
- is the current primary visualization component for day-to-day use

#### `MultiAgentTraceView.jsx`

- renders actor swimlanes and relationship cards inside the backend debugger
- derives actor structure from explicit agent ids or lifecycle run ids in normalized traces
- replaces the earlier standalone prototype page

#### `databaseAdapter.js`

- fetches trace metadata, spans, and summaries from the viewer server
- converts database rows into the viewer-friendly shape consumed by the frontend

#### `viewer/server/server.js`

- enumerates normalized traces under `../traces`
- serves metadata, span rows, and derived summaries over HTTP
- keeps access read-only so the viewer cannot mutate trace storage

## Data flow

### Database mode

1. A collector import writes `normalized.db` and optional `derived/*_summary.json` under `traces/<trace-dir>/`
2. `viewer/server/server.js` discovers those traces and exposes them via `/api/traces`
3. `DatabaseAdapter` loads metadata, spans, and summaries for the selected trace
4. `TraceStudio` converts the loaded data into the shared viewer model
5. `SummaryPanel`, `FilterPanel`, `SynchronizedTraceView`, and `SpanDetailModal` render the trace

### Sample mode

1. `TraceStudio` loads one of the bundled JSON fixtures from `viewer/samples/`
2. The same summary/filter/detail flow renders the replay without the backend

### Optional file upload

1. The user selects a local JSON trace file
2. `TraceStudio` parses it directly in the browser
3. The viewer renders it through the same summary/filter/detail path

The upload path is a convenience escape hatch, not the primary operational workflow.

## Viewer behavior

### Current capabilities

- grouped trace selection by source harness
- backend debugger for persisted normalized traces
- bundled demo traces for quick replay
- synchronized trace rendering with focus and detail inspection
- summary statistics and top-span navigation
- category, actor, and text filtering
- span metadata drill-down, including cost/token/context attributes

### Trace expectations

The viewer consumes the normalized trace contract described in [../design/event-model.md](../design/event-model.md) and enriched by trace-level metadata from the collector.

Key trace-level metadata currently used in the UI includes:

- `source_harness`
- `trace_semantics`
- `agent_identity_mode`
- `supports_multi_agent`
- `cwd`
- `total_spans`
- `total_cost`

Key span fields include:

- `record_id`
- `trace_id`
- `category`
- `subtype`
- `name`
- `start_at`
- `end_at`
- `duration_ms`
- `agent_id`
- `origin_agent_id`
- `target_agent_id`
- `status`
- `fidelity`
- `costUsd`
- `token_input`
- `token_output`
- `attributes`

## Development workflow

### Bring up the primary stack

```bash
cd viewer/server
npm install
npm start
```

```bash
cd viewer
npm install
npm run dev
```

Then open `http://127.0.0.1:3013` and keep `Database` selected for real traces.

### Build

```bash
cd viewer
npm run build
```

### Validation

Current practical checks:

- `cd collector && npm test`
- `cd viewer && npm run build`
- `cd viewer && ./validate.sh`

## Deployment notes

The landing/demo assets can be shipped as static frontend files, but the primary debugger experience depends on a trace API source. Today that source is `viewer/server/server.js`; a future live pipeline should still feed the same normalized viewer contract rather than introducing a separate UI data model.

## Future work

### Phase 4

- live collection and synchronization
- parity between incremental updates and persisted replay
- cleaner handoff between collector output and the debugger

### Phase 5

- advanced comparative analysis
- richer derived summaries and bottleneck views
- broader cross-trace and cross-harness intelligence

## Related Documentation

- `/docs/foundation/philosophy.md` - Product vision and design principles
- `/docs/design/event-model.md` - Normalized trace data model
- `/docs/visualization/visualization.md` - Visualization philosophy
- `/docs/foundation/roadmap.md` - Implementation roadmap
- `/viewer/README.md` - User-facing documentation
