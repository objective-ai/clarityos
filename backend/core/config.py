from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Clarity Optometry EHR"

    # ── Database (Supabase Postgres via asyncpg) ──────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/clarity_db"
    DB_ECHO_SQL: bool = False

    # ── Supabase ──────────────────────────────────────────────────────────
    SUPABASE_URL: str = Field(..., description="Supabase project URL - required")
    SUPABASE_ANON_KEY: str = Field(..., description="Supabase anon key - required")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., description="Supabase service role key - required")
    SUPABASE_JWT_SECRET: str = Field(..., description="Supabase JWT secret - required")

    # ── Anthropic (AI Scribe) ──────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""

    # ── Security ──────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(..., description="App secret key - required")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
