"""Runs all registered rules, collects non-None results — Section 6."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.events import OrderStatusChangedEvent
from app.rules.base import FraudRule, RuleResult
from app.rules.value_anomaly_rule import ValueAnomalyRule
from app.rules.velocity_rule import VelocityRule

logger = logging.getLogger(__name__)


class RuleEngine:
    def __init__(self, rules: list[FraudRule] | None = None) -> None:
        self.rules: list[FraudRule] = rules if rules is not None else [
            VelocityRule(),
            ValueAnomalyRule(),
        ]

    async def run(
        self, event: OrderStatusChangedEvent, session: AsyncSession
    ) -> list[RuleResult]:
        flags: list[RuleResult] = []
        for rule in self.rules:
            result = await rule.evaluate(event, session)
            if result is not None:
                logger.info(
                    "Rule %s flagged order %s (%s): %s",
                    result.rule_name,
                    event.order_id,
                    result.severity,
                    result.reason,
                )
                flags.append(result)
        return flags


engine = RuleEngine()
