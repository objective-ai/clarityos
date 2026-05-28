"""Daily-close route layer (Plan 15-07 — POS-04, POS-10, POS-11, POS-12).

Routes
------
    GET  /api/pos/daily-close/?date=YYYY-MM-DD             — totals preview
                                                              (open or closed day)
    POST /api/pos/daily-close/                              — record DailyCloseRun
                                                              (variance gate + 409
                                                              on duplicate day)
    GET  /api/pos/daily-close/{run_id}/export/?format=pdf|csv
                                                            — landscape PDF or
                                                              flat CSV download

All routes are gated by ``Entitlement.RETAIL_POS`` at the router level.
POST + export additionally enforce ``ClinicalAction.RUN_DAILY_CLOSE``
(OWNER + ADMIN) per POS-11. ``DAILY_CLOSE_RUN`` audit is appended in the
same TXN as the insert (POS-12).
"""
from __future__ import annotations

from datetime import date as date_cls
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.entitlements import Entitlement, require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, get_current_tenant, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction, DailyCloseRun
from backend.db.session import get_db
from backend.schemas.sales import (
    DailyCloseRequest,
    DailyCloseResponse,
    DailyCloseSummary,
    DailyCloseTotalsBucket,
)
from backend.services.money import quantize_money
from backend.services.receipts.daily_close_csv import build_daily_close_csv
from backend.services.receipts.daily_close_pdf import build_daily_close_pdf
from backend.services.sale_lifecycle import compute_daily_close

router = APIRouter(
    prefix="/api/pos/daily-close",
    tags=["pos-daily-close"],
    dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))],
)


async def _existing_run(
    db: AsyncSession, tenant_id: UUID, close_date: date_cls
) -> DailyCloseRun | None:
    return (
        await db.execute(
            select(DailyCloseRun).where(
                DailyCloseRun.tenant_id == tenant_id,
                DailyCloseRun.close_date == close_date,
            )
        )
    ).scalar_one_or_none()


def _build_response(
    data: dict, run: DailyCloseRun | None
) -> DailyCloseResponse:
    """Translate the service dict + (optional) DailyCloseRun into the
    Pydantic response. ``sales_summary.count`` maps to ``summary.sales_count``.
    """
    s = data["sales_summary"]
    return DailyCloseResponse(
        close_date=data["close_date"],
        summary=DailyCloseSummary(
            sales_count=s["count"],
            gross=s["gross"],
            refunds=s["refunds"],
            net=s["net"],
        ),
        by_method=[DailyCloseTotalsBucket(**m) for m in data["by_method"]],
        by_category=[DailyCloseTotalsBucket(**c) for c in data["by_category"]],
        expected_cash=data["expected_cash"],
        stripe_payout_estimate=data.get("stripe_payout_estimate"),
        counted_cash=run.counted_cash if run else None,
        variance=run.variance if run else None,
        run_id=run.id if run else None,
        run_at=run.run_at if run else None,
        notes=run.notes if run else None,
        is_closed=run is not None,
    )


@router.get("/", response_model=DailyCloseResponse)
async def get_daily_close(
    date: date_cls | None = Query(default=None),
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> DailyCloseResponse:
    close_date = date or date_cls.today()
    data = await compute_daily_close(db, ctx.tenant_id, close_date)
    run = await _existing_run(db, ctx.tenant_id, close_date)
    return _build_response(data, run)


@router.post("/", response_model=DailyCloseResponse, status_code=201)
async def record_daily_close(
    body: DailyCloseRequest,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.RUN_DAILY_CLOSE)),
    db: AsyncSession = Depends(get_db),
) -> DailyCloseResponse:
    """Record the cash count and persist the DailyCloseRun row. Variance is
    computed server-side as ``counted_cash - expected_cash`` so the client
    can't lie. Duplicate (tenant, close_date) → 409.
    """
    data = await compute_daily_close(db, ctx.tenant_id, body.close_date)
    expected_cash = data["expected_cash"]
    counted_cash = quantize_money(Decimal(body.counted_cash))
    variance = quantize_money(counted_cash - expected_cash)

    staff = await resolve_staff(ctx, db)
    if staff is None:
        raise HTTPException(
            status_code=400,
            detail="No staff record for caller — cannot run daily close.",
        )

    run = DailyCloseRun(
        tenant_id=ctx.tenant_id,
        close_date=body.close_date,
        expected_cash=expected_cash,
        counted_cash=counted_cash,
        variance=variance,
        notes=body.notes,
        run_by_id=staff.id,
    )
    db.add(run)

    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409, detail="Day already closed."
        ) from exc

    await log_action(
        db,
        ctx,
        AuditAction.DAILY_CLOSE_RUN,
        "daily_close_run",
        run.id,
        staff_id=staff.id,
        metadata={
            "close_date": body.close_date.isoformat(),
            "variance": str(variance),
        },
    )
    await db.commit()
    await db.refresh(run)

    return _build_response(data, run)


@router.get("/{run_id}/export/")
async def export_daily_close(
    run_id: UUID,
    format: str = Query(default="pdf", pattern="^(pdf|csv)$"),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.RUN_DAILY_CLOSE)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Download a closed-day PDF or CSV. Aggregation is recomputed from
    today's data — for closed days this is stable (no late-arriving
    payments). A future plan can snapshot the totals onto DailyCloseRun
    if true historical immutability is needed.
    """
    run = (
        await db.execute(
            select(DailyCloseRun).where(
                DailyCloseRun.id == run_id,
                DailyCloseRun.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Daily close not found")

    data = await compute_daily_close(db, ctx.tenant_id, run.close_date)
    tenant = await db.get(Tenant, ctx.tenant_id)

    if format == "csv":
        body = build_daily_close_csv(
            data, counted_cash=run.counted_cash, variance=run.variance
        )
        filename = f"daily-close-{run.close_date.isoformat()}.csv"
        return Response(
            content=body,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )

    staff = await resolve_staff(ctx, db)
    run_by = (
        f"{staff.first_name} {staff.last_name}".strip() if staff else ""
    )
    body = build_daily_close_pdf(
        data,
        tenant,
        counted_cash=run.counted_cash,
        variance=run.variance,
        run_by=run_by,
    )
    filename = f"daily-close-{run.close_date.isoformat()}.pdf"
    return Response(
        content=body,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"'
        },
    )


__all__ = ["router"]
