#!/bin/bash
# ============================================================
#  JEDAI Space Pong — Local Launch Script
#  Run this to start the game locally
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║        JEDAI SPACE PONG               ║"
echo "  ║   Where Video Games All Started       ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is required but not installed."
  echo "Install it from https://nodejs.org"
  exit 1
fi

echo "  Node.js $(node --version) detected"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies..."
  npm install
fi

echo ""
echo "  Starting JEDAI Space Pong..."
echo "  Open http://localhost:3000 in your browser"
echo ""

npm run dev
