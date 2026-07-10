# Logistics Platform — Phase Prompts & Review Checklists (updated through Phase 2)

Each phase prompt below reflects lessons from Phases 0-2's actual bugs, not just the
original plan. Review checklists focus on what a happy-path test can't catch — the
same shape of bug that's turned up every phase so far: config that looks right but
isn't wired, or logic that's correct in isolation but breaks under a real dependency
(a join, a restart, a redelivery).

**Standing instinct for every phase, not just BullMQ:** after Claude Code reports a
phase "done," the first question is always "did you actually run this against the
live stack, or just unit test it" — and the second is "does every queue/topic/table
this touches have the same protections (retry, DLX, idempotency, grants) as the ones
that already exist," since forgetting one of a matched set (the reply queue's retry
policy, a second .failed DLQ) has been the single most common bug shape.

---

## Phase 0 — Scaffolding & contracts — DONE, committed

Reference only. Real bugs found: missing `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP`/
`KAFKA_CONTROLLER_LISTENER_NAMES`/`KAFKA_INTER_BROKER_LISTENER_NAME` (broker
crash-loop), `kafka-init`'s YAML-folding bug masking a failed topic-create behind an
unconditional `echo`, missing healthchecks. All fixed and verified via `--describe`,
`psql \dn/\du/\ddp`, and a real `down -v && up` fresh-volume test.

---

## Phase 1 — Order API core — DONE, committed

Reference only. Real bug found: TypeORM's migration table defaulted to `public`
schema, which `order_api_migrator` has no `CREATE` on (Postgres 15+ default). Fixed
via `schema: 'order_api'` on the DataSource.

---

## Phase 2 — Transactional outbox, RabbitMQ, business logic — DONE, committed

Reference only. Real bugs found: outbox poller reentrancy (`@Interval` overlap →
47 duplicate messages), `trace_id` missing from `orders` table, Docker build context
broken for npm workspace siblings, `@Global()` NestJS export trap, `FOR UPDATE` +
`LEFT JOIN` Postgres restriction, reply queue missing retry/DLX topology entirely
(confirmed via a real 85341-redeliver busy loop, not hypothetical).

---

## Phase 3 — BullMQ

**Prompt:**
```
Implement the three BullMQ jobs (Section 5.5, 17) in order-api: payment-timeout,
delivery-reminder, generate-invoice-pdf. Read trace_id from the order row (added
to order_api.orders during Phase 2) rather than generating a new one — reuse it
in whatever event/log each job produces. Jobs that transition an order must call
the existing OrdersService.transition() (the transactional, row-locked version
from Section 17/Phase 2) — don't write a separate transition path for jobs.

Wire Bull Board per Section 15, mounted in order-api's existing container (Redis
connection and port are already configured in docker-compose.dev.yml — no compose
changes should be needed).

After implementing, actually exercise each job against the live stack, not just
unit tests: enqueue a payment-timeout with a short delay and confirm it correctly
no-ops if the order already moved past PLACED, and correctly cancels if it
hasn't; confirm delivery-reminder and generate-invoice-pdf fire and produce
real output (a logged reminder, an actual PDF file) rather than just asserting
the job was scheduled.
```

**Review checklist:**
- Enqueue `payment-timeout`, manually confirm payment before it fires — does it correctly no-op, not cancel a paid order?
- Enqueue `payment-timeout`, let it fire naturally on an unpaid order — does the order actually transition to `CANCELLED` through the real `OrdersService.transition()` (check logs/DB for the row lock path), not a shortcut?
- Open Bull Board (`/admin/queues`) — can you see real job states, not just that the route mounts?
- Check that every job's log line/event actually carries the `trace_id` read from the order row, not a freshly generated one — grep for two different `trace_id`s on the same order if in doubt.
- Confirm `generate-invoice-pdf` produces an actual file, not just a "job completed" log.
- Ask Claude Code directly: does calling `transition()` from a BullMQ processor hit the same row-locking code path as the HTTP endpoint and the reply-queue consumer, or did a fourth call site quietly diverge?

---

## Phase 4 — Kafka: outbox already exists, this phase is the four consumers — DONE, committed

Reference only. Real bugs found: `fraud.order_events`'s Kafka consumer task died silently ~1.5s after startup (DB insert failed pre-migration, `asyncio.create_task` swallowed the exception, zero log evidence) — fixed with a supervisor loop plus `enable_auto_commit=False`/manual commit, since default auto-commit is at-most-once and could silently lose a message rather than merely redeliver one. Also found: Section 19.1 prescribed a `new_status` column on `fraud.order_events` that Section 13's DDL never gave it — corrected to `UNIQUE (order_id)` alone.

**Prompt:**
```
Implement Kafka consumers for four services, each its own consumer group per
Section 5.2's registry:

- inventory-service: consumes order.status_changed, reacting to PAYMENT_CONFIRMED
  (commit reservation) and CANCELLED (release reservation) per Section 19.1's
  commitReservation/release logic — this does NOT already exist; Phase 2 only
  built the RabbitMQ side (reserve_stock, notify, reply-queue consumer). Every
  other status must be consumed (offset advances) but no-op.
- analytics-service and audit-service: consume and persist per Section 13's
  tables, idempotent via ON CONFLICT DO NOTHING on (order_id, new_status)
- fraud-service (FastAPI + aiokafka): the rule engine from Section 6, with
  RELEVANT_STATUSES scoped to PLACED only — every other status consumed but
  no-op before touching the rule engine or database

Check docs/init.sql against Section 13 for sequence grants on every BIGSERIAL
table this phase touches (analytics.order_status_events, audit.order_status_log,
fraud.order_events, fraud.flagged_orders) — confirm they're present, don't
assume.

After implementing, verify against the live stack: publish a duplicate
order.status_changed event manually and confirm each of the four consumers
produces exactly one effect, not two — including Inventory, where "effect"
means the reservation's status column changes exactly once, not that a row
was inserted twice. Confirm Fraud Service's logs show it explicitly skipping
rule evaluation on non-PLACED transitions. Confirm Inventory's commit/release
correctly no-ops on a redelivered event when the reservation is already in the
target state (COMMITTED/RELEASED), per Section 19.1.
```

**Review checklist — this is the highest-stakes phase remaining, budget the most review time here:**
- Re-publish the same `order.status_changed` event twice manually (or force outbox redelivery) — does Audit end up with exactly one row? Does Fraud skip re-flagging?
- **Inventory's commit/release is new work this phase, not a confirmation pass** — verify it actually exists as real code before verifying it's correct. Check: does a `PAYMENT_CONFIRMED` event actually flip a `RESERVED` reservation to `COMMITTED`, and does `CANCELLED` flip it to `RELEASED`? Publish the same event twice — does the reservation's status column change once, or does the second delivery error/duplicate?
- Check Fraud Service's logs directly — does it explicitly skip on `PAYMENT_CONFIRMED`/`PICKING`/etc., or does the `RELEVANT_STATUSES` filter only exist in a comment and not the actual code path?
- `docker stop kafka-2` mid-flow, place an order — does it still succeed? This is the actual test of whether `min.insync.replicas=2` + `acks=all` deliver what Section 8.3 claims, not just narration.
- Check kafka-ui's consumer groups view — are `analytics-service`, `fraud-service`, `audit-service`, `inventory-service` genuinely four **distinct** groups? (This is exactly the kind of thing that silently breaks if a copy-pasted config keeps the same group ID.)
- Confirm the Fraud Service's Postgres role (`fraud_app`) actually has the sequence grant it needs before assuming an insert works — this is the same class of bug as the `order_api.outbox` sequence-grant gap found in planning, now worth confirming it didn't slip through for Fraud/Analytics/Audit's own `BIGSERIAL` tables.
- Ask directly: does the Fraud Service's Alembic migration match Section 13's DDL the same way order-api's TypeORM migration was checked line-by-line back in Phase 1? Don't let the second language get a lighter review than the first.

---

## Phase 5 — Frontend — DONE, committed

Reference only. Real bugs found: `GET /orders` existed since Phase 1 but had zero pagination and zero test coverage; Analytics Service's actual REST API status contradicted an earlier claim (flagged rather than silently resolved either way); stale 274MB `.next/` bloating the Docker build context; port-convention mismatch (hardcoded `3100` instead of respecting `$PORT`); container-hostname vs. `localhost` mismatch in the subagent's own sandboxed verification, caught and fixed by the human review pass specifically because that's the one thing a sandboxed build can't check.

---

## Phase 6 — Polish

**Prompt:**
```
Wire the full CI pipeline (Sections 16, 18, 19.3):

- Add web to build-docker-images' matrix — it's missing entirely from Section 16,
  since that section predates Phase 5. Confirm whether web has a real test script
  (tsc + eslint at minimum) before adding it to test-node-services too — if it
  doesn't have one yet, add a minimal one rather than either skipping it from CI
  or letting the matrix job fail on a missing script.
- Confirm analytics-service and audit-service's --passWithNoTests handling lives
  in each service's own package.json test script, not as a CI-only override —
  otherwise the generic per-service test command in the matrix breaks for them.
- Add contract-drift-test to build-docker-images' needs: list — confirm this
  literally by reading the actual YAML, don't just state it. This exact gap
  (the fix described in prose without the YAML actually reflecting it) slipped
  through once already in the plan doc itself.

Before writing the README, bring up the ENTIRE stack in one shot — all infra
plus all 7 backend services plus web — from a fresh `down -v`. Every phase so
far has only brought up the subset it needed; this is the first time everything
runs together, and it's worth finding out now if anything about that combination
doesn't hold up.

Write the README with the "why RabbitMQ / Kafka / BullMQ" rationale section,
covering what's actually true of this implementation (including the testing
philosophy — why analytics/audit have no dedicated unit tests, the migrator/app
role split, the outbox pattern) — not just the original plan's intent. Also
explicitly address the deferred AWS/Terraform question: state plainly that this
project is local-only and why, rather than leaving it unmentioned.
```

**Review checklist:**
- Read the actual `needs:` list in the committed YAML yourself — don't accept a summary that says it's wired.
- Confirm `web` is genuinely in `build-docker-images`, and that whatever test script it has (if any) actually runs and passes in CI, not just locally.
- Deliberately break something the contract-drift test should catch (remove a Pydantic constraint) and push it — does CI actually go red, and does that red block the build?
- The full-stack `down -v && up` — did it actually succeed with zero manual intervention, or did something need a restart/reorder that should be reflected in a healthcheck/`depends_on` fix rather than papered over?
- Read the README's rationale section yourself — could you defend every sentence in an interview without looking anything up? If a sentence describes something that isn't quite how it ended up being built (the outbox timing, the reply queue's retry policy, the two-tier role model), fix the README, don't leave the aspirational version in.
- Confirm the AWS/Terraform decision is explicitly stated in the README, not silently absent.