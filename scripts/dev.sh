#!/usr/bin/env bash
# scripts/dev.sh — Dev workflow helper for ClarityOS
# Usage: bash scripts/dev.sh {restart-api|check-api|verify <script>}

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$PROJECT_DIR/venv/Scripts/activate"

case "${1:-help}" in
  restart-api)
    echo "--- Killing existing uvicorn ---"
    taskkill //F //IM uvicorn.exe 2>/dev/null || true
    pkill -f uvicorn 2>/dev/null || true
    sleep 1

    echo "--- Verifying imports ---"
    cd "$PROJECT_DIR"
    source "$VENV"
    python -c "from backend.main import app; print('FastAPI imports OK')"

    echo "--- Starting uvicorn ---"
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
    sleep 3

    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs)
    if [ "$STATUS" = "200" ]; then
      echo "FastAPI is UP (HTTP $STATUS)"
    else
      echo "FastAPI FAILED (HTTP $STATUS)"
      exit 1
    fi
    ;;

  check-api)
    API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs 2>/dev/null || echo "down")
    NEXT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "down")
    echo "FastAPI: $API | Next.js: $NEXT"
    ;;

  verify)
    SCRIPT="${2:?Usage: dev.sh verify /tmp/script.js}"
    cd ~/.claude/skills/playwright-skill
    node run.js "$SCRIPT"
    ;;

  smoke)
    echo "--- Smoke test: login + schedule + patients ---"
    cd ~/.claude/skills/playwright-skill
    node run.js "$PROJECT_DIR/tests/e2e/smoke-pages.spec.js"
    ;;

  help)
    echo "Usage: scripts/dev.sh {restart-api|check-api|verify <script>|smoke}"
    echo ""
    echo "Commands:"
    echo "  restart-api   Kill uvicorn, verify imports, start fresh, health-check"
    echo "  check-api     Quick health-check of FastAPI + Next.js"
    echo "  verify <js>   Run a Playwright test script"
    echo "  smoke         Run smoke test (login + schedule + patients)"
    ;;
esac
