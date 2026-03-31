# ClawScope Architecture

This document describes the intended system decomposition for the first implementation stages. It is paired with [overview.md](overview.md) for vocabulary and [event-model.md](../design/event-model.md) for the data contract the viewer should consume.

## Architectural goals

The architecture should preserve four properties:

- **OpenClaw-first fidelity**
- **live/replay parity**
- **clear separation of concerns**
- **future adapter extensibility without MVP overdesign**

## Component decomposition

```text
Runtime signals and replay artifacts
(OpenClaw / Claude Code / Codex)
            |
            v
+-------------------+
|     Collector     |
| import raw facts  |
+-------------------+
            |
            v
+-------------------+
|    Raw storage    |
| immutable inputs  |
+-------------------+
            |
            v
+-------------------+
|    Normalizer     |
| map to trace model|
+-------------------+
            |
            v
+-------------------+
| Normalized store  |
| spans + events    |
+-------------------+
      |          |
      |          +--------------------+
      v                               v
+-------------------+       +-------------------+
|      Viewer       |       | Derived analysis  |
| waterfall + graph |       | summaries/reports |
+-------------------+       +-------------------+
```

## Responsibilities by layer

| Layer | Responsibility | MVP emphasis |
| --- | --- | --- |
| **collector** | Observe runtime facts or replay artifacts without collapsing them into UI-specific structures | replay importers implemented; live capture later |
| **raw storage** | Preserve original evidence for reprocessing and debugging | important from the beginning |
| **normalizer** | Convert raw runtime data into one stable trace model | core MVP requirement |
| **normalized store** | Persist the records required to reconstruct the viewer | core MVP requirement |
| **viewer** | Render time, cost, concurrency, and delegation from normalized traces | core MVP requirement |
| **derived analysis** | Produce summaries, metrics, and comparisons from normalized traces | later MVP / post-MVP |

## Runtime data flow

1. **Supported harnesses emit or persist observable runtime facts** through logs, hooks, direct instrumentation, or saved session artifacts.
2. The **collector** records those facts as raw records with source context intact.
3. The **normalizer** maps raw records into a unified trace/span/event representation.
4. The **normalized store** persists the data required for replay and visual reconstruction.
5. The **viewer** reads normalized traces and renders the waterfall timeline, swimlanes, and delegation structure.
6. The **derived layer** computes summaries, cost rollups, bottleneck indicators, and future report outputs from the same normalized data.

## Raw, normalized, and derived data

Keeping these three layers distinct is a core design decision.

| Data layer | Purpose | Examples |
| --- | --- | --- |
| **raw** | Preserve source evidence exactly as observed | log lines, hook payloads, intercepted runtime payloads |
| **normalized** | Provide one stable viewer contract | trace records, spans, instant events, agent relationships |
| **derived** | Add analysis without changing the source truth | cost totals, bottleneck flags, semantic summaries |

This separation matters because the event model will evolve during OpenClaw source analysis. Raw data protects reprocessing. Normalized data protects UI stability. Derived data protects interpretability without weakening auditability.

## Live/replay parity rule

ClawScope should treat replay and live viewing as two ingestion modes for the same viewer.

- **replay mode** reads persisted normalized trace data
- **live mode** streams incremental normalized trace updates

The viewer should not depend on collector internals or raw source-specific formats. If a saved normalized trace cannot reproduce the same visual state shown in live mode, the design is too coupled.

## Multi-agent architecture implication

Because agent runtimes may delegate work to sub-agents, the normalized store must preserve both:

- **temporal structure** for the swimlane timeline
- **causal/delegation structure** for the hierarchy or DAG view

That means timestamps alone are not enough. The model also needs parent/causal relationships, defined in [event-model.md](../design/event-model.md).

## Extensibility boundary

OpenClaw still defines the original event semantics and remains the grounding runtime for the normalized model. The current repo already ships replay adapters for Claude Code and Codex, and any future harness should continue to plug into the **collector + normalizer** boundary rather than changing the viewer contract.

In other words:

- source-specific logic lives near collection and normalization
- framework-independent interpretation lives in the normalized model and viewer

## Architectural consequence for implementation order

The architecture points to a staged build order:

1. define vocabulary and constraints
2. inventory OpenClaw runtime signals
3. finalize normalized schema
4. build replay viewer against normalized traces
5. add live collection that streams the same normalized data

That build order is reflected in [roadmap.md](roadmap.md).
