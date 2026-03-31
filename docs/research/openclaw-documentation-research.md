# OpenClaw Documentation Research

This document archives the extensive research gathered about OpenClaw's architecture, runtime behavior, and observable events. This research was conducted through analysis of official documentation, blog posts, and technical guides rather than direct source code analysis.

**Note**: This is a documentation-based analysis. For actual source code analysis, see the roadmap Phase 1 which requires cloning and analyzing the OpenClaw GitHub repository at https://github.com/openclaw/openclaw (300k+ stars).

## Research Methodology

Information was gathered from:
- Official OpenClaw documentation sites
- Technical blog posts and tutorials
- Architecture deep-dives
- Plugin and hook system guides
- Multi-agent coordination patterns
- Observability and logging documentation

## Session Management Architecture

### Storage Locations

OpenClaw persists session data across two distinct layers:

**Session Store** (`~/.openclaw/agents/<agentId>/sessions.json`):
- Key-value map tracking metadata
- Current session ID
- Activity timestamps
- Feature toggles
- Token counters
- Small, mutable, safe to edit

**Session Transcripts** (`~/.openclaw/agents/<agentId>/sessions/*.jsonl`):
- Append-only JSONL format
- Tree structure with `id` and `parentId` fields
- Stores conversations, tool calls, and compaction summaries
- Used to rebuild model context

### Session Routing

Sessions are identified by `sessionKey` patterns:
- Main chat: `agent:<agentId>:main`
- Groups: `agent:<agentId>:<channel>:group:<id>`
- Cron jobs: `cron:<job.id>`
- Webhooks: `hook:<uuid>`

Each `sessionKey` points to a current `sessionId` (the active transcript file).

### Automatic Session Resets

New `sessionId` values are created via:
- Explicit `/reset` commands
- Daily resets (default 4:00 AM local time)
- Idle expiry when configured
- Thread parent fork guard (skips forking if parent exceeds 100,000 tokens)

### Compaction Mechanics

Compaction summarizes older conversation into a persistent entry while keeping recent messages intact.

**Auto-compaction triggers:**
- Model returns context overflow error
- Context usage exceeds `contextWindow - reserveTokens`

**Default settings:**
- Reserve tokens: 16,384
- Keep recent tokens: 20,000
- Safety floor: 20,000 tokens minimum

### Memory Flush Strategy

Before auto-compaction, OpenClaw can trigger a silent "memory flush" turn when context crosses a soft threshold (default 4,000 tokens below compaction point). This writes durable state to the agent workspace, preventing critical context loss during compaction.

### Session Maintenance

Session maintenance (`session.maintenance`) offers automatic cleanup:
- Prune stale entries after 30 days
- Cap store entries at 500
- Rotate `sessions.json` at 10MB
- Optional disk budget enforcement with 80% high-water target

## Memory System Architecture

### Three-Layer Storage

**Workspace Memory Files** (`~/.openclaw/workspace`):
- `MEMORY.md` or `memory.md` for long-term summaries
- `memory/*.md` for rolling notes
- Injected as bootstrap context with deduplication and size caps

**Session Transcripts** (`~/.openclaw/agents/<agentId>/sessions/*.jsonl`):
- Header and message rows for session restore and debugging

**Index Store** (`~/.openclaw/memory/<agentId>.sqlite`):
- Tables for metadata, files, chunks, and embedding cache
- Optional FTS5 and sqlite-vec structures

### Data Persistence Paths

Three write mechanisms:

1. **Manual persistence** — agents search first, then write durable facts to `MEMORY.md` or dated files
2. **Pre-compaction flush** — triggered near token threshold to persist long-term facts automatically
3. **Session-memory hook** — on `/new` command, extracts recent turns, generates a slug, and writes `memory/YYYY-MM-DD-<slug>.md`

### Retrieval and Indexing

**Search-first policy:**
- `memory_search` — hybrid vector + keyword
- `memory_get` — constrained to markdown files

**Indexing pipeline:**
- Chunks markdown using character approximation
- Supports multiple embedding providers (OpenAI, Gemini, local, auto)
- Combines vector and text scores: `final = vectorWeight * vectorScore + textWeight * textScore`

**File discovery:**
- Indexes only `.md` files
- Symlinks are skipped
- Sync triggers: session start, search calls, file watchers, optional intervals

### Security and Limitations

**Security:**
- Path and extension checks constrain `memory_get` reads
- Symlinks are ignored

**Known limitations:**
- Weak Chinese text parsing in FTS
- Fire-and-forget async sync
- Token approximation drift in multilingual content
- Potential sensitive data leakage if session indexing enabled without desensitization hooks

## Logging System

### Log Storage & Access

**File logs:**
- Location: `/tmp/openclaw/openclaw-YYYY-MM-DD.log` (default)
- Configurable via `~/.openclaw/openclaw.json`
- Format: JSONL (one JSON object per line)

**Access methods:**
- CLI: `openclaw logs --follow` (recommended for live tailing)
- Control UI: Logs tab

### Log Formats

**File logs:**
- JSONL format
- Parsed by CLI and UI for structured output

**Console output:**
- TTY-aware
- Subsystem prefixes
- Level-based coloring
- Compact or JSON modes via `logging.consoleStyle`

### Configuration Options

The `logging` section in `openclaw.json` controls:

**Level settings:**
- `logging.level` — file logs
- `logging.consoleLevel` — console output

**Console styles:**
- `pretty` — colored, human-friendly
- `compact` — tighter format
- `json` — structured JSON

**Redaction:**
- `logging.redactSensitive` — masks tokens in console output only (not file logs)

**Override options:**
- Environment variable: `OPENCLAW_LOG_LEVEL`
- CLI flag: `--log-level`

### Diagnostics & OpenTelemetry

Beyond standard logs, OpenClaw emits structured diagnostic events for model runs and message flow.

**diagnostics-otel plugin** exports via OTLP/HTTP to any compatible collector:

**Metrics captured:**
- Token usage
- Costs
- Message flow counters
- Queue depth

**Traces captured:**
- Model usage spans
- Webhook processing
- Message handling

**Logs:**
- Optional OTLP log export respecting `logging.level`

**Configuration:**
```json
{
  "diagnostics": {
    "enabled": true
  }
}
```

Configure exporter endpoint, sample rate, and flush intervals.

### Diagnostic Events Tracked

Key events include:
- `model.usage` — token counts, costs, model name
- `webhook.received` — incoming webhook events
- `webhook.processed` — successful webhook handling
- `webhook.error` — webhook processing failures
- `message.queued` — messages entering queue
- `message.processed` — messages handled
- `queue.lane.enqueue` — lane-specific queueing
- `queue.lane.dequeue` — lane-specific processing
- `session.state` — session lifecycle events
- `session.stuck` — warnings with associated metadata

All events include metadata like tokens, duration, channel, and session IDs.

## Hook System

### Core Architecture

OpenClaw's hooks provide an event-driven automation layer that runs within the Gateway when agent events fire.

**Discovery directories** (in precedence order):
1. Workspace hooks: `<workspace>/hooks/`
2. Managed hooks: `~/.openclaw/hooks/`
3. Bundled hooks: shipped with OpenClaw

### Event Types

**Command Events** — trigger when agent commands execute:
- `command:new` — issued when `/new` is called
- `command:reset` — triggered by `/reset`
- `command:stop` — triggered by `/stop`
- `command` — general listener for all command events

**Agent Events** — fire during bootstrap:
- `agent:bootstrap` — before workspace bootstrap files are injected (handlers can mutate `context.bootstrapFiles`)

**Gateway Events** — occur at startup:
- `gateway:startup` — after channels start and hooks load

**Tool Result Hooks** (Plugin API):
- `tool_result_persist` — synchronously adjusts tool results before persistence

### Hook Structure

Each hook requires two files:

1. **HOOK.md** — Contains YAML frontmatter with metadata and documentation
2. **handler.ts** — Exports a `HookHandler` function

Metadata specifies:
- Emoji display
- Event listeners
- Required binaries/environment variables
- OS compatibility
- Documentation URLs

### Event Context

Handlers receive an event object containing:
- `type` and `action` (command, session, agent, or gateway)
- `sessionKey` and `timestamp`
- `messages` array for user communication
- `context` with session data, workspace directory, bootstrap files, and configuration

### Bundled Hooks

OpenClaw ships with four hooks:

**session-memory:**
- Saves session context to memory on `/new`
- Generates dated filenames

**command-logger:**
- Logs all commands to `~/.openclaw/logs/commands.log`
- JSONL format

**boot-md:**
- Executes `BOOT.md` at gateway startup

**soul-evil:**
- Swaps `SOUL.md` with `SOUL_EVIL.md` during configured windows

### Integration Points

Hooks integrate with the agent runtime through:
- Command validation pipeline (triggers before/after command processing)
- Bootstrap file injection (allows mutation of workspace files)
- Gateway startup sequence (loads after channels initialize)
- Session lifecycle (can access session entries and transcripts)

### Configuration

Discovery-based format:
```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "hook-name": { "enabled": true }
      }
    }
  }
}
```

Per-hook configuration supports custom environment variables and eligibility requirements.

## Multi-Agent Coordination

### Core Architecture

OpenClaw uses **deterministic routing** via bindings that map `(channel, accountId, peer/guild)` tuples to agent IDs. The most specific binding wins, enabling predictable message routing without runtime classification overhead.

### Agent Isolation

Each agent operates with isolated resources:
- Dedicated workspace directory: `~/.openclaw/agents/<agentId>/workspace`
- Independent sessions and memory files
- Per-agent tool allow/deny configuration
- Separate auth profiles and model settings

### Coordination Patterns

**Coordinator-Specialist Model** (primary pattern):
- Coordinator receives tasks, classifies them, and delegates via `sessions_send` or `sessions_spawn`
- Specialists remain stateless—completing single tasks then terminating
- Coordinator owns persistent memory and aggregates results

**Shared State via Files:**

Common workspace directories enable agents to read/write coordination files:
- `goal.md` — task decomposition
- `plan.md` — execution plan with assignments
- `status.md` — subtask states (pending/in-progress/complete/blocked)
- `log.md` — append-only audit trail

### Delegation APIs

**sessions_send:**
- Sends message to existing session
- Used for communication between running agents

**sessions_spawn:**
- Creates new agent session
- Used for delegating work to specialists

**teammate_shutdown:**
- Terminates stuck or completed agents
- Used for cleanup and resource management

### Failure Prevention

**Infinite Loops:**
- Enforce no-recursion rules in prompts
- Deny `sessions_send` access to specialists to prevent delegation cycles

**Deadlocks:**
- Use unique task IDs
- Check status before claiming tasks
- Implement per-run timeouts
- Leverage `teammate_shutdown` for stuck agents

**Race Conditions:**
- Design writes as idempotent
- Use append-only logging rather than overwrites

**Cost Runaway:**
- Keep specialists stateless (no persistent memory)
- Summarize before storing
- Use concurrency limits deliberately
- Assign cheaper models to lightweight coordination tasks

### Observability

OpenClaw emits GenAI-standard OpenTelemetry traces tagged by `agentId`, enabling distributed tracing across delegation chains.

**Prometheus metrics** surface per-agent performance:
- Runs
- Success/failure counts
- Token usage
- Session counts

### Governance

**Tool permissions:**
- Enforce minimal privilege per agent
- Per-agent allow/deny lists

**Sandbox mode:**
- Docker sandbox mode (`sandbox.mode: "non-main"`)
- Isolates agents handling untrusted input

**Emergency controls:**
- Gateway acts as emergency kill switch
- Stops all agents and sessions immediately

## Plugin SDK Architecture

### Manifest-Based System

Plugins use JSON Schema validation with jiti transpilation (TypeScript → JavaScript at runtime, no build step).

**Manifest file:** `OpenClaw.plugin.json`
- Configuration schemas
- UI hints for form rendering

### Plugin Capabilities

Plugins can register:
- Gateway RPC methods
- HTTP handlers
- Agent tools
- CLI commands
- Background services
- Skills (bundled SKILL.md folders)
- Auto-reply commands that bypass the AI agent

### Discovery & Precedence

Plugins load from (in order):
1. Config paths
2. Workspace extensions
3. Global extensions
4. Bundled extensions (disabled by default)

**First match wins** — bundled plugins require explicit enablement.

### Plugin Slots

Mutually exclusive categories allow only one plugin per slot.

**Example:** Memory backend selection
- `memory-core`
- `memory-lancedb`
- `none`

Only one can be active at a time.

## Infrastructure Components

### Cron Scheduling System

OpenClaw implements three schedule types:
- Standard cron expressions with timezone support
- Recurring jobs
- Interval-based execution

**Features:**
- Each job runs in isolated agent context
- Prevents interference with main session
- Stuck job detection tracks execution state (duration, status, errors)
- Automatically prunes historical run logs

### Security Architecture (7 Subsystems)

**1. Injection Detection:**
- Identity-first access control with DM pairing
- Group allowlists
- Mention gating
- 9-layer tool policy that treats the model as untrusted

**2. SSRF Prevention:**
- DNS resolution with IP pinning
- Blocklists for private ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- DNS rebinding protection

**3. Ed25519 Device Identity:**
- Cryptographic keypair generation on first run
- Connection challenges use single-use nonces to prevent replay attacks

**4. Exec Safety:**
- Command allowlists with glob patterns
- "Safe bins" concept for stdin-only utilities (jq, grep, sort)
- Per-segment shell chain validation

**5. Audit Framework:**
- Runtime scanner checking:
  - Inbound access
  - Tool blast radius
  - Network exposure
  - Browser control
  - Disk hygiene
  - Plugins
  - Model configuration

**6. Formal Verification (TLA+):**
- Machine-checked proofs for protocol logic
- Gateway exposure
- Node execution pipelines
- Approval tokens
- Routing isolation

**7. Credential Isolation:**
- Credentials scattered across multiple files by design
- Enforced permissions (600 for sensitive files, 700 for directories)

### Daemon Management

**Platform Support:**

**macOS:**
- launchd with `KeepAlive` restart policy

**Linux:**
- systemd user service
- Requires `loginctl enable-linger`

**Windows:**
- Task Scheduler with logon trigger

**Multi-Profile Support:**
- Multiple Gateway instances run simultaneously
- Separate state directories
- Enables work/personal context separation on one machine

**Health Monitoring:**
- `openclaw status` — status checks
- `openclaw gateway probe` — connectivity probes
- `openclaw doctor` — full diagnostics

### Node Pairing & Extensibility

**Crypto Pairing Flow:**
1. Nodes present Ed25519 device identity
2. Gateway sends challenge nonce
3. Node signs and returns it
4. Gateway verifies and creates pairing request
5. Owner approves via CLI

**Capability Declaration:**
- Nodes declare capabilities at connect time:
  - Camera
  - Canvas
  - Screen
  - Location
  - Voice
  - Specific commands
- Server-side allowlists enforce permissions

**macOS Companion App:**
- Canvas (WebView rendering)
- Camera snapshots/video
- Screen recording
- Command execution
- All gated by exec approvals and sandbox policy

## Observable Event Points (Documentation-Based)

Based on the documentation research, the following event points are observable in OpenClaw:

### Session Lifecycle Events

**Observable:**
- Session creation (new sessionId generated)
- Session reset (`/reset` command)
- Session compaction (context overflow)
- Session termination
- Daily auto-reset (4:00 AM default)

**Metadata available:**
- Session key
- Session ID
- Timestamp
- Token counts
- Compaction triggers

**Event type:** Spans (session has duration) and instant events (reset, creation)

**Category:** `SESSION` or `AGENT`

### Memory Operations

**Observable:**
- Memory search (`memory_search` calls)
- Memory get (`memory_get` calls)
- Memory write (file writes to `MEMORY.md` or `memory/*.md`)
- Pre-compaction flush
- Session-memory hook execution

**Metadata available:**
- File paths
- Search queries
- Vector/text scores
- Chunk counts
- Embedding provider

**Event type:** Spans (search/write operations have duration)

**Category:** `MEMORY`

### Hook Execution

**Observable:**
- Hook discovery at startup
- Hook handler execution
- Command hooks (`command:new`, `command:reset`, `command:stop`)
- Agent bootstrap hooks
- Gateway startup hooks
- Tool result hooks

**Metadata available:**
- Hook name
- Event type
- Session key
- Timestamp
- Handler success/failure

**Event type:** Spans (hook execution has duration)

**Category:** `HOOK`

### Diagnostic Events

**Observable (via diagnostics-otel plugin):**
- `model.usage` — LLM API calls
- `webhook.received` — incoming webhooks
- `webhook.processed` — webhook handling
- `webhook.error` — webhook failures
- `message.queued` — message queueing
- `message.processed` — message handling
- `queue.lane.enqueue` — lane-specific queueing
- `queue.lane.dequeue` — lane-specific processing
- `session.state` — session state changes
- `session.stuck` — stuck session warnings

**Metadata available:**
- Tokens (input/output)
- Costs
- Duration
- Channel
- Session IDs
- Model name
- Status

**Event type:** Spans (operations have duration) and instant events (state changes)

**Category:** `MODEL`, `WEBHOOK`, `MESSAGE`, `SESSION`

### Multi-Agent Events

**Observable:**
- Agent spawn (`sessions_spawn`)
- Agent message send (`sessions_send`)
- Agent shutdown (`teammate_shutdown`)
- Coordinator delegation
- Specialist task completion

**Metadata available:**
- Agent ID
- Origin agent ID
- Target agent ID
- Session key
- Workspace directory
- Tool permissions

**Event type:** Spans (agent execution has duration) and instant events (spawn, shutdown)

**Category:** `AGENT`

### Cron Job Events

**Observable:**
- Job scheduling
- Job execution start
- Job execution end
- Stuck job detection
- Run history pruning

**Metadata available:**
- Job ID
- Schedule expression
- Execution duration
- Status
- Errors
- Agent context

**Event type:** Spans (job execution has duration)

**Category:** `CRON` or `SYSTEM`

### Plugin Events

**Observable:**
- Plugin discovery
- Plugin loading
- Plugin registration (RPC methods, HTTP handlers, tools, CLI commands)
- Plugin slot conflicts

**Metadata available:**
- Plugin name
- Capabilities registered
- Slot assignments
- Load order

**Event type:** Instant events (plugin lifecycle)

**Category:** `PLUGIN` or `SYSTEM`

## Event Categories Validation

Based on documentation research, OpenClaw's observable events extend **well beyond** just MODEL and TOOL categories.

### Confirmed Categories

**USER_IO:**
- Webhook received/processed
- Message queued/processed
- Command execution

**CONTEXT:**
- Memory search/get/write
- Session context assembly
- Bootstrap file injection

**MODEL:**
- Model usage (via diagnostics)
- Token counts
- Costs

**TOOL:**
- Tool execution (inferred from agent behavior)
- Tool result persistence hooks

**AGENT:**
- Agent spawn/shutdown
- Session send
- Multi-agent coordination
- Agent bootstrap

**MEMORY:**
- Memory operations
- Index updates
- Embedding generation

**HOOK:**
- Hook execution
- Event-driven automation

**STATE:**
- Session state changes
- Session stuck warnings
- Compaction triggers

**SYSTEM:**
- Gateway startup
- Plugin loading
- Cron job execution
- Daemon management

**WEBHOOK:**
- Webhook lifecycle events

**MESSAGE:**
- Message queue operations

**CRON:**
- Scheduled job execution

## Observability Fidelity

Based on documentation, observability fidelity varies:

**Exact (directly observable):**
- Diagnostic events (via diagnostics-otel plugin)
- Hook executions
- Session lifecycle events
- Memory operations
- Webhook events
- Cron job events

**Derived (computed from multiple signals):**
- Session compaction triggers (derived from token counts)
- Agent coordination patterns (derived from sessions_send/spawn calls)
- Cost calculations (derived from token counts + model pricing)

**Inferred (reconstructed from indirect evidence):**
- Tool executions (not directly instrumented, inferred from agent behavior)
- Model streaming chunks (not explicitly documented)
- Sub-agent hierarchy (inferred from spawn relationships)

## Gaps and Limitations

### Missing from Documentation

The following were **not found** in documentation research:

**Model-level details:**
- Streaming chunk events
- First token received timing
- Request retry mechanisms
- Model selection logic

**Tool-level details:**
- Tool selection process
- Tool parameter validation
- Tool execution sandboxing
- Tool result transformation

**Context assembly:**
- Prompt compilation steps
- Context window management
- File context loading specifics

**Error handling:**
- Error propagation paths
- Retry strategies
- Fallback mechanisms

### Requires Source Code Analysis

To complete the event inventory, the following require actual source code analysis:

1. **Exact instrumentation points** in the TypeScript codebase
2. **Event emission locations** in `src/` directory
3. **Metadata fields** actually available at each event point
4. **Span vs instant event** classification based on implementation
5. **Parent-child relationships** in the event hierarchy
6. **Causal relationships** between events
7. **Streaming behavior** for model responses
8. **Tool execution pipeline** implementation details

## Recommendations for Source Code Analysis

When analyzing the actual OpenClaw source code (https://github.com/openclaw/openclaw), focus on:

### Priority 1: Core Runtime Loop

**Files to analyze:**
- `src/index.ts` — entry point
- `src/gateway/` — main runtime
- `src/sessions/` — session management
- `src/channels/` — message routing

**Look for:**
- Main event loop
- Message processing pipeline
- Session lifecycle hooks
- Event emission points

### Priority 2: Model Integration

**Files to analyze:**
- `src/model/` or `src/llm/` — model integration
- `src/providers/` — LLM provider adapters

**Look for:**
- Model request construction
- Streaming implementation
- Token counting
- Cost calculation
- Retry logic

### Priority 3: Tool Execution

**Files to analyze:**
- `src/tools/` — tool registry and execution
- `src/exec/` — command execution

**Look for:**
- Tool selection logic
- Tool invocation pipeline
- Result handling
- Sandboxing implementation

### Priority 4: Multi-Agent System

**Files to analyze:**
- `src/agents/` — agent management
- `src/sessions/` — session spawning

**Look for:**
- `sessions_send` implementation
- `sessions_spawn` implementation
- Agent isolation mechanisms
- Coordination primitives

### Priority 5: Observability

**Files to analyze:**
- `src/diagnostics/` — diagnostic events
- `extensions/diagnostics-otel/` — OpenTelemetry plugin
- `src/hooks/` — hook system

**Look for:**
- Event emission calls
- Trace/span creation
- Metric collection
- Log statements

## Sources

This research was compiled from the following sources:

### Official Documentation
- https://beaverslab.mintlify.app/en/hooks — Hook system documentation
- https://xlongxia.mintlify.app/logging — Logging system documentation

### Architecture Deep Dives
- https://www.moely.ai/resources/openclaw-memory-design — Memory system architecture
- https://www.db0.ai/blog/how-openclaw-memory-works — Memory system deep dive
- https://cryptoclawdocs.termix.ai/reference/session-management-compaction — Session management
- https://avasdream.com/blog/openclaw-infrastructure-security-deep-dive — Infrastructure and plugin SDK
- https://lumadock.com/tutorials/openclaw-multi-agent-coordination-governance — Multi-agent coordination
- https://macaron.im/en/blog/openclaw-github — GitHub repository structure

### Observability
- https://www.thenextgentechinsider.com/pulse/ai-agents-gain-full-observability-via-native-openclaw-plugin — Observability plugin

### Additional Resources
- https://lobehub.com/skills/openclaw-skills-session-logs — Session logs skill
- https://playbooks.com/skills/openclaw/skills/session-logs — Session logs documentation
- https://lumadock.com/tutorials/openclaw-webhooks-explained — Webhooks guide
- https://danielhnyk.cz/openclaw-multi-agent-mattermost-routing/ — Multi-agent routing
- https://computertech.co/openclaw-skills-sub-agents-guide-2026/ — Skills and sub-agents guide

## Next Steps

To complete Phase 1 of the ClawScope roadmap:

1. **Clone the OpenClaw repository:**
   ```bash
   git clone https://github.com/openclaw/openclaw
   ```

2. **Analyze the source code** following the priority order above

3. **Create `docs/research/openclaw-source-analysis.md`** with:
   - Actual event emission points from source code
   - Exact metadata fields available
   - Span vs instant event classification
   - Parent-child relationships
   - Fidelity markers (exact/derived/inferred)

4. **Validate the draft event model** in `docs/design/event-model.md` against actual implementation

5. **Update the event inventory** with source-grounded findings

This documentation-based research provides a strong foundation, but **source code analysis is essential** to ground the ClawScope event model in actual OpenClaw implementation details.
