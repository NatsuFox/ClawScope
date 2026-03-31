# Changelog

All notable changes to ClawScope are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Conventional Commits](https://www.conventionalcommits.org/).

---

## [Unreleased]

### Planned
- Phase 4: live collection and sync
- Phase 5: advanced analysis, cross-session comparison, and derived insights

---

## [0.3.0] — Phase 3 Complete: Replay Visualization MVP

### Added
- React-based waterfall timeline viewer (Vite + React 18)
- Cost view panel for per-span and aggregate token cost analysis
- Summary panel with session metadata
- Category and text filtering for spans
- Span detail modal with full raw and normalized attributes
- Multi-agent visualization prototype (`viewer/multi-agent.html`)
- Viewer HTTP server (`viewer/server/`) with trace API on port 3001
- D3-based timeline rendering

---

## [0.2.0] — Phase 2 Complete: Trace Model and Storage MVP

### Added
- Normalized trace contract (raw → normalized → derived layering)
- SQLite-backed trace storage via `sql.js`
- Collector CLI (`collector/src/cli.js`) with `discover` and `import` commands
- Claude Code session JSONL normalizer
- Codex rollout JSONL normalizer
- OpenClaw raw-event directory normalizer

---

## [0.1.0] — Phase 1 Complete: OpenClaw Source Analysis

### Added
- OpenClaw source copy in `openclaw-source/` for grounding and alignment
- Event model and semantic analysis documentation
- Initial normalized trace schema based on OpenClaw event structure

---

## [0.0.1] — Phase 0 Complete: Documentation Foundation

### Added
- Full documentation system under `docs/`
  - `foundation/`: positioning, philosophy, architecture, roadmap
  - `research/`: ecosystem research and agent profiler landscape
  - `design/`: event model, normalizer, storage, harness adapters
  - `visualization/`: viewer behavior and multi-agent UX
  - `validation/`: exit criteria and proof
  - `status/`: current project state
- Initial README
