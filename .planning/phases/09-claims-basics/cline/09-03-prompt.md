# Phase 9 Wave 4a — CMS-1500 PDF Generation + Binary BFF Route

## Goal
Add a CMS-1500 style PDF generation endpoint to FastAPI `billing.py` and create the binary-forwarding BFF route that the frontend calls to download PDFs.

**Depends on:** 09-02 complete (billing.py already has payer fee extension)
**Parallel safe with:** 09-04, 09-05 (no shared files)

## Read These Files First
1. `backend/api/routes/billing.py` — find end of router block (add PDF endpoint AFTER existing endpoints)
2. `backend/db/models/tenant/audit.py` — find `AuditLog` model import path
3. `app/api/encounters/[encounterId]/superbill/` — check if directory/route already exists (don't overwrite)
4. `lib/supabase/server.ts` — find `createServerSupabaseClient` import path

## Context

**BFF binary route pattern (raw fetch + arrayBuffer):**
```typescript
// app/api/encounters/[encounterId]/superbill/pdf/route.ts
const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(request, { params }) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const upstream = `${FASTAPI_URL}/api/encounters/${params.encounterId}/superbill/pdf/`;
  const res = await fetch(upstream, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  // ...
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="claim-${params.encounterId.slice(0, 8)}.pdf"`,
    },
  });
}
```

**DRAFT watermark — use `onFirstPage` callback (NOT pypdf):**
```python
def add_draft_watermark(canvas_obj, doc_obj):
    canvas_obj.saveState()
    canvas_obj.setFont("Helvetica-Bold", 80)
    canvas_obj.setFillColorRGB(0.8, 0.2, 0.2, alpha=0.15)
    canvas_obj.translate(4.25 * inch, 5.5 * inch)
    canvas_obj.rotate(45)
    canvas_obj.drawCentredString(0, 0, "DRAFT")
    canvas_obj.restoreState()

doc.build(story, onFirstPage=add_draft_watermark, onLaterPages=add_draft_watermark)
```

**`to_pdf_currency()` helper (prevents Decimal TypeError):**
```python
def to_pdf_currency(val) -> str:
    return f"${float(val):,.2f}"
```

**Permission guard (from existing billing.py):**
```python
ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING))
```

## Do NOT / Instead
- Do NOT use `proxyToFastAPI()` in the BFF route — it corrupts binary responses. Use raw `fetch()` + `res.arrayBuffer()`.
- Do NOT return 403 for draft superbills — ALL statuses get a PDF. Drafts get a "DRAFT" watermark, not an error.
- Do NOT pass raw `Decimal` values to reportlab — always `float(val)` via `to_pdf_currency()`.
- Do NOT use `pypdf` for the watermark — use the `onFirstPage=add_draft_watermark` callback on `doc.build()`. It's simpler and reportlab is already installed.
- Do NOT call `db.refresh()` after `db.flush()` — the audit log uses `db.add(audit)` then `db.commit()` which is fine (no refresh needed on audit).

## Instructions

### Task 1 — Add PDF endpoint to `backend/api/routes/billing.py`

Add imports at top of `billing.py` if not already present:
```python
from io import BytesIO
from fastapi.responses import Response as FastAPIResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
```

Add the endpoint AFTER existing endpoints in the `router` block:
```python
@router.get("/{encounter_id}/superbill/pdf")
async def generate_superbill_pdf(
    encounter_id: str,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Generate a CMS-1500 style PDF for a superbill.

    All statuses allowed. Draft superbills receive a diagonal 'DRAFT' watermark.
    Returns binary application/pdf.
    """
    enc_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)

    # Load superbill with line items and payer
    sb_result = await db.execute(
        select(Superbill)
        .where(Superbill.encounter_id == enc_id, Superbill.tenant_id == ctx.tenant_id)
        .options(
            selectinload(Superbill.line_items),
            selectinload(Superbill.billed_payer),
        )
    )
    superbill = sb_result.scalar_one_or_none()
    if not superbill:
        raise HTTPException(status_code=404, detail="Superbill not found")

    is_draft = superbill.claim_status == ClaimStatus.DRAFT

    # Update audit trail
    superbill.last_pdf_generated_at = datetime.utcnow()
    superbill.pdf_generation_count = (superbill.pdf_generation_count or 0) + 1
    await db.flush()

    # Load patient
    from backend.db.models.tenant.clinical import Patient
    patient_result = await db.execute(
        select(Patient).where(Patient.id == superbill.patient_id, Patient.tenant_id == ctx.tenant_id)
    )
    patient = patient_result.scalar_one_or_none()

    # Load encounter
    enc_result = await db.execute(
        select(Encounter).where(Encounter.id == enc_id, Encounter.tenant_id == ctx.tenant_id)
    )
    encounter = enc_result.scalar_one_or_none()

    pdf_bytes = _build_cms1500_pdf(superbill, patient, encounter, is_draft=is_draft)
    filename = f"{'DRAFT-' if is_draft else ''}claim-{str(enc_id)[:8]}.pdf"

    # Write audit log
    from backend.db.models.tenant.audit import AuditLog
    audit = AuditLog(
        tenant_id=ctx.tenant_id,
        staff_id=ctx.staff_id,
        action="generate_pdf",
        resource_type="superbill",
        resource_id=str(superbill.id),
        details={"is_draft": is_draft, "generation_count": superbill.pdf_generation_count},
    )
    db.add(audit)
    await db.commit()

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

Add the `_build_cms1500_pdf` helper function (private, not a route):
```python
def _build_cms1500_pdf(superbill, patient, encounter, is_draft: bool = False) -> bytes:
    """Build a clean professional CMS-1500 style PDF using reportlab.

    Layout:
    1. Clinic header (clinic name, teal accent line)
    2. Claim info (Claim ID, Date of Service, Status)
    3. Two-column block: Patient Info | Insurance/Payer Info
    4. Service lines table (CPT | Description | Units | Fee)
    5. Total billed (right-aligned)
    6. Footer

    Design: Clean black-on-white. Accent: #2DD4BF (teal). No red government form.
    If is_draft=True: diagonal "DRAFT" watermark via onFirstPage callback.
    """
    def to_pdf_currency(val) -> str:
        return f"${float(val):,.2f}"

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
    normal = styles["Normal"]
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.grey)

    story = []

    # 1. Clinic header
    clinic_name = "ClarityOS Clinic"
    story.append(Paragraph(clinic_name, title_style))
    story.append(Paragraph("INSURANCE CLAIM STATEMENT", styles["Heading2"]))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#2DD4BF")))
    story.append(Spacer(1, 0.15 * inch))

    # 2. Claim info
    encounter_date = encounter.created_at.strftime("%m/%d/%Y") if encounter and encounter.created_at else "—"
    story.append(Paragraph(f"<b>Claim ID:</b> {str(superbill.id)[:8].upper()}", normal))
    story.append(Paragraph(f"<b>Date of Service:</b> {encounter_date}", normal))
    status_label = superbill.claim_status.value.replace("_", " ").title() if hasattr(superbill.claim_status, "value") else str(superbill.claim_status)
    story.append(Paragraph(f"<b>Status:</b> {status_label}", normal))
    story.append(Spacer(1, 0.15 * inch))

    # 3. Two-column: Patient | Payer
    patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown"
    patient_dob = str(patient.date_of_birth) if patient and hasattr(patient, "date_of_birth") and patient.date_of_birth else "—"
    payer_name = superbill.billed_payer.name if superbill.billed_payer else ("Self-Pay" if superbill.is_self_pay else "—")

    two_col_data = [
        ["PATIENT INFORMATION", "INSURANCE / PAYER"],
        [f"Name: {patient_name}", f"Payer: {payer_name}"],
        [f"DOB: {patient_dob}", f"Type: {'Self-Pay' if superbill.is_self_pay else 'Insurance'}"],
    ]
    two_col_table = Table(two_col_data, colWidths=[3.5 * inch, 3.5 * inch])
    two_col_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2DD4BF")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5FFFE")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(two_col_table)
    story.append(Spacer(1, 0.2 * inch))

    # 4. Service lines table
    active_items = [li for li in superbill.line_items if not getattr(li, "is_deleted", False)]
    svc_headers = ["CPT Code", "Description", "Units", "Fee"]
    svc_rows = []
    total_fee = 0.0
    for li in active_items:
        fee_val = float(li.fee)
        total_fee += fee_val * li.units
        source_note = " *" if getattr(li, "fee_source", "base_rate") == "base_rate" else ""
        svc_rows.append([li.cpt_code, li.description or "—", str(li.units), f"{to_pdf_currency(li.fee)}{source_note}"])

    if svc_rows:
        svc_data = [svc_headers] + svc_rows
        svc_table = Table(svc_data, colWidths=[1 * inch, 4.5 * inch, 0.75 * inch, 0.75 * inch])
        svc_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2DD4BF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5FFFE")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ]))
        story.append(Paragraph("<b>SERVICE LINES</b>", styles["Heading3"]))
        story.append(svc_table)
        if any(getattr(li, "fee_source", "base_rate") == "base_rate" for li in active_items):
            story.append(Paragraph("* Base catalog rate (no payer-specific rate on file)", small))
        story.append(Spacer(1, 0.15 * inch))

    # 5. Total
    story.append(Paragraph(f"<b>TOTAL BILLED: {to_pdf_currency(total_fee)}</b>", styles["Heading3"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))

    # 6. Footer
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph("Generated by ClarityOS EHR — This document is for billing purposes only.", small))

    # Build with optional DRAFT watermark
    buffer = BytesIO()

    def add_draft_watermark(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica-Bold", 80)
        canvas_obj.setFillColorRGB(0.8, 0.2, 0.2, alpha=0.15)
        canvas_obj.translate(4.25 * inch, 5.5 * inch)
        canvas_obj.rotate(45)
        canvas_obj.drawCentredString(0, 0, "DRAFT")
        canvas_obj.restoreState()

    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )

    if is_draft:
        doc.build(story, onFirstPage=add_draft_watermark, onLaterPages=add_draft_watermark)
    else:
        doc.build(story)

    return buffer.getvalue()
```

### Task 2 — Create binary BFF route `app/api/encounters/[encounterId]/superbill/pdf/route.ts`

Create the directory `app/api/encounters/[encounterId]/superbill/pdf/` if it doesn't exist, then create `route.ts`:

```typescript
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { encounterId: string } },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstream = `${FASTAPI_URL}/api/encounters/${params.encounterId}/superbill/pdf/`;
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach billing service" }, { status: 502 });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "PDF generation failed" }));
    return NextResponse.json(err, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="claim-${params.encounterId.slice(0, 8)}.pdf"`,
    },
  });
}
```

**Note:** `createServerSupabaseClient` is the existing server-side helper used in all other BFF routes — use the same import path as other BFF routes in `app/api/`.

## Verify
```bash
cd C:/Users/duytr/Projects/clarityos && python -c "from backend.api.routes.billing import generate_superbill_pdf; print('PDF endpoint registered')"
```
Then TypeScript:
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
```

## Done When
- `generate_superbill_pdf` importable from billing.py
- `_build_cms1500_pdf` function exists in billing.py
- BFF route file at `app/api/encounters/[encounterId]/superbill/pdf/route.ts`
- BFF route uses raw `fetch()` — NOT `proxyToFastAPI`
- `npx tsc --noEmit` shows 0 errors

## Commit
```
feat(claims-pdf): add CMS-1500 PDF generation endpoint and binary BFF route
```
