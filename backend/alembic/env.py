"""
Alembic async migration environment for ClarityOS EHR.

Uses asyncpg driver via async_engine_from_config. Imports both PublicBase
and TenantBase metadata so autogenerate sees every table across both schemas.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import BOTH bases so autogenerate sees all table metadata
from backend.db.base import PublicBase, TenantBase

# Import ALL model modules so their table definitions are registered
# on the respective Base.metadata before autogenerate runs.
from backend.db.models.public import saas  # noqa: F401
from backend.db.models.tenant import clinical  # noqa: F401

# Import settings to get DATABASE_URL
from backend.core.config import settings

# Alembic Config object (provides access to alembic.ini values)
config = context.config

# Override sqlalchemy.url from application settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Combine metadata from both bases for autogenerate
target_metadata = [PublicBase.metadata, TenantBase.metadata]


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configures the context with just a URL and not an Engine.
    Calls to context.execute() emit the given string to the script output.
    """
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Configure context with a live connection and run migrations."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using an async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migrations -- delegates to async runner."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
