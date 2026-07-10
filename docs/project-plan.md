# Logistics Order Fulfillment System — Project Plan

A portfolio project simulating a multi-service order fulfillment pipeline, designed to give honest, defensible hands-on experience with RabbitMQ, Kafka, BullMQ, and a polyglot (NestJS + FastAPI) service architecture.

---

## 1. Purpose & Positioning

This project exists to close a specific, self-identified gap: message queues (Kafka, RabbitMQ, BullMQ) as the most significant backend interview weak spot. Rather than three disconnected toy demos, the project is scoped so each tool solves a genuinely different problem in one coherent domain — order fulfillment, which is adjacent to real production experience with multi-branch retail/logistics systems.

**Domain:** An order moves through a lifecycle (placed → paid → picked → packed → shipped → delivered), with multiple independent services reacting at each stage — inventory, notifications, fraud detection, analytics, audit.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Core backend services | NestJS (TypeScript) |
| Fraud service | **FastAPI (Python)** — the one deliberate polyglot service |
| Frontend | Next.js |
| Relational data | PostgreSQL (schema-per-service in one instance) |
| Job queue | BullMQ (Redis-backed), internal to Order API |
| Task broker | RabbitMQ (management plugin enabled) |
| Event streaming | Kafka, 3-broker KRaft cluster (no Zookeeper) |
| Kafka visibility | kafka-ui (web UI for topics/partitions/consumer lag) |
| Local infra | Docker Compose |
| Repo structure | Monorepo, npm/pnpm workspaces |
| Shared contracts | TypeScript types in `packages/contracts`, mirrored as Pydantic models in the Python service |

### Why FastAPI only for Fraud Service
Fraud/anomaly detection is where Python's ecosystem (pandas, scikit-learn, statistical tooling) is an honest fit — not resume padding. It also proves Kafka's cross-language, protocol-based design for real: the same topic, read independently by a Node.js client (`kafkajs`) and a Python client (`aiokafka`), each in their own consumer group.

---

## 3. Service Boundaries

| Service | Language | Owns | Talks to |
|---|---|---|---|
| **Order API** | NestJS | Order records, state machine, REST for frontend | Publishes to RabbitMQ + Kafka; runs BullMQ jobs |
| **Inventory Service** | NestJS | Stock levels, reservations | Consumes RabbitMQ |
| **Notification Service** | NestJS | Simulated email/SMS sending | Consumes RabbitMQ |
| **Fraud Service** | **FastAPI (Python)** | Fraud rule evaluation, flagged orders | Consumes Kafka (own consumer group), exposes read API |
| **Analytics Service** | NestJS (or Python, optional stretch) | Aggregated stats | Consumes Kafka (own consumer group) |
| **Audit Service** | NestJS | Immutable event log | Consumes Kafka (own consumer group) |
| **Web** | Next.js | Dashboard: place orders, view status, analytics, fraud flags | Calls Order API + read APIs |

**Divide of responsibility between brokers:**
- **RabbitMQ** = task distribution, exactly-once-per-worker (reserve stock, send notification)
- **Kafka** = durable event log, multiple independent replaying consumers (analytics, fraud, audit)
- **BullMQ** = single-service delayed/scheduled jobs (payment timeout, delivery reminders, invoice PDFs)

---

## 4. Domain Model

**Order status state machine (only these transitions are valid):**
```
PLACED → PAYMENT_CONFIRMED
PLACED → CANCELLED                 (payment timeout)
PAYMENT_CONFIRMED → PICKING
PICKING → PACKED
PACKED → SHIPPED
SHIPPED → DELIVERED
```

**Inventory reservation pattern:** placing an order reserves stock (available ↓, reserved ↑) rather than decrementing immediately. `PAYMENT_CONFIRMED` commits the reservation (reserved stock actually decremented); `CANCELLED` releases it. This avoids overselling during the unpaid window and gives the system a legitimate second real transition to react to, not just order-placed.

**How commit/release is wired (resolved — was an open gap in an earlier draft):** the reserve step happens **asynchronously** via RabbitMQ request/reply — Order API fires `reserve_stock` and receives `StockReservationResult` later, on a separate reply queue, consumed independently (Section 5.3). Nothing blocks waiting on an HTTP-style call. Commit and release also happen asynchronously — Inventory Service consumes `order.status_changed` from Kafka in its own consumer group (`inventory-service`), reacting to `PAYMENT_CONFIRMED` (commit) and `CANCELLED` (release). Full trace in Section 20.

---

## 5. Canonical Event & Message Contracts

Wire format convention: **snake_case JSON** on the wire for all cross-service messages (Kafka + RabbitMQ), regardless of which side is TypeScript or Python. NestJS services translate to/from camelCase internally at the serialization boundary.

### 5.1 `order.status_changed` (Kafka)
- **Topic:** `order.status_changed`
- **Partitions:** 3, keyed by `order_id`
- **Replication factor:** 3
- **Producer:** Order API only
- **Consumers (each its own consumer group — see registry below):** `analytics-service`, `fraud-service`, `audit-service`

```typescript
export enum OrderStatus {
  PLACED = 'PLACED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PICKING = 'PICKING',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export interface OrderItem {
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface OrderMetadata {
  branchId: string;
}

export interface OrderStatusChangedEvent {
  schemaVersion: number;                // 1. See Section 19 (schema evolution rules)
  traceId: string;                       // UUID generated once at order placement, propagated everywhere
  orderId: string;
  customerId: string;
  previousStatus: OrderStatus | null;  // null on the first event
  newStatus: OrderStatus;
  timestamp: string;                    // ISO 8601
  deliveryAddress: string;
  orderValue: number;
  items: OrderItem[];
  metadata: OrderMetadata;
}
```

**Wire format (snake_case, what actually goes on the topic):**
```json
{
  "schema_version": 1,
  "trace_id": "trc_9f8e7d6c",
  "order_id": "ord_123",
  "customer_id": "cust_456",
  "previous_status": "PICKING",
  "new_status": "PACKED",
  "timestamp": "2026-07-09T10:15:00Z",
  "delivery_address": "123 Main St, Dagupan",
  "order_value": 1450.00,
  "items": [{ "sku": "SKU001", "qty": 2, "unit_price": 725.00 }],
  "metadata": { "branch_id": "branch_02" }
}
```

**Python mirror (Fraud Service, `app/models/events.py`):**
```python
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional

class OrderStatus(str, Enum):
    PLACED = "PLACED"
    PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED"
    PICKING = "PICKING"
    PACKED = "PACKED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"

class OrderItem(BaseModel):
    sku: str
    qty: int = Field(gt=0)
    unit_price: float = Field(ge=0)

class OrderMetadata(BaseModel):
    branch_id: str

class OrderStatusChangedEvent(BaseModel):
    schema_version: int
    trace_id: str
    order_id: str
    customer_id: str
    previous_status: Optional[OrderStatus]
    new_status: OrderStatus
    timestamp: datetime
    delivery_address: str
    order_value: float = Field(ge=0)
    items: list[OrderItem]
    metadata: OrderMetadata
```

### 5.2 Consumer group registry (critical — must stay distinct)

| Consumer Group ID | Service | Topic |
|---|---|---|
| `analytics-service` | Analytics Service | `order.status_changed` |
| `fraud-service` | Fraud Service | `order.status_changed` |
| `audit-service` | Audit Service | `order.status_changed` |
| `inventory-service` | Inventory Service | `order.status_changed` (reacts to `PAYMENT_CONFIRMED` → commit reservation, `CANCELLED` → release reservation) |

If two services accidentally share a group ID, Kafka treats them as one logical consumer splitting partitions between them — each would silently see only a subset of events. Every consumer's setup code should carry a comment pointing back to this table.

**Why Inventory Service is both a RabbitMQ consumer *and* a Kafka consumer:** the initial reserve request is a synchronous-ish "check and reserve now, tell me if it fails" task — RabbitMQ's request/reply model fits that. But *reacting* to a later state change (payment confirmed, cancelled) is exactly the "independent reader of the event log" pattern every other Kafka consumer already uses — no reason to invent a separate RabbitMQ message type for it. See Section 20 for the full reservation lifecycle trace.

### 5.3 `order.reserve_stock` (RabbitMQ)
- **Exchange:** `order.direct` (direct exchange, routing key `reserve_stock`), **durable: true**
- **Queue:** `inventory.reserve_stock`, **durable: true**, messages published with **persistent delivery mode** (`deliveryMode: 2`) — without this, a broker restart silently drops in-flight messages
- **Retry policy:** 3 attempts, exponential backoff (1s/5s/15s) via a retry queue with per-message TTL and dead-letter-back-to-original-queue pattern; after 3 failed attempts, routed to the DLQ below
- **Dead-letter queue:** `inventory.reserve_stock.failed`
- **Reply queue:** `order-api.stock-reservation-results` — Inventory Service publishes `StockReservationResult` here; Order API consumes it to decide the next transition
- **Producer:** Order API → **Consumer:** Inventory Service

```typescript
export interface ReserveStockMessage {
  traceId: string;
  orderId: string;
  items: { sku: string; qty: number }[];
}

export interface StockReservationResult {
  traceId: string;
  orderId: string;
  status: 'RESERVED' | 'INSUFFICIENT_STOCK';
  unavailableItems?: { sku: string; requestedQty: number; availableQty: number }[];
}
```

**Order API's handling of the reply (previously undefined, now explicit):** on `RESERVED`, order stays `PLACED`, waiting for payment. On `INSUFFICIENT_STOCK`, Order API transitions the order directly to `CANCELLED` (a valid transition per the state machine) — no stock was ever reserved, so no release is needed.

### 5.4 `order.notify` (RabbitMQ)
- **Exchange:** `order.direct` — **Queue:** `notification.send`, **durable: true**, persistent delivery mode
- **Retry policy:** same 3-attempt exponential backoff as above
- **Dead-letter queue:** `notification.send.failed` — previously missing; a failing notification now lands here instead of silently vanishing after repeated failure
- **Producer:** Order API → **Consumer:** Notification Service

```typescript
export interface NotifyMessage {
  traceId: string;
  orderId: string;
  customerId: string;
  type: 'ORDER_PLACED' | 'PAYMENT_CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  channel: 'EMAIL' | 'SMS';
}
```

### 5.5 BullMQ job payloads (internal to Order API only, not cross-service)

```typescript
export interface PaymentTimeoutJob { traceId: string; orderId: string; }
export interface DeliveryReminderJob { traceId: string; orderId: string; customerId: string; }
export interface GenerateInvoiceJob { traceId: string; orderId: string; }
```

- `payment-timeout` — delayed 15 min from `PLACED`; if not `PAYMENT_CONFIRMED` by then, cancel order + emit stock release
- `delivery-reminder` — scheduled for `estimatedDelivery - 1hr`, enqueued on `SHIPPED`
- `generate-invoice-pdf` — enqueued on `PAYMENT_CONFIRMED`, one-shot job

---

## 6. Fraud Service Detail (FastAPI)

```
apps/fraud-service/
├── app/
│   ├── main.py                # FastAPI entrypoint, lifespan-managed Kafka consumer task
│   ├── config.py
│   ├── models/
│   │   ├── events.py          # Pydantic mirror of order.status_changed
│   │   └── db.py               # SQLAlchemy models: order_events, flagged_orders
│   ├── consumer/
│   │   ├── kafka_consumer.py  # aiokafka consumer loop, group_id="fraud-service"
│   │   └── handlers.py
│   ├── rules/
│   │   ├── base.py             # FraudRule protocol + RuleResult
│   │   ├── velocity_rule.py    # 3+ orders same address in 10 min
│   │   ├── value_anomaly_rule.py # order value > 3x customer average
│   │   └── engine.py            # runs all rules, collects results
│   ├── api/
│   │   └── routes.py           # GET /flags, GET /flags/{order_id}
│   └── db/session.py
├── tests/
├── requirements.txt
└── Dockerfile
```

**Rule engine design:** rules implement a `FraudRule` Protocol (`evaluate(event) -> RuleResult | None`), aggregated by a simple `RuleEngine.run()`. Adding a new rule — or later upgrading to a real anomaly-detection model (isolation forest, z-score) — means adding one class, not touching existing logic.

**Rules v1:**
1. **Velocity rule** — 3+ orders to the same delivery address within 10 minutes → flag (medium severity)
2. **Value anomaly rule** — order value exceeds 3x the customer's historical average → flag (high severity)

**Rule scoping — restored (was dropped between drafts):** both rules only make sense against *order placement* facts — "is this new order suspicious" — not against every lifecycle transition. Without an explicit filter, the consumer would re-run both rules on `PICKING`, `PACKED`, `SHIPPED`, etc., which is redundant work and risks inserting duplicate flags for an order that already passed evaluation at placement. The consumer filters before doing any rule work:

```python
# consumer/handlers.py
RELEVANT_STATUSES = {OrderStatus.PLACED}

async def handle_event(event: OrderStatusChangedEvent):
    if event.new_status not in RELEVANT_STATUSES:
        return  # no-op: rules only evaluate at placement, offset still advances

    async with get_session() as session:
        session.add(OrderEvent(**event.model_dump()))
        await session.commit()

    flags = await engine.run(event)
    if flags:
        async with get_session() as session:
            for flag in flags:
                session.add(FlaggedOrder(**flag.model_dump()))
            await session.commit()
```

Every other status transition is still consumed (the offset advances normally — Fraud Service doesn't fall behind or re-read them later) but is a cheap no-op rather than a full rule evaluation. If a future rule genuinely needs to react to a later transition (e.g. "flag orders cancelled and re-placed 3x in a day"), it gets added to `RELEVANT_STATUSES` deliberately, not by omission.

**Dependencies:** `fastapi`, `uvicorn[standard]`, `aiokafka`, `sqlalchemy[asyncio]`, `asyncpg`, `pydantic`, `python-dotenv`, `alembic`, `psycopg2-binary`

**Why two Postgres drivers, not one:** the running service uses `asyncpg` (async-only, matches the `AIOKafkaConsumer`/FastAPI async style used everywhere else in this service). Alembic's default migration runner is synchronous, so it needs `psycopg2-binary` separately — this is why `MIGRATION_DATABASE_URL` (Section 22) uses `postgresql+psycopg2://` while the app's own `DATABASE_URL` uses the async driver. Both packages are required; this is intentional, not a leftover from an earlier draft — don't "simplify" it down to one driver later, since Alembic's sync runner won't work against `asyncpg` and the running app shouldn't take on Alembic's sync overhead just to share a driver.

---

## 7. Infra (Docker Compose)

```yaml
services:
  postgres:      # schema-per-service: order_api, inventory, notification, analytics, audit, fraud
  redis:         # BullMQ
  rabbitmq:      # management plugin, dead-letter exchange configured
  kafka-1:       # KRaft mode, node id 1
  kafka-2:       # KRaft mode, node id 2
  kafka-3:       # KRaft mode, node id 3
  kafka-ui:      # topic/partition/consumer-lag visibility
```

- **Kafka:** 3-broker KRaft cluster (no Zookeeper), `KAFKA_DEFAULT_REPLICATION_FACTOR=3` and `KAFKA_MIN_INSYNC_REPLICAS=2` set on every broker — this is what actually backs the `docker stop kafka-2` demo: with RF=3 and min ISR=2, the cluster tolerates exactly one broker down while still accepting writes from a producer using `acks=all`. Without `min.insync.replicas` set explicitly, "replication factor 3" alone doesn't guarantee anything about write availability during a broker outage — it was narration without a mechanism until this setting was added.

**Producer must also set `acks=all` (previously unstated) — otherwise the broker-side guarantee above is moot:**
```typescript
// messaging/kafka.producer.ts
await this.producer.send({
  topic,
  acks: -1,        // -1 === 'all': wait for every in-sync replica to acknowledge
  messages: [{ key: payload.order_id, value: JSON.stringify(payload) }],
});
```
- **RabbitMQ:** single instance is sufficient; the interesting depth here is the dead-letter exchange pattern, not clustering
- **Postgres:** one instance, separate schema per service (`order_api`, `inventory`, `notification`, `analytics`, `audit`, `fraud`) with scoped roles — demonstrates data-ownership boundaries without the operational overhead of separate DB containers

---

## 8. Repo Structure

```
logistics-platform/
├── apps/
│   ├── order-api/
│   ├── inventory-service/
│   ├── notification-service/
│   ├── fraud-service/          # FastAPI / Python
│   ├── analytics-service/
│   ├── audit-service/
│   └── web/                    # Next.js
├── packages/
│   └── contracts/               # shared TypeScript types
├── infra/
│   └── docker-compose.yml
└── docs/
    └── architecture.md          # this contract, plus rationale write-up
```

Monorepo chosen specifically because the shared event/message contracts need to stay in lockstep across services — the exact problem `packages/contracts` (TS) and the documented Pydantic mirror solve.

### 8.1 NestJS module structure per service

**Order API** (most complex — domain logic separated from messaging plumbing so state machine/rules can be unit-tested without live brokers):
```
apps/order-api/src/
├── orders/
│   ├── orders.controller.ts       # REST endpoints
│   ├── orders.service.ts          # orchestrates state machine + messaging
│   ├── order-state-machine.ts     # pure transition validation logic
│   ├── entities/order.entity.ts
│   └── dto/
├── messaging/
│   ├── rabbitmq.producer.ts       # reserve_stock, notify publishers
│   └── kafka.producer.ts          # status_changed publisher
├── jobs/
│   ├── jobs.module.ts             # BullMQ queue registration
│   ├── payment-timeout.processor.ts
│   ├── delivery-reminder.processor.ts
│   └── generate-invoice.processor.ts
└── common/
    ├── config/
    ├── filters/                   # global exception filter
    └── pipes/                     # global ValidationPipe
```

**Inventory / Notification Services** (mirror each other, simpler):
```
apps/inventory-service/src/
├── inventory/
│   ├── inventory.service.ts       # reservation logic
│   └── entities/stock.entity.ts
└── messaging/
    └── rabbitmq.consumer.ts
```

**Analytics / Audit Services** (mirror each other, both NestJS):
```
apps/analytics-service/src/
├── analytics/
│   ├── analytics.controller.ts    # read endpoints for dashboard
│   └── analytics.service.ts       # aggregation logic
└── messaging/
    └── kafka.consumer.ts          # group_id: "analytics-service"
```

### 8.2 Docker network & port map

All containers on one bridge network (`logistics-net`), resolving each other by service name rather than `localhost`:

| Service | Container port | Host port |
|---|---|---|
| postgres | 5432 | 5432 |
| redis | 6379 | 6379 |
| rabbitmq (AMQP) | 5672 | 5672 |
| rabbitmq (mgmt UI) | 15672 | 15672 |
| kafka-1 | 9092 | 9092 |
| kafka-2 | 9092 | 9095 |
| kafka-3 | 9092 | 9096 |
| kafka-ui | 8080 | 8080 |
| order-api | 3000 | 3000 |
| inventory-service | 3000 | 3001 |
| notification-service | 3000 | 3002 |
| analytics-service | 3000 | 3003 |
| audit-service | 3000 | 3004 |
| fraud-service (FastAPI) | 8000 | 8005 |
| web (Next.js) | 3000 | 3100 |

### 8.3 Full docker-compose.yml (infra layer, Phase 0)

```yaml
version: '3.8'

networks:
  logistics-net:

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: devpassword
    ports: ["5432:5432"]
    networks: [logistics-net]
    volumes:
      - pg-data:/var/lib/postgresql/data
      - ../docs/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7
    ports: ["6379:6379"]
    networks: [logistics-net]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  rabbitmq:
    image: rabbitmq:3.13-management
    ports: ["5672:5672", "15672:15672"]
    networks: [logistics-net]
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 10s
      retries: 10

  kafka-1:
    image: apache/kafka:3.7.0
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka-1:9093,2@kafka-2:9093,3@kafka-3:9093
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
    ports: ["9092:9092"]
    networks: [logistics-net]
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 15

  kafka-2:
    image: apache/kafka:3.7.0
    environment:
      KAFKA_NODE_ID: 2
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka-1:9093,2@kafka-2:9093,3@kafka-3:9093
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
    ports: ["9095:9092"]
    networks: [logistics-net]
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 15

  kafka-3:
    image: apache/kafka:3.7.0
    environment:
      KAFKA_NODE_ID: 3
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka-1:9093,2@kafka-2:9093,3@kafka-3:9093
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"
    ports: ["9096:9092"]
    networks: [logistics-net]
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 || exit 1"]
      interval: 10s
      timeout: 10s
      retries: 15

  kafka-init:
    image: apache/kafka:3.7.0
    depends_on:
      kafka-1: { condition: service_healthy }
      kafka-2: { condition: service_healthy }
      kafka-3: { condition: service_healthy }
    networks: [logistics-net]
    entrypoint: ["/bin/bash", "-c"]
    command: >
      "set -e;
      until /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 --list > /dev/null 2>&1; do echo 'waiting for kafka brokers...'; sleep 2; done;
      /opt/kafka/bin/kafka-topics.sh --create --if-not-exists --topic order.status_changed --partitions 3 --replication-factor 3 --config min.insync.replicas=2 --bootstrap-server kafka-1:9092;
      echo 'order.status_changed created: 3 partitions, RF=3, min.insync.replicas=2';
      "
    restart: "no"

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports: ["8080:8080"]
    networks: [logistics-net]
    depends_on: [kafka-1, kafka-2, kafka-3]

volumes:
  pg-data:
```

**Fixed during Phase 0 execution — three real gaps this planning process didn't catch, only actually running it did:**
1. **Missing KRaft listener config.** All three brokers crash-looped on first run (`IllegalArgumentException: No security protocol defined for listener CONTROLLER`) — the plan never set `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP`, `KAFKA_CONTROLLER_LISTENER_NAMES`, or `KAFKA_INTER_BROKER_LISTENER_NAME`, all required for a custom `CONTROLLER` listener name to have an inferable protocol. Added to all three brokers above.
2. **`kafka-init`'s YAML folding bug.** The `command: >` folded scalar doesn't fold *more-indented* continuation lines the way the original multi-line command assumed — `kafka-topics.sh --create` actually ran as several broken invocations, failed with a missing `--bootstrap-server` argument, and **failed silently**: no `set -e` meant the script fell through to the trailing `echo` and exited 0 anyway. `docker compose ps` would have shown a clean exit for a container that did nothing — this is the same "artifact exists, nothing verifies it ran correctly" shape as the CI-gating bug found earlier, just at the compose layer. Fixed by collapsing the command to one line and adding `set -e` so a real failure now actually propagates.
3. **No healthchecks.** `depends_on` without a health condition only waits for "container started," not "ready to accept connections" — harmless for `kafka-init` (which has its own retry loop) but a real race risk for Phase 1+ app containers connecting directly via `kafkajs`/`aiokafka` with no such loop of their own. Healthchecks added above for `postgres`, `redis`, `rabbitmq`, and all three Kafka brokers; `kafka-init`'s `depends_on` now uses `condition: service_healthy` on the brokers instead of relying solely on its own polling loop. Phase 1's `docker-compose.dev.yml` (Section 22) should use `condition: service_healthy` (and `condition: service_completed_successfully` for `kafka-init` specifically, since it's meant to exit, not stay up) rather than the bare dependency list shown there currently.

**Verification actually performed for these three, not just "it started":** `kafka-topics.sh --describe` (confirmed 3 partitions, RF=3, min ISR=2, no under-replication), kafka-ui's cluster API (3 brokers online, 3 partitions), `psql \dn`/`\du`/`\ddp` (all 6 schemas, all 12 roles, default-privilege grants matching Section 13 exactly — e.g. `audit_app` showing read/insert only, no write/delete, confirming the append-only enforcement holds at the role level in practice, not just on paper).

**Fixed gap — `init.sql` was defined (Section 13) but never actually wired to run.** The `postgres` service previously had no mechanism to execute the schema/role/grant SQL at all — the official Postgres image only auto-runs files mounted into `/docker-entrypoint-initdb.d/`, and nothing mounted anything there. As written, none of the six schemas, twelve roles, or default-privilege rules would have been created, and every service's `DATABASE_URL`/`MIGRATION_DATABASE_URL` would fail to authenticate on `docker compose up` — the same "correct artifact, no wiring to the thing that runs it" bug found earlier for the contract-drift CI job, one layer further down the stack. The mount above fixes it, and **the actual file now exists** — schemas + the two-tier role/grant block, no `CREATE TABLE` statements (per Section 13's design, tables are delivered by each service's own migration, not by `init.sql`). Save it to `docs/init.sql` in the repo to match the mount path above.

**Caveat worth stating plainly:** `/docker-entrypoint-initdb.d/` scripts only run once, against a *fresh* data directory — if `pg-data` already has data in it from a prior run, editing `init.sql` later won't retroactively apply. During Phase 0 iteration, that means `docker compose down -v` (removing the volume) before re-testing any change to `init.sql`, not just `docker compose down`.

**What's still a genuine to-do, not something this plan can hand you finished:** `docs/init.sql` above is now a complete, ready-to-use artifact — but Alembic's own `alembic.ini`/`env.py` (needed to make `alembic upgrade head` read `MIGRATION_DATABASE_URL` from the environment rather than a hardcoded connection string) can't be meaningfully written until `apps/fraud-service/` actually exists as a scaffolded project in Phase 0 — there's no directory structure yet for `env.py` to live in or import against. Same logic applies to each NestJS service's `data-source.ts`/TypeORM config reading `DATABASE_URL` vs `MIGRATION_DATABASE_URL`. Correct to treat these as Phase 0 implementation tasks rather than plan artifacts, unlike `init.sql`, which had no such dependency and could be finished now.

**Fixed gap — topic partition count was previously unenforced.** Section 5.1 declares `order.status_changed` has 3 partitions keyed by `order_id`, but nothing before this revision actually created the topic with that configuration — Kafka's auto-create-on-first-publish behavior would have defaulted to **1 partition**, silently invalidating both the partitioning-by-`order_id` design and most of the "3-broker resilience demo" (a single-partition topic lives on whichever broker(s) host that one partition's replicas, not spread across the cluster). Two things now close this:
1. **`kafka-init`** — a one-shot container, waits for the brokers, then runs `kafka-topics.sh --create` explicitly for `order.status_changed` with `--partitions 3 --replication-factor 3`. Scopes the setting to this specific topic rather than changing a broker-wide default that would silently apply to any future topic too.
2. **`KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"`** on all three brokers — belt-and-suspenders: if `kafka-init` is ever skipped or fails, a publish to a non-existent topic now fails loudly instead of silently auto-creating one with the wrong partition count.

App services (`order-api`, `inventory-service`, `fraud-service`, etc.) get added to this same file with their own Dockerfiles as each is built out from Phase 1 onward, and should list `kafka-init` in their `depends_on` if they publish to Kafka — see Section 22's updated `docker-compose.dev.yml`.

---

## 9. Phased Build Plan

**Phase 0 — Scaffolding & contracts**
Monorepo skeleton, `packages/contracts`, Docker Compose for all infra (Postgres, Redis, RabbitMQ, 3-broker Kafka, kafka-ui).

**Phase 1 — Order API + state machine (no messaging yet)**
CRUD + state machine enforcement, unit tests on valid/invalid transitions.

**Phase 2 — RabbitMQ fan-out**
Order API publishes `reserve_stock`; Inventory Service reserves/replies; Notification Service consumes and logs. First real async milestone.

**Phase 3 — BullMQ scheduled/delayed logic**
Payment timeout, delivery reminder, invoice PDF generation. Optional: Bull Board for job visibility.

**Phase 4 — Kafka event stream + 3 consumers**
Order API publishes `order.status_changed` on every transition. Analytics Service (NestJS), Fraud Service (FastAPI), Audit Service (NestJS) each consume independently.

**Phase 5 — Frontend**
Next.js dashboard: place test orders, live status, analytics charts, fraud flags.

**Phase 6 — Polish for portfolio**
Architecture diagram, README with explicit "why RabbitMQ here / why Kafka there / why BullMQ here" rationale, CI (GitHub Actions) running unit tests, optional AWS deployment via Terraform.

---

## 10. Order API State Machine — Implementation Detail

```typescript
// order-state-machine.ts
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PICKING'],
  PICKING: ['PACKED'],
  PACKED: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrderStateMachine {
  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }
}
```

```typescript
// orders.service.ts
async transition(orderId: string, to: OrderStatus) {
  const order = await this.ordersRepo.findOneOrFail(orderId);

  if (!this.stateMachine.canTransition(order.status, to)) {
    throw new InvalidTransitionException(order.status, to);
  }

  const previousStatus = order.status;
  order.status = to;
  await this.ordersRepo.save(order);

  await this.kafkaProducer.publish('order.status_changed', {
    order_id: order.id,
    customer_id: order.customerId,
    previous_status: previousStatus,
    new_status: to,
    timestamp: new Date().toISOString(),
    delivery_address: order.deliveryAddress,
    order_value: order.totalValue,
    items: order.items,
    metadata: { branch_id: order.branchId },
  });

  return order;
}
```

**Known gap, resolved in Section 17 — this note previously said "Phase 6 stretch goal," which contradicted Section 17/20 and went uncaught until Phase 1 implementation surfaced it:** the DB save and Kafka publish above are two separate operations — a crash between them produces a status change with no event. The fix is the **transactional outbox pattern** in Section 17, generalized to cover the RabbitMQ `reserve_stock` publish too. **It belongs at the start of Phase 2**, not Phase 6 — Section 20's end-to-end trace has the outbox firing at order placement, which is a Phase 2 concern (RabbitMQ integration), not a later stretch goal. The plain `transition()` shown just above is correct *only* for Phase 1, where no messaging exists yet and there's nothing to write to an outbox — Phase 2 should replace it with the transactional version from Section 17, not layer the outbox on top later.

---

## 11. Resolved Decisions (formerly Open Items)

- [x] **Analytics Service language:** stays NestJS. Keeping only one deliberate polyglot service (Fraud) keeps the "why Python here" story honest rather than diluted across two services.
- [x] **NestJS module structure per service:** detailed in Section 8.1.
- [x] **Docker network/port map:** finalized in Section 8.2.
- [x] **Order API state machine implementation:** detailed in Section 10, including the deferred outbox-pattern gap.
- [x] **docker-compose full file:** finalized in Section 8.3 (infra layer only — app service containers added incrementally from Phase 1 onward).

## 13. Database Schema DDL

Design principle: **no foreign keys across schemas.** Even though `inventory.reservations.order_id` conceptually points to `order_api.orders`, no FK is created there — cross-schema FKs would silently couple two services' data models, defeating the "each service owns its own data" boundary. `order_id` is a plain UUID value carried in messages, not a referential link.

```sql
-- ============================================
-- order_api schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS order_api;

CREATE TABLE order_api.customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_api.orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES order_api.customers(id),
  trace_id          UUID NOT NULL DEFAULT gen_random_uuid(),
  status            VARCHAR(20) NOT NULL DEFAULT 'PLACED'
                     CHECK (status IN ('PLACED','PAYMENT_CONFIRMED','PICKING',
                                        'PACKED','SHIPPED','DELIVERED','CANCELLED')),
  delivery_address  TEXT NOT NULL,
  branch_id         VARCHAR(20) NOT NULL,
  total_value       NUMERIC(10,2) NOT NULL CHECK (total_value >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- trace_id added during Phase 2 implementation (missing from the original design):
-- it's generated once at placement and must be reused on every later transition's
-- event, which requires somewhere durable to read it back from — the order row
-- itself is the natural place. Originally omitted from this table entirely.

CREATE TABLE order_api.order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES order_api.orders(id) ON DELETE CASCADE,
  sku        VARCHAR(50) NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_orders_customer_id   ON order_api.orders(customer_id);
CREATE INDEX idx_orders_status        ON order_api.orders(status);
CREATE INDEX idx_order_items_order_id ON order_api.order_items(order_id);


-- ============================================
-- inventory schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE inventory.stock (
  sku            VARCHAR(50) PRIMARY KEY,
  available_qty  INTEGER NOT NULL CHECK (available_qty >= 0),
  reserved_qty   INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory.reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL,   -- no FK: order_api owns this id, referenced by value only
  sku         VARCHAR(50) NOT NULL REFERENCES inventory.stock(sku),
  qty         INTEGER NOT NULL CHECK (qty > 0),
  status      VARCHAR(20) NOT NULL DEFAULT 'RESERVED'
              CHECK (status IN ('RESERVED','COMMITTED','RELEASED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservations_order_id ON inventory.reservations(order_id);
CREATE INDEX idx_reservations_sku      ON inventory.reservations(sku);


-- ============================================
-- analytics schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE analytics.order_status_events (
  id               BIGSERIAL PRIMARY KEY,
  order_id         UUID NOT NULL,
  branch_id        VARCHAR(20) NOT NULL,
  previous_status  VARCHAR(20),
  new_status       VARCHAR(20) NOT NULL,
  order_value      NUMERIC(10,2) NOT NULL,
  event_timestamp  TIMESTAMPTZ NOT NULL,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_branch    ON analytics.order_status_events(branch_id);
CREATE INDEX idx_analytics_events_status    ON analytics.order_status_events(new_status);
CREATE INDEX idx_analytics_events_timestamp ON analytics.order_status_events(event_timestamp);


-- ============================================
-- audit schema (append-only — enforced via role grants below)
-- ============================================
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.order_status_log (
  id                BIGSERIAL PRIMARY KEY,
  order_id          UUID NOT NULL,
  customer_id       UUID NOT NULL,
  previous_status   VARCHAR(20),
  new_status        VARCHAR(20) NOT NULL,
  delivery_address  TEXT NOT NULL,
  order_value       NUMERIC(10,2) NOT NULL,
  items             JSONB NOT NULL,
  branch_id         VARCHAR(20) NOT NULL,
  event_timestamp   TIMESTAMPTZ NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_order_id ON audit.order_status_log(order_id);


-- ============================================
-- fraud schema
-- ============================================
CREATE SCHEMA IF NOT EXISTS fraud;

CREATE TABLE fraud.order_events (
  id                BIGSERIAL PRIMARY KEY,
  order_id          UUID NOT NULL,
  customer_id       UUID NOT NULL,
  delivery_address  TEXT NOT NULL,
  order_value       NUMERIC(10,2) NOT NULL,
  event_timestamp   TIMESTAMPTZ NOT NULL,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fraud.flagged_orders (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL,
  rule_name   VARCHAR(50) NOT NULL,
  reason      TEXT NOT NULL,
  severity    VARCHAR(10) NOT NULL CHECK (severity IN ('low','medium','high')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_events_customer   ON fraud.order_events(customer_id);
CREATE INDEX idx_fraud_events_address    ON fraud.order_events(delivery_address);
CREATE INDEX idx_fraud_events_timestamp  ON fraud.order_events(event_timestamp);
CREATE INDEX idx_flagged_orders_order_id ON fraud.flagged_orders(order_id);


-- ============================================
-- Scoped roles — two-tier model per service (least privilege)
-- ============================================
-- Design decision (resolves two prior findings at once):
-- 1. The runtime app role only ever had USAGE on its schema, never CREATE — so it could
--    never have run its own migrations, even though an earlier draft's convention said it would.
-- 2. Rather than granting CREATE to the runtime role (which lets a compromised/buggy
--    running service alter its own schema), each service gets a SEPARATE migrator role,
--    used only to run migrations, distinct from the role the running service connects as.
--    This is the same least-privilege instinct already applied to audit_app's missing
--    UPDATE/DELETE grant, and to the non-superuser role pattern used on Collabboard.
--
-- Pattern per service: <service>_migrator (USAGE + CREATE, runs migrations only) and
-- <service>_app (USAGE only, what the running service connects as day-to-day). Default
-- privileges are set FOR the migrator role, so any table THAT ROLE creates automatically
-- grants the stated DML to the app role — no manual re-grant needed, ever, for any future
-- table. This also means bootstrap never needs to know about specific tables (outbox,
-- notification_log, or anything added later) — it only needs to know schemas and roles.

CREATE ROLE order_api_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE order_api_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA order_api TO order_api_migrator;
GRANT USAGE ON SCHEMA order_api TO order_api_app;
ALTER DEFAULT PRIVILEGES FOR ROLE order_api_migrator IN SCHEMA order_api
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO order_api_app;
ALTER DEFAULT PRIVILEGES FOR ROLE order_api_migrator IN SCHEMA order_api
  GRANT USAGE, SELECT ON SEQUENCES TO order_api_app;
-- Sequence grant matters here specifically because order_api.outbox uses BIGSERIAL —
-- INSERT into a BIGSERIAL column calls nextval() on its backing sequence, which requires
-- USAGE on that sequence, not just table-level INSERT. Missing this is a separate, equally
-- silent failure mode from the CREATE-grant issue, caught while fixing the same class of bug.

CREATE ROLE inventory_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE inventory_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA inventory TO inventory_migrator;
GRANT USAGE ON SCHEMA inventory TO inventory_app;
ALTER DEFAULT PRIVILEGES FOR ROLE inventory_migrator IN SCHEMA inventory
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_app;
-- No sequence grant needed: inventory.stock and inventory.reservations both use
-- non-serial primary keys (sku VARCHAR, UUID respectively).

CREATE ROLE analytics_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE analytics_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA analytics TO analytics_migrator;
GRANT USAGE ON SCHEMA analytics TO analytics_app;
ALTER DEFAULT PRIVILEGES FOR ROLE analytics_migrator IN SCHEMA analytics
  GRANT SELECT, INSERT ON TABLES TO analytics_app;
ALTER DEFAULT PRIVILEGES FOR ROLE analytics_migrator IN SCHEMA analytics
  GRANT USAGE, SELECT ON SEQUENCES TO analytics_app;
-- order_status_events uses BIGSERIAL — same sequence-grant requirement as outbox above.

CREATE ROLE audit_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE audit_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA audit TO audit_migrator;
GRANT USAGE ON SCHEMA audit TO audit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE audit_migrator IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO audit_app;  -- no UPDATE/DELETE: enforces append-only at the DB level
ALTER DEFAULT PRIVILEGES FOR ROLE audit_migrator IN SCHEMA audit
  GRANT USAGE, SELECT ON SEQUENCES TO audit_app;
-- order_status_log uses BIGSERIAL — same sequence-grant requirement.

CREATE ROLE fraud_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE fraud_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA fraud TO fraud_migrator;
GRANT USAGE ON SCHEMA fraud TO fraud_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fraud_migrator IN SCHEMA fraud
  GRANT SELECT, INSERT ON TABLES TO fraud_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fraud_migrator IN SCHEMA fraud
  GRANT USAGE, SELECT ON SEQUENCES TO fraud_app;
-- Both order_events and flagged_orders use BIGSERIAL — same requirement, twice over.

CREATE ROLE notification_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE notification_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA notification TO notification_migrator;
GRANT USAGE ON SCHEMA notification TO notification_app;
ALTER DEFAULT PRIVILEGES FOR ROLE notification_migrator IN SCHEMA notification
  GRANT SELECT, INSERT, UPDATE ON TABLES TO notification_app;
-- UPDATE included (unlike audit's strictly append-only grant): notification_log.status
-- may need to flip SENT -> FAILED on a later retry outcome.
-- No sequence grant needed: notification_log uses a UUID primary key.
```

**Why no `GRANT ... ON ALL TABLES IN SCHEMA` statements anymore:** an earlier draft granted DML on *existing* tables directly, then separately tried to patch the "future tables" gap with default privileges bolted on afterward. Under this model there's no need for both — since every table in every schema is created via that service's own migration (run by its migrator role), the schema is empty at bootstrap time, so an "ON ALL TABLES" grant would apply to zero tables anyway. The default-privileges lines alone are sufficient and correct from day one.

**How migrations actually run, concretely:** each service gets two connection strings — `DATABASE_URL` (as `<service>_app`, what the running service uses day-to-day) and `MIGRATION_DATABASE_URL` (as `<service>_migrator`, used only when invoking the migration command, e.g. `npm run migration:run` for NestJS/TypeORM services, or `alembic upgrade head` for Fraud Service). Migrations are an explicit step, not something the app runs automatically on every boot — see the updated `docker-compose.dev.yml` in Section 22.

**Bootstrap `init.sql` scope, now genuinely simple:** `CREATE SCHEMA` (all six) + the role/grant block above. Nothing else. Every `CREATE TABLE` shown anywhere in this document (Section 13's example tables, `order_api.outbox` in Section 17, `notification.notification_log` in Section 21) is delivered by that service's own first migration once its code exists — not by hand-run DDL, and not by a document-order dependency. This removes the ordering problem structurally rather than by remembering to sequence things correctly.

**Notes:**
- `gen_random_uuid()` is built into Postgres core since v13 — no extension needed.
- Audit's append-only guarantee is enforced at the **role** level (`audit_app` has no `UPDATE`/`DELETE` grant), not just convention — a bug in Audit Service code still can't rewrite history.
- `analytics.order_status_events` stores raw events rather than pre-aggregated rollups, which is sufficient at this project's scale; a daily rollup table is a legitimate future stretch goal.
- The tables shown throughout Sections 13, 17, and 21 remain the authoritative schema *design* — they define what each service's migrations must produce, even though they're no longer literally executed as one big init script.

---

## 15. Bull Board — BullMQ Job Visibility

Mounted as a route inside Order API (the only service running BullMQ queues).

```bash
npm install @bull-board/api @bull-board/express
```

```typescript
// apps/order-api/src/jobs/bull-board.setup.ts
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';

export function setupBullBoard(queues: Queue[]) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  return serverAdapter;
}
```

```typescript
// apps/order-api/src/main.ts (excerpt)
const app = await NestFactory.create(AppModule);
const { paymentTimeoutQueue, deliveryReminderQueue, generateInvoiceQueue } =
  app.get(JobsService);

const bullBoardAdapter = setupBullBoard([
  paymentTimeoutQueue,
  deliveryReminderQueue,
  generateInvoiceQueue,
]);
app.use('/admin/queues', bullBoardAdapter.getRouter());
```

**Note:** `/admin/queues` has no auth on it in this dev setup — flagged as needing an auth guard (or to be disabled) before any production-adjacent use.

---

## 16. CI Pipeline (GitHub Actions)

Scope: lint → unit test → Docker build verification. No deploy target since AWS/Terraform is out of scope for now.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  test-node-services:
    strategy:
      matrix:
        service:
          - order-api
          - inventory-service
          - notification-service
          - analytics-service
          - audit-service
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: testpass }
        ports: ["5432:5432"]
        options: >-
          --health-cmd="pg_isready" --health-interval=5s --health-timeout=5s --health-retries=5
      redis:
        image: redis:7
        ports: ["6379:6379"]
      rabbitmq:
        image: rabbitmq:3.13-management
        ports: ["5672:5672"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build --workspace=packages/contracts
      - run: npm run lint --workspace=apps/${{ matrix.service }}
      - run: npm run test --workspace=apps/${{ matrix.service }}

  test-fraud-service:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/fraud-service
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r requirements.txt
      - run: pip install pytest pytest-asyncio pytest-mock
      - run: pytest

  build-docker-images:
    needs: [test-node-services, test-fraud-service, contract-drift-test]
    strategy:
      matrix:
        service:
          - order-api
          - inventory-service
          - notification-service
          - analytics-service
          - audit-service
          - fraud-service
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t logistics/${{ matrix.service }}:ci ./apps/${{ matrix.service }}
```

**Deliberate omission:** Kafka is absent from CI services — a 3-broker KRaft cluster is heavy to spin up per PR, and unit tests should mock the Kafka producer/consumer rather than depend on a live broker. A live-Kafka integration suite is a reasonable later stretch, run on a schedule (e.g. nightly) rather than every PR.

**Fixed gap:** `test-node-services` previously ran service tests without building `packages/contracts` first. Since every NestJS service imports types from that workspace package, a service's test could pass against a stale local build of `packages/contracts` sitting in `node_modules` rather than the current commit's version — the `npm run build --workspace=packages/contracts` step above closes that.

---

## 17. Transactional Outbox Pattern (generalized — covers RabbitMQ too)

**Revision note:** an earlier draft of this section only made the Kafka publish transactionally safe, leaving the RabbitMQ `reserve_stock` publish as a separate, unsafe dual-write. Caught during architecture review (Section 20) and fixed here — the outbox now carries a `channel` column so one mechanism protects both.

**Schema addition to `order_api`:**
```sql
CREATE TABLE order_api.outbox (
  id             BIGSERIAL PRIMARY KEY,
  channel        VARCHAR(20) NOT NULL CHECK (channel IN ('kafka', 'rabbitmq')),
  routing_key    VARCHAR(100) NOT NULL,   -- kafka topic name, or rabbitmq routing key
  aggregate_type VARCHAR(50) NOT NULL DEFAULT 'order',
  aggregate_id   UUID NOT NULL,
  event_type     VARCHAR(50) NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unpublished ON order_api.outbox(created_at) WHERE published_at IS NULL;
```

**Write path — status update + both outbox rows in one DB transaction (example: order placement, which fires both a Kafka event and a RabbitMQ reserve request):**
```typescript
// orders.service.ts
async placeOrder(dto: CreateOrderDto) {
  return this.dataSource.transaction(async (manager) => {
    const traceId = randomUUID();
    const order = manager.create(Order, { ...dto, status: 'PLACED' });
    await manager.save(order);

    await manager.insert(OutboxEntry, {
      channel: 'kafka',
      routingKey: 'order.status_changed',
      aggregateId: order.id,
      eventType: 'order.status_changed',
      payload: buildStatusChangedPayload(order, null, 'PLACED', traceId),
    });

    await manager.insert(OutboxEntry, {
      channel: 'rabbitmq',
      routingKey: 'reserve_stock',
      aggregateId: order.id,
      eventType: 'order.reserve_stock',
      payload: { trace_id: traceId, order_id: order.id, items: order.items },
    });

    return order;
  });
}
```

**Poller — one mechanism, branches on channel. Reentrancy guard added after Phase 2 implementation found `@Interval` overlapping ticks on a slow publish call (a hung Kafka connection made one tick take ~20s; overlapping ticks each re-published the same still-unpublished row — 47 duplicates from one order in practice). This was a gap in this reference snippet itself, not an implementation mistake:**
```typescript
// jobs/outbox-poller.service.ts
@Injectable()
export class OutboxPollerService {
  private isPolling = false;

  constructor(
    private dataSource: DataSource,
    private kafkaProducer: KafkaProducerService,
    private rabbitProducer: RabbitMQProducerService,
  ) {}

  @Interval(1000) // poll every second
  async pollAndPublish() {
    if (this.isPolling) return; // previous tick still running — skip, don't overlap
    this.isPolling = true;
    try {
      const entries = await this.dataSource
        .getRepository(OutboxEntry)
        .find({ where: { publishedAt: IsNull() }, order: { createdAt: 'ASC' }, take: 50 });

      for (const entry of entries) {
        try {
          if (entry.channel === 'kafka') {
            await this.kafkaProducer.publish(entry.routingKey, entry.payload);
          } else {
            await this.rabbitProducer.publish(entry.routingKey, entry.payload);
          }
          entry.publishedAt = new Date();
          await this.dataSource.getRepository(OutboxEntry).save(entry);
        } catch (err) {
          // leave unpublished — retried on next poll
          this.logger.error(`Failed to publish outbox entry ${entry.id}`, err);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }
```
**Known remaining limitation, not redesigned here:** entries within one tick are still processed in a single sequential `for` loop, so a slow/hung channel still delays the other channel's delivery within that tick — it just no longer duplicates across ticks. A self-scheduling loop (re-queue via `setTimeout` only after the previous run fully completes, rather than a fixed-interval + guard) would remove even that, but that's a larger redesign than this fix warrants right now.
}
```

**Documented tradeoff, not an oversight:** this gives **at-least-once** delivery, not exactly-once, on both channels. A crash between publishing and marking `published_at` republishes that message on the next poll. Every consumer (Analytics, Fraud, Audit, Inventory) must therefore be **idempotent** — see Section 19.

**Concurrency — flagged during Phase 1, addressed here since this is the natural point to fix it.** Phase 1's plain `transition()` does read-then-write with no row locking or optimistic-concurrency column — two concurrent requests moving the same order forward (e.g. a duplicate payment-confirmation webhook retry racing the original) could silently clobber each other. Since Phase 2 already wraps `transition()`/`placeOrder()` in a DB transaction for the outbox insert, add `SELECT ... FOR UPDATE` (row lock) on the order row within that same transaction — no separate mechanism needed, it rides along with the refactor that's happening anyway:
```typescript
const order = await manager.findOneOrFail(Order, {
  where: { id: orderId },
  lock: { mode: 'pessimistic_write' },  // SELECT ... FOR UPDATE
});
```

---

## 18. CI Pipeline

*(unchanged from prior draft — see Section 16 above)*

---

## 19. Idempotency, Ordering, and Schema Evolution (new — closes gaps found in architecture review)

### 19.1 Idempotency — concrete mechanism, not just a stated requirement

Every Kafka consumer dedupes on `(order_id, new_status)` — safe because the state machine only moves forward, so this pair is naturally unique per legitimate event:

```sql
ALTER TABLE audit.order_status_log ADD CONSTRAINT uq_audit_order_status UNIQUE (order_id, new_status);
ALTER TABLE analytics.order_status_events ADD CONSTRAINT uq_analytics_order_status UNIQUE (order_id, new_status);
ALTER TABLE fraud.order_events ADD CONSTRAINT uq_fraud_order_status UNIQUE (order_id, new_status);
```

```typescript
// consumer insert pattern, all three services
await repo.insert(entity).onConflict(['order_id', 'new_status']).ignore();
```

Inventory Service's commit/release handlers check the reservation's current status before acting rather than relying on a DB constraint — e.g. a duplicate `PAYMENT_CONFIRMED` event is a no-op if the reservation is already `COMMITTED`:

```typescript
async commitReservation(orderId: string) {
  const reservation = await this.repo.findOneOrFail({ where: { orderId } });
  if (reservation.status === 'COMMITTED') return; // already handled, safe no-op
  if (reservation.status !== 'RESERVED') {
    // reservation not yet created — see 19.2, requeue rather than error
    throw new RetryableError('Reservation not found yet');
  }
  reservation.status = 'COMMITTED';
  await this.repo.save(reservation);
}
```

### 19.2 Ordering — the one real race condition found, and its fix

Kafka is safe (partitioned by `order_id`, so per-order ordering holds within a partition). The risk is Inventory Service's Kafka-triggered commit/release racing against its own still-in-progress RabbitMQ-triggered reserve, if a cancellation fires unusually fast. Fix: if a commit/release event arrives before a matching `RESERVED` row exists, treat it as **transient, not an error** — requeue with a short backoff (a few hundred ms, a handful of retries) rather than failing the message outright. This is the `RetryableError` path shown above.

### 19.3 Schema evolution — versioning rule

- **Additive changes** (new optional field) — no version bump, consumers ignore unknown/absent fields.
- **Breaking changes** (renamed/removed/retyped field) — bump `schema_version` in the payload (already added to the contract in Section 5.1); consumers branch on `schema_version` to handle old and new shapes during a transition window. A major breaking change to a Kafka topic's meaning (not just shape) would instead get a new topic name (`order.status_changed.v2`) so old consumers aren't silently fed data they can't parse.
- **Contract drift test (NestJS ↔ FastAPI) — implemented:** a single canonical JSON fixture, shared by both languages, is validated against a `zod` schema (TypeScript) and the Pydantic model (Python) in CI. If either side accepts a payload the other rejects — or vice versa — the drift test fails, catching exactly the kind of silent mismatch (e.g. Pydantic missing a numeric constraint that Postgres/zod already enforce) that hand-maintained mirrors are prone to.

**Fixtures (single source of truth, one file used by both languages):**
```json
// packages/contracts/fixtures/order-status-changed.valid.json
{
  "schema_version": 1,
  "trace_id": "trc_9f8e7d6c-1234-4a5b-8c9d-abcdef123456",
  "order_id": "ord_123",
  "customer_id": "cust_456",
  "previous_status": "PICKING",
  "new_status": "PACKED",
  "timestamp": "2026-07-09T10:15:00Z",
  "delivery_address": "123 Main St, Dagupan",
  "order_value": 1450.00,
  "items": [{ "sku": "SKU001", "qty": 2, "unit_price": 725.00 }],
  "metadata": { "branch_id": "branch_02" }
}
```

```json
// packages/contracts/fixtures/order-status-changed.invalid.json
{
  "schema_version": 1,
  "trace_id": "trc_bad",
  "order_id": "ord_999",
  "customer_id": "cust_999",
  "previous_status": "SHIPPED",
  "new_status": "TELEPORTED",
  "timestamp": "2026-07-09T10:15:00Z",
  "delivery_address": "Nowhere",
  "order_value": -50,
  "items": [],
  "metadata": { "branch_id": "branch_02" }
}
```
The invalid fixture deliberately has two violations at once (`"TELEPORTED"` isn't a valid status, `order_value` is negative) — both schemas must reject it, proving the constraints actually match, not just that both sides parse well-formed input.

**Zod schema (`packages/contracts/src/schemas/order-status-changed.schema.ts`) — validates the wire format directly (snake_case), since that's what actually crosses the boundary, not the camelCase in-app TypeScript interface:**
```typescript
import { z } from 'zod';

export const OrderStatusEnum = z.enum([
  'PLACED', 'PAYMENT_CONFIRMED', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED',
]);

export const OrderItemSchema = z.object({
  sku: z.string(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
});

export const OrderMetadataSchema = z.object({
  branch_id: z.string(),
});

export const OrderStatusChangedEventSchema = z.object({
  schema_version: z.number().int(),
  trace_id: z.string(),
  order_id: z.string(),
  customer_id: z.string(),
  previous_status: OrderStatusEnum.nullable(),
  new_status: OrderStatusEnum,
  timestamp: z.string(),
  delivery_address: z.string(),
  order_value: z.number().nonnegative(),
  items: z.array(OrderItemSchema),
  metadata: OrderMetadataSchema,
});
```

**TypeScript test:**
```typescript
// packages/contracts/tests/order-status-changed.contract.test.ts
import { readFileSync } from 'fs';
import path from 'path';
import { OrderStatusChangedEventSchema } from '../src/schemas/order-status-changed.schema';

const fixturesDir = path.join(__dirname, '../fixtures');

describe('order.status_changed contract', () => {
  it('accepts the canonical valid payload', () => {
    const payload = JSON.parse(readFileSync(path.join(fixturesDir, 'order-status-changed.valid.json'), 'utf-8'));
    expect(() => OrderStatusChangedEventSchema.parse(payload)).not.toThrow();
  });

  it('rejects the canonical invalid payload', () => {
    const payload = JSON.parse(readFileSync(path.join(fixturesDir, 'order-status-changed.invalid.json'), 'utf-8'));
    expect(() => OrderStatusChangedEventSchema.parse(payload)).toThrow();
  });
});
```

**Python test:**
```python
# apps/fraud-service/tests/test_contract_order_status_changed.py
import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from app.models.events import OrderStatusChangedEvent

FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "packages" / "contracts" / "fixtures"

def load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name) as f:
        return json.load(f)

def test_accepts_canonical_valid_payload():
    payload = load_fixture("order-status-changed.valid.json")
    OrderStatusChangedEvent(**payload)  # should not raise

def test_rejects_canonical_invalid_payload():
    payload = load_fixture("order-status-changed.invalid.json")
    with pytest.raises(ValidationError):
        OrderStatusChangedEvent(**payload)
```

**CI job addition (extends the pipeline in Section 16/18):**
```yaml
  contract-drift-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test --workspace=packages/contracts

      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r apps/fraud-service/requirements.txt pytest
      - run: pytest apps/fraud-service/tests/test_contract_order_status_changed.py
```

**Fixed — this was previously only narrated, not actually applied.** An earlier revision stated the intent ("add this job to the `needs:` list...") without the YAML in Section 16 actually reflecting it, so `contract-drift-test` ran in CI but couldn't block a merge — a failure would show up as a separate red X rather than gating `build-docker-images`. Section 16's `needs:` list now reads `[test-node-services, test-fraud-service, contract-drift-test]`, closing the gap for real rather than in prose only.

**Scope note:** this covers `order.status_changed` only — the one contract that actually crosses the NestJS/FastAPI language boundary (Fraud Service). The RabbitMQ contracts (`reserve_stock`, `notify`) stay NestJS-to-NestJS, so there's no cross-language drift risk there to test for.

---

## 20. End-to-End Order Trace (post-fix)

Walking one order through the corrected design, to confirm every hop is now accounted for:

1. **Place order** — Order API, in one DB transaction: creates `orders` row (`PLACED`) + two outbox rows (Kafka `order.status_changed`, RabbitMQ `reserve_stock`), both carrying the same `trace_id`. Both are now outbox-protected — no more dual-write gap on the RabbitMQ side.
2. **Outbox poller** picks up both rows, publishes to Kafka and RabbitMQ respectively, marks each `published_at`.
3. **Inventory Service** consumes `reserve_stock`: sufficient stock → creates `reservation` row (`RESERVED`), publishes `StockReservationResult(RESERVED)` to the reply queue. Insufficient → publishes `StockReservationResult(INSUFFICIENT_STOCK)`.
4. **Order API** consumes the reply queue: `RESERVED` → order stays `PLACED`, waiting on payment. `INSUFFICIENT_STOCK` → order transitions straight to `CANCELLED` (valid per state machine; nothing to release since nothing was reserved).
5. **Payment confirmation** — simulated via a direct endpoint (`POST /orders/:id/confirm-payment`) standing in for a real payment webhook; explicitly out of scope to integrate a real payment gateway.
6. **Order API** transitions to `PAYMENT_CONFIRMED` → outbox row → Kafka event. Four independent consumer groups receive it: Analytics (aggregate), Audit (log), **Inventory (commit reservation — the previously-missing link, now wired via Section 5.2's registry)**, and Fraud (consumes and advances its offset, but no-ops — `PAYMENT_CONFIRMED` isn't in `RELEVANT_STATUSES`, since velocity/value rules only evaluate at placement, per Section 6).
7. **BullMQ** `payment-timeout` job (enqueued at step 1) sees the order is no longer `PLACED` and no-ops harmlessly.
8. Order proceeds `PICKING → PACKED → SHIPPED → DELIVERED`, each a Kafka event, each consumed idempotently by Analytics/Audit/Inventory (Inventory no-ops on these too, since commit/release only react to `PAYMENT_CONFIRMED`/`CANCELLED`) and skipped by Fraud.
9. **Cancellation path** (payment timeout instead): BullMQ job fires after 15 min, order still `PLACED` → transitions to `CANCELLED` → Kafka event → Inventory Service releases the reservation (`RELEASED`), Notification Service (via a corresponding `order.notify` message) informs the customer.

Every hop in this trace now has a defined handler and an idempotency/ordering answer — this is the version I'd call defensible.

---

## 21. Notification Service Persistence (new — closes "queue as pseudo-database" gap)

Notification Service previously had no durable record of what it sent. Adding a minimal log:

```sql
CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE notification.notification_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL,
  customer_id  UUID NOT NULL,
  type         VARCHAR(30) NOT NULL,
  channel      VARCHAR(10) NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  status       VARCHAR(20) NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','FAILED')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_log_order_id ON notification.notification_log(order_id);
```

Answers "was this customer notified?" after the fact — previously undefined.

---

## 22. Local Dev — docker-compose.dev.yml (app services, dev-mode)

All services run in Docker for local dev, dev-tuned (bind-mounted source for hot reload, not a production-hardened build). Extends the infra compose file from Section 8.3:

```yaml
# docker-compose.dev.yml
# NOTE — corrected during Phase 2, this block previously didn't match reality:
# build.context was ./apps/<service> per service, which can't see @logistics/contracts
# (a workspace sibling) — Docker can't COPY from outside its build context. The actual
# fix, verified working in Phase 2: context is the repo root (one level up from this
# file, in infra/), dockerfile path is relative to that root, and volumes mount the
# individual source directories into /repo/apps/<service> and /repo/packages/contracts
# — not /app, which was never a real path once Dockerfile.dev switched to WORKDIR /repo.
# Confirmed in Phase 2: npm install runs once at /repo before either package's source
# is copied in, so the npm workspace symlink (/repo/node_modules/@logistics/contracts)
# is real, not accidental — verified via require.resolve() inside the running container.
services:
  order-api:
    build: { context: .., dockerfile: apps/order-api/Dockerfile.dev }
    volumes:
      - ../apps/order-api:/repo/apps/order-api
      - ../packages/contracts:/repo/packages/contracts
    environment:
      DATABASE_URL: postgres://order_api_app:change_me@postgres:5432/postgres
      MIGRATION_DATABASE_URL: postgres://order_api_migrator:change_me@postgres:5432/postgres
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://rabbitmq:5672
      KAFKA_BROKERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports: ["3000:3000"]
    networks: [logistics-net]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
      kafka-1: { condition: service_healthy }
      kafka-2: { condition: service_healthy }
      kafka-3: { condition: service_healthy }
      kafka-init: { condition: service_completed_successfully }

  inventory-service:
    build: { context: .., dockerfile: apps/inventory-service/Dockerfile.dev }
    volumes:
      - ../apps/inventory-service:/repo/apps/inventory-service
      - ../packages/contracts:/repo/packages/contracts
    environment:
      DATABASE_URL: postgres://inventory_app:change_me@postgres:5432/postgres
      MIGRATION_DATABASE_URL: postgres://inventory_migrator:change_me@postgres:5432/postgres
      RABBITMQ_URL: amqp://rabbitmq:5672
      KAFKA_BROKERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports: ["3001:3000"]
    networks: [logistics-net]
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }
      kafka-1: { condition: service_healthy }
      kafka-2: { condition: service_healthy }
      kafka-3: { condition: service_healthy }
      kafka-init: { condition: service_completed_successfully }

  notification-service:
    build: { context: .., dockerfile: apps/notification-service/Dockerfile.dev }
    volumes:
      - ../apps/notification-service:/repo/apps/notification-service
      - ../packages/contracts:/repo/packages/contracts
    environment:
      DATABASE_URL: postgres://notification_app:change_me@postgres:5432/postgres
      MIGRATION_DATABASE_URL: postgres://notification_migrator:change_me@postgres:5432/postgres
      RABBITMQ_URL: amqp://rabbitmq:5672
    ports: ["3002:3000"]
    networks: [logistics-net]
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_healthy }

  analytics-service:
    build: { context: .., dockerfile: apps/analytics-service/Dockerfile.dev }
    volumes:
      - ../apps/analytics-service:/repo/apps/analytics-service
      - ../packages/contracts:/repo/packages/contracts
    environment:
      DATABASE_URL: postgres://analytics_app:change_me@postgres:5432/postgres
      MIGRATION_DATABASE_URL: postgres://analytics_migrator:change_me@postgres:5432/postgres
      KAFKA_BROKERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports: ["3003:3000"]
    networks: [logistics-net]
    depends_on:
      postgres: { condition: service_healthy }
      kafka-1: { condition: service_healthy }
      kafka-2: { condition: service_healthy }
      kafka-3: { condition: service_healthy }
      kafka-init: { condition: service_completed_successfully }

  audit-service:
    build: { context: .., dockerfile: apps/audit-service/Dockerfile.dev }
    volumes:
      - ../apps/audit-service:/repo/apps/audit-service
      - ../packages/contracts:/repo/packages/contracts
    environment:
      DATABASE_URL: postgres://audit_app:change_me@postgres:5432/postgres
      MIGRATION_DATABASE_URL: postgres://audit_migrator:change_me@postgres:5432/postgres
      KAFKA_BROKERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports: ["3004:3000"]
    networks: [logistics-net]
    depends_on:
      postgres: { condition: service_healthy }
      kafka-1: { condition: service_healthy }
      kafka-2: { condition: service_healthy }
      kafka-3: { condition: service_healthy }
      kafka-init: { condition: service_completed_successfully }

  fraud-service:
    # Python — no npm workspace dependency, so the repo-root context requirement
    # above doesn't apply here; this one's context is genuinely fine as its own dir.
    build: { context: ./apps/fraud-service, dockerfile: Dockerfile.dev }
    volumes: ["./apps/fraud-service:/app"]
    environment:
      DATABASE_URL: postgresql+asyncpg://fraud_app:change_me@postgres:5432/postgres
      MIGRATION_DATABASE_URL: postgresql+psycopg2://fraud_migrator:change_me@postgres:5432/postgres
      KAFKA_BROKERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
    ports: ["8005:8000"]
    networks: [logistics-net]
    depends_on:
      postgres: { condition: service_healthy }
      kafka-1: { condition: service_healthy }
      kafka-2: { condition: service_healthy }
      kafka-3: { condition: service_healthy }
      kafka-init: { condition: service_completed_successfully }

  web:
    build: { context: .., dockerfile: apps/web/Dockerfile.dev }
    volumes:
      - ../apps/web:/repo/apps/web
      - ../packages/contracts:/repo/packages/contracts
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
    ports: ["3100:3000"]
    networks: [logistics-net]
    depends_on: [order-api]
```

Run with:
```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up
```

**Migrations are a separate, explicit step — not run automatically on container start** (running schema-altering migrations silently on every boot is its own hazard, especially with a broker/consumer system where you want to control exactly when a schema change lands). After bringing the stack up, each service's migrations run once, using `MIGRATION_DATABASE_URL`:
```bash
docker compose exec order-api npm run migration:run       # TypeORM, uses order_api_migrator
docker compose exec inventory-service npm run migration:run
docker compose exec notification-service npm run migration:run
docker compose exec analytics-service npm run migration:run
docker compose exec audit-service npm run migration:run
docker compose exec fraud-service alembic upgrade head      # Alembic, uses fraud_migrator
```

A production-hardened compose (or a real deployment target, if that's revisited later) is explicitly a separate, later concern — not needed for Phase 0–5.

---

## 23. Scale Statement

This project's primary goal is **correctness at demo scale**, not production load-bearing. The topology already leaves headroom without extra effort (3 Kafka partitions, replication factor 3), so a light load test (k6, simulating a burst of order placements) is a legitimate **optional Phase 6 stretch goal** — worth doing if time permits, not a requirement for the project to be considered complete.

---

## 24. Remaining Open Items

- [ ] Whether to deploy to AWS via Terraform as a final stretch goal, or keep this project local-only (explicitly deferred, not decided)