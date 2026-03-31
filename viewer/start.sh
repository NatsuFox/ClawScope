#!/bin/bash

# ClawScope Viewer Quick Start Script

echo "🚀 ClawScope Viewer Setup"
echo "========================"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✓ Node.js found: $(node --version)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✓ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "✓ Dependencies installed"
echo ""

# Start dev server
echo "🎨 Starting development server..."
echo ""
echo "The debugger will open at http://127.0.0.1:3013"
echo "The demo landing page is available at http://127.0.0.1:3013/landing.html"
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
