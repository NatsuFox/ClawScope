# ClawScope Visualization Philosophy

This document defines the primary analysis surfaces for ClawScope. It assumes the normalized model described in [event-model.md](../design/event-model.md) and the architectural separation described in [architecture.md](../foundation/architecture.md).

## Visualization goal

The viewer should make agent execution understandable faster than raw logs can. The first implementation should prioritize direct answers to the project’s three core questions:

1. where did the time go?
2. where did the cost go?
3. why did the agent do that?

## Waterfall view as the primary UX

The waterfall timeline should be the main debugging surface.

Why this comes first:

- duration is easier to reason about on a timeline than in text logs
- waiting, overlap, and stalls are immediately visible
- ordering becomes legible without replaying a transcript mentally
- the visual form matches the research goal that motivated the project

The default experience should feel closer to a profiler than a log browser.

## Primary visualization surfaces

### 1. Time waterfall

The time waterfall is the default view. It should render spans as horizontal bars positioned by start time and sized by duration.

This view should make it easy to spot:

- long model calls
- slow tool executions
- idle gaps
- retry patterns
- parent/child nesting
- overlap between concurrent sub-agents

### 2. Cost waterfall

Time is not the only bottleneck. A cost-oriented waterfall should expose where spend accumulated even when latency is not extreme.

This can reuse the same trace structure while changing emphasis toward:

- per-span cost
- model cost concentration
- expensive retries
- sub-agent fan-out cost

### 3. Multi-agent swimlane timeline

Each agent or sub-agent should have its own lane. This is the clearest way to show concurrency and waiting behavior in delegated systems.

The swimlane view should answer:

- which agents were active at the same time
- which agent was blocked waiting for another
- when delegation increased total latency
- whether sub-agent work overlapped productively or just added overhead

### 4. Delegation hierarchy or DAG view

A timeline shows **when** things happened. It does not fully show **why** the agent structure became what it became.

A secondary hierarchy view should show:

- root agent to sub-agent relationships
- delegation depth
- handoff chains
- over-delegation patterns
- causality between decisions and new agent activity

A collapsible tree is sufficient for the first version. A DAG may become useful later if cross-links and causal relationships matter enough to exceed tree structure.

## Shared viewer behaviors

All major views should support the same basic interactions.

### Drill-down

Users should be able to move from high-level spans to exact metadata and raw references.

### Filtering

The viewer should support filtering by at least:

- category
- subtype
- agent
- model
- tool
- error state
- time range
- cost range

### Search

Search should help locate interesting spans/events quickly, especially in large traces.

### Correlated selection

Selecting an item in one view should highlight or focus the same record in related views where possible.

## Visual priorities for MVP

The first viewer should optimize for the following sequence:

1. waterfall timeline readability
2. multi-agent swimlane support
3. hierarchy visibility for sub-agent relationships
4. basic cost/time summary panels
5. filtering and search

This ordering keeps the MVP anchored to the core profiler experience rather than expanding into reports too early.

## Reports and summaries

Reports and semantic summaries should attach to the viewer, not replace it. They should be treated as derived analysis surfaces that link back to the exact spans/events that justify the claim.

Examples:

- “Most latency came from three model retries.”
- “One sub-agent branch added cost without reducing wall-clock time.”
- “Context assembly dominated the first half of the run.”

Those statements are useful only if the user can click through to the underlying trace.

## Live and replay expectations

The viewer should behave consistently in live and replay mode.

- **replay mode**: renders a complete saved trace
- **live mode**: incrementally updates the same surfaces as new normalized records arrive

This means the visualization layer should not depend on source-specific collection logic.

## Non-goals for the first visualization pass

The first viewer should avoid becoming a generic dashboard with many equal-weight widgets. The primary interface is not:

- a transcript viewer with a tiny timeline
- a metrics-only dashboard
- an AI-summary-only report page

ClawScope should earn the right to add those views later by first making the waterfall and multi-agent views excellent.
