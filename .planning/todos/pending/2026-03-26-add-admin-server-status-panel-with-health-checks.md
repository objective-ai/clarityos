---
created: 2026-03-26T17:59:07.284Z
title: Add admin server status panel with health checks
area: ui
files:
  - scripts/dev.sh
  - app/(tenant)/[tenant]/admin
---

## Problem

No visibility into whether FastAPI (:8000) and Next.js (:3001) are running from within the app. Currently requires terminal commands (`bash scripts/dev.sh check-api`) to verify server health. If services are down, users see silent failures with no clear indication of the cause.

## Solution

Add a server status section to the admin panel that:
- Polls `/api/health` (BFF) and FastAPI's `/docs` or a dedicated `/health` endpoint
- Displays live UP/DOWN status for each service (FastAPI, Next.js)
- Shows last-checked timestamp
- Auto-refreshes on an interval (e.g., every 30s)
- Consider adding a manual "Restart" trigger for dev environments
