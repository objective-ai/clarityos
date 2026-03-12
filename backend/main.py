import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.routes import admin_seed, ai_scribe, appointment, audit, billing, billing_list, diagnosis, encounter, exam_findings, intake, optical, patient, patient_problem, promotion, public_booking, refraction, staff, tenant, vitals
from backend.core.config import settings

logger = logging.getLogger("clarityos")

app = FastAPI(
    title="ClarityOS API",
    description="Multi-tenant clinical backend — Supabase Postgres + Auth",
    version="0.1.0",
)


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    logger.error("Unhandled exception on %s %s:\n%s", request.method, request.url.path, "".join(tb))
    return JSONResponse(status_code=500, content={"detail": str(exc)})

# ── CORS ──────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────
app.include_router(
    ai_scribe.router,
    prefix="/api/encounters",
    tags=["AI Scribe"],
)
app.include_router(
    encounter.router,
    prefix="/api/encounters",
    tags=["Encounters"],
)
app.include_router(
    refraction.router,
    prefix="/api/encounters",
    tags=["Refractions"],
)
app.include_router(
    vitals.router,
    prefix="/api/encounters",
    tags=["Vitals"],
)
app.include_router(
    exam_findings.router,
    prefix="/api/encounters",
    tags=["Exam Findings"],
)
app.include_router(
    diagnosis.router,
    prefix="/api/encounters",
    tags=["Diagnoses"],
)
app.include_router(
    patient.router,
    prefix="/api/patients",
    tags=["Patients"],
)
app.include_router(
    patient_problem.router,
    prefix="/api/patients",
    tags=["Patient Problems"],
)
app.include_router(
    promotion.router,
    prefix="/api/encounters",
    tags=["Promotion"],
)
app.include_router(
    staff.router,
    prefix="/api/staff",
    tags=["Staff"],
)
app.include_router(
    audit.router,
    prefix="/api",
    tags=["Audit Logs"],
)
app.include_router(
    appointment.router,
    prefix="/api/appointments",
    tags=["Appointments"],
)
app.include_router(
    billing.router,
    prefix="/api/encounters",
    tags=["Billing"],
)
app.include_router(
    billing_list.router,
    prefix="/api/superbills",
    tags=["Billing"],
)
app.include_router(
    optical.router,
    prefix="/api/optical",
    tags=["Optical"],
)
app.include_router(
    intake.public_router,
    prefix="/api/public/intake",
    tags=["Intake (Public)"],
)
app.include_router(
    public_booking.router,
    prefix="/api/public/booking",
    tags=["Booking (Public)"],
)
app.include_router(
    intake.staff_router,
    prefix="/api/appointments",
    tags=["Intake (Staff)"],
)
app.include_router(
    tenant.router,
    prefix="/api/tenant",
    tags=["Tenant"],
)
app.include_router(
    admin_seed.router,
    prefix="/api/admin",
    tags=["Admin"],
)


@app.get("/")
async def root():
    return {"status": "ClarityOS API is online", "version": "0.1.0"}
