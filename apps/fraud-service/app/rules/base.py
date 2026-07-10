"""FraudRule protocol + RuleResult — project-plan.md Section 6.

Adding a new rule (or upgrading to a real anomaly-detection model later)
means adding one class that satisfies this protocol — existing logic
untouched.
"""

from dataclasses import dataclass
from typing import Optional, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.events import OrderStatusChangedEvent


@dataclass
class RuleResult:
    rule_name: str
    reason: str
    severity: str  # 'low' | 'medium' | 'high' (matches the DB CHECK constraint)


class FraudRule(Protocol):
    async def evaluate(
        self, event: OrderStatusChangedEvent, session: AsyncSession
    ) -> Optional[RuleResult]: ...
