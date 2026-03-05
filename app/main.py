from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import diagnosis, encounter, exam_findings, patient_problem, promotion, refraction, staff, vitals
from app.core.config import settings

app = FastAPI(
    title="Clarity Optometry EHR API",
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


@app.get("/")
async def root():
    return {"status": "Clarity EHR API is online", "version": "0.1.0"}