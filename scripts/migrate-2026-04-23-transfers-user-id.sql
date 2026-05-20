-- ============================================================================
-- Migración condicional 2026-04-23: añadir transfers.user_id
-- ============================================================================
-- SOLO EJECUTAR SI `\d transfers` en Neon prod muestra que la columna
-- user_id no existe. Si ya existe NOT NULL, este script es un no-op seguro.
--
-- Contexto: el INSERT en POST /api/transfers nunca incluyó user_id. Si el
-- schema actual de Neon es el de src/lib/schema.sql (user_id NOT NULL),
-- entonces cada transfer está fallando con NOT NULL violation en prod.
-- Si el schema de Neon es el viejo (sin user_id), los transfers son
-- huérfanos — no tienen dueño y no cascadean al borrar cuenta.
-- El fix de código (commit e4ca284) añade user_id al INSERT; este script
-- asegura que la DB lo acepte.
--
-- PRE-REQ: backup/branch Neon antes.
--
-- VERIFICAR:
--   \d transfers  -> debe aparecer user_id integer not null con FK cascade
--   SELECT COUNT(*) FROM transfers WHERE user_id IS NULL; -> 0
-- ============================================================================

BEGIN;

-- 1. Añadir columna nullable primero (para poder backfill).
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS user_id INTEGER;

-- 2. Backfill desde transactions (from_transaction_id.user_id es la fuente).
UPDATE transfers t
   SET user_id = tx.user_id
  FROM transactions tx
 WHERE tx.id = t.from_transaction_id AND t.user_id IS NULL;

-- 3. Si quedan filas con user_id NULL, borrarlas — son huérfanas sin forma
-- de asignarlas a un dueño. (Debería ser 0 si todos los transfers fueron
-- creados por el código actual).
DELETE FROM transfers WHERE user_id IS NULL;

-- 4. Ahora SET NOT NULL + FK CASCADE.
ALTER TABLE transfers
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE transfers
  DROP CONSTRAINT IF EXISTS transfers_user_id_fkey;
ALTER TABLE transfers
  ADD CONSTRAINT transfers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;

-- Índice fuera de transacción.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_user ON transfers(user_id);
