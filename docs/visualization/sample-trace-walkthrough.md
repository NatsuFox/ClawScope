# Multi-Agent Trace Analysis: Sample Walkthrough

This document walks through the sample multi-agent trace to demonstrate how the visualization helps understand complex agent behavior.

## Trace Overview

**Task**: Code review with multiple specialist agents
**Duration**: 45.5 seconds
**Cost**: $0.272
**Agents**: 4 (1 coordinator + 3 specialists)
**Spans**: 23 total

## Agent Hierarchy

```
Root Agent (coordinator)
├── Code Analyzer (specialist)
├── Security Checker (specialist)
└── Code Formatter (specialist)
```

## Timeline Analysis

### Phase 1: Setup (0-6s)

```
Root Agent: ████ ████
            │    │
            │    └─ Load context (2.4s)
            └─ Receive user input (0.1s)
```

The root agent receives the user's code review request and loads the necessary context (PR files, history, etc.). This is sequential work that must complete before delegation.

**Key insight**: Context loading takes 2.4s, which is 5% of total time but necessary overhead.

### Phase 2: Planning (2.5-6s)

```
Root Agent:      ███
                 │
                 └─ Plan review strategy (3.3s)
                    Model call: claude-opus-4
                    Cost: $0.024
```

The root agent uses a model to analyze the PR and decide which specialist agents to spawn. This is where the delegation strategy is determined.

**Key insight**: Planning takes 3.3s and costs $0.024. This upfront investment enables parallel work.

### Phase 3: Parallel Delegation (6-22s)

This is where the multi-agent visualization really shines:

```
Time:       6s    8s    10s   12s   14s   16s   18s   20s   22s
           ┌────────────────────────────────────────────────────┐
Root       │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ (waiting)
           │ ▲▲                                              ▲ │
           ├─┼┼──────────────────────────────────────────────┼─┤
Analyzer   │ │└─ ████████████████████████                   │ │ (12.3s)
           │ │                                              │ │
           ├─┼──────────────────────────────────────────────┼─┤
Security   │ └── ████████████████████████████████████       │ │ (15.7s)
           │                                                │ │
           └────────────────────────────────────────────────┴─┘
                Spawn                                       Join
```

**Concurrent execution**: Both Analyzer and Security Checker run in parallel:
- Analyzer: 6.2s - 18.5s (12.3s duration)
- Security: 6.4s - 22.1s (15.7s duration)

**Waiting/blocking**: Root agent has a JOIN span (6.2s - 22.1s) showing it's blocked waiting for both sub-agents to complete.

**Key insights**:
1. Parallelism saves time: Sequential would take 12.3s + 15.7s = 28s, but parallel takes only 15.9s
2. Root is blocked for 15.9s, which is 35% of total trace time
3. Security Checker is the bottleneck (finishes last at 22.1s)
4. Combined cost of parallel work: $0.042 + $0.038 = $0.080

### Phase 4: Synthesis (22-28s)

```
Root Agent:                                      ████████
                                                 │
                                                 └─ Synthesize findings (6.3s)
                                                    Model call: claude-opus-4
                                                    Cost: $0.058
```

After both sub-agents complete, the root agent synthesizes their findings into a coherent review. This requires a large model call with all the context.

**Key insight**: Synthesis is expensive ($0.058, the highest single span cost) because it processes results from both sub-agents.

### Phase 5: Sequential Delegation (28-38s)

```
Time:       28s   30s   32s   34s   36s   38s
           ┌──────────────────────────────────┐
Root       │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ (waiting)
           │ ▲                              ▲ │
           ├─┼──────────────────────────────┼─┤
Formatter  │ └─ ████████████████████████   │ │ (9.4s)
           │                                │ │
           └────────────────────────────────┴─┘
                Spawn                      Join
```

Based on the synthesis, the root agent decides formatting is needed and spawns the Formatter agent. This is sequential (not parallel) because it depends on the synthesis results.

**Key insight**: Sequential delegation adds latency (9.4s) but is necessary when work depends on previous results.

### Phase 6: Finalization (38-45s)

```
Root Agent:                                      ████████ ██
                                                 │        │
                                                 │        └─ Send response (0.7s)
                                                 └─ Finalize review (6.6s)
                                                    Model call: claude-opus-4
                                                    Cost: $0.082
```

The root agent makes a final model call to format the complete review and sends it to the user.

**Key insight**: Final model call is the most expensive ($0.082) because it includes all context from the entire review process.

## Cost Breakdown

```
Agent           Spans  Duration  Cost      % of Total
─────────────────────────────────────────────────────
Root Agent      12     45.5s     $0.164    60.3%
Code Analyzer   4      12.3s     $0.042    15.4%
Security        4      15.7s     $0.038    14.0%
Formatter       3      9.4s      $0.028    10.3%
─────────────────────────────────────────────────────
Total           23     45.5s     $0.272    100%
```

**Key insights**:
1. Root agent accounts for 60% of cost despite delegating work
2. This is because root makes 3 expensive model calls (plan, synthesize, finalize)
3. Sub-agents are relatively cheap (10-15% each)
4. Parallel delegation is cost-effective: $0.080 for 15.9s of work

## Time Breakdown

```
Phase                Duration  % of Total  Pattern
──────────────────────────────────────────────────────────
Setup                6.0s      13%         Sequential
Parallel work        15.9s     35%         Concurrent
Synthesis            6.3s      14%         Sequential
Sequential work      9.4s      21%         Sequential
Finalization         7.3s      16%         Sequential
──────────────────────────────────────────────────────────
Total                45.5s     100%
```

**Key insights**:
1. Only 35% of time is truly parallel
2. 65% is sequential (setup, synthesis, finalization)
3. Parallelism saves ~12s (28s sequential vs 15.9s parallel)
4. More aggressive parallelism could reduce total time further

## Bottleneck Analysis

### Critical Path

The critical path (longest dependency chain) is:

```
Setup (6s) → Security Checker (15.7s) → Synthesis (6.3s) →
Formatter (9.4s) → Finalization (7.3s) = 44.7s
```

**Bottleneck**: Security Checker (15.7s) is the longest single operation and blocks the root agent.

### Optimization Opportunities

1. **Parallel formatting**: Formatter could run in parallel with synthesis if it only needs raw data
2. **Faster security scanning**: Security Checker is the bottleneck; optimizing it would reduce total time
3. **Incremental synthesis**: Start synthesizing as soon as Analyzer completes (don't wait for Security)
4. **Caching**: Context loading (2.4s) could be cached across reviews

## Visualization Benefits

### What the Swimlane View Shows

1. **Concurrency**: Immediately visible that Analyzer and Security run in parallel
2. **Waiting**: Root agent's long JOIN span shows it's blocked
3. **Bottleneck**: Security Checker's longer bar identifies it as the slowest sub-agent
4. **Sequential dependency**: Formatter clearly starts after synthesis completes

### What the Hierarchy View Shows

1. **Delegation structure**: Root spawns 3 sub-agents
2. **Spawn timing**: Analyzer and Security spawned together, Formatter spawned later
3. **Agent workload**: Span counts show root does most coordination work

### What Details Panel Shows

For each span:
- Exact duration and cost
- Model name and token counts
- Parent/child relationships
- Causality (caused_by_span_id)
- Fidelity (exact vs derived)

## Real-World Patterns Demonstrated

### Pattern 1: Fan-out for Parallelism

```
Root spawns multiple agents at once to reduce latency:
  Root → [Analyzer, Security] (parallel)
```

**Benefit**: Saves ~12s compared to sequential execution
**Cost**: Increases total cost by running multiple models

### Pattern 2: Join/Barrier Synchronization

```
Root waits for all sub-agents before proceeding:
  [Analyzer, Security] → Join → Synthesis
```

**Benefit**: Ensures all data is available before synthesis
**Cost**: Total time limited by slowest sub-agent

### Pattern 3: Sequential Dependency

```
Root spawns agent based on previous results:
  Synthesis → Formatter (sequential)
```

**Benefit**: Avoids unnecessary work (only format if needed)
**Cost**: Adds latency (can't start until synthesis completes)

## Conclusion

This sample trace demonstrates how multi-agent visualization makes complex execution patterns understandable:

1. **Timeline view** shows when agents were active and where time was spent
2. **Hierarchy view** shows why agents were spawned and how they relate
3. **Details panel** provides exact metrics for optimization

The trace reveals that while parallelism saves time, the root agent's coordination overhead (planning, synthesis, finalization) dominates both time and cost. Future optimizations should focus on:

1. Reducing Security Checker latency (bottleneck)
2. Enabling more parallel work (e.g., parallel formatting)
3. Caching expensive operations (e.g., context loading)
4. Incremental synthesis (don't wait for all sub-agents)

This is exactly the kind of insight ClawScope is designed to surface: not just "what happened" but "why it happened" and "how to make it faster."
