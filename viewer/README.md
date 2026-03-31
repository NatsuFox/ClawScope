# ClawScope Viewer

ClawScope's viewer layer currently ships two public surfaces built around the same trace model:

- `index.html`: the primary backend debugger for real normalized traces
- `landing.html`: the demo landing surface with bundled frontend replay assets

## Primary workflow

The operational workflow is the backend debugger.

### 1. Start the trace server

```bash
cd viewer/server
npm install
npm start
```

The API serves normalized traces from `../traces` on `http://localhost:3001`.

### 2. Start the viewer

```bash
cd viewer
npm install
npm run dev
```

The Vite dev server runs on `http://127.0.0.1:3013`.

### 3. Open the debugger

Open `http://127.0.0.1:3013` and keep `Database` selected to inspect real traces from the backend.

## Viewer surfaces

### Backend debugger

`index.html` loads `src/App.jsx` and treats the server-backed debugger as the primary ClawScope workflow.

Current behavior:

- defaults to `Database` mode
- lists traces from the viewer server
- loads metadata, spans, and summaries from the normalized SQLite-backed trace store
- keeps a fallback `Demo traces` mode for frontend-only replay

### Demo landing surface

`landing.html` loads `src/LandingPage.jsx` and exists to communicate positioning and let users replay bundled traces without starting the backend.

Use it when you want:

- a product/demo surface
- a self-contained replay walkthrough
- a quick handoff into the backend debugger

### Integrated multi-agent debugger view

The swimlane + actor-relationship view now lives inside `index.html` as part of the backend debugger. When the current trace exposes real actor structure, the debugger can switch between the synchronized log view and the integrated multi-agent view without leaving the page.

## Data flow

ClawScope keeps a hard boundary between collection and visualization:

1. harness-specific collectors normalize runtime artifacts into the shared trace contract
2. normalized traces are persisted under `../traces`
3. `viewer/server/server.js` exposes those traces over HTTP
4. the React debugger consumes the API without depending on harness-specific logic

For the contract and architecture details, use the docs rather than this file:

- `../docs/design/event-model.md`
- `../docs/design/harness-adapters.md`
- `../docs/foundation/architecture.md`

## Development notes

- `vite.config.js` defines the current dev host and port: `127.0.0.1:3013`
- `viewer/server/server.js` is the read-only backend for database mode
- `src/components/TraceStudio.jsx` is the main shared viewer shell used by both the debugger and the landing demo
- `src/LandingPage.jsx` is the demo/positioning layer on top of the same trace UI primitives
- `src/components/MultiAgentTraceView.jsx` renders the integrated debugger-side swimlane view

## Validation

Run these when changing the viewer:

```bash
cd viewer
npm run build
./validate.sh
```

If your change touches the collector/server handshake, also verify:

```bash
cd ../collector
npm test
```

## Related documentation

- `../README.md`
- `../docs/status/current-status.md`
- `../docs/visualization/viewer-implementation.md`
- `../docs/visualization/multi-agent-views.md`
- `server/README.md`
