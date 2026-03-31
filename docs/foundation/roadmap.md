# ClawScope Roadmap

This roadmap organizes implementation around decision-enabling milestones rather than generic engineering phases. It assumes the product constraints in [philosophy.md](philosophy.md), the system decomposition in [architecture.md](architecture.md), and the draft contract in [event-model.md](../design/event-model.md).

## Roadmap principles

- move from vocabulary to evidence before implementation breadth
- validate the trace model against OpenClaw source before optimizing UI details
- make replay work before live collection
- treat reports and summaries as a later derived layer
- keep multi-framework live support out of the MVP path until replay import works cleanly

## Phase 0 — Documentation foundation

### Goal

Create a documentation system that becomes the implementation-facing source of truth.

### Outcomes

- establish the README and core docs
- align terminology across philosophy, overview, architecture, event model, visualization, and roadmap
- define stable MVP constraints and non-goals

### Exit criteria

- a new contributor can read the docs in order and understand the intended product shape
- the docs clearly prioritize OpenClaw-first, replay-first, and waterfall-first decisions

## Phase 1 — OpenClaw source analysis

### Goal

Ground the profiler in real OpenClaw runtime behavior.

### Outcomes

- obtain and study OpenClaw source code
- build a source-level event inventory of observable runtime points
- identify which signals are direct versus derived or inferred
- validate whether major categories extend beyond model/tool calls

### Exit criteria

- first OpenClaw event inventory document exists
- the draft subtype list in [event-model.md](../design/event-model.md) has been validated and refined
- required metadata for key spans/events is known

## Phase 2 — Trace model and storage MVP

### Goal

Finalize the normalized trace schema and persisted data layout required for replay.

### Outcomes

- finalize normalized span/event schema for OpenClaw
- define raw, normalized, and derived storage boundaries
- define reconstructability requirements for replay parity
- establish conventions for fidelity markers and causal relationships

### Exit criteria

- saved normalized data is sufficient to recreate planned viewer state
- the schema can represent time, cost, concurrency, and delegation cleanly

## Phase 3 — Replay-mode visualization MVP

### Goal

Build the first profiler experience using persisted normalized traces.

### Outcomes

- implement the primary waterfall timeline
- add swimlane view for multi-agent concurrency
- add sub-agent hierarchy/tree view
- add basic time and cost summaries
- add baseline filtering and search

### Exit criteria

- replay mode can load a saved trace and render the core views consistently
- a user can answer where time went, where cost went, and why the agent acted that way for a representative trace

## Phase 4 — Live collection and synchronization

### Goal

Add incremental collection without changing the viewer contract.

### Outcomes

- implement collector process for live runtime signals
- normalize incoming data incrementally
- stream or poll normalized updates into the same viewer model used by replay
- verify parity between live and replay rendering

### Exit criteria

- live mode surfaces the same structures as replay mode
- replaying persisted normalized data reproduces the same visual state at equivalent checkpoints

## Bridge work — Replay adapters for directly testable local harnesses

### Goal

Enable direct testing against local agent harnesses whose session artifacts are already available, without waiting for OpenClaw live runtime access.

### Outcomes

- import Claude Code sessions from `~/.claude/projects/`
- import Codex rollout sessions from `~/.codex/sessions/`
- preserve harness identity in trace metadata
- validate that imported traces render in the existing replay viewer

### Constraints

- this is a replay bridge, not a new primary product direction
- the normalized span schema remains canonical
- OpenClaw remains the grounding source for the original event model

## Phase 5 — Advanced intelligence and expansion

### Goal

Add higher-level analysis after the trace model and core viewer are stable.

### Outcomes

- bottleneck detection
- semantic summary and report generation
- comparison views across traces or tasks
- redaction controls and sharing/reporting support
- live and analytical expansion across Claude Code, Codex, and other runtimes

### Exit criteria

- advanced analysis remains grounded in normalized traces
- new adapters can be designed without weakening the OpenClaw-first MVP decisions

## Deferred second-wave documents

These documents should be created after the core set when implementation evidence exists:

- `docs/research/openclaw-source-analysis.md`
- `docs/design/harness-adapters.md`
- `docs/reporting-and-summaries.md`

## Current immediate next step

The original next step was OpenClaw source analysis, and that grounding work has now been completed. The current near-term follow-up is to use replay adapters for directly testable local harnesses while preserving the OpenClaw-grounded normalized trace contract.
