"""Phase 13 — Retail Inventory routes (Product CRUD + Receive/Adjust stock).

All write routes log via log_action() in the primary TXN per .claude/rules/clinical-safety.md.
Stock mutations (receive, adjust) also insert an InventoryTransaction audit row in the SAME TXN.
"""
from __future__ import annotations

import re
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.entitlements import Entitlement, require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    InventoryTransaction,
    Product,
)
from backend.db.session import get_db
from backend.schemas.inventory import (
    AdjustStockRequest,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
    ReceiveStockRequest,
)

router = APIRouter(
    dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))]
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _product_response(p: Product) -> ProductResponse:
    return ProductResponse.model_validate(p, from_attributes=True)


def _generate_sku(payload: ProductCreate) -> str:
    """Auto-generate a SKU from brand/model/attributes when not provided.

    Frames: ``FR-{BRAND}-{MODEL}-{COLOR}-{EYE_SIZE}``
    Contacts: ``CL-{BRAND}-{MODEL}-{POWER}``

    Caller resolves collisions via :func:`_resolve_sku_collision`.
    """

    def _slug(s: str) -> str:
        return re.sub(r"[^A-Z0-9]+", "", (s or "").upper())[:12] or "X"

    brand = _slug(payload.brand)
    model = _slug(payload.model)
    attrs = payload.attributes or {}
    if payload.product_type == "frame":
        color = _slug(str(attrs.get("color", "")))
        eye = re.sub(r"[^A-Z0-9]+", "", str(attrs.get("eye_size", "")).upper())
        parts = ["FR", brand, model, color, eye]
    else:
        # Contact lens — flatten power (-3.50 -> M350)
        power_raw = str(attrs.get("power", ""))
        power = (
            power_raw.replace("-", "M")
            .replace("+", "P")
            .replace(".", "")
            .upper()
        )
        power = re.sub(r"[^A-Z0-9]+", "", power)
        parts = ["CL", brand, model, power]
    return "-".join(p for p in parts if p)


async def _resolve_sku_collision(
    db: AsyncSession, ctx: TenantContext, base_sku: str
) -> str:
    """Return base_sku if no active row holds it; else append -2, -3, ..."""
    candidate = base_sku
    suffix = 2
    while True:
        clash = (
            await db.execute(
                select(Product.id).where(
                    Product.tenant_id == ctx.tenant_id,
                    Product.sku == candidate,
                    Product.is_active.is_(True),
                )
            )
        ).first()
        if not clash:
            return candidate
        candidate = f"{base_sku}-{suffix}"
        suffix += 1


# ---------------------------------------------------------------------------
# GET / — list products
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[ProductResponse])
async def list_products(
    product_type: Optional[Literal["frame", "contact_lens"]] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    stock_status: Literal["all", "in_stock", "low", "out"] = Query("all"),
    active_only: bool = Query(True),
    gender: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    """List products for the tenant with filters."""
    stmt = select(Product).where(Product.tenant_id == ctx.tenant_id)
    if active_only:
        stmt = stmt.where(Product.is_active.is_(True))
    if product_type:
        stmt = stmt.where(Product.product_type == product_type)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(Product.brand.ilike(like), Product.model.ilike(like))
        )
    if stock_status == "in_stock":
        stmt = stmt.where(Product.stock_qty > Product.reorder_threshold)
    elif stock_status == "low":
        stmt = stmt.where(
            Product.stock_qty <= Product.reorder_threshold,
            Product.stock_qty > 0,
        )
    elif stock_status == "out":
        stmt = stmt.where(Product.stock_qty <= 0)
    # JSONB attribute filters — Postgres ->> operator
    if gender and (product_type is None or product_type == "frame"):
        stmt = stmt.where(Product.attributes["gender"].astext == gender)
    if modality and (product_type is None or product_type == "contact_lens"):
        stmt = stmt.where(Product.attributes["modality"].astext == modality)
    stmt = stmt.order_by(
        Product.brand, Product.model, Product.created_at.desc()
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_product_response(p) for p in rows]


# ---------------------------------------------------------------------------
# POST / — create product
# ---------------------------------------------------------------------------


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new product. Auto-generates SKU when not provided."""
    staff = await resolve_staff(ctx, db)
    sku = payload.sku or _generate_sku(payload)
    sku = await _resolve_sku_collision(db, ctx, sku)

    product = Product(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        product_type=payload.product_type,
        brand=payload.brand,
        model=payload.model,
        sku=sku,
        upc=payload.upc,
        attributes=payload.attributes,
        retail_price=payload.retail_price,
        cost_price=payload.cost_price,
        stock_qty=payload.stock_qty,
        reorder_threshold=payload.reorder_threshold,
        is_active=payload.is_active,
    )
    db.add(product)
    await db.flush()

    await log_action(
        db, ctx, AuditAction.PRODUCT_CREATE, "product", product.id,
        staff_id=staff.id if staff else None,
        detail=f"Created product {product.brand} {product.model} ({product.sku})",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Re-fetch (selectinload not needed — Product has no eager response-model relationships)
    product = (
        await db.execute(select(Product).where(Product.id == product.id))
    ).scalar_one()
    return _product_response(product)


# ---------------------------------------------------------------------------
# GET /{product_id}/ — get single product
# ---------------------------------------------------------------------------


@router.get("/{product_id}/", response_model=ProductResponse)
async def get_product(
    product_id: uuid.UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    """Get a single active product by ID."""
    p = (
        await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.tenant_id == ctx.tenant_id,
                Product.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    return _product_response(p)


# ---------------------------------------------------------------------------
# PATCH /{product_id}/ — update product
# ---------------------------------------------------------------------------


@router.patch("/{product_id}/", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    """Update product fields (partial). Emits AuditAction.PRODUCT_UPDATE with diff."""
    staff = await resolve_staff(ctx, db)
    p = (
        await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    changes: dict[str, dict] = {}
    for field, new in payload.model_dump(exclude_unset=True).items():
        old = getattr(p, field, None)
        if old != new:
            changes[field] = {
                "old": str(old) if old is not None else None,
                "new": str(new) if new is not None else None,
            }
            setattr(p, field, new)
    await db.flush()

    await log_action(
        db, ctx, AuditAction.PRODUCT_UPDATE, "product", p.id,
        staff_id=staff.id if staff else None,
        changes=changes if changes else None,
        detail=f"Updated product {p.sku}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    p = (
        await db.execute(select(Product).where(Product.id == p.id))
    ).scalar_one()
    return _product_response(p)


# ---------------------------------------------------------------------------
# DELETE /{product_id}/ — soft-delete (set is_active=False)
# ---------------------------------------------------------------------------


@router.delete("/{product_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_product(
    product_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a product (set is_active=False). Idempotent on already-inactive."""
    staff = await resolve_staff(ctx, db)
    p = (
        await db.execute(
            select(Product).where(
                Product.id == product_id,
                Product.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    if not p.is_active:
        # Idempotent — already deactivated
        return

    p.is_active = False
    await db.flush()

    await log_action(
        db, ctx, AuditAction.PRODUCT_DEACTIVATE, "product", p.id,
        staff_id=staff.id if staff else None,
        detail=f"Soft-deleted product {p.sku}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
