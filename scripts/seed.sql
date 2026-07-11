-- scripts/seed.sql
-- Minimal test data for local development after a fresh `docker compose down -v`.
-- Idempotent (ON CONFLICT DO UPDATE) — safe to re-run against an existing database.
--
-- Run with:
--   docker compose -f infra/docker-compose.yml exec -T postgres \
--     psql -U postgres -d postgres < scripts/seed.sql
--
-- Without this, a fresh volume has zero stock for every SKU, and placing a
-- test order silently auto-cancels (INSUFFICIENT_STOCK -> CANCELLED) rather
-- than failing with an obvious "no stock configured" error — this script
-- exists specifically to remove that trap.

INSERT INTO order_api.customers (id, full_name, email)
VALUES ('11111111-1111-4111-8111-111111111111', 'Test Customer', 'test@example.com')
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

INSERT INTO inventory.stock (sku, available_qty, reserved_qty)
VALUES
  ('SKU001', 50, 0),
  ('SKU002', 50, 0)
ON CONFLICT (sku) DO UPDATE
  SET available_qty = EXCLUDED.available_qty,
      reserved_qty = EXCLUDED.reserved_qty;
