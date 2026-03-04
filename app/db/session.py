"""
db/session.py

Async SQLAlchemy engine and session factory.

We use asyncpg as the async PostgreSQL driver.  The engine is created once
at application startup and reused across all requests.  Individual sessions
are created per-request via the get_db FastAPI dependency.

Connection pool settings are tuned for a multi-tenant SaaS context:
  - pool_size=20      : Reasonable baseline; each worker gets its own pool.
  - max_overflow=10   : Burst capacity for traffic spikes.
  - pool_timeout=30   : How long to wait for a connection before raising.
  - pool_recycle=1800 : Recycle connections every 30 min to avoid stale state.

IMPORTANT: The session created here is a vanilla session.  The
tenant-routing middleware (tenant_router.py) is responsible for calling
`SET search_path` on the underlying connection before any query runs.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,  # e.g. postgresql+asyncpg://user:pass@host/dbname
    echo=settings.DB_ECHO_SQL,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    # Needed for asyncpg to properly handle UUID types without conversion overhead
    connect_args={"server_settings": {"jit": "off"}},
)

# ---------------------------------------------------------------------------
# Session Factory
# ---------------------------------------------------------------------------

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Don't expire objects after commit (better for async)
    autocommit=False,
    autoflush=False,
)


# ---------------------------------------------------------------------------
# FastAPI Dependency
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides a database session per request.

    Usage in a route:
        @router.get("/patients")
        async def list_patients(db: AsyncSession = Depends(get_db)):
            ...

    The tenant search_path is set by TenantMiddleware BEFORE this session
    is used, so any query against TenantBase models will resolve to the
    correct schema automatically.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
