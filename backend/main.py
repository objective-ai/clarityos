from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import ai_scribe, appointment, audit, diagnosis, encounter, exam_findings, patient, patient_problem, promotion, refraction, staff, vitals
from backend.core.config import settings

app = FastAPI(
    title="ClarityOS API",
    description="Multi-tenant clinical backend — Supabase Postgres + Auth",
    version="0.1.0",
)

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


@app.get("/")
async def root():
    return {"status": "ClarityOS API is online", "version": "0.1.0"}
