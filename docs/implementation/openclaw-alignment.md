# OpenClaw Alignment: From Assumptions to Reality

**Document Date:** 2026-03-18
**Status:** Completed
**Phase:** Post-Source Analysis Alignment

---

## Executive Summary

### Why Alignment Was Needed

ClawScope's initial event model was based on documentation research and reasonable assumptions about OpenClaw's observable runtime behavior. While the documentation provided valuable architectural insights, it lacked the precision needed to build a production-grade profiling tool. The alignment phase involved analyzing OpenClaw's actual source code (commit 0e9b899, version 2026.3.14) to ground ClawScope's data model in observable reality.

### What Changed

The source analysis revealed OpenClaw implements a **dual-event architecture** with two independent systems:
1. **Diagnostic Events** (`src/infra/diagnostic-events.ts`) - Infrastructure telemetry
2. **Agent Events** (`src/infra/agent-events.ts`) - Runtime lifecycle and tool execution

This discovery led to significant refinements in ClawScope's event categories, metadata fields, and storage indexes to match OpenClaw's actual emission patterns.

### Impact on ClawScope

**Positive outcomes:**
- Event model now grounded in exact source code instrumentation points
- Storage indexes optimized for actual OpenClaw query patterns
- Fidelity markers accurately reflect observability quality
- Viewer categories aligned with real event types

**Architectural validation:**
- Three-tier data model (raw/normalized/derived) remains sound
- Waterfall-first visualization approach validated
- Reconstructability requirement achievable with actual events
- Local-first storage design compatible with OpenClaw's architecture

---

## Timeline

### Phase 1: Documentation Research (Pre-Alignment)

**Duration:** Initial research phase
**Output:** `/docs/research/openclaw-documentation-research.md`

**Approach:**
- Analyzed official OpenClaw documentation sites
- Reviewed technical blog posts and architecture deep-dives
- Studied hook system, memory architecture, and multi-agent coordination
- Identified observable event points from documentation

**Key findings:**
- Confirmed multi-agent coordination patterns
- Identified session lifecycle and memory operations
- Discovered hook execution and plugin events
- Found diagnostic events via diagnostics-otel plugin

**Limitations:**
- No access to exact instrumentation points
- Missing metadata field specifications
- Unclear span vs instant event classification
- Inferred tool execution behavior (not directly documented)

### Phase 2: Source Code Analysis (Alignment Trigger)

**Duration:** Source analysis phase
**Output:** `/docs/research/openclaw-source-analysis.md`

**Approach:**
- Cloned OpenClaw repository (https://github.com/openclaw/openclaw)
- Analyzed 4,761 TypeScript files in `src/`, 1,817 in `extensions/`
- Traced event emission call sites
- Documented exact metadata fields available
- Classified events by fidelity (exact/derived/inferred)

**Key discoveries:**
- Dual-event architecture (diagnostic + agent events)
- In-process event emitter pattern with listener registration
- OpenTelemetry integration via diagnostics-otel extension
- Exact emission points and metadata schemas
- Sensitive data redaction patterns

### Phase 3: Alignment Phase (Current)

**Duration:** Post-source analysis
**Output:** This document + updated event model and storage design

**Activities:**
- Reconciled documentation assumptions with source reality
- Updated event categories to match actual emission patterns
- Added OpenClaw-specific metadata fields
- Refined storage indexes for real query patterns
- Validated viewer categories against source events
- Documented migration path for future changes

---

## Event Category Changes

### Before/After Comparison

| Category | Documentation Research | Source Analysis | Status |
|----------|----------------------|-----------------|--------|
| `MODEL` | Assumed from diagnostics | ✅ Confirmed: `model.usage` event | **Validated** |
| `TOOL` | Inferred from agent behavior | ✅ Confirmed: `tool` stream (start/end/result) | **Validated** |
| `AGENT` | Assumed from coordination docs | ✅ Confirmed: `lifecycle` stream (start/end/error) | **Validated** |
| `WEBHOOK` | Assumed from diagnostics | ✅ Confirmed: `webhook.*` events | **Validated** |
| `MESSAGE` | Assumed from queue docs | ✅ Confirmed: `message.*` events | **Validated** |
| `SESSION` | Assumed from session docs | ✅ Confirmed: `session.*` events | **Validated** |
| `QUEUE` | Assumed from queue docs | ✅ Confirmed: `queue.lane.*` events | **Validated** |
| `RUN` | Not in documentation | ✅ **Added**: `run.attempt` event | **New** |
| `CONTEXT` | Assumed from memory docs | ⚠️ Partial: context metadata in `model.usage` | **Refined** |
| `SYSTEM` | Assumed from daemon docs | ✅ Confirmed: `diagnostic.heartbeat` | **Validated** |
| `USER_IO` | Assumed from webhook docs | ⚠️ Merged into WEBHOOK/MESSAGE | **Removed** |
| `MEMORY` | Assumed from memory docs | ⚠️ Not in diagnostic events | **Deferred** |
| `HOOK` | Assumed from hook docs | ⚠️ Not in diagnostic events | **Deferred** |
| `STATE` | Assumed from session docs | ⚠️ Merged into SESSION | **Removed** |
| `CRON` | Assumed from cron docs | ⚠️ Not in diagnostic events | **Deferred** |
| `PLUGIN` | Assumed from plugin docs | ⚠️ Not in diagnostic events | **Deferred** |

### Removed Categories and Why

**USER_IO** → Merged into WEBHOOK and MESSAGE
- Rationale: OpenClaw doesn't emit generic "user input" events
- Reality: Webhooks capture external input, messages capture processing
- Impact: Viewer uses WEBHOOK/MESSAGE categories instead

**STATE** → Merged into SESSION
- Rationale: Session state transitions are the primary state events
- Reality: `session.state` event captures all state changes
- Impact: No separate STATE category needed

**MEMORY, HOOK, CRON, PLUGIN** → Deferred to Phase 4+
- Rationale: Not emitted by diagnostic events system
- Reality: These may exist in agent events or require custom instrumentation
- Impact: ClawScope MVP focuses on diagnostic events first
- Future: Can be added when agent events integration is implemented

### Added Categories and Why

**RUN** → New category for retry tracking
- Rationale: `run.attempt` event discovered in source analysis
- Reality: OpenClaw tracks agent run retry attempts explicitly
- Impact: Viewer can show retry patterns and failure recovery
- Metadata: `runId`, `attempt` number

**CONTEXT** → Refined to metadata-only
- Rationale: No standalone context events, but context metadata exists
- Reality: `model.usage` includes `context.limit` and `context.used`
- Impact: Context window usage shown in MODEL spans, not separate category
- Future: May become full category if context assembly events added

---

## Event Model Updates

### Field Changes

**Added OpenClaw-specific fields:**

| Field | Type | Purpose | Source |
|-------|------|---------|--------|
| `channel` | string | Messaging channel (discord, slack, etc.) | Diagnostic events |
| `session_key` | string | Session correlation identifier | Diagnostic + agent events |
| `run_id` | string | Agent run identifier | Agent events |
| `tool_call_id` | string | Tool execution identifier | Agent events |
| `lane` | string | Queue lane identifier | Diagnostic events |
| `update_type` | string | Webhook update type | Diagnostic events |
| `seq` | integer | Monotonic sequence number (per runId or global) | Both event systems |
| `ts` | integer | Unix timestamp in milliseconds | Both event systems |

**Refined existing fields:**

| Field | Before | After | Reason |
|-------|--------|-------|--------|
| `tokens.input` | Assumed | ✅ `usage.input` | Exact field name from source |
| `tokens.output` | Assumed | ✅ `usage.output` | Exact field name from source |
| `tokens.cache_read` | Assumed | ✅ `usage.cacheRead` | Exact field name from source |
| `tokens.cache_write` | Assumed | ✅ `usage.cacheWrite` | Exact field name from source |
| `cost_usd` | Assumed | ✅ `costUsd` | Exact field name from source |
| `context.limit` | Assumed | ✅ Confirmed in model.usage | Exact metadata available |
| `context.used` | Assumed | ✅ Confirmed in model.usage | Exact metadata available |

### Metadata Additions

**Model spans now include:**
- `provider` (string) - Model provider (e.g., "anthropic", "openai")
- `model` (string) - Model name (e.g., "claude-opus-4-6")
- `durationMs` (number) - Request duration
- `channel` (string) - Messaging channel
- `sessionKey` (string) - Session identifier

**Tool spans now include:**
- `toolCallId` (string) - Tool call identifier
- `toolName` (string) - Normalized tool name
- `args` (unknown) - Tool arguments
- `meta` (string) - Tool metadata
- `result` (unknown) - Tool result (sanitized)
- `isError` (boolean) - Error flag
- `errorMessage` (string) - Error message if failed

**Agent spans now include:**
- `runId` (string) - Unique run identifier
- `phase` (string) - "start", "end", "error"
- `startedAt` (number) - Start timestamp
- `endedAt` (number) - End timestamp
- `error` (string) - Error message (if phase=error)

### Schema Updates

**Updated normalized span schema:**

```sql
-- Added OpenClaw-specific fields
channel TEXT,
session_key TEXT,
run_id TEXT,
tool_call_id TEXT,
lane TEXT,
update_type TEXT,
seq INTEGER,
ts INTEGER,

-- Refined token fields to match source
token_input INTEGER,      -- was tokens.input
token_output INTEGER,     -- was tokens.output
token_cache_read INTEGER, -- was tokens.cache_read
token_cache_write INTEGER,-- was tokens.cache_write
cost_usd REAL,           -- was cost

-- Added provider field
provider TEXT
```

---

## Storage Design Updates

### New Indexes Added

**OpenClaw-specific indexes for actual event types:**

```sql
-- Channel-based queries (webhook, message events)
CREATE INDEX idx_spans_channel ON spans(channel)
WHERE channel IS NOT NULL;

-- Session correlation (cross-run analysis)
CREATE INDEX idx_spans_session_key ON spans(session_key)
WHERE session_key IS NOT NULL;

-- Run-based queries (agent lifecycle)
CREATE INDEX idx_spans_run_id ON spans(run_id)
WHERE run_id IS NOT NULL;

-- Tool call correlation
CREATE INDEX idx_spans_tool_call_id ON spans(tool_call_id)
WHERE tool_call_id IS NOT NULL;

-- Queue lane analysis
CREATE INDEX idx_spans_lane ON spans(lane)
WHERE lane IS NOT NULL;

-- Webhook type filtering
CREATE INDEX idx_spans_update_type ON spans(update_type)
WHERE update_type IS NOT NULL;

-- Event sequence ordering (per run)
CREATE INDEX idx_spans_seq ON spans(run_id, seq)
WHERE run_id IS NOT NULL AND seq IS NOT NULL;
```

### Query Pattern Changes

**Before (documentation assumptions):**
```sql
-- Generic agent filtering
SELECT * FROM spans WHERE agent_id = ?;

-- Generic time range
SELECT * FROM spans WHERE start_at BETWEEN ? AND ?;
```

**After (source-grounded patterns):**
```sql
-- Channel-specific analysis (actual OpenClaw pattern)
SELECT * FROM spans
WHERE channel = 'discord' AND category = 'MODEL'
ORDER BY start_at;

-- Session timeline reconstruction (actual correlation key)
SELECT * FROM spans
WHERE session_key = ?
ORDER BY start_at;

-- Run event sequence (actual ordering mechanism)
SELECT * FROM spans
WHERE run_id = ?
ORDER BY seq;

-- Tool execution correlation (actual identifier)
SELECT * FROM spans
WHERE tool_call_id = ?;
```

### Performance Optimizations

**Composite indexes for common OpenClaw patterns:**

```sql
-- Channel + category filtering (webhook → model flow)
CREATE INDEX idx_spans_channel_category
ON spans(channel, category)
WHERE channel IS NOT NULL;

-- Session timeline queries (session replay)
CREATE INDEX idx_spans_session_timeline
ON spans(session_key, start_at)
WHERE session_key IS NOT NULL;

-- Run event sequence (agent lifecycle reconstruction)
CREATE INDEX idx_spans_run_timeline
ON spans(run_id, seq)
WHERE run_id IS NOT NULL;
```

**Rationale:**
- OpenClaw often queries by channel + category together
- Session replay requires efficient session_key + time ordering
- Agent lifecycle reconstruction uses run_id + seq ordering
- Partial indexes reduce index size for nullable fields

---

## Viewer Updates

### Category Support Changes

**Before (documentation-based):**
- 15 categories including USER_IO, MEMORY, HOOK, STATE, CRON, PLUGIN
- Generic color scheme
- Assumed all categories would have spans

**After (source-grounded):**
- 10 validated categories: MODEL, TOOL, AGENT, WEBHOOK, MESSAGE, SESSION, QUEUE, RUN, CONTEXT, SYSTEM
- 5 deferred categories: MEMORY, HOOK, CRON, PLUGIN, ERROR
- Color scheme aligned with actual event types
- Viewer gracefully handles missing categories

### Color Scheme Updates

**Updated category colors to match event semantics:**

| Category | Color | Rationale |
|----------|-------|-----------|
| MODEL | Pink | High-cost, high-visibility operations |
| TOOL | Amber | Action-oriented, execution focus |
| AGENT | Green | Lifecycle, health, success |
| WEBHOOK | Indigo | External input, ingress |
| MESSAGE | Blue | Processing, flow |
| SESSION | Cyan | State management |
| QUEUE | Purple | Queueing, waiting |
| RUN | Orange | Retry, recovery |
| CONTEXT | Teal | Metadata, supporting info |
| SYSTEM | Slate | Infrastructure, background |

**Removed colors:**
- USER_IO (merged into WEBHOOK/MESSAGE)
- STATE (merged into SESSION)
- MEMORY, HOOK, CRON, PLUGIN (deferred)

### New Metadata Displays

**Model spans now show:**
- Provider badge (Anthropic, OpenAI, etc.)
- Model name with version
- Token breakdown (input/output/cache read/cache write)
- Cost in USD with 4 decimal places
- Context window usage (used/limit)
- Channel and session identifiers

**Tool spans now show:**
- Tool call ID for correlation
- Tool name (normalized)
- Arguments (sanitized)
- Result preview (sanitized)
- Error flag and message if failed
- Duration in milliseconds

**Agent spans now show:**
- Run ID for correlation
- Phase (start/end/error)
- Session key for cross-run analysis
- Error details if failed
- Sequence number for ordering

**Webhook spans now show:**
- Channel (discord, slack, etc.)
- Update type (message, reaction, etc.)
- Chat ID for correlation
- Processing duration

**Message spans now show:**
- Channel and source
- Outcome (completed/skipped/error)
- Queue depth at time of event
- Session key for correlation
- Reason for outcome

---

## Sample Data Updates

### Old Mock Data (Documentation-Based)

**Example span (before):**
```json
{
  "record_id": "span-1",
  "category": "USER_IO",
  "subtype": "user_input_received",
  "name": "User message received",
  "start_at": "2026-03-18T10:00:00Z",
  "duration_ms": 5,
  "agent_id": "agent-main",
  "status": "success",
  "fidelity": "assumed"
}
```

**Issues:**
- Generic USER_IO category (doesn't exist in OpenClaw)
- No channel or session correlation
- Missing OpenClaw-specific identifiers
- Fidelity marked as "assumed" (not a valid value)

### New Realistic Data (Source-Grounded)

**Example webhook span (after):**
```json
{
  "record_id": "span-webhook-1",
  "trace_id": "trace-xyz789",
  "record_kind": "span",
  "category": "WEBHOOK",
  "subtype": "webhook.received",
  "name": "Discord webhook received",
  "start_at": "2026-03-18T10:00:00.123Z",
  "end_at": "2026-03-18T10:00:00.145Z",
  "duration_ms": 22,
  "agent_id": "agent-main",
  "status": "success",
  "channel": "discord",
  "update_type": "message",
  "session_key": "session-abc123",
  "fidelity": "exact",
  "raw_refs": "[\"collector.jsonl:1\"]",
  "attributes": "{\"chatId\":\"123456789\"}",
  "created_at": 1710756000145000
}
```

**Example model span (after):**
```json
{
  "record_id": "span-model-1",
  "trace_id": "trace-xyz789",
  "record_kind": "span",
  "category": "MODEL",
  "subtype": "model.usage",
  "name": "Claude Opus 4.6 request",
  "start_at": "2026-03-18T10:00:01.000Z",
  "end_at": "2026-03-18T10:00:03.500Z",
  "duration_ms": 2500,
  "parent_span_id": "span-webhook-1",
  "agent_id": "agent-main",
  "status": "success",
  "model_name": "claude-opus-4-6",
  "provider": "anthropic",
  "token_input": 1500,
  "token_output": 800,
  "token_cache_read": 200,
  "token_cache_write": 0,
  "cost_usd": 0.045,
  "channel": "discord",
  "session_key": "session-abc123",
  "run_id": "run-def456",
  "seq": 5,
  "fidelity": "exact",
  "raw_refs": "[\"collector.jsonl:15\", \"collector.jsonl:42\"]",
  "attributes": "{\"context\":{\"limit\":200000,\"used\":12500}}",
  "created_at": 1710756003500000
}
```

**Example tool span (after):**
```json
{
  "record_id": "span-tool-1",
  "trace_id": "trace-xyz789",
  "record_kind": "span",
  "category": "TOOL",
  "subtype": "tool_execution",
  "name": "Read file: config.json",
  "start_at": "2026-03-18T10:00:02.000Z",
  "end_at": "2026-03-18T10:00:02.150Z",
  "duration_ms": 150,
  "parent_span_id": "span-model-1",
  "agent_id": "agent-main",
  "status": "success",
  "tool_name": "Read",
  "tool_call_id": "tool-call-abc123",
  "run_id": "run-def456",
  "session_key": "session-abc123",
  "seq": 6,
  "fidelity": "exact",
  "raw_refs": "[\"collector.jsonl:20\", \"collector.jsonl:25\"]",
  "attributes": "{\"args\":{\"file_path\":\"/path/to/config.json\"},\"result\":\"<file contents>\"}",
  "created_at": 1710756002150000
}
```

### Event Structure Changes

**Key improvements:**
1. **Real categories**: WEBHOOK, MODEL, TOOL instead of generic USER_IO
2. **Correlation IDs**: session_key, run_id, tool_call_id for linking events
3. **Exact metadata**: Actual field names from OpenClaw source
4. **Fidelity markers**: "exact" for directly observed events
5. **Raw references**: Pointers to source data for auditability
6. **Attributes**: Extensible JSON for source-specific details
7. **Timestamps**: Microsecond precision for accurate ordering

---

## Lessons Learned

### 1. Importance of Source Analysis First

**Lesson:** Documentation provides architectural context, but source code reveals implementation reality.

**Evidence:**
- Documentation suggested 15+ event categories
- Source analysis found 10 validated categories in diagnostic events
- 5 categories deferred (not in diagnostic events system)

**Impact:**
- Avoided building viewer features for non-existent events
- Storage indexes optimized for actual query patterns
- Fidelity markers accurately reflect observability quality

**Recommendation:** For future integrations, prioritize source analysis over documentation research. Documentation is valuable for understanding intent, but source code is ground truth.

### 2. Value of Flexible Architecture

**Lesson:** ClawScope's three-tier data model (raw/normalized/derived) proved resilient to alignment changes.

**Evidence:**
- Raw layer preserved OpenClaw events exactly as emitted
- Normalized layer adapted to new fields without schema breaking changes
- Derived layer remained unchanged (summaries still valid)

**Impact:**
- No major architectural refactoring required
- Storage design accommodated new indexes without migration
- Viewer components adapted to new categories with minimal changes

**Recommendation:** Maintain separation between raw evidence, normalized model, and derived analysis. This flexibility enables alignment without data loss.

### 3. Dual-Event Architecture Discovery

**Lesson:** OpenClaw's separation of diagnostic and agent events was not obvious from documentation.

**Evidence:**
- Documentation mentioned "diagnostic events" generically
- Source revealed two independent event systems with different purposes
- Agent events (lifecycle, tools, streaming) separate from diagnostic events

**Impact:**
- ClawScope MVP focuses on diagnostic events (infrastructure telemetry)
- Agent events integration deferred to Phase 4+
- Clear path for future expansion

**Recommendation:** When analyzing complex systems, look for architectural patterns (event emitters, listeners, exporters) that may not be explicitly documented.

### 4. Fidelity Markers Are Critical

**Lesson:** Distinguishing exact, derived, and inferred events prevents false confidence in data quality.

**Evidence:**
- Diagnostic events are "exact" (directly from instrumentation)
- Tool execution details are "exact" (from agent events)
- Memory operations are "inferred" (not in diagnostic events)

**Impact:**
- Viewer can show confidence levels for each span
- Users understand which data is directly observed vs reconstructed
- Future instrumentation improvements can upgrade fidelity

**Recommendation:** Always mark observability quality explicitly. Users need to know what's real vs what's inferred.

### 5. Correlation IDs Are Essential

**Lesson:** OpenClaw's correlation identifiers (runId, sessionKey, toolCallId) enable powerful analysis.

**Evidence:**
- `runId` links all events in a single agent execution
- `sessionKey` correlates events across multiple runs
- `toolCallId` links tool start/end/result events
- `seq` provides deterministic ordering within a run

**Impact:**
- Storage indexes optimized for correlation queries
- Viewer can reconstruct agent lifecycle accurately
- Session replay uses sessionKey for cross-run analysis

**Recommendation:** Identify and preserve all correlation identifiers from source system. They enable analysis patterns not obvious during initial design.

### 6. Metadata Richness Varies by Event Type

**Lesson:** Not all events have the same metadata depth. Model events are rich, queue events are sparse.

**Evidence:**
- Model events: 10+ metadata fields (tokens, cost, context, provider)
- Tool events: 8+ metadata fields (args, result, error, duration)
- Queue events: 3 metadata fields (lane, queueSize, waitMs)

**Impact:**
- Viewer detail modal adapts to available metadata
- Storage schema uses nullable fields for optional metadata
- Summary calculations handle missing data gracefully

**Recommendation:** Design for metadata heterogeneity. Don't assume all events have the same richness.

### 7. OpenTelemetry Integration Is Powerful

**Lesson:** OpenClaw's diagnostics-otel extension provides production-grade observability export.

**Evidence:**
- Exports traces, metrics, and logs to OTLP
- Includes sensitive data redaction
- Supports sampling and batching
- Configurable flush intervals

**Impact:**
- ClawScope can leverage existing OTLP export
- No need to build custom instrumentation
- Can integrate with standard observability tools

**Recommendation:** When possible, leverage existing observability infrastructure rather than building custom instrumentation.

---

## Future Recommendations

### Phase 4: Agent Events Integration

**Goal:** Integrate OpenClaw's agent events system for deeper runtime visibility.

**Scope:**
- Subscribe to agent events (`lifecycle`, `tool`, `assistant`, `error` streams)
- Add agent event categories: MEMORY, HOOK, STREAMING
- Capture assistant text deltas for streaming visualization
- Implement tool approval event tracking

**Benefits:**
- Richer tool execution details (args, results, errors)
- Agent lifecycle visibility (start, end, error, compaction)
- Streaming behavior analysis (text deltas, message chunks)
- Hook execution tracking

### Phase 5: Multi-Agent Coordination

**Goal:** Visualize multi-agent delegation and coordination patterns.

**Scope:**
- Swimlane timeline with one lane per agent
- Delegation hierarchy/DAG view
- Correlated selection across views
- Agent filtering and highlighting

**Benefits:**
- Understand coordinator-specialist patterns
- Debug multi-agent deadlocks
- Optimize delegation strategies
- Visualize agent isolation

### Phase 6: Cost Optimization

**Goal:** Provide actionable cost optimization recommendations.

**Scope:**
- Cost rollup by category, agent, model
- Identify expensive operations
- Suggest cheaper model alternatives
- Track cost trends over time

**Benefits:**
- Reduce LLM API costs
- Optimize model selection
- Identify cost runaway patterns
- Budget tracking and alerts

### Phase 7: Live Streaming Mode

**Goal:** Enable real-time trace visualization during agent execution.

**Scope:**
- Incremental span updates
- Live summary recalculation
- Timeline auto-scroll
- Replay from saved file produces identical view

**Benefits:**
- Debug issues as they happen
- Monitor long-running agents
- Catch errors early
- Validate live/replay parity

---

## Migration Guide

### For Existing Traces (If Any)

**Note:** ClawScope is in MVP phase, so existing traces are unlikely. This section is for future reference.

**If you have traces from pre-alignment ClawScope:**

1. **Backup existing data:**
   ```bash
   cp -r ~/.clawscope/traces ~/.clawscope/traces.backup
   ```

2. **Run migration script:**
   ```bash
   python scripts/migrate_v1_to_v2.py
   ```

3. **Verify migration:**
   ```bash
   python scripts/verify_migration.py
   ```

4. **Update viewer:**
   ```bash
   cd viewer && npm install && npm run build
   ```

**Migration changes:**
- Renames USER_IO spans to WEBHOOK or MESSAGE based on subtype
- Adds OpenClaw-specific fields (channel, session_key, run_id)
- Updates fidelity markers from "assumed" to "inferred"
- Adds raw_refs pointers (empty for pre-alignment data)

### For Future Development

**When adding new event types:**

1. **Check OpenClaw source first:**
   - Verify event exists in diagnostic or agent events
   - Document exact metadata fields available
   - Classify as exact, derived, or inferred

2. **Update event model:**
   - Add category to `/docs/design/event-model.md`
   - Document subtype and metadata
   - Add to category color scheme

3. **Update storage schema:**
   - Add indexes if new correlation patterns emerge
   - Update normalized span schema if new fields needed
   - Increment schema version

4. **Update viewer:**
   - Add category to color scheme
   - Update detail modal to show new metadata
   - Add filtering support

5. **Update sample data:**
   - Create realistic example spans
   - Include all required metadata
   - Test viewer rendering

### Breaking Changes

**Schema version 1 → 2 (this alignment):**

**Breaking:**
- Removed USER_IO category (use WEBHOOK or MESSAGE)
- Removed STATE category (use SESSION)
- Renamed token fields (tokens.input → token_input)
- Changed fidelity values ("assumed" → "inferred")

**Non-breaking:**
- Added OpenClaw-specific fields (nullable)
- Added new indexes (backward compatible)
- Added RUN category (new, not breaking)

**Migration required:** Yes, for traces using removed categories

**Backward compatibility:** Viewer can read v1 traces with warnings

---

## Conclusion

The OpenClaw alignment phase successfully grounded ClawScope's event model in observable reality. By analyzing OpenClaw's actual source code, we:

1. **Validated** 10 event categories with exact instrumentation points
2. **Deferred** 5 categories not present in diagnostic events
3. **Added** OpenClaw-specific metadata fields and correlation IDs
4. **Optimized** storage indexes for actual query patterns
5. **Updated** viewer to match real event types and metadata

The three-tier data model (raw/normalized/derived) proved resilient to these changes, requiring only additive schema updates and new indexes. The waterfall-first visualization approach remains sound, and the reconstructability requirement is achievable with actual OpenClaw events.

ClawScope is now ready for Phase 2 (collector implementation) with confidence that the data model matches OpenClaw's runtime behavior.

---

**Document Status:** Complete
**Next Steps:** Implement Phase 2 collector with source-grounded event capture
**Related Documents:**
- `/docs/design/event-model.md` - Updated normalized event model
- `/docs/design/storage-design.md` - Updated storage schema and indexes
- `/docs/research/openclaw-source-analysis.md` - Source code findings
- `/docs/research/openclaw-documentation-research.md` - Initial research
