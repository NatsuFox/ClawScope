# Agent Framework Profiler Research Report

**Date**: March 18, 2026
**Project**: ClawScope
**Research Focus**: Profiling and tracing tools for CLI agent frameworks

---

## Executive Summary

This report documents comprehensive research into profiling and observability tools for CLI-based agent frameworks, specifically focusing on Claude Code, Codex CLI, and OpenClaw (formerly MoltBot/ClawdBot). The research identified multiple open-source solutions that provide waterfall-style visualization similar to Chrome DevTools, with ClawMetry emerging as the closest match to the desired functionality for OpenClaw agents.

**Key Findings**:
- Multiple mature open-source profilers exist specifically for CLI agent frameworks
- ClawMetry provides the most comprehensive OpenClaw-specific observability
- claude-devtools offers the best waterfall visualization for Claude Code
- Significant opportunities exist for improvement, particularly in multi-framework support and advanced waterfall visualization

---

## 1. Research Objective

### Problem Statement

Agent frameworks (CLI-based tools like Claude Code, Codex, OpenClaw) generate numerous invocations during execution:
- User input processing
- Context concatenation and preprocessing
- External LLM API calls
- Tool invocations (shell commands, skills, MCP servers)
- Response generation and post-processing

**Goal**: Build a profiler that provides complete visibility into the communication and call chain from user input to final response, with intuitive waterfall-style visualization similar to Chrome DevTools Network tab.

### Requirements

1. **Comprehensive tracing**: Capture all communications and calls in the agent execution pipeline
2. **Waterfall visualization**: Chronological timeline with color-coded event types
3. **Framework-specific analysis**: Each agent framework has unique architecture requiring custom instrumentation
4. **Developer-friendly**: Enable debugging and performance optimization
5. **Cost transparency**: Show API call overhead and token usage

---

## 2. Industry Landscape: LLM Observability vs. Agent Profiling

### 2.1 General LLM Observability Platforms

These platforms focus on traditional LLM applications rather than CLI agent frameworks:

#### OpenTelemetry-Based Solutions
- **Standard**: Industry-standard distributed tracing framework
- **Visualization backends**: Jaeger, Zipkin, Grafana Tempo, SigNoz
- **Strengths**: Mature ecosystem, vendor-neutral, standardized spans/traces
- **Limitations**: Generic distributed tracing, not optimized for agent-specific workflows
- **Sources**:
  - [How to Read OpenTelemetry Trace Waterfalls](https://oneuptime.com/blog/post/2026-02-06-read-interpret-opentelemetry-trace-waterfalls/view)
  - [Understanding Traces and Spans in LLM Applications](https://www.traceloop.com/blog/understanding-traces-and-spans-in-llm-applications)

#### LLM-Specific Platforms
- **Langfuse** (Open Source, MIT): Waterfall trace visualization for LangChain/LlamaIndex applications
- **Arize Phoenix** (Open Source): Visual trace timeline with hierarchical span visualization
- **LangSmith** (Commercial): Full trace visualization by LangChain team
- **AgentOps**: Session waterfall view for agent workflows
- **Braintrust**: Tracing for various agent frameworks

**Key Insight**: These tools are designed for **LLM application frameworks** (LangChain, LlamaIndex) rather than **CLI agent frameworks** (Claude Code, Codex, OpenClaw).

**Sources**:
- [Langfuse Review 2026](https://vibecoding.app/blog/langfuse-review)
- [Arize Phoenix Tracing](https://docs.arize.com/phoenix/tracing)
- [AgentOps Dashboard](https://docs.agentops.ai/v1/usage)
- [15 AI Agent Observability Tools in 2026](https://research.aimultiple.com/agentic-monitoring/)

---

## 3. CLI Agent Framework Profilers

### 3.1 claude-devtools

**Repository**: [matt1398/claude-devtools](https://github.com/matt1398/claude-devtools)
**Website**: [claude-dev.tools](https://claude-dev.tools/)
**License**: Open Source
**Platform**: Desktop (Electron app)

#### Features
- Reads Claude Code session logs from `~/.claude/projects/*.jsonl`
- **Visual timeline** showing chronological execution
- Complete reconstruction of agent activity:
  - Every file path Read
  - Every tool called
  - Every diff Applied
  - Every token consumed
- **Per-turn context attribution**: Shows what context was loaded each turn
- **Compaction visualization**: Displays how context was compressed
- **Subagent execution traces**: Multi-agent workflow visibility
- Searchable and structured interface
- Real-time tailing of active sessions

#### Architecture
- Electron desktop application
- Parses JSONL session logs locally
- No setup required - reads existing logs
- Runs entirely offline

#### Strengths
- **Best-in-class waterfall visualization** for Claude Code
- Zero configuration
- Privacy-focused (local-only)
- Open source

#### Limitations
- Claude Code only (no multi-framework support)
- Desktop app (no web-based option)
- Limited to log parsing (no real-time instrumentation)

**Sources**:
- [claude-devtools Product Hunt](https://www.producthunt.com/products/claude-devtools)
- [claude-devtools overview](https://chatgate.ai/post/claude-devtools)
- [HackerNews discussion](https://news.ycombinator.com/item?id=47004712)

---

### 3.2 lazyagent.dev

**Website**: [lazyagent.dev](https://lazyagent.dev/)
**License**: Open Source
**Platform**: Terminal UI (TUI) + macOS menu bar + HTTP API

#### Features
- **Multi-framework support**: Claude Code (CLI & Desktop), Cursor, pi, OpenCode
- Real-time monitoring of all running agents simultaneously
- Single unified terminal interface
- Token usage and cost tracking
- Activity monitoring
- macOS menu bar integration
- HTTP API for programmatic access

#### Architecture
- Written in Go using Bubble Tea framework
- Terminal-based UI
- Monitors multiple agent processes concurrently

#### Strengths
- **Cross-framework support** (biggest differentiator)
- Real-time monitoring
- Lightweight TUI
- API access for automation

#### Limitations
- Terminal-only (no graphical waterfall view)
- Limited historical analysis
- No detailed trace visualization

**Sources**:
- [lazyagent.dev](https://lazyagent.dev/)
- [HackerNews launch](https://news.ycombinator.com/item?id=47349851)
- [Lazy Agent overview](https://chatgate.ai/post/lazy-agent)

---

### 3.3 agentsview.io

**Website**: [agentsview.io](https://www.agentsview.io/)
**License**: Open Source
**Platform**: Local web app

#### Features
- Browse and analyze **past** AI coding sessions
- Cross-project session history
- Searchable interface
- Shows what agents did across all projects
- Local-only (privacy-focused)

#### Architecture
- Web-based interface
- Reads local session logs
- Historical analysis focus

#### Strengths
- Cross-project insights
- Web-based UI
- Privacy-focused

#### Limitations
- Historical only (no real-time monitoring)
- Limited visualization capabilities
- No waterfall view

**Source**: [agentsview.io](https://www.agentsview.io/)

---

### 3.4 ccusage

**Repository**: [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
**License**: Open Source
**Platform**: CLI tool

#### Features
- Analyzes Claude Code and Codex CLI usage from local JSONL files
- Token usage and cost tracking
- Daily, monthly, and per-session statistics
- Entirely local - no data uploads
- Fast Rust implementation (also Node.js version available)

#### Architecture
- CLI tool written in Rust
- Parses JSONL logs
- Statistical analysis focus

#### Strengths
- Fast performance (Rust)
- Detailed cost analysis
- Multi-framework (Claude Code + Codex)
- Raycast extension available

#### Limitations
- CLI-only (no visualization)
- Statistics focus (not profiling)
- No timeline view

**Sources**:
- [ccusage GitHub](https://github.com/ryoppippi/ccusage)
- [ccusage guide](https://www.productcool.com/product/how-to-use-ccusage)
- [Raycast extension](https://www.raycast.com/nyatinte/ccusage)

---

### 3.5 vibe-log-cli

**Repository**: [vibe-log/vibe-log-cli](https://github.com/vibe-log/vibe-log-cli)
**Website**: [vibelog.tech](https://vibelog.tech/)
**License**: Open Source
**Platform**: CLI tool

#### Features
- Logging and analysis for Claude Code and Cursor sessions
- Report generation for client billing
- Developer productivity tracking
- Works with Cursor, GitHub Copilot, Claude Code
- 30-second setup

#### Architecture
- CLI tool
- Session tracking and logging
- Report generation engine

#### Strengths
- Multi-framework support
- Billing-focused reports
- Quick setup

#### Limitations
- Report focus (not real-time profiling)
- Limited visualization
- No waterfall view

**Sources**:
- [vibe-log-cli GitHub](https://github.com/vibe-log/vibe-log-cli)
- [VibeLog website](https://vibelog.tech/)

---

### 3.6 ClawMetry (Primary Focus)

**Website**: [clawmetry.com](https://clawmetry.com/)
**Repository**: [tugcantopaloglu/openclaw-dashboard](https://github.com/tugcantopaloglu/openclaw-dashboard)
**License**: MIT (Open Source)
**Platform**: Web dashboard (Node.js)

#### Core Features

**Real-time Observability**
- Live visibility into AI agent operations
- Token usage and cost per session and model
- Cron job status and history
- Sub-agent spawns and outcomes
- Memory file changes

**Sub-Agent Monitoring**
- Tracks spawned sub-agents with detailed insights
- File reads, command execution, tool calls
- Internal reasoning visibility
- Summaries, narratives, and full logs per sub-agent

**Cost & Token Tracking**
- Granular cost breakdowns: per-session, per-model, per-tool
- Tokens in/out, cache hits, response times
- Cost per call analysis

**Session History**
- Complete session logging
- Timeline views
- Tool call records
- Cost analysis

**System Health Monitoring**
- Cron job tracking
- Service uptime monitoring
- Disk usage metrics
- Active sub-agent counts

**Flow Visualization**
- Live graph displaying channels, gateways, models, tools, nodes
- Real-time updates as operations occur

**Mission Control Integration**
- Hooks into OpenClaw's task system
- Correlates agents with assigned tasks

#### Architecture

**Technology Stack**
- Pure Node.js (no npm packages required)
- No database dependency
- Zero external dependencies
- Electron-free (web-based)

**Security Implementation**
- Username/password authentication with PBKDF2 hashing (100,000 iterations, SHA-512)
- Optional TOTP MFA (Google Authenticator compatible)
- Rate limiting: 5 failed attempts → 15-min soft lockout; 20 attempts → hard lockout
- HTTPS enforcement (except localhost and Tailscale IPs)
- Security headers: HSTS, CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff
- Timing-safe password comparisons
- Audit logging for authentication and destructive actions

**Data Storage**
- Credentials in `data/credentials.json`
- Audit logs maintained
- Path traversal protection
- Automatic `.bak` backups for workspace edits

**Deployment**
- Local-first design (no cloud dependency)
- Supports macOS, Linux, Windows (WSL), ARM devices (Raspberry Pi)
- Installation: `pip install clawmetry` → `clawmetry`
- Auto-detection of OpenClaw workspaces
- ~30-second configuration time
- Optional managed cloud hosting for teams

#### Model Support
- Claude
- GPT-4
- Gemini
- Other models integrated with OpenClaw

#### Adoption
- 23,000+ installations
- 107 GitHub stars
- 50+ countries
- 188 Product Hunt upvotes

#### Strengths
- **OpenClaw-specific** optimization
- Real-time monitoring
- Comprehensive sub-agent tracking
- Strong security implementation
- Zero-dependency architecture
- Local-first privacy
- Active development

#### Limitations
- **OpenClaw-only** (no Claude Code, Codex, or other framework support)
- **No Chrome DevTools-style waterfall visualization** (has timeline views but not detailed waterfall)
- Not hardened for public internet exposure (designed for private networks)
- Limited to OpenClaw's log format

**Sources**:
- [ClawMetry website](https://clawmetry.com/)
- [openclaw-dashboard GitHub](https://github.com/tugcantopaloglu/openclaw-dashboard)
- [ClawMetry Product Hunt](http://hunted.space/dashboard/clawmetry)
- [ClawMetry review](https://www.productcool.com/product/clawmetry-for-openclaw)
- [Detailed analysis](https://savedelete.com/article/clawmetry-free-open-source-real-time-dashboard-for-openclaw-ai-agents/)

---

### 3.7 Additional Tools

#### agentprobe
- **Website**: [agentprobe blog](https://blog.vtemian.com/project/agentprobe/)
- Real-time observability for Cursor, Claude Code, and other AI agents
- Framework for building custom dashboards, TUIs, or plugins
- Extensible architecture with structured event streams

#### Agentlytics
- **Website**: [agentlytics.io](https://agentlytics.io/)
- Unified analytics dashboard
- Reads local chat history from all major coding agents
- Nothing leaves your machine

#### AgentLogs
- **Website**: [agentlogs.ai](https://agentlogs.ai/)
- Lightweight plugins for coding agents
- Captures transcripts and links to git commits
- Single-command installation

#### Agent Lens (VS Code Extension)
- **Marketplace**: [Agent Lens](https://marketplace.visualstudio.com/items?itemName=Proliminal.agent-lens)
- VS Code extension for GitHub Copilot, Claude Code, Codex CLI
- Shows which agents ran, models used, token consumption
- Agent workflow visibility

#### Omnara
- **Website**: [Omnara overview](https://www.scriptbyai.com/ai-agent-monitor-omnara/)
- Open-source AI agent monitoring
- Supports Claude Code, Cursor, GitHub Copilot
- Transforms agents into "communicative teammates"

---

## 4. OpenClaw-Specific Ecosystem

### 4.1 OpenClaw Background

**Names**: OpenClaw (current) ← MoltBot ← ClawdBot (original)
**Creator**: Peter Steinberger (Austrian developer)
**History**: Weekend project → 200K+ GitHub stars
**Description**: Open-source personal AI assistant running 24/7 on local machines

**Sources**:
- [OpenClaw history](https://www.taskade.com/blog/moltbook-clawdbot-openclaw-history)
- [OpenClaw 101](https://sidsaladi.substack.com/p/openclawmoltbotclawdbot-101-the-complete)
- [How OpenClaw works](https://langwatch.ai/blog/how-openclaw-clawbot-works-behind-the-scenes---and-why-agent-observability-matter)

### 4.2 OpenClaw Observability Tools

#### ClawMetry (covered above)
Primary observability dashboard for OpenClaw

#### OpenTelemetry Integration
- [Monitoring OpenClaw with OpenTelemetry](https://signoz.io/blog/monitoring-openclaw-with-opentelemetry)
- [Tracing OpenClaw with OTEL and Orq.ai](https://orq.ai/blog/tracing-openclaw-with-opentelemetry-and-orq.ai)
- [LangWatch instrumentation guide](https://langwatch.ai/blog/instrumenting-your-openclaw-agent-with-opentelemetry)

#### MoltWire
- **Website**: [moltwire.com](https://moltwire.com/)
- Security & observability platform for AI agents
- Real-time threat detection
- Behavioral monitoring
- Protects against prompt injection, data exfiltration

---

## 5. Comparative Analysis

### 5.1 Feature Matrix

| Tool | Framework Support | Waterfall View | Real-time | Historical | Open Source | Platform |
|------|------------------|----------------|-----------|------------|-------------|----------|
| **claude-devtools** | Claude Code only | ✅ Excellent | ✅ | ✅ | ✅ | Desktop |
| **lazyagent.dev** | Multi-framework | ❌ | ✅ | ❌ | ✅ | TUI |
| **agentsview.io** | Multi-framework | ❌ | ❌ | ✅ | ✅ | Web |
| **ccusage** | Claude Code + Codex | ❌ | ❌ | ✅ | ✅ | CLI |
| **vibe-log-cli** | Claude Code + Cursor | ❌ | ❌ | ✅ | ✅ | CLI |
| **ClawMetry** | OpenClaw only | ⚠️ Partial | ✅ | ✅ | ✅ | Web |
| **agentprobe** | Multi-framework | ❌ | ✅ | ❌ | ✅ | Framework |

### 5.2 Best Tool by Use Case

**Best waterfall visualization**: claude-devtools (Claude Code only)
**Best multi-framework support**: lazyagent.dev
**Best for OpenClaw**: ClawMetry
**Best for cost analysis**: ccusage
**Best for real-time monitoring**: lazyagent.dev or ClawMetry
**Best for historical analysis**: agentsview.io

---

## 6. ClawMetry Improvement Opportunities

### 6.1 Priority 1: Waterfall/Timeline Visualization

**Current State**: Shows "live graphs" and "session timelines" but lacks Chrome DevTools-style waterfall

**Improvement**: Add dedicated waterfall profiler view with:
- Horizontal timeline showing chronological execution
- Color-coded bars for different operation types:
  - 🔵 LLM API calls
  - 🟢 Tool invocations (bash, file operations)
  - 🟡 Context processing
  - 🟠 Sub-agent spawns
  - 🔴 Errors
- Nested/hierarchical view showing parent-child relationships
- Precise timing with millisecond granularity
- Hover tooltips showing:
  - Input/output data
  - Token counts
  - Cost
  - Latency
- Zoom and pan controls
- Minimap for navigation

**Implementation Approach**:
- Use D3.js or similar for visualization
- Parse existing session logs to extract timing data
- Build hierarchical data structure from flat logs
- Render as SVG or Canvas for performance

**Reference Implementations**:
- Chrome DevTools Network tab
- Chrome Performance tab flame charts
- Jaeger trace visualization
- Grafana Tempo

---

### 6.2 Priority 2: Multi-Framework Support

**Current State**: OpenClaw-only

**Improvement**: Extend to support:
- **Claude Code**: Read from `~/.claude/projects/*.jsonl`
- **Codex CLI**: Parse Codex session logs
- **Cursor Agent**: Integrate with Cursor's logging
- **Aider**: Support Aider's log format
- **Generic agents**: Plugin system for custom formats

**Architecture**:
```
┌─────────────────────────────────────┐
│     Unified Data Model              │
│  (framework-agnostic events)        │
└─────────────────────────────────────┘
           ▲
           │
┌──────────┴──────────────────────────┐
│      Adapter Layer (Plugins)        │
├─────────────────────────────────────┤
│ • OpenClaw Adapter                  │
│ • Claude Code Adapter               │
│ • Codex Adapter                     │
│ • Cursor Adapter                    │
│ • Custom Adapter API                │
└─────────────────────────────────────┘
           ▲
           │
┌──────────┴──────────────────────────┐
│      Log Parsers                    │
│  (framework-specific)               │
└─────────────────────────────────────┘
```

**Benefits**:
- Universal agent profiler
- Larger user base
- Cross-framework comparisons
- Ecosystem growth

---

### 6.3 Priority 3: Performance Bottleneck Detection

**Current State**: Shows costs and token usage

**Improvement**: Automatic bottleneck detection
- Highlight slow operations (e.g., "This LLM call took 15s, 3x longer than average")
- Context bloat analysis (identify unnecessary context growth)
- Tool efficiency metrics (slowest/most expensive tools)
- Recommendations engine:
  - "Consider caching this file read"
  - "This prompt could be shortened by 30%"
  - "Sub-agent spawn overhead is high"

**Implementation**:
- Statistical analysis of historical data
- Baseline establishment per operation type
- Anomaly detection algorithms
- Rule-based recommendation system

---

### 6.4 Priority 4: Advanced Filtering & Search

**Current State**: Basic session history

**Improvement**:
- **Query language**: Filter by criteria
  - "sessions with >10k tokens"
  - "sessions that called bash tool"
  - "sessions with errors"
  - "sessions using claude-opus-4-6"
- **Full-text search**: Search across all logs, tool I/O, LLM responses
- **Regex support**: Pattern matching
- **Saved filters**: Bookmark common queries
- **Quick filters**: One-click filters (errors only, expensive sessions, etc.)

**UI Design**:
```
┌─────────────────────────────────────────────────┐
│ Search: [sessions with errors AND cost > $1   ]│
│                                                 │
│ Quick Filters: [Errors] [Expensive] [Slow]     │
│                                                 │
│ Saved Filters: ▼                                │
│   • High-cost debugging sessions                │
│   • Failed sub-agent spawns                     │
│   • Long-running tasks                          │
└─────────────────────────────────────────────────┘
```

---

### 6.5 Priority 5: Export & Reporting

**Current State**: Web dashboard only

**Improvement**:
- **Export formats**:
  - CSV (for spreadsheet analysis)
  - JSON (for programmatic processing)
  - PDF (for client reports)
  - OpenTelemetry traces (for integration with observability stacks)
- **Custom reports**:
  - Time period selection
  - Project-specific reports
  - Cost breakdowns by model/tool
  - Performance summaries
- **API access**: RESTful API for CI/CD integration
- **Billing reports**: Detailed cost breakdowns for client billing

---

### 6.6 Additional Improvements

#### Comparative Analysis & Benchmarking
- Session comparison (side-by-side)
- Baseline tracking
- A/B testing support
- Aggregate statistics and trends

#### Distributed Tracing Integration
- OpenTelemetry export
- Span correlation with application traces
- Cross-service tracing

#### Real-time Alerting
- Cost alerts (budget thresholds)
- Performance alerts (slow operations)
- Error notifications
- Anomaly detection (ML-based)

#### Replay & Debugging
- Session replay (step-by-step)
- Breakpoint simulation ("what if" analysis)
- Context inspection (exact LLM input at each step)
- Diff visualization (context changes between turns)

#### Security & Privacy
- PII redaction (automatic sensitive data masking)
- Role-based access control
- Audit logging (who viewed what)
- Data retention policies

#### Collaborative Features
- Session sharing (via links)
- Annotations (comments on specific points)
- Team dashboards (aggregate view)
- Knowledge base (pattern library)

#### Development Workflow Integration
- Git integration (link sessions to commits/branches)
- IDE plugins (VS Code, JetBrains)
- CI/CD integration (performance tests in pipeline)
- Issue tracking (create GitHub/Jira issues from sessions)

---

## 7. Implementation Recommendations

### 7.1 For Building a Universal Agent Profiler

**Phase 1: Foundation**
1. Study claude-devtools source code for waterfall visualization
2. Study ClawMetry source code for real-time monitoring
3. Design unified data model for agent events
4. Build adapter layer for multiple frameworks

**Phase 2: Core Features**
1. Implement waterfall timeline visualization
2. Add multi-framework log parsing
3. Build real-time monitoring
4. Create web-based dashboard

**Phase 3: Advanced Features**
1. Performance bottleneck detection
2. Advanced filtering and search
3. Export and reporting
4. Alerting system

**Phase 4: Ecosystem**
1. Plugin system for custom frameworks
2. API for third-party integrations
3. Community contributions
4. Documentation and examples

### 7.2 Technology Stack Recommendations

**Frontend**:
- React or Vue.js for UI
- D3.js or Recharts for waterfall visualization
- TanStack Query for data fetching
- Tailwind CSS for styling

**Backend**:
- Node.js or Go for performance
- SQLite or PostgreSQL for data storage
- WebSocket for real-time updates
- REST API for integrations

**Deployment**:
- Docker for containerization
- Local-first architecture
- Optional cloud hosting
- Self-hosted option

---

## 8. Conclusion

### Key Takeaways

1. **Mature ecosystem exists**: Multiple open-source profilers for CLI agent frameworks
2. **ClawMetry is closest match**: Best OpenClaw-specific tool with real-time monitoring
3. **claude-devtools has best visualization**: Excellent waterfall view for Claude Code
4. **Gap exists**: No universal profiler with waterfall visualization for all frameworks
5. **Opportunity**: Build on ClawMetry foundation to add waterfall view and multi-framework support

### Recommended Next Steps

1. **Fork ClawMetry**: Use as foundation for universal profiler
2. **Add waterfall visualization**: Implement Chrome DevTools-style timeline
3. **Extend framework support**: Add Claude Code and Codex adapters
4. **Contribute back**: Open source improvements benefit entire community

### Market Opportunity

- Growing adoption of CLI agent frameworks
- Increasing need for observability and debugging
- No dominant universal solution
- Strong open-source community
- Enterprise demand for cost optimization

---

## 9. References

### Primary Sources

**Claude Code Tools**:
- [claude-devtools](https://claude-dev.tools/)
- [claude-devtools GitHub](https://github.com/matt1398/claude-devtools)
- [ccusage GitHub](https://github.com/ryoppippi/ccusage)

**Multi-Framework Tools**:
- [lazyagent.dev](https://lazyagent.dev/)
- [agentsview.io](https://www.agentsview.io/)
- [vibe-log-cli GitHub](https://github.com/vibe-log/vibe-log-cli)

**OpenClaw Tools**:
- [ClawMetry](https://clawmetry.com/)
- [openclaw-dashboard GitHub](https://github.com/tugcantopaloglu/openclaw-dashboard)
- [MoltWire](https://moltwire.com/)

**General Observability**:
- [Langfuse](https://langfuse.com/)
- [Arize Phoenix](https://docs.arize.com/phoenix)
- [AgentOps](https://docs.agentops.ai/)

### Research Articles

- [How OpenClaw works behind the scenes](https://langwatch.ai/blog/how-openclaw-clawbot-works-behind-the-scenes---and-why-agent-observability-matter)
- [Monitoring OpenClaw with OpenTelemetry](https://signoz.io/blog/monitoring-openclaw-with-opentelemetry)
- [15 AI Agent Observability Tools in 2026](https://research.aimultiple.com/agentic-monitoring/)
- [Understanding Traces and Spans in LLM Applications](https://www.traceloop.com/blog/understanding-traces-and-spans-in-llm-applications)
- [How to Read OpenTelemetry Trace Waterfalls](https://oneuptime.com/blog/post/2026-02-06-read-interpret-opentelemetry-trace-waterfalls/view)

### Community Resources

- [HackerNews: claude-devtools launch](https://news.ycombinator.com/item?id=47004712)
- [HackerNews: lazyagent launch](https://news.ycombinator.com/item?id=47349851)
- [Product Hunt: ClawMetry](http://hunted.space/dashboard/clawmetry)
- [Product Hunt: claude-devtools](https://www.producthunt.com/products/claude-devtools)

---

## Appendix A: Glossary

**Agent Framework**: Software that enables autonomous AI agents to perform tasks (e.g., Claude Code, Codex, OpenClaw)

**CLI Agent**: Command-line interface agent that runs in terminal

**Waterfall Visualization**: Timeline view showing sequential operations as horizontal bars (like Chrome DevTools Network tab)

**Span**: Single unit of work in distributed tracing (e.g., one LLM API call)

**Trace**: Collection of spans representing complete request flow

**OpenTelemetry (OTEL)**: Open-source observability framework for distributed systems

**Sub-agent**: Agent spawned by parent agent to handle specific subtasks

**Token**: Unit of text processed by LLM (roughly 0.75 words)

**Context**: Information provided to LLM as input (prompt + history + files)

**Tool Call**: Agent invoking external functionality (bash command, file operation, API call)

---

## Appendix B: Contact Information

**Research Conducted By**: Claude (Anthropic)
**Model**: claude-opus-4-6
**Date**: March 18, 2026
**Project**: ClawScope
**Location**: /root/Workspace/PROJECTS/powers/ClawScope

---

*End of Report*
