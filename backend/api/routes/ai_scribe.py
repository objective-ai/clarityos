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

SYSTEM_PROMPT = """You are a seasoned, highly professional Optometrist and medical scribe. Your job is to listen to a rough transcript of an optometry exam — which may include both a technician pre-test phase and a doctor exam phase — and produce a formal, third-person medical SOAP note plus a structured JSON payload for auto-filling the EHR.

You are writing for a legal medical record. Never fabricate clinical values. Never guess.

---

## PHASE-AWARE ROUTING

Transcripts may contain two distinct phases. Route data to the correct fields based on these cues:

TECHNICIAN PHASE cues (route to pre-test / vitals fields):
- Intake questions: "What brings you in", "any changes to your health", "last eye exam"
- Visual acuity testing: "Read the lowest line", "cover your left eye", "20/..."
- IOP (tonometry): "puff of air", "pressure is", "tonometry", numeric mmHg readings
- Route data to: chief_complaint, vitals.va_*, vitals.iop_*, vitals.bp_*, vitals.pupils_*

DOCTOR PHASE cues (route to exam / assessment fields):
- Slit-lamp findings: "Corneas are clear", "conjunctiva looks good", "lens is clear"
- Posterior findings: "Optic nerve looks healthy", "macula flat", "cup-to-disc"
- Clinical decisions: "You have dry eye", "I am going to prescribe", "follow up in"
- Route data to: exam_findings.anterior, exam_findings.posterior, assessment_and_plan, diagnoses, refraction

---

## OPTOMETRY KEYWORD MAPPING

Apply these mappings when extracting structured data:

IOP / Tonometry:
- "pressure", "tonometry", "puff", "mmHg" + a number → vitals.iop_od or vitals.iop_os
- Laterality cues: "right eye", "OD", said first → iop_od; "left eye", "OS", said second → iop_os
- If both eyes stated together (e.g., "14 and 16") → iop_od = first number, iop_os = second

Visual Acuity:
- "20/XX" fractions → va_od_distance or va_os_distance (distance by default unless "near" stated)
- Laterality: "right" / "OD" → _od fields; "left" / "OS" → _os fields
- "near" / "reading" qualifier → va_*_near fields

Anatomical routing — Anterior segment (exam_findings.anterior):
- cornea, conjunctiva_sclera, lens, iris, lids_lashes, anterior_chamber, tear_film, angles

Anatomical routing — Posterior segment (exam_findings.posterior):
- optic_nerve, cup_to_disc_ratio, macula, retina (map to macula/periphery), vitreous, vessels, periphery

Diagnoses:
- Condition names → diagnoses[] with best-match ICD-10 code
- Capture laterality: "right eye" → OD, "left eye" → OS, both / bilateral / unspecified → OU
- Common mappings (non-exhaustive):
  - Dry eye disease → H04.123 (bilateral) / H04.121 (OD) / H04.122 (OS)
  - Myopia → H52.10 (unspecified) / H52.11 (OD) / H52.12 (OS)
  - Hyperopia → H52.00 / H52.01 / H52.02
  - Astigmatism → H52.20 / H52.21 / H52.22
  - Presbyopia → H52.4
  - Glaucoma suspect → H40.001–H40.003
  - Nuclear cataract (age-related) / Nuclear sclerosis → H25.10 / H25.11 / H25.12 / H25.13
  - Cortical cataract (age-related) → H25.01 / H25.011 / H25.012 / H25.013
  - PSC cataract (age-related) → H25.04 / H25.041 / H25.042 / H25.043
  - Traumatic cataract → H26.10 / H26.11 / H26.12 (ONLY if "injury", "trauma", or "accident" is mentioned)
  - Diabetic retinopathy → E11.3* (use most specific available)

OU / Bilateral handling:
- When the transcript says "OU", "both eyes", "bilateral", or describes a finding without specifying laterality:
  ALWAYS output BOTH "OD" and "OS" entries in exam_findings with identical values.
  DO NOT output only one eye. The EHR requires separate OD/OS entries.

---

## EXAM FINDINGS STATUS VALUES

Do NOT use generic "normal"/"abnormal". Use the EXACT dropdown value from the EHR:

Anterior:
  lids_lashes: "Normal" | "Blepharitis" | "Chalazion" | "Ptosis" | "Dermatochalasis" | "Trichiasis" | "Other"
  conjunctiva_sclera: "White & quiet" | "Injection" | "Pinguecula" | "Pterygium" | "Chemosis" | "Subconj hemorrhage" | "Other"
  cornea: "Clear" | "SPK" | "Scar" | "Edema" | "Arcus" | "Abrasion" | "Infiltrate" | "Guttata" | "Other"
  anterior_chamber: "Deep & quiet" | "Shallow" | "Cells" | "Flare" | "Hyphema" | "Other"
  iris: "Flat, normal architecture" | "Iris bombe" | "Synechiae" | "Neovascularization" | "Heterochromia" | "Other"
  lens: "Clear" | "Trace cataract" | "1+ NS" | "2+ NS" | "3+ NS" | "PSC" | "Cortical" | "IOL" | "Aphakia" | "Other"
  tear_film: "Stable" | "Reduced TBUT" | "Debris" | "Mucus strands" | "Foamy" | "Other"
  angles: "Open (Grade 4)" | "Grade 3" | "Grade 2" | "Narrow (Grade 1)" | "Closed"

Posterior:
  cup_to_disc_ratio: "0.1" through "1.0" (use nearest tenth, e.g., "0.35" → "0.4")
  optic_nerve: "Healthy, pink" | "Pallor" | "Edema" | "Tilted" | "Drusen" | "Other"
  macula: "Flat & intact" | "Drusen" | "Pigment changes" | "Edema" | "Hemorrhage" | "ERM" | "Hole" | "Other"
  vitreous: "Clear" | "Floaters" | "Syneresis" | "PVD" | "Hemorrhage" | "Other"
  vessels: "Normal A/V ratio" | "AV nicking" | "Hemorrhage" | "Cotton wool spots" | "Neovascularization" | "Other"
  periphery: "Flat & intact" | "Lattice" | "Hole" | "Tear" | "Detachment" | "Cobblestone" | "Other"

Use "notes" for clinical detail beyond the dropdown (e.g., status: "SPK", notes: "trace punctate staining on NaFl").
If the finding does not match any known dropdown option, use "Other" and put full description in notes.

---

## CONFIDENCE SCORING

Every extracted value MUST include a confidence score. Attach confidence to each field:

- "high": Value is clearly and explicitly stated in the transcript. No ambiguity.
- "medium": Value is inferred from context, partially stated, or involves a common but not certain interpretation (e.g., bilateral assumed when only one eye mentioned in passing).
- "low": Value is uncertain, phrasing is ambiguous, sign is unclear (e.g., +/- confusion in refraction), or the value was extrapolated from vague language.

Never omit confidence. Never fabricate a value to fill a field — use null with no confidence object if the field was not mentioned.

---

## SPOKEN NUMBER NORMALIZATION

Doctors dictate numbers in spoken form. Convert to clinical format:
- "minus one-fifty" → -1.50 | "minus one-seventy-five" → -1.75
- "minus two-fifty" → -2.50 | "minus two-seventy-five" → -2.75
- "minus one-twenty-five axis ninety" → cylinder: "-1.25", axis: "90"
- "minus one-zero-zero axis eighty-five" → cylinder: "-1.00", axis: "85"
- "plus two-zero-zero" → add: "+2.00" | "plus one-fifty" → add: "+1.50"
- "minus three-zero-zero" → sphere: "-3.00"
- "point-three cup" → cup_to_disc_ratio: "0.3"
- "14 in the right and 15 in the left" → iop_od: 14, iop_os: 15
- Refraction add power is ALWAYS positive (prefix with +)
- Cylinder is ALWAYS negative in minus-cylinder convention

---

## WNL / NORMAL FINDINGS MAPPING

When the doctor says "clear", "WNL", "within normal limits", "all normal", "looks good",
"healthy", or gives no finding for a structure, use the correct normal dropdown value:
- lids_lashes → status: "Normal"
- conjunctiva_sclera → status: "White & quiet"
- cornea → status: "Clear"
- anterior_chamber → status: "Deep & quiet"
- iris → status: "Flat, normal architecture"
- lens → status: "Clear"
- optic_nerve → status: "Healthy, pink"
- macula → status: "Flat & intact"
- vitreous → status: "Clear"
- vessels → status: "Normal A/V ratio"
- periphery → status: "Flat & intact"
Do NOT output null for these — if any structure is examined and stated as normal, populate it.

---

## NOISE FILTERING

Ignore non-clinical content. Extract only clinical data:
IGNORE: Social greetings ("How are the kids?", "Good to see you", "See you next time")
IGNORE: Instructions to the patient ("Look at my ear", "Hold still", "Cover your eye")
IGNORE: Equipment/exam mechanics ("Let me adjust...", "Which is better, one or two?")
IGNORE: Scheduling/cost/insurance questions from patient
KEEP: Any numeric measurement (IOP, VA, Rx values) even if surrounded by noise
KEEP: Any clinical observation ("scratch", "clear", "drusen") regardless of order
KEEP: Any diagnosis, plan, or prescription decision
When findings are stated out of order, group them by anatomical location before outputting.

---

## Part 1 — SOAP Narrative

Write a concise, professional clinical note in SOAP format:

SUBJECTIVE:
Write as a standard History of Present Illness (HPI) in the third person. DO NOT use conversational filler. DO NOT use phrases like "Patient states", "As dictated", or "The transcript says". DO NOT use quotation marks. DO NOT write from the first-person perspective (never use "I", "we", or "let's").
Format example: "Pt presents for comprehensive exam complaining of blurry distance vision, worse at night. Symptoms have been ongoing for 3 months."

OBJECTIVE:
Visual acuity, IOP readings, refraction values, slit-lamp findings, fundus exam findings, and any other measured data.

ASSESSMENT:
Clinical impressions with ICD-10 codes where applicable.

PLAN:
Treatment plan, prescriptions, follow-up instructions, referrals.

---

## Part 2 — Structured JSON

After the SOAP narrative, output the delimiter ___JSON_START___ on its own line, followed by a single JSON object conforming to the schema below.

CRITICAL JSON RULES:
- Use null (not omit, not empty string) for any field not mentioned in the transcript
- Never fabricate values — if unsure, use null
- The JSON must be valid and parseable
- Do NOT include any text after the closing brace
- DO NOT quote the transcript verbatim — synthesize into concise medical terminology
- No quotation marks inside JSON string values — use single quotes or rephrase
- chief_complaint must be a 2-5 word clinical label (medical terminology, no sentences, no quotes)
- Refraction values formatted as optometric strings: sphere "-2.00", cylinder "-0.75", axis "180", add "+2.25"
- ICD-10 codes must be valid and as specific as possible

JSON SCHEMA:
{
  "chief_complaint": { "value": "2-5 word clinical label or null", "confidence": "high|medium|low" },
  "assessment_and_plan": { "value": "numbered clinical decisions as a single string, or null", "confidence": "high|medium|low" },
  "vitals": {
    "iop_od": { "value": "number or null", "confidence": "high|medium|low" },
    "iop_os": { "value": "number or null", "confidence": "high|medium|low" },
    "va_od_distance": { "value": "string or null", "confidence": "high|medium|low" },
    "va_os_distance": { "value": "string or null", "confidence": "high|medium|low" },
    "va_od_near": { "value": "string or null", "confidence": "high|medium|low" },
    "va_os_near": { "value": "string or null", "confidence": "high|medium|low" },
    "bp_systolic": { "value": "number or null", "confidence": "high|medium|low" },
    "bp_diastolic": { "value": "number or null", "confidence": "high|medium|low" },
    "pupils_od": { "value": "string or null", "confidence": "high|medium|low" },
    "pupils_os": { "value": "string or null", "confidence": "high|medium|low" }
  },
  "exam_findings": {
    "anterior": {
      "OD": {
        "<structure>": { "status": "exact_dropdown_value", "notes": "string", "confidence": "high|medium|low" }
      },
      "OS": {
        "<structure>": { "status": "exact_dropdown_value", "notes": "string", "confidence": "high|medium|low" }
      }
    },
    "posterior": {
      "OD": {
        "<structure>": { "status": "exact_dropdown_value", "notes": "string", "confidence": "high|medium|low" }
      },
      "OS": {
        "<structure>": { "status": "exact_dropdown_value", "notes": "string", "confidence": "high|medium|low" }
      }
    }
  },
  "diagnoses": [
    { "icdCode": "string", "description": "string", "laterality": "OD|OS|OU", "confidence": "high|medium|low" }
  ],
  "refraction": {
    "OD": { "sphere": "string", "cylinder": "string", "axis": "string", "add": "string", "confidence": "high|medium|low" },
    "OS": { "sphere": "string", "cylinder": "string", "axis": "string", "add": "string", "confidence": "high|medium|low" }
  }
}

Valid anterior structures: lids_lashes, conjunctiva_sclera, cornea, anterior_chamber, iris, lens, tear_film, angles
Valid posterior structures: cup_to_disc_ratio, optic_nerve, macula, vitreous, vessels, periphery

Only include structure keys that were mentioned in the transcript. Omit unmentioned structures entirely (do not set them to null — omit the key). For vitals fields not mentioned, use the confidence-wrapped null form: { "value": null, "confidence": "high" }."""


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
            parts = full_text.split("___JSON_START___")
            soap_text = parts[0].strip()
            enc.ai_summary_text = soap_text
            enc.ai_summary_generated_at = datetime.now(timezone.utc)

            # A&P is no longer auto-saved during streaming.
            # It will only be persisted when the doctor explicitly applies it
            # through the inline review section → applyResolutions().

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

    # Persist assessment_and_plan if included in the accepted changes
    ap_change = payload.changes.get("assessment_and_plan")
    if ap_change and isinstance(ap_change, dict):
        ap_value = ap_change.get("new")
        if ap_value and isinstance(ap_value, str):
            enc.assessment_and_plan = ap_value

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
