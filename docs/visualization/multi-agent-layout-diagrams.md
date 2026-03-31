# Multi-Agent Viewer Layout Diagrams

This document provides ASCII diagrams showing the layout and behavior of the multi-agent visualization views.

## Overall Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ClawScope Multi-Agent Trace Viewer    Duration: 45.5s  Cost: $0.272  Agents: 4│
├──────────────┬──────────────────────────────────────────────────────────────┤
│              │ Color by: [Category] Agent   Filter: [All] Model Tool Agent  │
│ HIERARCHY    ├──────────────────────────────────────────────────────────────┤
│              │ Time:  0s    5s    10s   15s   20s   25s   30s   35s   40s   │
│ Root Agent   │       ┌──────────────────────────────────────────────────────┤
│ (11 spans)   │ Root  │ ████ ████ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ████ ████████ ████ ██│
│              │       ├──────────────────────────────────────────────────────┤
│ ├─ Analyzer  │ Analyz│      ████████████████████████                        │
│    (4 spans) │       ├──────────────────────────────────────────────────────┤
│              │ Securi│      ████████████████████████████████                │
│ ├─ Security  │       ├──────────────────────────────────────────────────────┤
│    (4 spans) │ Format│                              ████████████████        │
│              │       └──────────────────────────────────────────────────────┘
│ └─ Formatter │                                                               │
│    (3 spans) │                    SWIMLANE TIMELINE VIEW                    │
│              │                                                               │
│              │                                                               │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

## Swimlane Timeline Detail

Shows temporal relationships and concurrency:

```
Time Axis:  0s         10s        20s        30s        40s        50s
           ┌────────────────────────────────────────────────────────────┐
Root Agent │ ┌─┐ ┌──┐                                                   │
           │ │U│ │C │ ┌─────────────────┐ ┌────┐ ┌──────┐ ┌────────┐ │
           │ │I│ │X │ │   JOIN (wait)   │ │ M  │ │  S   │ │   M    │ │
           │ └─┘ └──┘ └─────────────────┘ └────┘ └──────┘ └────────┘ │
           │           ▲                 ▲        ▲                     │
           │           │                 │        │                     │
           ├───────────┼─────────────────┼────────┼─────────────────────┤
Analyzer   │           │ ┌─────────────┐ │        │                     │
           │           │ │ T │  M      │ │        │                     │
           │           │ └───┴─────────┘ │        │                     │
           │           │                 │        │                     │
           ├───────────┼─────────────────┼────────┼─────────────────────┤
Security   │           │ ┌───────────────┐        │                     │
           │           │ │ T   │   M     │        │                     │
           │           │ └─────┴─────────┘        │                     │
           │           │                          │                     │
           ├───────────┴──────────────────────────┼─────────────────────┤
Formatter  │                                      │ ┌──────────────┐    │
           │                                      │ │  T  │   M    │    │
           │                                      │ └──────────────┘    │
           │                                      │                     │
           └──────────────────────────────────────┴─────────────────────┘

Legend:
  UI = User I/O       M = Model call      T = Tool execution
  CX = Context load   S = State decision  JOIN = Wait for sub-agents

  ▲ = Spawn point (delegation)
  Vertical alignment shows concurrency
  Horizontal gaps show waiting/idle time
```

## Hierarchy View Detail

Shows delegation structure and agent relationships:

```
┌─────────────────────────────────┐
│ AGENT HIERARCHY                 │
├─────────────────────────────────┤
│                                 │
│ ● Root Agent          11 spans  │◄─── Root (coordinator)
│   │                             │
│   ├─● Code Analyzer    4 spans  │◄─── Spawned at 6.0s
│   │                             │     (parallel with Security)
│   │                             │
│   ├─● Security Checker 4 spans  │◄─── Spawned at 6.2s
│   │                             │     (parallel with Analyzer)
│   │                             │
│   └─● Code Formatter   3 spans  │◄─── Spawned at 28.8s
│                                 │     (sequential, after join)
│                                 │
└─────────────────────────────────┘

Interaction:
  • Click agent → filter timeline to that agent
  • Selected agent highlighted in blue
  • Color dots match swimlane colors
```

## Span Nesting Within Lanes

Shows how parent-child spans are displayed:

```
Agent Lane:
┌─────────────────────────────────────────────────────────────┐
│ Agent Name                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │ Level 0
│  │ Agent Execution Span                                 │  │ (top-level)
│  └──────────────────────────────────────────────────────┘  │
│    ┌──────────────┐                                        │ Level 1
│    │ Tool Call    │                                        │ (nested)
│    └──────────────┘                                        │
│                     ┌─────────────────────────────────┐    │ Level 1
│                     │ Model Request                   │    │ (nested)
│                     └─────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Vertical spacing: 8px per nesting level
Minimum lane height: 60px + (max_nesting_level * 8px)
```

## Concurrent Execution Pattern

Shows how parallel agent work appears:

```
Time:       0s    2s    4s    6s    8s    10s   12s   14s   16s   18s
           ┌──────────────────────────────────────────────────────────┐
Root       │ ████████ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
           │          ▲                                              ▲│
           │          │ Spawn                                   Join ││
           ├──────────┼──────────────────────────────────────────────┼┤
Agent A    │          │ ████████████████████████                     ││
           │          │                                              ││
           ├──────────┼──────────────────────────────────────────────┼┤
Agent B    │          │ ████████████████████████████████████         ││
           │          │                                              ││
           └──────────┴──────────────────────────────────────────────┴┘

Observation:
  • Root spawns A and B at ~6s
  • A and B run concurrently (overlapping bars)
  • Root waits (shaded bar) until both complete
  • A finishes at ~18s, B finishes at ~22s
  • Root resumes after B completes (join point)
```

## Sequential Delegation Pattern

Shows how sequential agent work appears:

```
Time:       0s    5s    10s   15s   20s   25s   30s   35s   40s
           ┌──────────────────────────────────────────────────────┐
Root       │ ████████ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ████ ▓▓▓▓▓▓▓▓▓▓ ████ │
           │          ▲                    ▲    ▲          ▲      │
           │          │                    │    │          │      │
           ├──────────┼────────────────────┼────┼──────────┼──────┤
Agent A    │          │ ████████████████   │    │          │      │
           │          │                    │    │          │      │
           ├──────────┼────────────────────┼────┼──────────┼──────┤
Agent B    │          │                    │    │ ████████ │      │
           │          │                    │    │          │      │
           └──────────┴────────────────────┴────┴──────────┴──────┘
                      Spawn A              Join  Spawn B   Join

Observation:
  • Root spawns A, waits for A to complete
  • After A finishes, Root processes results
  • Root then spawns B, waits for B to complete
  • No concurrency: agents run one after another
  • Total time = sum of all agent durations + overhead
```

## Color Modes

### Category Color Mode

Each span colored by its category type:

```
┌─────────────────────────────────────────────────────────────┐
│ ┌─┐ ┌──┐ ┌────────┐ ┌──────┐ ┌─────┐ ┌────────┐ ┌─┐       │
│ │T│ │C │ │   M    │ │  T   │ │  A  │ │   M    │ │T│       │
│ └─┘ └──┘ └────────┘ └──────┘ └─────┘ └────────┘ └─┘       │
└─────────────────────────────────────────────────────────────┘

Legend:
  T = Teal (USER_IO)      M = Blue (MODEL)
  C = Orange (CONTEXT)    A = Purple (AGENT)
  T = Yellow (TOOL)       S = Green (STATE)

Best for: Understanding what kind of work is happening
```

### Agent Color Mode

Each span colored by which agent owns it:

```
┌─────────────────────────────────────────────────────────────┐
│ ████ ████ ████████ ████████ ████████ ████████ ████         │ Root (blue)
│      ████████████████████████                               │ Agent A (teal)
│      ████████████████████████████████                       │ Agent B (purple)
│                              ████████████████               │ Agent C (yellow)
└─────────────────────────────────────────────────────────────┘

Best for: Tracking agent boundaries and ownership
```

## Details Panel

Appears when clicking a span:

```
                                    ┌──────────────────────────┐
                                    │ Span Details         [×] │
                                    ├──────────────────────────┤
                                    │ NAME                     │
                                    │ Analyze code patterns    │
                                    │                          │
                                    │ CATEGORY                 │
                                    │ MODEL                    │
                                    │                          │
                                    │ SUBTYPE                  │
                                    │ request_submitted        │
                                    │                          │
                                    │ AGENT                    │
                                    │ agent_analyzer           │
                                    │                          │
                                    │ DURATION                 │
                                    │ 7600ms (7.60s)           │
                                    │                          │
                                    │ MODEL                    │
                                    │ claude-sonnet-4          │
                                    │                          │
                                    │ TOKENS                   │
                                    │ Input: 3500              │
                                    │ Output: 1200             │
                                    │                          │
                                    │ COST                     │
                                    │ $0.0420                  │
                                    │                          │
                                    │ START TIME               │
                                    │ 2026-03-18T10:00:08.200Z │
                                    │                          │
                                    │ FIDELITY                 │
                                    │ exact                    │
                                    └──────────────────────────┘
```

## Filter Behavior

### All Spans (default)

```
Root    │ ████ ████ ████████ ████████ ████████ ████████ ████ │
Analyzer│      ████ ████████████████████ ████                 │
Security│      ████ ████████████████████████ ████             │
```

### Filter: MODEL only

```
Root    │           ████████          ████████      ████████  │
Analyzer│                ████████████████                     │
Security│                ████████████████████                 │
```

### Filter: TOOL only

```
Root    │                                                     │
Analyzer│      ████           ████                            │
Security│      ████                ████                       │
```

## Interaction Flow

```
User Action                 System Response
───────────                 ───────────────

Click agent in hierarchy
    │
    ├──> Highlight agent node (blue)
    │
    └──> Filter timeline to show only that agent's lane


Click span in timeline
    │
    ├──> Highlight span (white border)
    │
    ├──> Open details panel (slide in from right)
    │
    └──> Show span metadata


Toggle color mode
    │
    └──> Re-render all spans with new color scheme


Apply category filter
    │
    ├──> Hide spans not matching filter
    │
    └──> Adjust lane heights if needed


Close details panel
    │
    ├──> Slide panel out to right
    │
    └──> Deselect span (remove highlight)
```

## Responsive Behavior

The viewer adapts to trace characteristics:

```
Short trace (< 10s):
┌────────────────────────────────────────────────────────────┐
│ Wide spans, easy to read labels                            │
│ ████████████████████████████████████                       │
└────────────────────────────────────────────────────────────┘

Long trace (> 60s):
┌────────────────────────────────────────────────────────────┐
│ Narrow spans, requires horizontal scroll                   │
│ ██ ██ ████ ██ ████████ ██ ████ ██ ████ ██ ████████ ██ ████│
└────────────────────────────────────────────────────────────┘

Few agents (2-3):
┌────────────────────────────────────────────────────────────┐
│ Root    │ ████████████████████████████████████████████████ │
│ Agent A │      ████████████████████████                    │
└────────────────────────────────────────────────────────────┘

Many agents (5+):
┌────────────────────────────────────────────────────────────┐
│ Root    │ ████████████████████████████████████████████████ │
│ Agent A │      ████████████████████████                    │
│ Agent B │      ████████████████████████████████            │
│ Agent C │                              ████████████████    │
│ Agent D │           ████████████████                       │
│ Agent E │                ████████████████████              │
└────────────────────────────────────────────────────────────┘
         Requires vertical scroll
```

## Key Visual Patterns

### Pattern: Fan-out (parallel delegation)

```
Root spawns multiple agents at once:

Root    │ ████ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
        │      ▲▲                                          ▲ │
        │      ││                                          │ │
Agent A │      │└─ ████████████████████                   │ │
Agent B │      └── ████████████████████████████████       │ │
        │                                                  │ │
        └──────────────────────────────────────────────────┴─┘
                                                           Join

Benefit: Reduces total latency through parallelism
Cost: May increase total cost if agents duplicate work
```

### Pattern: Pipeline (sequential delegation)

```
Root delegates in sequence:

Root    │ ████ ▓▓▓▓▓▓▓▓ ████ ▓▓▓▓▓▓▓▓ ████ ▓▓▓▓▓▓▓▓ ████ │
        │      ▲        ▲    ▲        ▲    ▲        ▲    │
Agent A │      └─ ████  │    │        │    │        │    │
Agent B │               └─ ████       │    │        │    │
Agent C │                             └─ ████       │    │
        └───────────────────────────────────────────┴────┘

Benefit: Each agent builds on previous results
Cost: Total latency = sum of all stages
```

### Pattern: Retry

```
Agent retries a failed operation:

Agent   │ ████ ⚠ ████ ⚠ ████ ✓                            │
        │      │      │      │                             │
        │      │      │      └─ Success                    │
        │      │      └─ Retry 2                           │
        │      └─ Retry 1                                  │
        └─────────────────────────────────────────────────┘

Visual cue: Multiple similar spans in sequence
Details panel shows: status = "error" for failed attempts
```

These diagrams illustrate the key visual patterns and interactions in the multi-agent viewer, making it easier to understand the implementation without running the code.
