"""Read API — GET /flags, GET /flags/{order_id} (Section 6)."""

from fastapi import APIRouter
from sqlalchemy import select

from app.db.session import get_session
from app.models.db import FlaggedOrder

router = APIRouter()


def _serialize(flag: FlaggedOrder) -> dict:
    return {
        "id": flag.id,
        "order_id": flag.order_id,
        "rule_name": flag.rule_name,
        "reason": flag.reason,
        "severity": flag.severity,
        "created_at": flag.created_at.isoformat(),
    }


@router.get("/flags")
async def list_flags() -> list[dict]:
    async with get_session() as session:
        result = await session.execute(select(FlaggedOrder).order_by(FlaggedOrder.created_at.desc()))
        return [_serialize(f) for f in result.scalars()]


@router.get("/flags/{order_id}")
async def flags_for_order(order_id: str) -> list[dict]:
    async with get_session() as session:
        result = await session.execute(select(FlaggedOrder).where(FlaggedOrder.order_id == order_id))
        return [_serialize(f) for f in result.scalars()]
