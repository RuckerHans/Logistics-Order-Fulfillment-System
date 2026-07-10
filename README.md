# Logistics Order Fulfillment System

A polyglot microservices demo built to close one specific gap: hands-on,
production-shaped experience with the three message-queue technologies that
show up constantly in backend interviews — Kafka, RabbitMQ, and BullMQ — all
wired into one coherent domain (order fulfillment) instead of three
disconnected toy demos.

Full design reference: [docs/project-plan.md](docs/project-plan.md).

## Stack

| Service | Framework | Role |
|---|---|---|
| `order-api` | NestJS + TypeORM | Order state machine, outbox, BullMQ jobs |
| `inventory-service` | NestJS + TypeORM | Stock reservation (RabbitMQ), commit/release (Kafka) |
| `notification-service` | NestJS + TypeORM | Customer notifications (RabbitMQ) |
| `analytics-service` | NestJS + TypeORM | Order metrics (Kafka) |
| `audit-service` | NestJS + TypeORM | Append-only compliance log (Kafka) |
| `fraud-service` | FastAPI + SQLAlchemy/Alembic | Rule-based fraud flags (Kafka, Python — deliberately polyglot) |
| `web` | Next.js (App Router) | Order placement + ops dashboards |

Postgres (schema-per-service), Redis (BullMQ), a RabbitMQ-management image,
and a 3-broker Kafka KRaft cluster round out the infra.

---

## Prerequisites

- Docker Desktop (with Compose v2 — `docker compose`, not the standalone
  `docker-compose` binary)
- Node.js 20+ and npm 10+ (for running things outside Docker, e.g. `npm run
  migration:generate` locally)
- ~4GB of free RAM available to Docker — the full stack is 8 app containers
  plus Postgres, Redis, RabbitMQ, 3 Kafka brokers, Kafka UI, and kafka-init
- **If you're on Windows:** use WSL2, and clone/run the repo from inside the
  WSL2 filesystem (`\\wsl$\...` or a native `/home/...` path), not from
  `/mnt/c/...` — cross-filesystem bind mounts are dramatically slower and
  more prone to the file-watcher issues in [Troubleshooting](#troubleshooting)
  below.

---

## Quickstart

```bash
# 1. Install root + workspace dependencies
npm install

# 2. Bring up everything — infra and all app services — from scratch
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build

# 3. Wait for every container to report healthy
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml ps
```

`postgres`, `redis`, `rabbitmq`, and all three `kafka-*` brokers have real
healthchecks — every app service's `depends_on` waits on those, and on
`kafka-init` having *completed* (it's a one-shot job that creates the
`order.status_changed` topic with the right partition/replication config,
then exits — `Exited (0)` is its correct, healthy end state, not a failure).

```bash
# 4. Run migrations (first time only, or after any docker compose down -v)
for svc in order-api inventory-service notification-service analytics-service audit-service; do
  docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec $svc npm run migration:run
done
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec fraud-service alembic upgrade head

# 5. Seed minimal test data (a customer + stock for two SKUs)
docker compose -f infra/docker-compose.yml exec -T postgres \
  psql -U postgres -d postgres < scripts/seed.sql
```

**6. Place a test order and watch it flow through the whole system:**

Open http://localhost:3100/orders/new and submit:
- Customer ID: `11111111-1111-4111-8111-111111111111` (from the seed script)
- Delivery address / branch: anything
- SKU: `SKU001`, qty: `1`, unit price: `100`

You should land on the new order's detail page showing status `PLACED`.
Within a few seconds (RabbitMQ round-trip), it should be reachable — refresh
or enable auto-refresh — while its outbox events, reservation, and
notification are all real, independently checkable rows:

```bash
ORDER_ID=<paste the order ID from the URL>

docker compose -f infra/docker-compose.yml exec postgres psql -U postgres -d postgres -c "
SELECT status FROM order_api.orders WHERE id = '$ORDER_ID';
SELECT channel, routing_key, published_at IS NOT NULL AS published FROM order_api.outbox WHERE aggregate_id = '$ORDER_ID';
SELECT sku, status FROM inventory.reservations WHERE order_id = '$ORDER_ID';
SELECT type, channel, status FROM notification.notification_log WHERE order_id = '$ORDER_ID';
"
```

Then try `PATCH http://localhost:3000/orders/$ORDER_ID/transition` with
`{"newStatus":"PAYMENT_CONFIRMED"}` (or use the button on the order detail
page) and watch `analytics.order_status_events` and `audit.order_status_log`
each pick up a new row, and `fraud.order_events`/`fraud.flagged_orders`
correctly *not* grow (Fraud Service only evaluates rules at `PLACED`).

| Endpoint | URL |
|---|---|
| Web UI | http://localhost:3100 |
| Order API | http://localhost:3000 |
| Analytics API | http://localhost:3003 |
| Fraud API | http://localhost:8005 |
| Kafka UI | http://localhost:8080 |
| RabbitMQ management | http://localhost:15672 (guest/guest) |
| Bull Board | http://localhost:3000/admin/queues |

---

## Directory structure

```
apps/
  order-api/            # NestJS — state machine, outbox, BullMQ jobs, reply-queue consumer
  inventory-service/    # NestJS — RabbitMQ reserve/release, Kafka commit/release consumer
  notification-service/ # NestJS — RabbitMQ notify consumer
  analytics-service/    # NestJS — Kafka consumer + read API
  audit-service/        # NestJS — Kafka consumer, append-only log
  fraud-service/        # FastAPI — Kafka consumer, rule engine, read API
  web/                  # Next.js — dashboard (Server Components + Route Handler proxies)
packages/
  contracts/            # Shared TS types, zod schemas, contract-drift fixtures
infra/
  docker-compose.yml       # Infra only: postgres, redis, rabbitmq, kafka x3, kafka-ui, kafka-init
  docker-compose.dev.yml   # App services, extends the above
docs/
  project-plan.md              # Full design reference — read this for the "why" behind everything
  phase-prompts-and-checklists.md  # Build-phase prompts/checklists used during development
  init.sql                     # Bootstrap: schemas + two-tier roles/grants only, no tables
scripts/
  seed.sql               # Minimal test data for local dev
```

---

## Running migrations

Every service has two Postgres roles: `<service>_migrator` (can `CREATE
TABLE`, used only for migrations) and `<service>_app` (day-to-day runtime
connection, cannot alter schema). Migrations are never run automatically on
service boot — always an explicit step:

```bash
# Any single NestJS service
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec order-api npm run migration:run

# Generate a new migration after changing a TypeORM entity (run locally, not in the container)
cd apps/order-api && npm run migration:generate -- src/database/migrations/DescriptiveName

# Fraud Service (Alembic)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec fraud-service alembic upgrade head
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec fraud-service alembic revision --autogenerate -m "description"
```

A full `docker compose down -v` wipes both the Postgres volume and every
RabbitMQ/Kafka queue and topic — re-run the migration and seed steps above
after one.

---

## Common commands

```bash
# Logs for one service, following
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml logs -f order-api

# Rebuild + restart just one service after a code change (most services also
# hot-reload via the bind mount — this is for when that's not enough)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build order-api

# Run one service's tests locally (outside Docker)
cd apps/order-api && npm test

# Run the whole test suite across every workspace
npm test --workspaces --if-present

# Full teardown, including volumes (Postgres data + all queues/topics)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down -v
```

---

## Troubleshooting

**`fraud-service` (or any service using `--reload`/`--watch`) crashes with
"Cannot allocate memory" once everything is running together.** This is a
shared-inotify-watch-budget exhaustion inside Docker Desktop's WSL2 VM once
6+ file watchers (5 NestJS `--watch` processes, Next.js's dev server, and
Alembic's own watcher) are all running concurrently. `fraud-service`'s
`docker-compose.dev.yml` entry already sets `WATCHFILES_FORCE_POLLING=true`
to work around it — if you hit an equivalent crash on another service, the
same fix (force polling instead of inotify) applies.

**`curl http://localhost:PORT` hangs indefinitely, but the service is
clearly running.** A known IPv6 loopback port-forwarding quirk in Docker
Desktop/WSL2 — `curl` resolves `localhost` to `::1` first and hangs. Use
`http://127.0.0.1:PORT` explicitly instead.

**A freshly placed test order immediately shows `CANCELLED`.** This means
`inventory.stock` has no row (or zero `available_qty`) for the SKU you
used — the reservation genuinely failed as `INSUFFICIENT_STOCK` and Order
API correctly auto-cancelled it. Run `scripts/seed.sql` (or insert stock for
your SKU directly) before testing.

**Editing a change in `packages/contracts` doesn't seem to take effect
inside a running container.** The contracts package is consumed via its
compiled `dist/` output, not its TypeScript source — a bind mount makes the
source visible inside the container, but nothing recompiles it
automatically. Run `npm run build --workspace=@logistics/contracts` on the
host, then `docker compose restart <affected-service>` (a restart is enough;
a full `docker compose build` is only needed if you changed a *dependency*
of the contracts package, not its own source).

---

## Why three different queues, not one

Each broker is used for the kind of work it's actually good at — this is the
core architectural idea of the whole project, not an incidental choice:

- **RabbitMQ — task distribution.** `reserve_stock` and `notify` are
  one-shot commands with exactly one intended handler and a natural
  request/reply shape (Inventory Service replies to Order API's own reply
  queue with a reservation result). Each queue gets an explicit 3-stage TTL
  retry topology (1s / 5s / 15s) plus a terminal DLQ, and the *consumer*
  decides the next retry stage by inspecting delivery headers
  (`getNextRetryTarget`) rather than relying on a passive nack → DLX bounce.
  That was a deliberate choice made after finding, live, that a bare
  `channel.nack(msg, false, true)` on a persistently-failing message just
  busy-loops with no backoff at all — there's no delay from a same-queue
  requeue.

- **Kafka — durable, replayable event log.** `order.status_changed` has
  four independent consumers (`analytics-service`, `fraud-service`,
  `audit-service`, `inventory-service`) that each need their own full,
  ordered view of every status change, replayable from any offset. That's a
  fan-out shape RabbitMQ queues don't give you for free — a queue drains
  once, a Kafka partition can be re-read by any number of independent
  consumer groups. Producers use `acks=all`; the topic runs replication
  factor 3 with `min.insync.replicas=2`.

- **BullMQ — internal scheduled/delayed jobs.** `payment-timeout`,
  `delivery-reminder`, and `generate-invoice-pdf` are Order API's own
  internal deferred work, not cross-service communication — there's no
  reason to pay Kafka's or RabbitMQ's operational weight for a job that
  fires once, 15 minutes from now, and is only ever consumed by the same
  service that scheduled it. Redis-backed BullMQ with the Bull Board admin
  UI is the right-sized tool here.

Every message and job payload carries a `trace_id`, generated once at order
placement and propagated through every hop — Kafka events, RabbitMQ
messages, and BullMQ job payloads alike — so a single order's path through
the whole system is greppable end to end.

## Reliability patterns

**Transactional outbox.** Order API never publishes to Kafka or RabbitMQ
directly inside a request handler. Every state-changing operation writes a
row to `order_api.outbox` (with a `channel` column distinguishing
`kafka`/`rabbitmq`) in the *same* database transaction as the domain write,
and a separate `OutboxPollerService` ticks every second, picks up
unpublished rows, and publishes them. This is what makes "the DB write
succeeded but the event never went out" structurally impossible — the event
either commits with the order or the whole transaction rolls back. The
poller has an `isPolling` reentrancy guard, added after finding, live, that
a single slow Kafka publish (~20s) let ticks pile up concurrently and each
one independently re-published the same still-unpublished row — 47 duplicate
publishes from one order. Every consumer is expected to be idempotent on top
of this anyway (`UNIQUE(order_id, new_status)` with `ON CONFLICT DO NOTHING`
on the Kafka side), because outbox delivery is at-least-once by design, not
exactly-once.

**Two Postgres roles per service.** Every service schema has a
`<service>_migrator` role (`USAGE + CREATE`, used only to run migrations)
and a `<service>_app` role (`USAGE` only, what the running service actually
connects as). `ALTER DEFAULT PRIVILEGES FOR ROLE <service>_migrator` means
any table *that role* creates automatically grants the app role the right
DML — no manual re-grant per migration. The app role structurally cannot
`CREATE TABLE`, `DROP TABLE`, or otherwise touch schema shape, even if the
running service is compromised or has a bug. No foreign keys ever cross
schemas — each service owns its own data outright, and cross-service
consistency is handled by the messaging layer, not the database.

**Migrations are never automatic.** No service runs migrations on boot.
They're a separate, explicit step (`npm run migration:run` per NestJS
service, `alembic upgrade head` for Fraud Service) run against the
`_migrator` role. Tying schema changes to process boot means a bad
migration takes down every replica simultaneously on deploy; keeping it
explicit means it can be reviewed, staged, and rolled back independently of
application code.

## Testing philosophy

Most services have real unit test suites — NestJS's order state machine,
RabbitMQ retry-routing logic, and Fraud Service's rule engine all have
meaningful branching logic worth covering. `analytics-service` and
`audit-service` deliberately don't: both are a Kafka consumer whose entire
job is one `INSERT ... ON CONFLICT DO NOTHING` query-builder chain per
event. A unit test for that would either mock the TypeORM repository (in
which case the test verifies the mock was called correctly, not that the
row lands in Postgres) or stand up a real database (at which point it's an
integration test wearing a unit test's clothes, and slower to boot for no
extra signal). Their actual correctness question — "does a duplicate
Kafka delivery produce one row, not two?" — was verified live instead: by
publishing the same event twice and checking the row count, not by
asserting a mock was called. Both services do have a real, working
`"test": "jest --passWithNoTests"` script in their own `package.json` (not
a CI-only override), so CI's generic per-service test command doesn't
special-case them.

## Local-only, deliberately

This project does not deploy to AWS and has no Terraform. That's a
deliberate scope decision, not an oversight: the entire point of the
project is hands-on depth with Kafka/RabbitMQ/BullMQ message-passing
semantics, not cloud infrastructure-as-code — a skill area better
demonstrated by a separate, dedicated project than bolted onto this one for
completeness. `docker-compose.yml` (infra) + `docker-compose.dev.yml` (app
services) is the full deployment target. If this ever needs to run
somewhere other than a laptop, that's a new project, not a Phase 7.

## CI

`.github/workflows/ci.yml` runs, in dependency order: lint + unit tests per
service (matrix over all 7 `apps/*`, including `web`'s `tsc` typecheck) →
Fraud Service's pytest suite → a contract-drift test that validates the same
canonical `order.status_changed` fixture against both the Zod schema (TS)
and the Pydantic model (Python) → a Docker build verification matrix over
all 7 services, gated on the first three jobs passing.