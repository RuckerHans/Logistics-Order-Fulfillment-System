"""aiokafka consumer loop, group_id="fraud-service" — Section 5.2's registry.

Proves Kafka's cross-language design for real: the same topic order-api
publishes with kafkajs, read here by a Python client in its own group.
"""

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from pydantic import ValidationError

from app.config import CONSUMER_GROUP_ID, KAFKA_BROKERS, ORDER_STATUS_CHANGED_TOPIC
from app.consumer.handlers import handle_event
from app.models.events import OrderStatusChangedEvent

logger = logging.getLogger(__name__)

RESTART_BACKOFF_SECONDS = 5


async def run_consumer_forever(stop_event: asyncio.Event) -> None:
    """Supervisor: a consumer crash must be loud and recoverable, never a
    silent death. Found live: the task raised on its first message (tables
    not migrated yet), and asyncio.create_task swallowed the exception —
    the app kept serving HTTP with its consumer dead and no log line saying
    why. This loop logs the traceback and restarts with a backoff instead.
    """
    while not stop_event.is_set():
        try:
            await _run_consumer(stop_event)
            return  # clean shutdown
        except Exception:
            logger.exception(
                "Kafka consumer crashed — restarting in %ss", RESTART_BACKOFF_SECONDS
            )
            await asyncio.sleep(RESTART_BACKOFF_SECONDS)


async def _run_consumer(stop_event: asyncio.Event) -> None:
    consumer = AIOKafkaConsumer(
        ORDER_STATUS_CHANGED_TOPIC,
        bootstrap_servers=KAFKA_BROKERS,
        group_id=CONSUMER_GROUP_ID,
        auto_offset_reset="earliest",
        # Manual commit AFTER handle_event: aiokafka's default auto-commit
        # ticks every 5s regardless of handler success — a handler crash
        # under auto-commit silently loses the message (at-most-once). This
        # service needs at-least-once + idempotent handlers (Section 19.1).
        enable_auto_commit=False,
    )
    await consumer.start()
    logger.info(
        "Kafka consumer started: topic=%s group_id=%s", ORDER_STATUS_CHANGED_TOPIC, CONSUMER_GROUP_ID
    )
    try:
        async for message in consumer:
            if stop_event.is_set():
                break
            raw = (message.value or b"").decode("utf-8", errors="replace")
            try:
                event = OrderStatusChangedEvent(**json.loads(raw))
            except (ValidationError, json.JSONDecodeError) as exc:
                # Poison message — log loudly, commit, and advance; re-reading
                # forever would wedge the partition behind one bad payload.
                logger.error("Malformed event, skipping: %s (%s)", raw[:200], exc)
                await consumer.commit()
                continue
            await handle_event(event)
            await consumer.commit()
    finally:
        await consumer.stop()
        logger.info("Kafka consumer stopped")
