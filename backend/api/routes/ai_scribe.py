"""
api/routes/ai_scribe.py

Ambient Data-Entry Scribe — streams a SOAP note + structured JSON from a
raw clinical transcript via Claude API (SSE).

Dual-output protocol:
  1. SOAP narrative (streamed to the UI word-by-word)
  2. Delimiter: ___JSON_START___
  3. Structured JSON (silently buffered by frontend, dispatched to stores on Accept)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.resolvers import resolve_encounter_id
from backend.core.audit import log_action
from backend.core.config import settings
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import AuditAction, Encounter
from backend.db.session import get_db

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class AiScribeRequest(BaseModel):
    transcript: str = Field(..., min_length=10, description="Raw clinical dictation text")


class AiScribeAcceptRequest(BaseModel):
    changes: dict = Field(..., description="Structured JSON auto-filled into encounter fields")


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a seasoned, highly professional Optometrist. Your job is to listen to a rough transcript of an exam and write a formal, third-person medical SOAP note. You are writing for a legal medical record.

Given a raw dictation transcript from a doctor's encounter with a patient, produce TWO outputs in a single response:

## Part 1 — SOAP Narrative
Write a concise, professional clinical note in SOAP format:

SUBJECTIVE:
You MUST write this as a standard History of Present Illness (HPI) in the third person. DO NOT use conversational filler. DO NOT use phrases like "Patient states", "As dictated", or "The transcript says". DO NOT use any quotation marks. DO NOT write from the first-person perspective (e.g., never use "I", "we", or "let's"). Format Example: "Pt presents for comprehensive exam complaining of blurry distance vision, worse at night. Pt reports symptoms have been ongoing for 3 months."

OBJECTIVE:
[Visual acuity, IOP readings, refraction values, slit-lamp findings, fundus exam findings, any other measured data]

ASSESSMENT:
[Clinical impressions with ICD-10 codes where applicable]

PLAN:
[Treatment plan, prescriptions, follow-up instructions, referrals]

## Part 2 — Structured JSON
After the SOAP narrative, output the delimiter ___JSON_START___ on its own line, followed by a JSON object that maps the transcript data to structured clinical fields.

The JSON must conform to this schema (only include fields mentioned in the transcript, omit others):
{
  "chief_complaint": "A 2-5 word clinical label (e.g., Blurry distance vision, Annual exam, Red eye OD). NEVER use quotes inside this string.",
  "vitals": {
    "iop_od": number | null,
    "iop_os": number | null,
    "va_od_distance": "string | null",
    "va_os_distance": "string | null",
    "va_od_near": "string | null",
    "va_os_near": "string | null",
    "bp_systolic": number | null,
    "bp_diastolic": number | null,
    "pupils_od": "string | null",
    "pupils_os": "string | null"
  },
  "exam_findings": {
    "anterior": {
      "OD": { "<structure>": { "status": "normal" | "abnormal", "notes": "string" } },
      "OS": { "<structure>": { "status": "normal" | "abnormal", "notes": "string" } }
    },
    "posterior": {
      "OD": { "<structure>": { "status": "normal" | "abnormal", "notes": "string" } },
      "OS": { "<structure>": { "status": "normal" | "abnormal", "notes": "string" } }
    }
  },
  "diagnoses": [
    { "icdCode": "string", "description": "string", "laterality": "OD" | "OS" | "OU" }
  ],
  "refraction": {
    "OD": { "sphere": "string", "cylinder": "string", "axis": "string", "add": "string" },
    "OS": { "sphere": "string", "cylinder": "string", "axis": "string", "add": "string" }
  }
}

Valid anterior structures: lids_lashes, conjunctiva_sclera, cornea, anterior_chamber, iris, lens, tear_film, angles
Valid posterior structures: cup_to_disc_ratio, optic_nerve, macula, vitreous, vessels, periphery

Rules:
- Only include fields that are explicitly mentioned or clearly implied in the transcript
- Use null for vitals not mentioned (the frontend will skip nulls)
- Refraction values should be formatted as optometric strings (e.g., "-2.00", "+0.75", "180")
- ICD-10 codes must be valid
- The JSON must be valid and parseable
- Do NOT include any text after the JSON object
- DO NOT quote the transcript verbatim in the JSON. Synthesize the patient's spoken words into concise, professional medical terminology
- No quotation marks are allowed inside JSON string values. Use single quotes or rephrase if needed
- chief_complaint must be a 2-5 word clinical label. No quotes, no conversational text, no sentences. Use medical terminology"""


# ---------------------------------------------------------------------------
# POST /encounters/{encounter_id}/ai-scribe
# ---------------------------------------------------------------------------


@router.post("/{encounter_id}/ai-scribe")
async def generate_ai_scribe(
    encounter_id: str,
    payload: AiScribeRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.GENERATE_AI_SCRIBE)),
    db: AsyncSession = Depends(get_db),
):
    """Stream an AI-generated SOAP note + structured JSON from a clinical transcript."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)

    # ── Validate API key ───────────────────────────────────────────────
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Scribe is not configured. Set ANTHROPIC_API_KEY in .env.",
        )

    # ── Validate encounter exists + belongs to tenant ──────────────────
    enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
                Encounter.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if enc.is_finalized:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Encounter is finalized")

    # ── Resolve staff ──────────────────────────────────────────────────
    staff = await resolve_staff(ctx, db)

    # ── Resolve AI model from tenant settings ─────────────────────────
    from backend.core.ai_models import get_tenant_ai_model

    ai_model = await get_tenant_ai_model(ctx.tenant_id, db)

    # ── Stream from Claude ─────────────────────────────────────────────
    from anthropic import Anthropic

    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def stream():
        full_text = ""
        try:
            with client.messages.stream(
                model=ai_model,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": payload.transcript}],
                max_tokens=4096,
            ) as s:
                for text in s.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'text': text})}\n\n"

            yield f"data: {json.dumps({'done': True})}\n\n"

            # ── Save SOAP portion (before delimiter) to DB ─────────
            soap_text = full_text.split("___JSON_START___")[0].strip()
            enc.ai_summary_text = soap_text
            enc.ai_summary_generated_at = datetime.now(timezone.utc)

            await log_action(
                db, ctx, AuditAction.AI_SCRIBE_GENERATED, "encounter", enc.id,
                staff_id=staff.id if staff else None,
                encounter_id=enc.id,
                patient_id=enc.patient_id,
                detail="AI Scribe SOAP note generated",
                ip_address=request.client.host if request.client else None,
            )
            await db.commit()

        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /encounters/{encounter_id}/ai-scribe/accept
# ---------------------------------------------------------------------------


@router.post("/{encounter_id}/ai-scribe/accept", status_code=status.HTTP_201_CREATED)
async def accept_ai_scribe(
    encounter_id: str,
    payload: AiScribeAcceptRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.GENERATE_AI_SCRIBE)),
    db: AsyncSession = Depends(get_db),
):
    """Log that the doctor accepted AI auto-fill for this encounter."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)

    enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
                Encounter.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")

    staff = await resolve_staff(ctx, db)

    from backend.core.ai_models import get_tenant_ai_model

    ai_model = await get_tenant_ai_model(ctx.tenant_id, db)

    await log_action(
        db, ctx, AuditAction.AI_SCRIBE_AUTOFILL, "encounter", enc.id,
        staff_id=staff.id if staff else None,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        detail="AI Scribe auto-fill accepted by provider",
        changes=payload.changes,
        metadata={"ai_model": ai_model},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return {"status": "logged"}
