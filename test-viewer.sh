#!/bin/bash
# Quick test script to verify the multi-agent viewer setup

echo "ClawScope Multi-Agent Viewer Test"
echo "================================="
echo ""

# Check if required files exist
echo "Checking file structure..."

files=(
    "viewer/multi-agent.html"
    "viewer/src/multi-agent-viewer.js"
    "viewer/samples/multi-agent-trace.json"
    "docs/multi-agent-views.md"
    "docs/multi-agent-layout-diagrams.md"
)

all_exist=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ $file (missing)"
        all_exist=false
    fi
done

echo ""

if [ "$all_exist" = true ]; then
    echo "✓ All required files present"
    echo ""
    echo "To view the multi-agent trace viewer:"
    echo "  1. Open viewer/multi-agent.html in a web browser"
    echo "  2. Or run: python3 -m http.server 8000"
    echo "     Then navigate to: http://localhost:8000/viewer/multi-agent.html"
    echo ""
    echo "Sample trace includes:"

    # Parse and display trace summary
    if command -v jq &> /dev/null; then
        echo "  - Agents: $(jq -r '.summary.total_agents' viewer/samples/multi-agent-trace.json)"
        echo "  - Spans: $(jq -r '.summary.total_spans' viewer/samples/multi-agent-trace.json)"
        echo "  - Duration: $(jq -r '.summary.total_duration_ms' viewer/samples/multi-agent-trace.json)ms"
        echo "  - Cost: $$(jq -r '.summary.total_cost' viewer/samples/multi-agent-trace.json)"
    else
        echo "  - 4 agents (Root, Analyzer, Security, Formatter)"
        echo "  - 23 spans across all agents"
        echo "  - 45.5 second trace duration"
        echo "  - Demonstrates concurrent and sequential delegation"
    fi

    exit 0
else
    echo "✗ Some files are missing"
    exit 1
fi
