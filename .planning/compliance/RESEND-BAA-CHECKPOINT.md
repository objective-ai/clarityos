---
status: postmark-fallback
provider: postmark
baa_pdf_path: pending-postmark-signing
recorded_at: 2026-04-29T00:00:00Z
recorded_by: duytran@yahoo.com
notes: |
  Resend skipped without contacting them. Reason: owner wanted to minimize the
  number of vendor accounts. Existing SendGrid account does not have HIPAA BAA
  (Free/Essentials tier — BAA only on Pro $89.95+/mo, exceeds pilot budget).
  Chose Postmark Starter (~$15/mo) for: published BAA path, fast turnaround
  (hours not days), single small refactor in Plans 12-02 + 12-04.
---

# Email Provider BAA Checkpoint — Phase 12 (CRM & Patient Engagement)

## Decision: Postmark

Final routing for the email rail of the messaging system.

| Field | Value |
|---|---|
| Provider | Postmark |
| Python SDK | `postmarker>=1.0` |
| Webhook auth | HTTP Basic Auth (NOT HMAC, NOT Svix — see correction below) |
| Plan | Starter (~$15/mo) — sufficient for pilot |
| BAA path | Submit via Postmark Support → HIPAA Compliance form |

## What was rejected and why

**Resend** — public docs do not advertise a BAA path (verified 2026-04-29). Owner declined to email support to wait 7 days; pivoted to Postmark.

**SendGrid** — owner has existing account but on Free/Essentials tier. SendGrid only offers BAA on Pro ($89.95+/mo) or Premier (custom). Cost exceeded pilot budget.

**Postmark** — public BAA path, Starter tier $15/mo, well-documented webhook flow.

## ⚠️ Plan correction — webhook auth scheme

The original Plan 12-00 frontmatter said:
> "Postmark webhook signature uses raw HMAC-SHA1 (not Svix); update Plan 12-04 accordingly."

**This is incorrect.** Postmark webhooks do NOT use HMAC signing. They use:

1. **HTTP Basic Auth** — set username/password in the Postmark dashboard webhook config; webhook handler validates the `Authorization: Basic <token>` header on every request.
2. **Optional IP allowlist** — Postmark publishes egress IPs at https://postmarkapp.com/support/article/800-ips-for-firewalls

Plan 12-04 must implement `verify_postmark_basic_auth(request)` (constant-time string compare against env vars `POSTMARK_WEBHOOK_USER` / `POSTMARK_WEBHOOK_PASSWORD`), not HMAC-SHA1 verification. The conftest fixture `postmark_webhook_request_factory` already reflects the correct auth scheme.

## Owner action checklist

- [ ] Sign up at postmarkapp.com (Starter tier or higher)
- [ ] Submit HIPAA BAA request: postmarkapp.com → Account → Compliance → Request BAA
- [ ] Save signed PDF to `.planning/compliance/postmark-baa-2026.pdf`
- [ ] Update this file's frontmatter: `baa_pdf_path` to actual path, set `recorded_at` to signing date, change `status` to `signed`
- [ ] Provision domain DNS: SPF, DKIM, DMARC, Return-Path (Postmark walks you through this)
- [ ] Create webhook user/password in Postmark dashboard; set as env vars `POSTMARK_WEBHOOK_USER` / `POSTMARK_WEBHOOK_PASSWORD`
- [ ] Get server token: set as env var `POSTMARK_SERVER_TOKEN`

Until BAA is signed: Postmark account stays in test mode (sends to verified addresses only). Production patient sends are gated on the `signed` status flip.

## Env vars Plan 12-02 + 12-04 will read

```
POSTMARK_SERVER_TOKEN          # API key for sending
POSTMARK_FROM_ADDRESS          # e.g. noreply@clarityos.app
POSTMARK_WEBHOOK_USER          # Basic Auth username
POSTMARK_WEBHOOK_PASSWORD      # Basic Auth password
POSTMARK_MESSAGE_STREAM        # default "outbound" for transactional
```
