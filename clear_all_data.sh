#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ -d "backend/.venv" ]; then
    source backend/.venv/bin/activate
elif [ -d "backend/venv" ]; then
    source backend/venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
fi

python3 reset_database.py
