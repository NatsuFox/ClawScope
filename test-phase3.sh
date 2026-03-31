#!/bin/bash

# Test script to normalize fixtures and verify viewer integration

set -e

echo "ClawScope Phase 3 Integration Test"
echo "=================================="
echo ""

# Create traces directory
TRACES_DIR="./traces"
mkdir -p "$TRACES_DIR"

# Normalize each test fixture
FIXTURES=(
  "basic-trace-events.jsonl"
  "multi-agent-trace-events.jsonl"
  "error-trace-events.jsonl"
  "queue-trace-events.jsonl"
)

echo "Step 1: Normalizing test fixtures..."
echo ""

cd collector

for fixture in "${FIXTURES[@]}"; do
  fixture_name="${fixture%.jsonl}"
  trace_dir="../traces/${fixture_name}"

  echo "Normalizing ${fixture}..."

  # Create raw events directory
  mkdir -p "${trace_dir}/raw"

  # Copy fixture to raw directory
  cp "test/fixtures/${fixture}" "${trace_dir}/raw/diagnostic_events.jsonl"

  # Normalize
  node src/cli.js normalize "${trace_dir}/raw" "${trace_dir}"

  echo "  ✓ Created ${trace_dir}"
  echo ""
done

cd ..

echo "Step 2: Validating normalized traces..."
echo ""

cd collector

for fixture in "${FIXTURES[@]}"; do
  fixture_name="${fixture%.jsonl}"
  trace_dir="../traces/${fixture_name}"

  echo "Validating ${fixture_name}..."
  node src/cli.js validate "${trace_dir}"
  echo ""
done

cd ..

echo "Step 3: Starting viewer server..."
echo ""
echo "Run the following commands in separate terminals:"
echo ""
echo "  Terminal 1 (Viewer Server):"
echo "    cd viewer/server"
echo "    npm install"
echo "    npm start"
echo ""
echo "  Terminal 2 (Viewer UI):"
echo "    cd viewer"
echo "    npm run dev"
echo ""
echo "Then open http://127.0.0.1:3013 and switch to 'Database' mode"
echo ""
echo "✓ Test preparation complete!"
