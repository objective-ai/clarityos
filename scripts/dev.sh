#!/usr/bin/env bash
# scripts/dev.sh — Dev workflow helper for ClarityOS
# Usage: bash scripts/dev.sh {restart-api|check-api|verify <script>}

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$PROJECT_DIR/venv/Scripts/activate"

case "${1:-help}" in
  ensure-api)
    # Only restart if API is not responding — prevents wasteful restart loops
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
      echo "FastAPI already UP (HTTP $STATUS) — no restart needed"
      exit 0
    fi
    echo "FastAPI not responding ($STATUS) — restarting..."
    # Fall through to restart-api
    ;&

  restart-next)
    echo "--- Killing Next.js on port 3001 ---"
    PID=$(netstat -ano 2>/dev/null | grep ":3001 " | grep "LISTENING" | awk '{print $NF}' | head -1)
    if [ -n "$PID" ] && [ "$PID" != "0" ]; then
      taskkill //F //PID "$PID" 2>/dev/null || true
      echo "Killed PID $PID"
    else
      echo "No process found on port 3001"
    fi
    sleep 1

    echo "--- Starting Next.js ---"
    cd "$PROJECT_DIR"
    npm run dev &
    sleep 5

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "307" ]; then
      echo "Next.js is UP (HTTP $STATUS)"
    else
      echo "Next.js FAILED (HTTP $STATUS)"
      exit 1
    fi
    ;;

  restart-api)
    echo "--- Killing existing uvicorn ---"
    taskkill //F //IM uvicorn.exe 2>/dev/null || true
    pkill -f uvicorn 2>/dev/null || true
    # Also kill any process still holding port 8000 (uvicorn runs as python.exe on Windows)
    for PID in $(netstat -ano 2>/dev/null | grep ":8000 " | grep "LISTENING" | awk '{print $NF}' | sort -u); do
      [ -n "$PID" ] && [ "$PID" != "0" ] && taskkill //F //PID "$PID" 2>/dev/null || true
    done
    sleep 1

    echo "--- Verifying imports ---"
    cd "$PROJECT_DIR"
    source "$VENV"
    python -c "from backend.main import app; print('FastAPI imports OK')"

    echo "--- Starting uvicorn ---"
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
    sleep 3

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs)
    if [ "$STATUS" = "200" ]; then
      echo "FastAPI is UP (HTTP $STATUS)"
    else
      echo "FastAPI FAILED (HTTP $STATUS)"
      exit 1
    fi
    ;;

  restart-all)
    echo "=== Restarting FastAPI ==="
    bash "$0" restart-api
    echo ""
    echo "=== Restarting Next.js ==="
    bash "$0" restart-next
    ;;

  check-api)
    API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null || echo "down")
    NEXT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null || echo "down")
    echo "FastAPI: $API | Next.js: $NEXT"
    ;;

  pre-test)
    # Quick gate: ensure both servers are up before any test run
    API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null || echo "000")
    NEXT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null || echo "000")
    FAIL=0
    if [ "$API" != "200" ]; then echo "FAIL: FastAPI not responding ($API)"; FAIL=1; fi
    if [ "$NEXT" != "200" ] && [ "$NEXT" != "307" ]; then echo "FAIL: Next.js not responding ($NEXT)"; FAIL=1; fi
    if [ "$FAIL" = "1" ]; then
      echo "Start servers before running tests: npm run dev + uvicorn backend.main:app --reload"
      exit 1
    fi
    echo "OK: FastAPI ($API) + Next.js ($NEXT)"
    ;;

  seed)
    cd "$PROJECT_DIR"
    source "$VENV"
    PYTHONPATH="$PROJECT_DIR" PYTHONIOENCODING=utf-8 python backend/seed_db.py
    ;;

  reseed)
    cd "$PROJECT_DIR"
    source "$VENV"
    RESEED=true PYTHONPATH="$PROJECT_DIR" PYTHONIOENCODING=utf-8 python backend/seed_db.py
    ;;

  verify)
    SCRIPT="${2:?Usage: dev.sh verify /tmp/script.js}"
    cd "$PROJECT_DIR"
    node "$SCRIPT"
    ;;

  smoke)
    echo "--- Smoke test: login + schedule + patients ---"
    cd "$PROJECT_DIR"
    node tests/e2e/smoke-pages.spec.js
    ;;

  help)
    echo "Usage: scripts/dev.sh {ensure-api|restart-api|restart-next|restart-all|check-api|pre-test|seed|reseed|verify <script>|smoke}"
    echo ""
    echo "Commands:"
    echo "  ensure-api    Start FastAPI only if not already running (idempotent)"
    echo "  restart-api   Kill uvicorn, verify imports, start fresh, health-check"
    echo "  restart-next  Kill Next.js, start fresh on port 3001, health-check"
    echo "  restart-all   Restart both FastAPI and Next.js"
    echo "  check-api     Quick health-check of FastAPI + Next.js"
    echo "  pre-test      Gate: verify both servers up before tests (exits 1 if not)"
    echo "  seed          Populate DB with seed data (skips existing rows)"
    echo "  reseed        Wipe + repopulate DB with fresh seed data"
    echo "  verify <js>   Run a Playwright test script"
    echo "  smoke         Run smoke test (login + schedule + patients)"
    ;;
esac
