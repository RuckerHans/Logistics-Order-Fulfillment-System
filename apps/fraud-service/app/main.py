"""FastAPI entrypoint — lifespan-managed Kafka consumer task (Section 6)."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.consumer.kafka_consumer import run_consumer_forever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(run_consumer_forever(stop_event))
    yield
    stop_event.set()
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="fraud-service", lifespan=lifespan)
app.include_router(router)
