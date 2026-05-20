-- ============================================================================
-- Migración 2026-04-23: FKs faltantes + índices + TIMESTAMPTZ + TTL reports
-- ============================================================================
-- Cierra los hallazgos DB-NEW-002, DB-NEW-003, DB-NEW-006, DB-NEW-007,
-- DB-NEW-008 y GDPR-NEW-003 de la auditoría 2026-04-23.
--
-- PRE-REQ: snapshot/branch Neon antes de ejecutar. Las ALTER TABLE sobre
-- user_subscriptions cambian el tipo de columnas, requieren lock de tabla
-- corto. Las CREATE INDEX CONCURRENTLY no bloquean escrituras.
--
-- VERIFICAR POST-EJECUCIÓN con:
--   \d ai_usage        -> ver "Foreign-key constraints"
--   \d feedback
--   \d import_events
--   \d user_subscriptions
--   \d savings_goals   -> ver índices
--   \d+ import_error_reports -> ver columna expires_at con default
-- ============================================================================

BEGIN;

-- --- FKs faltantes con CASCADE --------------------------------------------

ALTER TABLE ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_user_id_fkey;
ALTER TABLE ai_usage
  ADD CONSTRAINT ai_usage_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE feedback
  DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;
ALTER TABLE feedback
  ADD CONSTRAINT feedback_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE import_events
  DROP CONSTRAINT IF EXISTS import_events_user_id_fkey;
ALTER TABLE import_events
  ADD CONSTRAINT import_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- --- user_subscriptions: ON DELETE CASCADE + TIMESTAMPTZ ------------------

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Cambiar TIMESTAMP -> TIMESTAMPTZ. Asume que los valores actuales están
-- en UTC (el código usa NOW() y Date.toISOString()).
ALTER TABLE user_subscriptions
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC';
ALTER TABLE user_subscriptions
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE user_subscriptions
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

-- --- TTL para PDFs bancarios (GDPR art. 5(1)(e) minimización) -------------

ALTER TABLE import_error_reports
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

-- Backfill expires_at para filas existentes (si las hay).
UPDATE import_error_reports
   SET expires_at = COALESCE(expires_at, created_at + INTERVAL '30 days')
 WHERE expires_at IS NULL;

COMMIT;

-- --- Índices (fuera de transacción porque usan CONCURRENTLY) -------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_savings_goals_user
  ON savings_goals(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recurring_transactions_user
  ON recurring_transactions(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_categorization_rules_user
  ON categorization_rules(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_investment_positions_user
  ON investment_positions(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_investment_transactions_user
  ON investment_transactions(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_import_error_reports_expires
  ON import_error_reports(expires_at);

-- ============================================================================
-- ROLLBACK manual si algo falla:
-- BEGIN;
--   ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_user_id_fkey;
--   ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;
--   ALTER TABLE import_events DROP CONSTRAINT IF EXISTS import_events_user_id_fkey;
--   ALTER TABLE user_subscriptions
--     ALTER COLUMN expires_at TYPE TIMESTAMP USING expires_at AT TIME ZONE 'UTC',
--     ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
--     ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC';
--   ALTER TABLE import_error_reports DROP COLUMN IF EXISTS expires_at;
-- COMMIT;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_savings_goals_user;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_recurring_transactions_user;
-- ... etc
-- ============================================================================
