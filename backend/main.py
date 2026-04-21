import asyncio
import logging
import os
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api.routes import admin_seed, ai_scribe, analytics, appointment, audit, billing, billing_list, diagnosis, encounter, exam_findings, intake, optical, patient, patient_insurance, patient_problem, payer, promotion, public_booking, refraction, staff, staff_schedule, system, tenant, uptime, vitals
from backend.api.routes.system import sample_health_now
from backend.core.config import settings
from backend.core.sentry_setup import init_sentry
from backend.db.session import AsyncSessionLocal

logger = logging.getLogger("clarityos")

app = FastAPI(
    title="ClarityOS API",
    description="Multi-tenant clinical backend — Supabase Postgres + Auth",
    version="0.1.0",
)
init_sentry()  # MUST be before add_middleware/include_router — Sentry ASGI wraps the app on init


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
    patient_insurance.router,
    prefix="/api/patients",
    tags=["Patient Insurance"],
)
app.include_router(
    payer.router,
    prefix="/api/payers",
    tags=["Payers"],
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
app.include_router(
    analytics.router,
    prefix="/api/analytics",
    tags=["Analytics"],
)
app.include_router(
    staff_schedule.router,
    prefix="/api/staff-schedule",
    tags=["Staff Schedule"],
)
app.include_router(
    uptime.router,
    prefix="/api/system",
    tags=["System Uptime"],
)
app.include_router(system.router)


# ── Self-pinger (Phase 10.3-04) ───────────────────────────────────────────
# Writes a system_health_samples row every 60s in production so uptime data
# accumulates even when no admin dashboard is open.
_pinger_task: asyncio.Task | None = None
_PINGER_INTERVAL_SECONDS = 60


async def _health_pinger_loop() -> None:
    """Append one health sample every 60s; never crashes the loop."""
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await sample_health_now(db)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Swallow — Sentry will have already captured real issues via
            # init_sentry(). A failing probe must not kill the loop.
            logger.warning("health self-pinger iteration failed: %s", exc)
        await asyncio.sleep(_PINGER_INTERVAL_SECONDS)


@app.on_event("startup")
async def _start_health_pinger() -> None:
    """Start the 60s self-pinger — only in production."""
    global _pinger_task
    if os.getenv("SENTRY_ENVIRONMENT") != "production":
        return
    _pinger_task = asyncio.create_task(_health_pinger_loop())


@app.on_event("shutdown")
async def _stop_health_pinger() -> None:
    """Cancel the self-pinger cleanly on shutdown."""
    global _pinger_task
    if _pinger_task is not None:
        _pinger_task.cancel()
        try:
            await _pinger_task
        except (asyncio.CancelledError, Exception):
            pass
        _pinger_task = None


@app.get("/")
async def root():
    return {"status": "ClarityOS API is online", "version": "0.1.0"}
