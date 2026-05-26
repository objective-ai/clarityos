"""Phase 14 — Optical Order Configuration: job ticket PDF generator tests (Wave 0 stub).

Plan 14-05 lands backend/services/job_ticket_pdf.py + POST
/optical-orders/{id}/job-ticket/. Skip guard until then.
"""

from __future__ import annotations

try:
    from backend.services.job_ticket_pdf import generate_job_ticket_pdf  # noqa: F401
except Exception:  # pragma: no cover
    import pytest

    pytest.skip(
        "Phase 14-05 not yet landed — generate_job_ticket_pdf() unavailable.",
        allow_module_level=True,
    )

import pytest


def test_job_ticket_pdf_bytes_non_empty(optical_order_in_draft):
    """OPT14-06 — reportlab output is a real PDF (>= 1500 bytes, starts with %PDF)."""
    pytest.skip("Phase 14-05 — implement after PDF service")


def test_job_ticket_pdf_contains_rx_block(optical_order_in_draft):
    """OPT14-06 — PDF text extraction contains 'Habitual' + 'Final' Rx columns."""
    pytest.skip("Phase 14-05 — implement after PDF service")


def test_job_ticket_audit_row_written(optical_order_in_draft):
    """OPT14-10 — JOB_TICKET_GENERATE audit row logged in the primary TXN."""
    pytest.skip("Phase 14-05 — implement after route audit hook")
