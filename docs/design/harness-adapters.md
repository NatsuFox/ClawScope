# Harness Adapters

This document defines how ClawScope can ingest traces from agent harnesses other than OpenClaw without changing the viewer contract.

## Why this exists

ClawScope was originally built around OpenClaw-specific raw events, but the normalized span database and replay viewer are already generic enough to serve as a stable target for other local-first harnesses.

That matters for direct testing:

- OpenClaw is not always available in the local environment
- Claude Code and Codex both already persist machine-readable session artifacts locally
- reference projects such as `claude-devtools` and `lazyagent` prove those artifacts are rich enough for observational profiling

The adapter layer therefore exists to turn harness-specific logs into the current ClawScope trace schema.

## Core rule

The normalized span contract stays canonical.

Adapters may vary in how much fidelity they can recover, but they should all emit:

- normalized spans
- trace metadata
- optional raw-source copies under `traces/<trace>/raw/`

They should not introduce a second viewer contract.

## Adapter boundary

Each harness adapter should implement four responsibilities:

1. `discoverSessions(options)`
2. `loadSession(input, options)`
3. `normalizeSession(raw, options)`
4. `buildTraceMetadata(spans, raw)`

In practice:

- `discoverSessions` finds local artifacts that can be imported
- `loadSession` reads the harness-specific raw source
- `normalizeSession` maps the raw source into ClawScope spans
- `buildTraceMetadata` enriches the trace with source-level context

## Supported harnesses

### OpenClaw

OpenClaw remains the grounding source for the original event model.

Input shape:

- `diagnostic_events.jsonl`
- `agent_events.jsonl`

Normalization path:

- existing OpenClaw normalizer logic

### Claude Code

Claude Code persists session JSONL under `~/.claude/projects/<encoded-project>/*.jsonl`.

Useful source characteristics:

- `user`, `assistant`, `system`, `summary`, `queue-operation`
- tool calls appear as `tool_use` content blocks
- tool results appear in user-side `tool_result` blocks
- model usage is present on assistant entries
- `cwd`, `gitBranch`, `version`, and related session metadata are available in-line

Recommended mappings:

- user prompts -> `MESSAGE`
- assistant responses with usage -> `MODEL`
- `tool_use` / `tool_result` pairs -> `TOOL`
- `turn_duration` and local command noise -> `SYSTEM`
- `summary` -> `CONTEXT`
- `queue-operation` -> `QUEUE`

### Codex

Codex persists rollout JSONL under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.

Useful source characteristics:

- `session_meta`
- `turn_context`
- `event_msg`
- `response_item`
- thread naming from `~/.codex/session_index.jsonl`
- prompt history from `~/.codex/history.jsonl`

Recommended mappings:

- `task_started` -> start `AGENT` turn span
- `task_complete` / `turn_aborted` -> end `AGENT` turn span
- `user_message` / `agent_message` -> `MESSAGE`
- `function_call` / `function_call_output` -> `TOOL`
- `web_search_call` -> `TOOL`
- `turn_context` / `reasoning` -> `CONTEXT`
- `token_count` and other runtime state -> `SYSTEM`

## Metadata policy

Not every harness exposes the same identifiers. Instead of widening the span schema for every new field, preserve harness-specific detail in two places:

- trace-level metadata:
  - `source_harness`
  - `source_session_id`
  - `source_path`
  - `cwd`
  - `git_branch`
  - `trace_name`
- span-level `attributes`

This keeps the first pass stable while preserving future analysis options.

## Replay-first before live

The first adapter implementations should stay replay-first:

- import existing session files
- write normalized traces into `traces/`
- open them in the existing viewer

This gives direct testability now without committing to a live-watcher architecture too early.

Full live support can follow after the replay importers prove the schema and UX.
