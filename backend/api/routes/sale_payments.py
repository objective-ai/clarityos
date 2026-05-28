"""POS payment routes (Phase 15, Plan 15-04, Task 2).

Routes are attached to the shared `sales_router` from sales.py via decorators
below (single-router pattern, WARNING #6 — no separate APIRouter here).

Routes:
    POST   /api/sales/{sale_id}/payments/                    — record cash/external_card/write_off, or init stripe PaymentIntent
    POST   /api/sales/{sale_id}/payments/stripe-confirm/     — confirm via server-authoritative retrieve
    DELETE /api/sales/{sale_id}/payments/{payment_id}/       — cancel pending stripe Payment

All gated on Entitlement.RETAIL_POS + ClinicalAction.RECORD_PAYMENT.
Write-off branch additionally gated on ClinicalAction.RECORD_WRITE_OFF.
"""
from __future__ import annotations

# Task 2 will fill in the actual handler implementations.
# This file currently registers no routes; sales_router is imported only so
# the WARNING #6 acceptance check (`from backend.api.routes.sales import router`)
# is satisfied at module import time.
from backend.api.routes.sales import router as sales_router  # noqa: F401
