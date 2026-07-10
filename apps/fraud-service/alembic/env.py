import os

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import create_engine

from app.models.db import Base

load_dotenv()

# fraud_migrator role (USAGE + CREATE on the fraud schema), sync psycopg2
# driver — never the app's own asyncpg DATABASE_URL.
MIGRATION_DATABASE_URL = os.environ["MIGRATION_DATABASE_URL"]

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=MIGRATION_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        version_table_schema="fraud",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(MIGRATION_DATABASE_URL)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # fraud_migrator has no CREATE on public — Alembic's own
            # version table lives in the fraud schema too (same reasoning
            # as the TypeORM services' schema-scoped migrations table).
            version_table_schema="fraud",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
