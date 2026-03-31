# ClawScope Design Philosophy

This document defines the constraints that future implementation work should preserve. For the system shape that follows from these choices, see [overview.md](overview.md), [architecture.md](architecture.md), and [event-model.md](../design/event-model.md).

## Product vision

ClawScope should become a local-first profiler for agent runtimes that makes execution behavior understandable at a glance. Its job is not only to collect logs, but to reconstruct the path from user input to final response in a form that supports debugging, performance analysis, and cost inspection.

The first implementation target is **OpenClaw**. The initial goal is not to build a universal profiler immediately, but to build one profiler correctly by grounding the model in a real agent runtime.

## Core questions the profiler must answer

Every major product decision should help answer at least one of these questions:

1. **Where did the time go?**
2. **Where did the cost go?**
3. **Why did the agent do that?**

If a feature does not improve one of those answers, it should not be part of the MVP.

## Core principles

### 1. OpenClaw-first MVP

The first schema, instrumentation plan, and replay model should be derived from OpenClaw source analysis. This keeps the MVP honest: the trace model should describe actual observable runtime behavior rather than a generic abstraction invented too early.

### 2. Documentation-driven development

The project should establish its language and architectural constraints before implementation. The goal of the current documentation set is to make future coding decisions easier to evaluate and less likely to drift.

### 3. Local-first and inspectable

The profiler should assume local development workflows first. Trace data, replay, and analysis should work without requiring a cloud dependency. This matches the strongest properties of the current OpenClaw tooling landscape while keeping debugging practical and private.

### 4. Collector/viewer separation

Collection, normalization, storage, and visualization should remain distinct responsibilities. The collector captures runtime facts. The viewer explains those facts. This separation makes the system easier to reason about and is the basis for replay/live parity.

### 5. Unified normalized trace model

OpenClaw-specific collection can feed an OpenClaw-specific adapter, but the viewer should depend on a normalized trace model rather than raw runtime artifacts. This keeps the interface stable and makes later adapters possible without letting future extensibility dominate the MVP.

### 6. Waterfall-first UX

The primary debugging surface should be a timeline profiler. Logs and summaries are useful, but the central experience should make duration, overlap, waiting, and sequencing obvious.

### 7. Multi-agent visibility through complementary views

A single visualization is not enough for multi-agent systems. ClawScope should treat the swimlane timeline and the delegation hierarchy as complementary surfaces:

- **timeline** explains concurrency and order
- **tree/DAG** explains delegation and causality

### 8. Live and replay should share one model

Live mode should not have a special viewer data model. It should stream the same normalized trace records that replay mode reads from storage. If replay cannot reconstruct the live UI from persisted data, the architecture is too coupled.

### 9. Summaries are derived artifacts

Reports, bottleneck summaries, and AI-generated explanations should be generated from normalized trace data and link back to the underlying spans/events. They are useful interpretation layers, not the source of truth.

## Scope guardrails

## MVP in scope

- OpenClaw-focused source analysis
- normalized trace/event model for OpenClaw
- replay-first waterfall profiler
- multi-agent swimlane and hierarchy views
- basic time and cost analysis

## Explicitly out of scope for the MVP

- broad multi-framework support from day one
- generic observability platform ambitions
- summary-only dashboards that hide raw traces
- cloud-first deployment assumptions
- finalizing the entire taxonomy before OpenClaw source analysis

## OpenClaw-first rationale

The research phase showed that existing tools split along different strengths: some have strong waterfall visualization, while others are better aligned with OpenClaw itself. ClawScope should start from the runtime that is closest to the intended product shape, then add breadth later.

That means the first event inventory should be produced from OpenClaw source code and real runtime signals, then captured in the draft model in [event-model.md](../design/event-model.md), then surfaced through the viewer principles in [visualization.md](../visualization/visualization.md).

## Design test for future work

Before implementing a new feature, ask:

- Does it strengthen the OpenClaw-first MVP?
- Does it preserve live/replay parity?
- Does it improve the waterfall-first debugging experience?
- Does it keep summaries derived from trace data rather than replacing it?

If the answer is no, it is probably not the next thing to build.
