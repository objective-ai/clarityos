# System Status

`Admin > System` is an **OWNER-only** surface showing live platform health,
recent Sentry errors, and 7-day uptime. Its purpose is to give the OWNER a
single-pane-of-glass for "is the EHR healthy right now?" without requiring
them to SSH, tail logs, or open Sentry directly.

## Audience

- **Primary:** OWNER role — the only role with `VIEW_SYSTEM_STATUS`
  permission / `view_system_status` entitlement.
- **Secondary:** Duy (engineering) for on-call response.

Every other role (doctor, technician, receptionist, admin) does **not** see
the System section in the sidebar and does **not** see the TopNav health
dot. Deep-linking `/admin?section=system` as a non-owner returns a neutral
"Not available" card — the section's existence is not leaked to
non-privileged users.

## Panels

### Service Health

Three colored cards showing live status of the platform's critical
dependencies:

| Dependency        | Probe                                                             | OK latency |
| ----------------- | ----------------------------------------------------------------- | ---------- |
| **FastAPI**       | `GET /api/system/health` returns 200                              | < 100 ms   |
| **Postgres**      | `SELECT 1` round-trip via the main pool                           | < 50 ms    |
| **Supabase Auth** | `GET /.well-known/openid-configuration` with a 2s timeout         | < 500 ms   |

Each card shows a colored dot (green / amber / red), latency in ms, and a
"last checked" timestamp. Backed by `GET /api/system/health` which is
rate-limited and runs the probes server-side.

### Recent Errors

The last ~50 unresolved Sentry issues in the `production` environment,
sourced directly from the Sentry REST API (no local mirror). Each row
links out to the Sentry issue page. Token stays server-side via the BFF
proxy, with a 20s in-memory cache to avoid Sentry rate limits.

Columns: **Title · Count · Last Seen · Env**. A `(cached)` badge appears
next to the heading when the proxy served the response from cache instead
of Sentry.

### Uptime & Deploy

A 4-stat grid:

1. **7-day uptime %** — computed as
   `count(all_green = true) / count(*)` over `system_health_samples` for
   the trailing 168 hours.
2. **Samples green / total** — raw counts for the same window.
3. **Window start / end** — the inclusive 7-day window.
4. **Deploy SHA** — read from `GIT_SHA` env var at runtime.

Samples are written every 60s by a FastAPI asyncio background task
(`self_pinger`) and opportunistically on every OWNER view of the page.

## TopNav Health Dot

A small colored dot lives in the TopNav immediately left of
`ClockInButton`, visible to **OWNER only**, polling `/api/system/health`
every 60 s. Clicking it opens `Admin > System`.

**Color rollup:**

| Observation                         | Dot Color |
| ----------------------------------- | --------- |
| Any dependency `down`               | 🔴 red    |
| Any dependency `degraded` (no down) | 🟠 amber  |
| All dependencies `ok`               | 🟢 green  |
| Fetch failed / unknown              | ⚪ gray   |

Red wins ties — we want the worst-case signal, not an average.

## Refresh Behavior

- **Auto-poll:** `Admin > System` refreshes every 30 s; the TopNav dot
  every 60 s.
- **Manual:** a "Refresh" button sits top-right of the System section and
  re-fetches all three panels coherently.
- **Timestamp:** "Updated HH:MM:SS" is rendered next to the Refresh
  button so OWNER can confirm data is live.

## Alerting

Sentry's built-in email alert rule is the **sole** alerting channel at
launch:

> **"Any new issue in production"** → emails the OWNER and Duy.

No Slack webhook, no SMS, no pager. The status page itself is pull-only —
it does not push alerts. The decision record for this is in
`.planning/phases/10.3-error-monitoring-system-status/10.3-CONTEXT.md`.

## PHI Safety (HIPAA Seatbelt)

Every Sentry event — in both Next.js and FastAPI runtimes — passes
through a deterministic scrubber before leaving the process:

- **Next.js:** `lib/sentry/phi-scrubber.ts`
- **FastAPI:** `backend/core/sentry_scrubber.py`

Both enforce a shared 41-key deny-list (snake_case + camelCase variants)
covering patient identifiers, contact info, insurance fields, and
clinical free-text.

Additionally, any event whose request URL starts with one of the
**clinical prefixes** below has its entire `request.data` body dropped
before scrubbing runs:

```
/api/encounters
/api/patients
/api/ai-scribe
/api/claims
/api/vitals
/api/exam-findings
/api/superbills
```

Dropping the full payload is belt-and-suspenders: it also protects
against unknown future PHI-bearing fields that haven't been added to the
deny-list yet.

**Sentry is disabled in dev and Vercel preview** by design — test
fixtures include synthetic PHI and must not leak to the cloud. The init
modules gate on `SENTRY_ENVIRONMENT === "production"`.

See `10.3-01-SUMMARY.md` for the scrubber integrity hash used to detect
drift between the two runtimes.

## Runbook (OWNER)

Use this when the dot goes amber or red, or when a Sentry email alert
fires.

### Dot is amber or red → open `Admin > System`

1. **Postgres down.** Check the Supabase Postgres dashboard. If it's a
   compute pause, click Resume. If the pool is saturated, run
   `bash scripts/dev.sh ensure-api` from the dev box to restart
   FastAPI — the backend opens a fresh pool on startup.
2. **Supabase Auth down/degraded.** Check https://status.supabase.com.
   Nothing to do on our side; login will fail until upstream recovers.
   The System page stays available because `/api/system/*` routes
   are exempted from the auth middleware.
3. **FastAPI down.** If the API itself is unreachable, the page will
   show stale data with no "Updated" tick. Restart with
   `bash scripts/dev.sh ensure-api`.

### Recent Errors panel is empty but issues suspected

Verify the following env vars are set in Vercel and FastAPI:

- `SENTRY_API_TOKEN` — org-scoped, requires
  `org:read, project:read, event:read`
- `SENTRY_ORG` — Sentry org slug
- `SENTRY_PROJECT` — Sentry project slug
- `SENTRY_ENVIRONMENT=production` — capture is gated on this

### Uptime panel dips during a deploy

Expected — the self-pinger is restarted when the FastAPI container
cycles, so a handful of samples may be missed. The 7-day rolling window
smooths this out within an hour. If it stays below 99% for > 1 hour,
check for a restart loop in the deploy logs.

### Sentry email alert fires

1. Click the issue link in the email — it opens the Sentry issue page.
2. Before triaging, confirm the scrubber worked: the issue must have
   **no** `request.data` field for clinical routes, and any remaining
   fields named in the deny-list should render as `[Filtered]`.
3. If you see raw PHI in a production issue, **treat as a breach** per
   `.claude/rules/clinical-safety.md` — delete the event in Sentry,
   document in `deferred-items.md`, and hot-patch the scrubber before
   re-deploying.

## Related

- Phase docs: `.planning/phases/10.3-error-monitoring-system-status/`
- Phase context: `10.3-CONTEXT.md` (alerting decision, deny-list)
- Phase verification: `10.3-VERIFICATION.md` (automated + manual checks)
- Scrubber tests: `tests/unit/sentry-scrubber.test.ts`,
  `backend/tests/test_sentry_scrubber.py`
- UI tests: `tests/unit/system-status-section.test.tsx`,
  `tests/unit/topnav-health-dot.test.tsx`,
  `tests/e2e/system-status.spec.ts`
