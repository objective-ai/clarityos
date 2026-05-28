---
phase: 15-point-of-sale
plan: 07
status: complete
completed: 2026-05-28
commits:
  - fe27f5e feat(15-07): compute_daily_close + PDF/CSV exports (POS-04, POS-10)
  - 764001b feat(15-07): daily-close routes — GET totals / POST record / GET export (POS-04, POS-10, POS-11, POS-12)
key-files:
  created:
    - backend/services/receipts/daily_close_pdf.py
    - backend/services/receipts/daily_close_csv.py
    - backend/api/routes/pos_daily_close.py
  modified:
    - backend/services/sale_lifecycle.py
    - backend/main.py
    - backend/tests/test_daily_close.py
    - backend/tests/test_daily_close_export.py
---

## What shipped

Daily-close report rail for POS-04, POS-10, POS-11, POS-12 — the OWNER's
end-of-day cash reconciliation smoke test.

**Aggregation** (`backend.services.sale_lifecycle.compute_daily_close`)
- Single async helper returns a 5-section dict: `sales_summary`,
  `by_method`, `by_category`, `expected_cash`, `stripe_payout_estimate`.
- Queries are pure SQLAlchemy `select + func.sum + func.coalesce + case()`;
  every monetary scalar is `Decimal` round-tripped through `quantize_money`
  (ROUND_HALF_EVEN). No floats anywhere.
- Sales summary counts paid + refunded sales closed on the day; refunds
  are subtracted via a separate `Refund.total_amount` sum so the gross
  number stays "what came in" and the net is "what we kept".
- `by_category` uses `case()` to bucket `SaleLineItem.source_type` →
  `clinical` / `optical` / `retail`.
- `expected_cash = sum(cash payments) − sum(cash refund payouts)`. Stripe
  / check don't touch the till.
- `stripe_payout_estimate` previews Stripe's standard 2.9% + $0.30 fee
  per card transaction; falls back to `Decimal("0.00")` on a zero-stripe
  day so JSON serialization stays deterministic.

**PDF export** (`backend/services/receipts/daily_close_pdf.py`)
- `build_daily_close_pdf(data, tenant, *, counted_cash?, variance?, run_by?)`
  → `bytes` starting with `b"%PDF-"`.
- Landscape `letter` cloned from `backend/services/messaging/compliance_report.py`:
  Helvetica-Bold section headers, Courier money columns, lightgrey table
  headers, GRID + RIGHT-aligned numbers, "Cash reconciliation" panel with
  Variance row bolded.
- Renders `—` placeholders when `counted_cash` / `variance` are missing
  (open-day preview).

**CSV export** (`backend/services/receipts/daily_close_csv.py`)
- `build_daily_close_csv(data, *, counted_cash?, variance?)` → `bytes`
  with header `section,key,count,total`. One row per metric, sections
  ordered `summary` → `by_method` → `by_category` → `cash` → `stripe`.
- Open-day variant omits `cash,counted` and `cash,variance` rows.

**Routes** (`backend/api/routes/pos_daily_close.py`, prefix `/api/pos/daily-close`)
- `GET  /`                  — open or closed-day preview; accepts
                              `?date=YYYY-MM-DD` (defaults to today).
                              Returns `DailyCloseResponse`; `is_closed=True`
                              and run-side fields populated when a
                              `DailyCloseRun` row exists.
- `POST /`                  — body `DailyCloseRequest(close_date,
                              counted_cash, notes?)`. Variance computed
                              server-side. Single `db.flush()` →
                              `IntegrityError` mapped to HTTP 409
                              ("Day already closed."). `DAILY_CLOSE_RUN`
                              audit appended in the same TXN.
- `GET  /{run_id}/export/`  — `?format=pdf|csv`, default pdf. Recomputes
                              the 5-section data for the close date and
                              streams the PDF/CSV with proper
                              `Content-Disposition`.

Router gated at the router level on `Entitlement.RETAIL_POS`; POST and
export additionally enforce `ClinicalAction.RUN_DAILY_CLOSE` (OWNER +
ADMIN). GET preview is `get_current_tenant` only so cashiers can see
running totals during the day.

Registered in `backend/main.py` as
`app.include_router(_pos_daily_close_routes.router)` (router declares its
own prefix per the Plan 15-04 / 15-05 / 15-06 pattern).

## Tests

`backend/tests/test_daily_close.py` + `backend/tests/test_daily_close_export.py`
— **7 passed, 0 warnings, 0.89s**.

Coverage:
- `compute_daily_close` returns the documented 5-section dict shape;
  `sales_summary` math (gross − refunds = net) holds; stripe payout
  estimate matches the documented `2.9% + $0.30` formula
  (`150 − 4.65 = 145.35`).
- Zero-day call returns empty `by_method` / `by_category` and
  `stripe_payout_estimate=Decimal("0.00")` (not `None`).
- `DailyCloseRun.__table__` carries the `UniqueConstraint(tenant_id,
  close_date)` that the route's `IntegrityError → 409` path relies on.
- PDF byte stream starts with `b"%PDF-"`, > 800 bytes; renders both
  closed-day (counted + variance) and open-day (no run) variants.
- CSV byte stream contains the documented header row + every section
  key; open-day variant skips `cash,counted` and `cash,variance`.

Regression sweep across sale / refund / receipt / daily-close suites:
**45 passed, 2 skipped** (skips pre-existed, unrelated).

## Deviations from PLAN

1. **Response schema field name.** Plan said the dict and response both
   use `sales_summary.count`, but the existing `DailyCloseSummary` schema
   from Plan 15-03 has `sales_count`. Service dict keeps `count` (so the
   PDF/CSV builders match the plan), and the route's `_build_response`
   helper maps `count → sales_count` when building the Pydantic model.
   Net effect: API + schema unchanged, service dict matches plan
   verbatim.

2. **GET preview not gated on RUN_DAILY_CLOSE.** Plan §B implies the
   permission gates POST + export only ("RUN_DAILY_CLOSE permission
   (OWNER+ADMIN, POS-11) gates POST and exports"). Implemented exactly
   that — GET uses `get_current_tenant` so any logged-in staff can see
   running totals during the day. POST and `/{run_id}/export/` enforce
   `require_permission(ClinicalAction.RUN_DAILY_CLOSE)`.

3. **No `staff_id` field on `DailyCloseRun.run_by_id`.** The ORM column
   is `run_by_id` (NOT NULL FK to `staff.id`), so the route 400s if
   `resolve_staff(ctx, db)` returns `None`. This shouldn't happen in
   practice — `require_permission` is JWT-gated — but the explicit guard
   keeps the failure mode obvious.

4. **`db.refresh(run)` after audit + commit.** The Pydantic response
   reads `run.run_at` (server_default `now()`), which is populated only
   on commit. After `db.commit()` the route awaits `db.refresh(run)` so
   the response carries the real timestamp rather than `None`.

## Open follow-ups (out of scope, tracked for later plans)

- Historical exports recompute aggregation on every request rather than
  reading snapshotted totals. For Phase 15 this is acceptable — closed
  days don't have late-arriving payments — but a future plan could
  add `snapshot_jsonb` to `DailyCloseRun` if true immutable history is
  required (e.g. for an auditor binder).
- Phase 15-10 will need a BFF proxy in `app/api/pos/daily-close/route.ts`
  to proxy GET + POST and a `[run_id]/export/route.ts` for the PDF/CSV
  blob. That work belongs to Plan 15-10's UI entry-points slice.
- Stripe payout estimate uses the standard 2.9% + $0.30 rate. If a
  tenant negotiates a custom rate, that can land as a column on
  `payment_config` and the helper can read it; deferred until a real
  user surfaces the need.

## Self-Check

- [x] `compute_daily_close` returns the documented 5-section dict (no
      floats, every Decimal quantized).
- [x] PDF + CSV builders return `bytes`; PDF magic verified; CSV has
      the documented header row.
- [x] Router exposes `GET /api/pos/daily-close/`,
      `POST /api/pos/daily-close/`,
      `GET /api/pos/daily-close/{run_id}/export/`.
- [x] `RUN_DAILY_CLOSE` gate on POST + export; `RETAIL_POS` entitlement
      on the whole router.
- [x] `IntegrityError` → HTTP 409 on duplicate `(tenant_id, close_date)`.
- [x] `DAILY_CLOSE_RUN` audit row with `{close_date, variance}` metadata
      in the same TXN as the insert (Pitfall 14).
- [x] `application/pdf` + `text/csv` Responses with proper
      `Content-Disposition`.
- [x] `include_router(_pos_daily_close_routes.router)` in `backend/main.py`.
- [x] 7 unit tests green; 45 sale/refund/receipt regression tests still
      green.
