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

**Status: DONE, committed.** Real bugs found: CI's contract-drift-test job existed only in prose before this phase (never spliced into the actual YAML); all 5 NestJS services were missing ESLint configs since Phase 1 (uncaught because no CI existed to run lint until now); the RabbitMQ setup race (amqp-connection-manager's concurrent `addSetup` callbacks racing a queue's own assertion — masked in every prior phase by RabbitMQ queues persisting across dev sessions that never got `down -v`'d, only surfaced on the first-ever full-stack boot); fraud-service's `--reload` crashing under WSL2's shared inotify budget (fixed via `WATCHFILES_FORCE_POLLING`). README expanded into a full guide with a seed script (`scripts/seed.sql`) closing the previously-flagged unscripted-test-data gap. AWS/Terraform section intentionally left as-is pending separate work.

---

## Frontend Improvement Plan (post-Phase 6)

Scope: improve the existing Next.js app in place — no shadcn/ui, no replacing Tailwind, no migrating Server Component reads to client-side fetching. Adds Redux Toolkit for client state (toasts, auto-refresh preference, order form draft) and RTK Query for exactly two mutations (create order, transition order). Sequenced as three independently-reviewable prompts rather than one large one, since the riskiest decisions (Client/Server component boundaries, where RTK Query actually points) are cheapest to catch early.

**Two risks worth stating explicitly before Prompt 1, since they're easy to get subtly wrong:**
1. RTK Query must call the existing same-origin Route Handler proxies (`/api/orders`, `/api/orders/:id/transition`) — not backend container hostnames, which the browser cannot resolve.
2. Only the specific interactive leaf components (the new-order form, the transition buttons) should become Client Components — not the surrounding pages. A common failure mode is one interactive button forcing `'use client'` onto an entire page, silently undoing Phase 5's SSR architecture.
3. `router.refresh()` after a successful transition only shows fresh data if the order-detail page's server-side fetch uses `cache: 'no-store'` (or equivalent) — confirm this rather than assume it.

### Prompt 1 — Foundation: Redux store, reusable components, error boundaries

**Prompt:**
```
Add Redux Toolkit + React Redux to apps/web without touching backend services
or migrating any read page to client-side fetching.

Store setup:
- Redux store, a client-component Provider wrapper (Redux's <Provider> cannot
  go directly in the root layout.tsx, since that's a Server Component by
  default — create a dedicated providers.tsx with 'use client' that wraps
  {children}, and use that in layout.tsx).
- Typed useAppDispatch/useAppSelector hooks.
- ui slice: toasts (array, each with id/type/message), autoRefreshEnabled
  (boolean), lastError (string | null).
- orderForm slice: customerId, deliveryAddress, branchId, items (array of
  {sku, qty, unitPrice}), validationErrors, plus a reset action.

Reusable components (plain Tailwind, no shadcn/ui, no new UI library):
- ErrorState: title, message, optional actionLabel/onAction. No stack
  traces, file paths, or error.digest ever rendered to the user.
- LoadingState: simple, reusable loading indicator.
- ToastHost: reads ui.toasts from Redux, renders success/error/info toasts,
  each dismissible and auto-dismissing after ~4s via a per-toast timeout
  with cleanup on unmount (not a shared interval). Mount once, e.g. in
  providers.tsx.
- PageHeader: title + optional right-aligned actions slot.

Error boundaries — use Next.js App Router's actual error.tsx convention
(required to be a Client Component), not a custom mechanism:
- apps/web/app/orders/error.tsx
- apps/web/app/orders/[id]/error.tsx
- apps/web/app/analytics/error.tsx
Each renders ErrorState with a clean message, and calls the reset() function
Next.js provides as the retry action. error.digest is fine to console.error
for debugging but must never render in the UI.

Do not wire any of this into the order form or transition buttons yet —
that's the next phase. This phase is infrastructure only, and should be
independently verifiable: the app should build, the toast host should be
mountable with a manually-dispatched test toast, and each error.tsx should
be triggerable (e.g. by temporarily throwing in the relevant page) and show
a clean message with a working retry.
```

**Review checklist:**
- Confirm `<Provider>` is in a dedicated `'use client'` file, not pasted directly into `layout.tsx` (which would either error or force the whole layout client-side).
- Manually dispatch a toast and confirm it auto-dismisses and cleans up its timeout on unmount (navigate away before the timeout fires — no console warning about a state update on an unmounted component).
- Temporarily throw inside each of the three pages and confirm: the error.tsx catches it, shows a clean message, `reset()` actually retries rendering, and nothing resembling a stack trace/file path/digest appears in the rendered output.
- Confirm the rest of the app (order list, detail, analytics reads) still renders via Server Components exactly as before — this phase should change zero read behavior.

### Prompt 2 — Feature wiring: RTK Query, form migration, transitions, auto-refresh

**Prompt:**
```
Wire the Redux foundation from the previous phase into real functionality.

RTK Query — createOrder and transitionOrder mutations only. baseUrl must be
the existing same-origin Route Handler proxies (/api/orders,
/api/orders/:id/transition) — NOT the backend container hostnames, which
cannot resolve from the browser. Confirm this by checking network requests
in the browser, not just reading the code.

Order form (apps/web/app/orders/new — this page's form becomes a Client
Component; the surrounding route can stay as minimal a shell as possible):
- Move draft state (customerId, deliveryAddress, branchId, items) from
  local useState into the orderForm Redux slice.
- Validation errors stay visible and readable, sourced from the slice.
- Disable submit while the createOrder mutation is pending.
- On success: show a success toast, dispatch orderForm's reset action, then
  navigate to the new order's detail page (in that order — reset before
  navigating away, not after, so there's no stale-form flash if navigation
  is slow).
- On failure: show an error toast (or inline error, whichever reads better
  for the failure) with the actual backend message, not a generic string.

Order transitions (order detail page's status-change buttons — these
buttons become a small Client Component; the rest of the page stays server-
rendered):
- Use the transitionOrder mutation's pending/error state to disable buttons
  during the request.
- Success: toast, then router.refresh() (from next/navigation) so the
  Server Component re-fetches and shows the new status. Before assuming
  this works, confirm the order-detail page's server-side fetch actually
  uses cache: 'no-store' (or equivalent) — if it doesn't, router.refresh()
  may silently re-render the same cached response instead of fresh data.
- Failure: clean error toast with the actual backend error message (Order
  API already returns specific 400 messages for invalid transitions — surface
  that, not a generic "something went wrong").

Auto-refresh: move the enabled/disabled preference into ui.autoRefreshEnabled,
shared across every page that currently has its own local auto-refresh
toggle, so toggling it on one page is reflected on others. Keep the actual
refresh mechanism (however it currently polls/refetches) unchanged — only
the on/off state moves to Redux.
```

**Review checklist:**
- Open browser devtools' Network tab while creating an order — confirm the request actually goes to `/api/orders` (same-origin), not `order-api:3000` or `localhost:3000` directly.
- Confirm the order-detail page's fetch has `cache: 'no-store'` (or a revalidate setting short enough to matter) — transition an order, click confirm, and verify the displayed status actually changes without a manual page reload.
- Force a transition that the backend will reject (e.g. `PLACED` → `SHIPPED` directly) and confirm the toast shows the real backend message, not a generic error.
- Toggle auto-refresh on one page, navigate to another page that also has it, and confirm the toggle state carried over.
- Confirm only the form/button components are `'use client'` — check that the order list and detail pages' main content still renders without a client-side loading flash on first load (a sign something got accidentally converted to client-side fetching).

### Prompt 3 — Responsive/UI polish

**Prompt:**
```
Polish only — no new functionality, no Redux changes.

- Tables (orders list, fraud flags): wrap in a horizontally-scrollable
  container on narrow viewports rather than squeezing columns.
- Long UUIDs (order IDs, customer IDs, trace IDs): truncate with ellipsis
  and a title attribute (or copy-to-clipboard) rather than overflowing or
  wrapping mid-character.
- Buttons (transition actions, filters): wrap cleanly (flex-wrap) on small
  screens instead of overflowing or forcing horizontal scroll on the whole
  page.
- Keep existing card/panel sizing compact — no new padding/spacing scale.
- Add a clean empty state (using the new LoadingState/ErrorState-adjacent
  pattern, or a simple centered message) anywhere a page can legitimately
  have zero data (empty order list, no fraud flags, no analytics data yet)
  — some of this may already exist from Phase 5, don't duplicate it.

Do not introduce shadcn/ui or any new component library. Do not touch
backend services.
```

**Review checklist:**
- Resize the browser to a phone width and check: does the orders table scroll horizontally instead of squishing, do transition buttons wrap instead of overflowing, do long IDs truncate cleanly?
- Confirm empty states render correctly for a genuinely empty result (e.g. filter fraud flags by a nonexistent order ID) rather than an empty table with just headers.