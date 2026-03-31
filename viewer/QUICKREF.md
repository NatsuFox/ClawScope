# ClawScope Viewer Quick Reference

## Working directory

```bash
cd /root/Workspace/PROJECTS/powers/ClawScope/viewer
```

## Start the full viewer stack

### Terminal 1

```bash
cd /root/Workspace/PROJECTS/powers/ClawScope/viewer/server
npm install
npm start
```

API: `http://localhost:3001`

### Terminal 2

```bash
cd /root/Workspace/PROJECTS/powers/ClawScope/viewer
npm install
npm run dev
```

Debugger UI: `http://127.0.0.1:3013`

## Surfaces

- `http://127.0.0.1:3013/` — backend debugger for real traces
- `http://127.0.0.1:3013/landing.html` — demo landing page

## Current mode guidance

- Use `Database` mode for actual normalized traces from `../traces`
- Use `Demo traces` only when the backend is not running or when you want the shipped replay examples
- Use the integrated multi-agent view inside the backend debugger when the current trace exposes actor structure

## Build and validation

```bash
npm run build
./validate.sh
```

## Common troubleshooting

### Port `3013` already in use

Edit `vite.config.js` and change:

```js
server: {
  host: '127.0.0.1',
  port: 3013,
  strictPort: true,
}
```

### No traces appear in `Database` mode

- confirm the viewer server is running on `3001`
- confirm `../traces/<trace-id>/normalized.db` exists
- confirm the imported trace metadata was written into the `traces` table

### Need demo-only replay

Open `landing.html` or switch the debugger to `Demo traces`.

## Docs

- `README.md`
- `server/README.md`
- `../docs/status/current-status.md`
- `../docs/visualization/viewer-implementation.md`
