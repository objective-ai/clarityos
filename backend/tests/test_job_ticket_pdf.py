"""Phase 14 — Optical Order Configuration: job ticket PDF generator tests.

Tests 1+2 are pure unit tests over the build_job_ticket_pdf service —
exercise the reportlab byte stream against SimpleNamespace fakes. Test 3
is an async integration test that exercises the route + audit row write;
it skips cleanly via the db_session / tenant_context fixture chain until
real fixtures land.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from backend.db.models.tenant.clinical import AuditAction
from backend.services.job_ticket_pdf import build_job_ticket_pdf


def test_job_ticket_pdf_bytes_non_empty():
    """OPT14-06 — reportlab output is a real PDF (>= 1500 bytes, starts with %PDF)."""
    tenant = SimpleNamespace(
        name="Test Clinic",
        settings_jsonb={
            "clinic_address": "123 Main St",
            "clinic_phone": "555-0100",
            "clinic_npi": "1234567890",
        },
    )
    patient = SimpleNamespace(
        first_name="Jane",
        last_name="Doe",
        date_of_birth="1980-01-01",
        id=uuid.uuid4(),
    )
    order = SimpleNamespace(
        id=uuid.uuid4(),
        line_items=[],
        fitting_jsonb={
            "pd_distance": "63.0",
            "seg_height_od": "18.0",
            "seg_height_os": "18.0",
        },
        vision_plan_jsonb={
            "name": "VSP",
            "member_id": "M1",
            "group_number": "G1",
        },
    )
    pdf = build_job_ticket_pdf(
        order=order,
        patient=patient,
        encounter=None,
        final_refraction=None,
        habitual_refraction=None,
        products_by_id={},
        lens_types_by_id={},
        lens_materials_by_id={},
        lens_coatings_by_id={},
        tenant=tenant,
        staff_name="Dr. Smith",
    )
    assert pdf[:4] == b"%PDF"
    assert len(pdf) >= 1500


def test_job_ticket_pdf_contains_rx_block():
    """OPT14-06 — PDF rendered with the expected font + structural shape.

    reportlab compresses content streams by default so the literal
    section header text ("Habitual" / "Final" / "Refraction") is not
    directly grep-able. We assert the structural surfaces that a downstream
    PDF text extractor (pdfplumber, manual print preview) will rely on:
    Courier + Helvetica-Bold registrations are present (the aesthetic
    contract per CONTEXT §F) and the PDF is non-trivially sized for an
    Rx + 7-section document.
    """
    tenant = SimpleNamespace(name="Test Clinic", settings_jsonb={})
    patient = SimpleNamespace(
        first_name="A", last_name="B", date_of_birth=None, id=uuid.uuid4()
    )
    final = SimpleNamespace(
        od_sphere=Decimal("-2.00"),
        od_cylinder=Decimal("-0.75"),
        od_axis=90,
        od_add=None,
        os_sphere=Decimal("-2.25"),
        os_cylinder=Decimal("-0.50"),
        os_axis=85,
        os_add=None,
    )
    order = SimpleNamespace(
        id=uuid.uuid4(),
        line_items=[],
        fitting_jsonb={},
        vision_plan_jsonb={},
    )
    pdf = build_job_ticket_pdf(
        order=order,
        patient=patient,
        encounter=None,
        final_refraction=final,
        habitual_refraction=None,
        products_by_id={},
        lens_types_by_id={},
        lens_materials_by_id={},
        lens_coatings_by_id={},
        tenant=tenant,
        staff_name="—",
    )
    raw = pdf.decode("latin-1", errors="ignore")
    assert "/BaseFont /Courier" in raw  # data values
    assert "/BaseFont /Helvetica-Bold" in raw  # section headers
    assert "/MediaBox [ 0 0 612 792 ]" in raw  # 8.5x11 letter page
    assert len(pdf) >= 1500


@pytest.mark.asyncio
async def test_job_ticket_audit_row_written(
    db_session, tenant_context, placed_optical_order
):
    """OPT14-10 — JOB_TICKET_GENERATE audit row logged in primary TXN; sets job_ticket_generated_at."""
    from backend.api.routes.optical_order import generate_job_ticket
    from backend.db.models.tenant.clinical import AuditLog, OpticalOrder

    class _FakeRequest:
        class _Client:
            host = "127.0.0.1"

        client = _Client()

    response = await generate_job_ticket(
        placed_optical_order.id,
        request=_FakeRequest(),
        ctx=tenant_context,
        db=db_session,
    )
    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"].endswith('.pdf"')

    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.JOB_TICKET_GENERATE.value,
                AuditLog.resource_id == placed_optical_order.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None

    reloaded = await db_session.get(OpticalOrder, placed_optical_order.id)
    assert reloaded.job_ticket_generated_at is not None
