from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import your Route "Engines"
from app.api.routes import refraction, vitals, encounter

app = FastAPI(
    title="Clarity Optometry EHR API",
    description="Multi-tenant clinical backend for US-based SaaS",
    version="0.1.0"
)

# 1. Setup CORS (Cross-Origin Resource Sharing)
# This allows your Next.js frontend to talk to this FastAPI backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Register the Routes
# This "connects the wires" so requests go to the right logic files
app.include_router(
    refraction.router, 
    prefix="/api/encounters", 
    tags=["Clinical - Refraction"]
)

app.include_router(
    vitals.router, 
    prefix="/api/encounters", 
    tags=["Clinical - Vitals"]
)

@app.get("/")
async def root():
    return {"status": "Clarity EHR API is online", "mode": "Multi-tenant SaaS"}