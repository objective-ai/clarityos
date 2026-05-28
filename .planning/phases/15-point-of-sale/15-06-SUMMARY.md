---
phase: 15-point-of-sale
plan: 06
status: complete
completed: 2026-05-28
commits:
  - 908af40 feat(15-06): receipt + refund-receipt PDF generators (POS-03, POS-05)
  - 5e28c92 feat(15-06): sale + refund receipt routes — PDF stream + Postmark email
key-files:
  created:
    - backend/services/receipts/__init__.py
    - backend/services/receipts/receipt_pdf.py
    - backend/services/receipts/refund_receipt_pdf.py
    - backend/services/messaging/templates/__init__.py
    - backend/services/messaging/templates/receipt_email.py
    - backend/api/routes/sale_receipts.py
  modified:
    - backend/services/messaging/email_client.py
    - backend/main.py
    - backend/tests/test_receipt_pdf.py
    - backend/tests/test_receipt_email.py
  removed:
    - backend/services/messaging/templates.py
---

## What shipped

Backend receipt rail for POS-03 + POS-12.

**PDF generation**
- `build_receipt_pdf(sale, tenant, *, cashier_name)` — letter-size sale
  receipt cloned from `backend/services/job_ticket_pdf.py`: Helvetica-Bold
  section headers, Courier monospaced money values, lightgrey table headers,
  totals block with `LINEABOVE` on the TOTAL row, payment-method block with
  cash-tender detail, optional refund summary, ISO-8601 generated-at footer.
- `build_refund_receipt_pdf(refund, sale, tenant, *, cashier_name)` — same
  template, title swapped to **"Refund receipt"**, refund amounts rendered
  red (`#B91C1C`) per 15-UI-SPEC, reversal block reading
  `refund.payment_allocations`.
- Both helpers are pure-sync, return `bytes` starting with `b"%PDF-"`; the
  caller streams via `fastapi.Response(content=…, media_type="application/pdf")`.

**Routes** (`backend/api/routes/sale_receipts.py`, prefix `/api`)
- `GET  /sales/{id}/receipt/`        — 409 unless sale is `paid|refunded`;
                                       emits `RECEIPT_PRINTED` audit per blob.
- `POST /sales/{id}/receipt/email/`  — body `{to?: str}`; falls back to
                                       `patient.contact_info_jsonb["email"]`;
                                       sends via Postmark with PDF attachment;
                                       emits `RECEIPT_EMAILED` audit with
                                       provider message id.
- `GET  /refunds/{id}/receipt/`      — 404 on missing refund; PDF stream.

Router is mounted at `/api` and gated on `Entitlement.RETAIL_POS`.

**Email**
- `render_receipt_email(...)` — pure HTML+subject builder, HTML-escapes every
  caller-supplied string, suppresses the phone-line block when blank.
- `send_email(...)` gained an optional `attachments=` parameter that maps to
  Postmark's `Attachments` payload — backwards-compatible with every existing
  call site (sender service, recall, scheduler).

## Tests

`backend/tests/test_receipt_pdf.py` + `backend/tests/test_receipt_email.py` —
**5 passed in 0.93s**.

Coverage:
- Receipt PDF byte stream starts with `%PDF-`, > 1000 bytes.
- Refund PDF byte stream starts with `%PDF-`, > 800 bytes, reads
  `payment_allocations`.
- Email subject + body contain clinic name / total / date / change line.
- Caller-supplied strings are HTML-escaped (`<script>` → `&lt;script&gt;`,
  `'` → `&#x27;`, `&` → `&amp;`); phone-line block is suppressed when blank.
- Postmark attachment dict shape (`Name` / `Content` / `ContentType`) +
  base64 round-trip recovers the PDF magic.

Messaging regression check: `pytest backend/tests/messaging/test_templates.py
backend/tests/messaging/test_sender.py` — **52 passed**, confirming the
`templates.py` → `templates/` package promotion did not break any consumer.

## Deviations from PLAN

1. **`templates.py` is a module, not a package.** Plan-stub test imports
   `from backend.services.messaging.templates import receipt_email`, which
   only works if `templates` is a package. Renamed `templates.py` to
   `templates/__init__.py` (content identical) and added the receipt sub-
   module beside it. All existing call sites — `sender.py`, `ai_draft.py`,
   `test_routes_misc.py`, `test_templates.py`, `test_sender.py` — continue
   to work unchanged because Python resolves `templates.X` identically for
   modules and packages with the same exported symbols.

2. **Plan referenced `payment_refunds`** on the Refund ORM. The actual
   relationship is `payment_allocations` (clinical.py:2301);
   `payment_refunds` is the Pydantic *schema* alias used in
   `api/routes/refunds.py:_refund_response`. Refund PDF + the
   `/refunds/{id}/receipt/` handler read the ORM attribute directly, with a
   defensive fallback so the SimpleNamespace fixtures resolve.

3. **Plan used `get_tenant_context` and `db.deps.get_db`.** Real exports are
   `get_current_tenant` (`backend.core.security`) and `get_db`
   (`backend.db.session`). Routes use the real names.

4. **`send_email` signature** is keyword-only (`subject`, `html`, `to`,
   `idempotency_key`, …) — no `tenant` positional, no `text`, no
   `attachments`. Extended the signature with an optional `attachments=`
   kwarg that maps straight to Postmark's `Attachments` field. The route
   builds an `idempotency_key = f"receipt-email:{sale.id}:{to_email}"` so
   accidental double-clicks coalesce in Postmark's message log.

5. **Patient.email does not exist** as a column. Email lives in
   `patient.contact_info_jsonb["email"]`; the route reads it through a
   helper that returns `None` when absent and triggers the 400 "No
   recipient email" path.

## Open follow-ups (out of scope, tracked for later plans)

- The router has no per-action permission gate beyond `RETAIL_POS`. Refunds
  uses `ClinicalAction.ISSUE_REFUND`; receipts may want a parallel
  `VIEW_RECEIPT` / `SEND_RECEIPT` action — defer to Plan 15-11 verification
  once the UI surface is in place.
- Phase 15-09/15-10 UI will need a BFF proxy in `app/api/sales/[id]/...` to
  proxy `receipt/` + `receipt/email/`. That proxy is owned by Plan 15-09's
  store + page work, not 15-06.
- `receipt_url` on Sale stays null; we regenerate on every fetch per the
  Open-Q-2 resolution in 15-CONTEXT.

## Self-Check

- [x] Both PDF generators return `bytes` starting with `b"%PDF-"`
- [x] `application/pdf` Response with `Content-Disposition: inline; filename=...`
- [x] 409 gate on `sale.status not in {paid, refunded}` for both PDF + email
- [x] Postmark used (`send_email` adapter) — zero `resend` references
- [x] `RECEIPT_PRINTED` + `RECEIPT_EMAILED` audits recorded in same TXN
- [x] Templates package conversion does not regress existing messaging tests
- [x] Router registered in `main.py` and exposes 3 routes
- [x] All 5 unit tests green
