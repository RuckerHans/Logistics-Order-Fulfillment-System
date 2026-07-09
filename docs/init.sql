-- ============================================
-- Logistics Platform — bootstrap init.sql
-- Mounted at /docker-entrypoint-initdb.d/01-init.sql (see infra/docker-compose.yml)
-- Runs ONCE, automatically, on first container start against an empty pg-data volume.
-- Scope is deliberately minimal: schemas + roles + grants only.
-- No CREATE TABLE statements here — every table is created by that service's own
-- migration (TypeORM for NestJS services, Alembic for Fraud Service), run separately
-- via each service's *_migrator role. See Section 13 of the project plan for the full
-- rationale and the authoritative schema design each migration must produce.
-- ============================================

-- ============================================
-- Schemas (one per service)
-- ============================================
CREATE SCHEMA IF NOT EXISTS order_api;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS fraud;

-- ============================================
-- Scoped roles — two-tier model per service (least privilege)
-- ============================================
-- Pattern per service: <service>_migrator (USAGE + CREATE, runs migrations only) and
-- <service>_app (USAGE only, what the running service connects as day-to-day). Default
-- privileges are set FOR the migrator role, so any table THAT ROLE creates automatically
-- grants the stated DML to the app role — no manual re-grant needed for any future table.

CREATE ROLE order_api_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE order_api_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA order_api TO order_api_migrator;
GRANT USAGE ON SCHEMA order_api TO order_api_app;
ALTER DEFAULT PRIVILEGES FOR ROLE order_api_migrator IN SCHEMA order_api
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO order_api_app;
ALTER DEFAULT PRIVILEGES FOR ROLE order_api_migrator IN SCHEMA order_api
  GRANT USAGE, SELECT ON SEQUENCES TO order_api_app;
-- Sequence grant matters here specifically because order_api.outbox uses BIGSERIAL.

CREATE ROLE inventory_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE inventory_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA inventory TO inventory_migrator;
GRANT USAGE ON SCHEMA inventory TO inventory_app;
ALTER DEFAULT PRIVILEGES FOR ROLE inventory_migrator IN SCHEMA inventory
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO inventory_app;
-- No sequence grant needed: inventory tables use non-serial primary keys (sku, UUID).

CREATE ROLE analytics_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE analytics_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA analytics TO analytics_migrator;
GRANT USAGE ON SCHEMA analytics TO analytics_app;
ALTER DEFAULT PRIVILEGES FOR ROLE analytics_migrator IN SCHEMA analytics
  GRANT SELECT, INSERT ON TABLES TO analytics_app;
ALTER DEFAULT PRIVILEGES FOR ROLE analytics_migrator IN SCHEMA analytics
  GRANT USAGE, SELECT ON SEQUENCES TO analytics_app;
-- order_status_events uses BIGSERIAL — sequence grant required.

CREATE ROLE audit_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE audit_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA audit TO audit_migrator;
GRANT USAGE ON SCHEMA audit TO audit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE audit_migrator IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO audit_app;  -- no UPDATE/DELETE: enforces append-only at the DB level
ALTER DEFAULT PRIVILEGES FOR ROLE audit_migrator IN SCHEMA audit
  GRANT USAGE, SELECT ON SEQUENCES TO audit_app;
-- order_status_log uses BIGSERIAL — sequence grant required.

CREATE ROLE fraud_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE fraud_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA fraud TO fraud_migrator;
GRANT USAGE ON SCHEMA fraud TO fraud_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fraud_migrator IN SCHEMA fraud
  GRANT SELECT, INSERT ON TABLES TO fraud_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fraud_migrator IN SCHEMA fraud
  GRANT USAGE, SELECT ON SEQUENCES TO fraud_app;
-- Both order_events and flagged_orders use BIGSERIAL — sequence grant required for each.

CREATE ROLE notification_migrator LOGIN PASSWORD 'change_me';
CREATE ROLE notification_app LOGIN PASSWORD 'change_me';
GRANT USAGE, CREATE ON SCHEMA notification TO notification_migrator;
GRANT USAGE ON SCHEMA notification TO notification_app;
ALTER DEFAULT PRIVILEGES FOR ROLE notification_migrator IN SCHEMA notification
  GRANT SELECT, INSERT, UPDATE ON TABLES TO notification_app;
-- UPDATE included (unlike audit's strictly append-only grant): notification_log.status
-- may need to flip SENT -> FAILED on a later retry outcome.
-- No sequence grant needed: notification_log uses a UUID primary key.
