#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"
exec "$DIR/venv/bin/uvicorn" main:app --host 127.0.0.1 --port 8001 --workers 1
