#!/bin/bash

# ClawScope Viewer Validation Script

echo "🔍 ClawScope Viewer Validation"
echo "=============================="
echo ""

ERRORS=0

# Check required files
echo "Checking required files..."

FILES=(
    "package.json"
    "vite.config.js"
    "index.html"
    "src/main.jsx"
    "src/App.jsx"
    "src/components/WaterfallView.jsx"
    "src/components/SummaryPanel.jsx"
    "src/components/FilterPanel.jsx"
    "src/components/SpanDetailModal.jsx"
    "src/utils/traceUtils.js"
    "src/styles/App.css"
    "samples/sample-trace.json"
    "samples/complex-trace.json"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (missing)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# Validate JSON files
echo "Validating JSON files..."

for json_file in samples/*.json; do
    if python3 -m json.tool "$json_file" > /dev/null 2>&1; then
        echo "  ✓ $json_file"
    else
        echo "  ✗ $json_file (invalid JSON)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# Check for node_modules
if [ -d "node_modules" ]; then
    echo "✓ Dependencies installed"
else
    echo "⚠ Dependencies not installed (run: npm install)"
fi

echo ""

# Summary
if [ $ERRORS -eq 0 ]; then
    echo "✅ All validation checks passed!"
    echo ""
    echo "Ready to run:"
    echo "  npm run dev"
    exit 0
else
    echo "❌ Validation failed with $ERRORS error(s)"
    exit 1
fi
