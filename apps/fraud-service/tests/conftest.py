"""Set required env vars BEFORE any app module import — app/config.py reads
them at import time and raises KeyError if absent. Unit tests never open a
real connection; these values just have to parse."""

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("KAFKA_BROKERS", "localhost:9092")
