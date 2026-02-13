#!/bin/bash
# Start API server and frontend in parallel

set -e

echo "🚀 Starting Agent Registry development environment..."
echo ""

# Start API server in background
echo "📡 Starting API server on port 3001..."
cd "$(dirname "$0")/.."
npm run api:dev &
API_PID=$!

# Wait for API to be ready
echo "⏳ Waiting for API server..."
for i in {1..15}; do
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ API server ready!"
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "❌ API server failed to start"
    kill $API_PID 2>/dev/null || true
    exit 1
  fi
done

# Start frontend
echo ""
echo "🎨 Starting frontend on port 5173..."
cd src/app
npm run dev

# Cleanup on exit
trap "kill $API_PID 2>/dev/null || true" EXIT
