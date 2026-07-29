#!/usr/bin/env bash
set -euo pipefail
find . -name "__pycache__" -type d -prune -exec rm -rf {} +
find . -name "*.pyc" -delete
find . -name "*.tsbuildinfo" -delete
rm -rf frontend/dist frontend/node_modules/.vite backend/.pytest_cache coverage
find . -maxdepth 3 \( -name "ees.db" -o -name "test_ees.db" \) -delete
echo "Release artifacts cleaned."
