# ClawScope

<div align="center">

**面向现代 AI Runtime 的 Agent Profiler 与 Trace Viewer**

**Agent Profiler & Trace Viewer for Modern AI Runtimes**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Phase](https://img.shields.io/badge/Phase-3%20Complete-brightgreen.svg)](#roadmap)
[![Local-first](https://img.shields.io/badge/Local--first-yes-orange.svg)](#设计承诺)

*时间花在哪里？成本花在哪里？Agent 为什么这样执行？*

[中文](#中文说明) · [English](#english)

</div>

---

## 中文说明

### ClawScope 是什么？

ClawScope 是面向现代 AI Runtime 的**本地优先 Agent Profiler 与 Trace Viewer**。它将 OpenClaw、Claude Code、Codex 的本地会话产物导入统一 trace 模型，以 Waterfall 时间线界面呈现，帮助你稳定回答三个调试核心问题：

1. **时间花在哪里？**
2. **成本花在哪里？**
3. **Agent 为什么这样执行？**

它不是日志面板，也不是 token 统计器——它是结构化的 Replay 与取证分析系统。

---

### 核心特性

| 能力 | 状态 |
|---|---|
| OpenClaw 原始事件导入 | ✅ |
| Claude Code 会话 JSONL 导入 | ✅ |
| Codex rollout JSONL 导入 | ✅ |
| 统一 trace contract（raw → normalized → derived） | ✅ |
| Waterfall 时间线 Viewer | ✅ |
| Cost 视图 | ✅ |
| Summary 面板 | ✅ |
| 分类与文本过滤 | ✅ |
| Span 详情弹窗 | ✅ |
| 多 Agent 可视化原型 | ✅ |
| Live collection | 🔜 Phase 4 |
| 高级对比分析 | 🔜 Phase 5 |

---

### 快速开始

> **前置要求：** Node.js 18+

#### 1. 导入本地 trace

```bash
cd collector
npm install

# 发现本地会话
node src/cli.js discover claude-code --limit 5
node src/cli.js discover codex --limit 5

# 导入到仓库 traces/ 目录
node src/cli.js import claude-code ~/.claude/projects/<project>/<session>.jsonl ../traces/my-session
node src/cli.js import codex ~/.codex/sessions/YYYY/MM/DD/rollout-....jsonl ../traces/my-session
node src/cli.js import openclaw ./raw-events ../traces/my-trace
```

#### 2. 启动 trace server

```bash
cd viewer/server
npm install
npm start
# → API 在 http://localhost:3001，从 traces/ 读取数据
```

#### 3. 启动 viewer

```bash
cd viewer
npm install
npm run dev
# → Viewer 在 http://127.0.0.1:3013
```

`viewer/index.html` 是主工作流中的后端调试器；`viewer/landing.html` 保留为演示着陆页；多 Agent 泳道与关系视图现已整合进后端调试器内部。

---

### 架构

```
原始输入                    Collector 层               Viewer 层
─────────────────────       ────────────────────────   ─────────────────────
OpenClaw 事件目录      ──┐
Claude Code JSONL      ──┼──▶  Normalizer  ──▶  DB  ──▶  Server  ──▶  React UI
Codex rollout JSONL    ──┘
                                    │
                                Storage
                          raw · normalized · derived
```

三层模型（`raw / normalized / derived`）是硬边界。Viewer 仅依赖 normalized contract，不感知采集内部实现。Derived summary 与 AI 解释建立在 trace 之上，不能替代 trace。

---

### 仓库结构

```
ClawScope/
├── collector/          # 导入、规范化、存储（见 collector/README.md）
├── viewer/             # React Viewer + Vite 开发服务器（见 viewer/README.md）
│   └── server/         # Trace API Server（见 viewer/server/README.md）
├── traces/             # 规范化后的 trace（默认 git-ignored）
├── openclaw-source/    # OpenClaw 源码副本，用于对齐与参考
└── docs/               # 文档总入口（从 docs/index.md 开始）
    ├── foundation/     # 定位、原则、架构、路线图
    ├── research/       # 生态研究、OpenClaw 源码对齐
    ├── design/         # 事件模型、Normalizer、存储、Harness 适配器
    ├── visualization/  # Viewer 行为与多 Agent UX
    ├── implementation/ # 阶段交付说明
    ├── validation/     # 退出标准与验证
    └── status/         # 当前项目状态
```

---

### 与同类项目的对比

> 研究基础：[docs/research/agent-profiler-research-report.md](docs/research/agent-profiler-research-report.md)

| 项目 | 其优势 | ClawScope 的差异点 |
|---|---|---|
| `claude-devtools` | Claude Code 的优秀 Waterfall 可视化，近零配置 | ClawScope 跨多个 Runtime（OpenClaw、Claude Code、Codex）统一 trace，使用 Web viewer 而非桌面端 |
| `ClawMetry` | OpenClaw 实时运维监控 | ClawScope 聚焦 Replay 取证分析、Waterfall 调试、稳定 viewer contract，而非 Ops 仪表盘 |
| `lazyagent.dev`、`agentsvi` | Live 监控与云端 Dashboard | ClawScope 本地优先、Replay 优先，面向结构化分析与调试而非托管监控平台 |
| OpenTelemetry exporter | 标准分布式追踪基础设施 | ClawScope 针对 Agent 特有语义（delegation、上下文压力、多 Agent 因果链）与 Replay 场景设计 |

---

### 项目进度

| 阶段 | 状态 | 内容 |
|---|---|---|
| Phase 0 | ✅ 已完成 | 文档基础建设 |
| Phase 1 | ✅ 已完成 | OpenClaw 源码分析与对齐 |
| Phase 2 | ✅ 已完成 | Trace model 与 storage MVP |
| Phase 3 | ✅ 已完成 | Replay visualization MVP |
| Phase 4 | 🔜 计划中 | Live collection 与同步 |
| Phase 5 | 🔜 计划中 | 高级分析、对比与 derived insights |

---

### 设计承诺

以下承诺在项目长期内保持稳定：

- **Local-first** — 敏感 trace 不需要上传云端即可完整使用
- **Inspectable** — 原始证据、规范化数据、派生分析之间边界明确、稳定
- **Replay-first** — 先确保 saved trace 可重建，再构建更多 live 复杂度
- **Live/replay parity** — 两种模式最终面向同一个 viewer model
- **Waterfall-first** — 时间线调试是主界面，不是附属功能
- **OpenClaw-first honesty** — 先把一个真实 runtime 建模正确，再扩展到更多 harness
- **Derived is not source of truth** — Summary 与 AI 解释必须建立在 trace 之上，不能替代 trace

---

### 适合谁使用

- **AI 工程师与工具链团队** — 需要同时关注时间、成本、上下文压力、工具调用与多 Agent 调度
- **Claude Code / Codex 高级用户** — 想把本地 JSONL 会话导入更完整的 Profiler 视图
- **Agent Framework 构建者** — 希望为自己的 runtime 建立稳定 trace contract 与回放能力
- **研究者与性能优化人员** — 需要 session 级、trace 级、span 级行为分析与瓶颈定位

如果你只需要「查看一天花了多少 token」，ClawScope 不是最轻的工具。如果你想真正理解 Agent 为什么这样执行，ClawScope 是正确的位置。

---

### 文档入口

第一次进入仓库，推荐按顺序阅读：

1. [docs/index.md](docs/index.md) — 文档总入口
2. [docs/foundation/philosophy.md](docs/foundation/philosophy.md) — 设计原则
3. [docs/foundation/overview.md](docs/foundation/overview.md) — 系统概览
4. [docs/foundation/architecture.md](docs/foundation/architecture.md) — 架构说明
5. [docs/design/harness-adapters.md](docs/design/harness-adapters.md) — Harness 导入设计

---

## English

### What Is ClawScope?

ClawScope is a **local-first agent profiler and trace viewer** for modern AI runtimes. It imports traces from OpenClaw, Claude Code, and Codex sessions, normalizes them into a stable contract, and presents them in a waterfall timeline interface — so you can answer the three questions that matter most when debugging an agent run:

1. **Where did the time go?**
2. **Where did the cost go?**
3. **Why did the agent behave that way?**

It is not another log panel or a token counter. It is a structured replay and forensic analysis system.

---

### Features

| Capability | Status |
|---|---|
| OpenClaw raw-event import | ✅ |
| Claude Code session JSONL import | ✅ |
| Codex rollout JSONL import | ✅ |
| Normalized trace contract (raw → normalized → derived) | ✅ |
| Waterfall timeline viewer | ✅ |
| Cost view | ✅ |
| Summary panel | ✅ |
| Category and text filtering | ✅ |
| Span detail modal | ✅ |
| Multi-agent visualization prototype | ✅ |
| Live collection | 🔜 Phase 4 |
| Advanced comparative analysis | 🔜 Phase 5 |

---

### Quick Start

> **Requirements:** Node.js 18+

#### 1. Import a local trace

```bash
cd collector
npm install

# Discover local sessions
node src/cli.js discover claude-code --limit 5
node src/cli.js discover codex --limit 5

# Import into repo-local traces/
node src/cli.js import claude-code ~/.claude/projects/<project>/<session>.jsonl ../traces/my-session
node src/cli.js import codex ~/.codex/sessions/YYYY/MM/DD/rollout-....jsonl ../traces/my-session
node src/cli.js import openclaw ./raw-events ../traces/my-trace
```

#### 2. Start the trace server

```bash
cd viewer/server
npm install
npm start
# → API on http://localhost:3001, reads from traces/
```

#### 3. Launch the viewer

```bash
cd viewer
npm install
npm run dev
# → Viewer on http://127.0.0.1:3013
```

`viewer/index.html` is the primary backend debugger. `viewer/landing.html` remains the demo landing surface, and the multi-agent swimlane/relationship view now lives inside the backend debugger instead of a separate prototype page.

---

### Architecture

```
Raw input                   Collector layer            Viewer layer
─────────────────────       ────────────────────────   ─────────────────────
OpenClaw event dir    ──┐
Claude Code JSONL     ──┼──▶  Normalizer  ──▶  DB  ──▶  Server  ──▶  React UI
Codex rollout JSONL   ──┘
                                   │
                               Storage
                          raw · normalized · derived
```

The three-layer model (`raw / normalized / derived`) is a hard boundary. The viewer depends only on the normalized contract, never on collection internals. Derived summaries and AI explanations are layered on top of traces — they cannot replace them.

---

### Repository Map

```
ClawScope/
├── collector/          # Import, normalization, storage (see collector/README.md)
├── viewer/             # React viewer + Vite dev server (see viewer/README.md)
│   └── server/         # Trace API server (see viewer/server/README.md)
├── traces/             # Normalized traces (git-ignored by default)
├── openclaw-source/    # Local OpenClaw source copy for grounding and alignment
└── docs/               # Documentation hub (start at docs/index.md)
    ├── foundation/     # Positioning, principles, architecture, roadmap
    ├── research/       # Ecosystem research, OpenClaw source grounding
    ├── design/         # Event model, normalizer, storage, harness adapters
    ├── visualization/  # Viewer behavior and multi-agent UX
    ├── implementation/ # Phase delivery notes
    ├── validation/     # Exit criteria and proof
    └── status/         # Current project state
```

---

### How ClawScope Compares

> Research basis: [docs/research/agent-profiler-research-report.md](docs/research/agent-profiler-research-report.md)

| Project | Their strongest angle | Where ClawScope differs |
|---|---|---|
| `claude-devtools` | Excellent waterfall visualization for Claude Code; near-zero setup | ClawScope normalizes across multiple runtimes (OpenClaw, Claude Code, Codex) and uses a web-based viewer rather than a desktop-only surface |
| `ClawMetry` | Strong OpenClaw real-time ops monitoring | ClawScope focuses on replay-first forensic analysis, waterfall debugging, and stable viewer contracts rather than ops dashboards |
| `lazyagent.dev`, `agentsvi` | Live agent monitoring and cloud dashboards | ClawScope is local-first and replay-first, built for structured debugging and analysis rather than hosted monitoring |
| OpenTelemetry exporters | Standards-compliant distributed tracing infrastructure | ClawScope targets agent-specific semantics (delegation, context pressure, multi-agent causality) and replay rather than generic infrastructure spans |

---

### Roadmap

| Phase | Status | Scope |
|---|---|---|
| Phase 0 | ✅ Complete | Documentation foundation |
| Phase 1 | ✅ Complete | OpenClaw source analysis and alignment |
| Phase 2 | ✅ Complete | Trace model and storage MVP |
| Phase 3 | ✅ Complete | Replay visualization MVP |
| Phase 4 | 🔜 Planned | Live collection and sync |
| Phase 5 | 🔜 Planned | Advanced analysis, comparison, and derived insights |

---

### Design Commitments

These commitments are intended to hold for the long term:

- **Local-first** — sensitive traces do not require a cloud upload to be fully usable
- **Inspectable** — raw evidence, normalized data, and derived analysis have explicit, stable boundaries
- **Replay-first** — reconstructability is proved before adding live complexity
- **Live/replay parity** — both modes target the same viewer model
- **Waterfall-first** — timeline debugging is a primary surface, not a sidebar
- **OpenClaw-first honesty** — one real runtime is modeled correctly before expanding to more harnesses
- **Derived is not source of truth** — summaries and AI explanations must remain trace-backed and cannot replace the trace

---

### Who Should Use ClawScope

- **AI engineers and toolchain teams** — need simultaneous visibility into time, cost, context pressure, tool calls, and multi-agent scheduling
- **Claude Code / Codex power users** — want to import local JSONL sessions into a proper profiler view
- **Agent framework authors** — want to establish a stable trace contract and replay capability for their runtime
- **Researchers and performance engineers** — need session-level, trace-level, and span-level behavioral analysis and bottleneck identification

If you only need a daily token summary, ClawScope is more than you need. If you want to genuinely understand why an agent executed the way it did, ClawScope is the right tool.

---

### Documentation

Start here if you are new to the project:

1. [docs/index.md](docs/index.md) — documentation hub
2. [docs/foundation/philosophy.md](docs/foundation/philosophy.md) — design principles
3. [docs/foundation/overview.md](docs/foundation/overview.md) — system overview
4. [docs/foundation/architecture.md](docs/foundation/architecture.md) — architecture
5. [docs/design/harness-adapters.md](docs/design/harness-adapters.md) — harness import design
