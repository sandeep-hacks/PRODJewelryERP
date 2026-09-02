#!/bin/bash
set -e

# 1. Project directories
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Function to clean up background processes on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup EXIT INT TERM

# 2. Setup & Start Backend
echo "=================================================="
echo "🚀 Starting Backend (FastAPI)..."
echo "=================================================="
cd "$PROJECT_DIR/backend"

mkdir -p app/routers
touch app/__init__.py
touch app/routers/__init__.py

if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

if command -v pip3 &> /dev/null; then
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    PIP_CMD="pip"
else
    PIP_CMD="python3 -m pip"
fi

if command -v uvicorn &> /dev/null; then
    UVICORN_CMD="uvicorn"
else
    UVICORN_CMD="python3 -m uvicorn"
fi

if [ -f "requirements.txt" ]; then
    $PIP_CMD install -r requirements.txt
fi

$UVICORN_CMD app.main:app --reload --port 8000 &
BACKEND_PID=$!

# 3. Setup & Start Frontend
echo "=================================================="
echo "✨ Starting Frontend (React + Vite)..."
echo "=================================================="
cd "$PROJECT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies (npm install)..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!

echo "=================================================="
echo "✅ Applications are running!"
echo "👉 Frontend UI:      http://localhost:3000"
echo "👉 Backend API Docs: http://127.0.0.1:8000/docs"
echo "👉 Default Login:    Username: admin | Password: admin123"
echo "=================================================="

# Try to automatically open frontend in the default browser
(sleep 3 && open "http://localhost:3000" 2>/dev/null || true) &

wait