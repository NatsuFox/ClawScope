# ClawScope Documentation

This directory is the canonical documentation hub for ClawScope. Project-level docs are grouped by function so conceptual design, research, implementation history, and validation evidence are no longer split between `docs/` and the repository root.

## Sections

- [foundation/](foundation/index.md): product vision, vocabulary, system shape, roadmap
- [research/](research/index.md): market/context research and OpenClaw source-grounding
- [design/](design/index.md): event model, normalizer design, storage design, harness adapters
- [visualization/](visualization/index.md): viewer UX, multi-agent views, walkthroughs, layout references
- [implementation/](implementation/index.md): alignment work, phase summaries, implementation recaps
- [validation/](validation/index.md): phase exit criteria and validation reports
- [status/](status/index.md): current delivery state and doc navigation

## Recommended entry points

For first-time orientation:

1. [foundation/philosophy.md](foundation/philosophy.md)
2. [foundation/overview.md](foundation/overview.md)
3. [foundation/architecture.md](foundation/architecture.md)
4. [research/openclaw-source-analysis.md](research/openclaw-source-analysis.md)
5. [design/event-model.md](design/event-model.md)

For delivery and progress tracking:

1. [status/current-status.md](status/current-status.md)
2. [implementation/index.md](implementation/index.md)
3. [validation/index.md](validation/index.md)

For viewer-focused work:

1. [visualization/visualization.md](visualization/visualization.md)
2. [visualization/viewer-implementation.md](visualization/viewer-implementation.md)
3. [visualization/multi-agent-views.md](visualization/multi-agent-views.md)
4. [visualization/sample-trace-walkthrough.md](visualization/sample-trace-walkthrough.md)

## Current viewer surfaces

- [../viewer/index.html](../viewer/index.html): primary backend debugger for real traces
- [../viewer/landing.html](../viewer/landing.html): demo landing page with bundled replay traces
- the integrated multi-agent view now lives inside [../viewer/index.html](../viewer/index.html)

For multi-harness ingestion work:

1. [design/harness-adapters.md](design/harness-adapters.md)
2. [../collector/README.md](../collector/README.md)

## Component-local docs

Project-level documentation lives here. Component-specific usage docs remain colocated with the code they describe:

- [../collector/README.md](../collector/README.md)
- [../viewer/README.md](../viewer/README.md)
- [../viewer/server/README.md](../viewer/server/README.md)

## Reorganized root summaries

The root-level summary docs have been absorbed into the structured system:

- `STATUS.md` -> [status/current-status.md](status/current-status.md)
- `PHASE2_COMPLETE.md` -> [implementation/phase-2-complete.md](implementation/phase-2-complete.md)
- `PHASE3_COMPLETE.md` -> [implementation/phase-3-complete.md](implementation/phase-3-complete.md)
- `PHASE3_SUMMARY.md` -> [implementation/phase-3-viewer-summary.md](implementation/phase-3-viewer-summary.md)
- `IMPLEMENTATION-SUMMARY.md` -> [implementation/multi-agent-visualization-summary.md](implementation/multi-agent-visualization-summary.md)
- `agent-profiler-research-report.md` -> [research/agent-profiler-research-report.md](research/agent-profiler-research-report.md)
