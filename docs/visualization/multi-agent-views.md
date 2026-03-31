# Multi-Agent Views Architecture

This document describes the implementation of ClawScope's multi-agent visualization system, which provides complementary views for understanding complex agent delegation and concurrency patterns.

## Overview

Multi-agent traces require two distinct but coordinated visualization approaches:

1. **Swimlane Timeline View**: Shows temporal relationships, concurrency, and waiting patterns
2. **Hierarchy/DAG View**: Shows delegation structure and agent relationships

Both views consume the same normalized trace data and support correlated selection, allowing users to understand both "when" and "why" aspects of multi-agent execution.

## Design Principles

### Complementary, Not Redundant

The two views answer different questions:

- **Timeline**: When were agents active? Which agents ran concurrently? Where did agents wait?
- **Hierarchy**: Which agent spawned which? What's the delegation depth? How does control flow?

### Shared Data Model

Both views consume the normalized trace format defined in `/docs/design/event-model.md`. Key fields for multi-agent support:

- `agent_id`: The agent that owns/emitted the span
- `origin_agent_id`: The agent that initiated a delegation
- `target_agent_id`: The agent being delegated to
- `parent_span_id`: Structural nesting
- `caused_by_span_id`: Causal relationships across agent boundaries

### Correlated Selection

Clicking an agent in the hierarchy view filters the timeline to show only that agent's spans. Clicking a span in the timeline shows its details and highlights its agent in the hierarchy.

## Swimlane Timeline View

### Layout Algorithm

Each agent gets its own horizontal lane (swimlane). Spans are positioned within their agent's lane based on time.

```
Time Axis:  0s    5s    10s   15s   20s   25s   30s   35s   40s   45s
           ┌─────────────────────────────────────────────────────────┐
Root Agent │ ████ ████████ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ████████ ████████ ██│
           ├─────────────────────────────────────────────────────────┤
Analyzer   │      ████████████████████████                           │
           ├─────────────────────────────────────────────────────────┤
Security   │      ████████████████████████████████                   │
           ├─────────────────────────────────────────────────────────┤
Formatter  │                              ████████████████           │
           └─────────────────────────────────────────────────────────┘
```

### Key Features

**Concurrency Visualization**: When multiple agents have overlapping spans, it's immediately visible that work happened in parallel.

**Waiting/Blocking**: Long gaps in an agent's lane while other agents are active indicate waiting. Join spans explicitly show synchronization points.

**Nesting Within Lanes**: Spans can nest within their agent's lane to show parent-child relationships (e.g., a tool call nested under a model request).

**Time Alignment**: All lanes share the same time axis, making it easy to correlate events across agents.

### Implementation Details

**Lane Height**: Each lane has a minimum height of 60px, with additional space added for nested spans (8px per nesting level).

**Span Positioning**:
- Left position: `200px + (span_start - trace_start) / trace_duration * timeline_width`
- Width: `span_duration / trace_duration * timeline_width` (minimum 2px)
- Vertical position: `8px + nesting_level * 8px`

**Nesting Calculation**: Spans are sorted by start time, and a level-assignment algorithm finds the first available vertical slot for each span, preventing overlaps.

**Color Modes**:
- Category mode: Colors by span category (MODEL, TOOL, AGENT, etc.)
- Agent mode: Colors by agent_id, making it easy to track which agent owns which work

### Interaction Patterns

- Click a span to view detailed metadata
- Hover over a span to highlight it
- Selected spans show a white border
- Scroll horizontally to see long traces
- Scroll vertically to see many agents

## Hierarchy/DAG View

### Structure

The hierarchy view shows the agent delegation tree, with the root agent at the top and sub-agents as children.

```
Root Agent (11 spans)
├─ Code Analyzer (4 spans)
├─ Security Checker (4 spans)
└─ Code Formatter (3 spans)
```

### Building the Hierarchy

The hierarchy is constructed from agent metadata:

1. Parse all agents from the trace
2. Build a map of agent_id → agent data
3. Link children to parents using the `spawned_by` field
4. Find root agents (those without `spawned_by`)
5. Recursively render the tree

### Agent Spawn Relationships

Agent spawn relationships are captured in AGENT category spans with subtype `spawn`:

```json
{
  "category": "AGENT",
  "subtype": "spawn",
  "origin_agent_id": "agent_root",
  "target_agent_id": "agent_analyzer"
}
```

This allows the hierarchy view to show not just the static structure, but also link to the exact moment when delegation occurred.

### Visual Design

- Each agent node shows:
  - Color-coded icon (matches swimlane colors)
  - Agent name
  - Span count
- Selected agents have a blue highlight
- Indentation shows nesting depth
- Collapsible nodes (future enhancement)

### Interaction Patterns

- Click an agent to filter the timeline to show only that agent's spans
- Click again to deselect and show all agents
- Selected agent is highlighted in both views

## Correlated Selection

The two views maintain shared selection state:

### Agent Selection
1. User clicks agent in hierarchy view
2. `selectedAgent` state is updated
3. Hierarchy view re-renders with highlight
4. Timeline view re-renders, showing only selected agent's lane

### Span Selection
1. User clicks span in timeline view
2. `selectedSpan` state is updated
3. Details panel opens with span metadata
4. Timeline view re-renders with span highlight
5. Hierarchy view highlights the span's agent (future enhancement)

## Filtering and Controls

### Color Mode Toggle

Users can switch between two coloring schemes:

- **Category mode**: Colors indicate span type (MODEL, TOOL, AGENT, etc.)
  - Best for understanding what kind of work is happening
  - Consistent colors across all agents

- **Agent mode**: Colors indicate which agent owns the span
  - Best for tracking agent boundaries
  - Each agent gets a distinct color

### Category Filters

Users can filter spans by category:

- **All**: Show all spans
- **Model**: Show only MODEL category spans
- **Tool**: Show only TOOL category spans
- **Agent**: Show only AGENT category spans (spawn, join, etc.)

Filtering affects the timeline view but not the hierarchy view.

## Data Requirements

### Trace Format

The viewer expects a JSON trace with this structure:

```json
{
  "trace_id": "string",
  "trace_name": "string",
  "start_at": "ISO8601 timestamp",
  "end_at": "ISO8601 timestamp",
  "agents": [
    {
      "agent_id": "string",
      "name": "string",
      "type": "string",
      "spawned_by": "agent_id or null"
    }
  ],
  "spans": [
    {
      "record_id": "string",
      "record_kind": "span",
      "category": "string",
      "subtype": "string",
      "name": "string",
      "start_at": "ISO8601 timestamp",
      "end_at": "ISO8601 timestamp",
      "duration_ms": number,
      "agent_id": "string",
      "parent_span_id": "string or null",
      "caused_by_span_id": "string or null",
      "origin_agent_id": "string or null",
      "target_agent_id": "string or null",
      "status": "string",
      "fidelity": "exact|derived|inferred"
    }
  ],
  "summary": {
    "total_duration_ms": number,
    "total_cost": number,
    "total_agents": number,
    "total_spans": number,
    "agent_stats": {
      "agent_id": {
        "span_count": number,
        "duration_ms": number,
        "cost": number
      }
    }
  }
}
```

### Required Fields for Multi-Agent Views

**Hierarchy View**:
- `agents[].agent_id`
- `agents[].name`
- `agents[].spawned_by`

**Timeline View**:
- `spans[].agent_id`
- `spans[].start_at`
- `spans[].end_at`
- `spans[].duration_ms`
- `spans[].category`
- `spans[].name`

**Delegation Tracking**:
- `spans[].origin_agent_id` (for spawn spans)
- `spans[].target_agent_id` (for spawn spans)
- `spans[].caused_by_span_id` (for cross-agent causality)

## Performance Considerations

### Scalability Targets

The implementation is designed to handle:

- 5-10 agents per trace
- 20-50 spans per agent
- Total trace duration up to 5 minutes
- Timeline width scales with duration (10ms per pixel minimum)

### Optimization Strategies

**Nesting Calculation**: O(n log n) algorithm using sorted spans and active span tracking.

**Rendering**: Direct DOM manipulation rather than virtual DOM for simplicity in the MVP.

**Filtering**: Client-side filtering is sufficient for MVP scale. Larger traces may require server-side filtering.

**Scrolling**: Native browser scrolling with sticky positioning for headers and time axis.

## Future Enhancements

### Collapsible Hierarchy Nodes

For deep agent hierarchies (3+ levels), add expand/collapse controls to the hierarchy view.

### DAG Support

If agents can be spawned by multiple parents or have cross-links, upgrade from tree to directed acyclic graph visualization.

### Span Search

Add text search to quickly find spans by name, category, or metadata.

### Zoom Controls

Add zoom in/out controls for the timeline to focus on specific time ranges.

### Export

Add ability to export filtered views as images or JSON.

### Live Mode

Stream trace data incrementally and update views in real-time as spans complete.

## Visual Design Rationale

### Dark Theme

The viewer uses a dark theme (VS Code-inspired) because:
- Reduces eye strain during long debugging sessions
- Provides better contrast for colored span bars
- Matches developer tool conventions

### Color Palette

Category colors are chosen for:
- Distinctiveness: Easy to tell apart at a glance
- Semantic meaning: Blue for MODEL (thinking), yellow for TOOL (action), purple for AGENT (delegation)
- Accessibility: Sufficient contrast against dark background

### Layout Proportions

- Hierarchy panel: 300px fixed width (enough for agent names + stats)
- Timeline panel: Flexible width (fills remaining space)
- Details panel: 350px fixed width (enough for metadata without overwhelming)

### Typography

- Headers: 13-16px, semi-bold
- Body text: 11-13px, regular
- Monospace for IDs and timestamps
- Sans-serif for readability

## Testing Strategy

### Sample Trace Characteristics

The included `multi-agent-trace.json` demonstrates:

1. **Sequential delegation**: Root spawns analyzer and security in sequence
2. **Concurrent execution**: Analyzer and security run in parallel
3. **Waiting/join**: Root waits for both to complete
4. **Nested delegation**: Root spawns formatter after synthesis
5. **Nested spans**: Tools and model calls nested under agent execution spans
6. **Mixed categories**: USER_IO, CONTEXT, MODEL, TOOL, AGENT, STATE spans

### Manual Test Cases

1. Load trace and verify all agents appear in hierarchy
2. Click each agent and verify timeline filters correctly
3. Click spans and verify details panel shows correct metadata
4. Toggle color modes and verify colors change appropriately
5. Apply category filters and verify spans hide/show correctly
6. Scroll timeline horizontally and verify time axis stays aligned
7. Verify concurrent spans appear in parallel lanes
8. Verify nested spans appear at different vertical levels

## File Structure

```
viewer/
├── index.html                # Backend debugger entry
├── src/
│   └── components/
│       └── MultiAgentTraceView.jsx
└── samples/
    └── multi-agent-trace.json # Sample multi-agent trace data
```

## Usage

Open `viewer/index.html` in the browser, load a trace with actor structure, and switch the debugger from the synchronized log view to the integrated multi-agent view.

To use with your own trace data:
1. Format your trace according to the schema above
2. Place it in `viewer/public/demo-traces/` for landing/demo replay, or import it into `traces/` for the backend debugger
3. Open it through the shared `TraceStudio` shell so the synchronized log and multi-agent views operate on the same trace contract

## Integration with Existing Viewer

This design is now integrated into the main ClawScope viewer:

1. The backend debugger owns the view toggle between synchronized log mode and multi-agent mode
2. Both views share the same trace loading, filtering, and selection state
3. The multi-agent UI only activates when a trace exposes real actor structure
4. Landing/demo replay can still exercise the same visualization model through bundled assets
