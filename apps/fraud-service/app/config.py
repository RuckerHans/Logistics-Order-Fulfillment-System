import os

from dotenv import load_dotenv

load_dotenv()

# Runtime connection — fraud_app role (SELECT/INSERT only, no CREATE).
DATABASE_URL = os.environ["DATABASE_URL"]

KAFKA_BROKERS = os.environ["KAFKA_BROKERS"].split(",")

# Group ID from project-plan.md Section 5.2's registry (mirrored from
# packages/contracts topology/kafka.ts) — never shared with another service:
# two services on one group ID silently split partitions between them.
CONSUMER_GROUP_ID = "fraud-service"

ORDER_STATUS_CHANGED_TOPIC = "order.status_changed"
