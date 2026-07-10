# Logistics Platform — Conventions

Full design reference: docs/project-plan.md — read relevant sections before
implementing any phase.

## Non-negotiable conventions
- No foreign keys across schemas (services own their own data — Section 13)
- Every service's Postgres role is split: <service>_migrator (USAGE+CREATE, runs
  migrations only) and <service>_app (USAGE only, runtime connection) — never
  grant CREATE to an _app role
- Wire format for all Kafka/RabbitMQ messages is snake_case JSON, regardless of
  language (Section 5)
- Every message/event includes trace_id, generated once at order placement,
  propagated everywhere — including BullMQ job payloads
- Kafka consumer group IDs must match the registry in Section 5.2 exactly —
  never let two services share a group ID
- Fraud Service only evaluates rules on new_status == PLACED (Section 6) —
  every other status is consumed but no-op'd, not skipped from consumption
- All Kafka producers use acks=all
- Migrations are a separate, explicit step — never run automatically on
  service boot

## Before marking any phase done
List 2-3 ways this implementation could fail silently (missing grant, unwired
config, race condition) and state what you checked, not just that the happy
path works.

When editing packages/contracts: run `npm run build --workspace=@logistics/contracts`
on the host, then `docker compose restart <service>` for anything that consumes it —
not a full `docker compose build`, once the volume mount is in place.