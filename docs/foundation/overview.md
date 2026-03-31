# ClawScope Overview

ClawScope is an agent-profiler project whose implementation is grounded in the research captured in [../research/agent-profiler-research-report.md](../research/agent-profiler-research-report.md). The intent is to turn that research into an implementation blueprint centered on OpenClaw.

For the product constraints behind this overview, see [philosophy.md](philosophy.md). For the system shape that follows, see [architecture.md](architecture.md).

## High-level product summary

ClawScope ingests runtime signals from agent harness artifacts, normalizes them into one trace model, and presents them through a profiler-style interface built around timeline analysis. The current repo is replay-first and source-grounded: OpenClaw remains the grounding runtime, while replay imports for Claude Code and Codex already feed the same trace contract.

## Key concepts

| Term | Meaning in ClawScope |
| --- | --- |
| **trace** | The full execution record for one top-level agent run or task. |
| **span** | A duration-based unit of work, such as a model call, tool execution, or sub-agent execution. |
| **instant event** | A point-in-time record, such as a spawn trigger, retry marker, or response emission. |
| **agent** | A runtime actor participating in the trace. This may be the root agent or a spawned sub-agent. |
| **sub-agent** | A delegated agent created by another agent to perform part of the work. |
| **collector** | The process that receives raw runtime signals from logs, hooks, or direct instrumentation. |
| **normalizer** | The layer that maps raw runtime data into the unified trace model. |
| **viewer** | The UI that renders normalized traces as waterfalls, swimlanes, and hierarchy views. |
| **derived artifact** | A report, summary, metric bundle, or comparison generated from normalized trace data. |

## Product shape

At a high level, the product consists of four cooperating layers:

1. **Collection** of raw runtime facts
2. **Normalization** into a unified trace model
3. **Storage** of raw, normalized, and derived data
4. **Visualization and analysis** through a waterfall-first viewer

Those layers are described in more detail in [architecture.md](architecture.md).

## Replay mode and live mode

ClawScope should support two operating modes built on the same normalized trace data.

### Replay mode

Replay mode reads persisted normalized traces from storage and reconstructs the same visual state that the live viewer would have shown. This is still the current product baseline because it lowers implementation risk and forces the data model to be complete enough for reconstruction.

Current replay surfaces:

- the backend debugger at `viewer/index.html` for real traces via the server
- the landing demo at `viewer/landing.html` for bundled replay examples
- the integrated multi-agent debugger view inside `viewer/index.html`

### Live mode

Live mode streams incremental normalized trace updates into the same viewer model used by replay mode. Live collection adds freshness, but it should not redefine the viewer contract.

## Reports and summaries

Summaries, reports, and semantic explanations belong to a **derived layer**, not the primary trace layer. In practice, that means:

- the normalized trace remains authoritative
- summaries are generated from normalized spans/events
- every summary should be traceable back to the underlying records

## Implementation stance

The project is deliberately avoiding premature breadth. The immediate job is not to support every agent framework, but to produce:

- a stable vocabulary
- a source-grounded OpenClaw event inventory
- a normalized trace model
- a replay-first visualization plan

That staged approach is captured in [roadmap.md](roadmap.md).
