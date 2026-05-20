-- Migración: normalizar colores de cuentas antiguas.
--
-- Regla de marca Fintrk: cero morado, violeta o índigo en toda la app
-- (decision log 2026-04-23). Cuentas creadas antes del cambio tienen estos
-- colores persistidos en DB. Este script los reemplaza idempotentemente.
--
-- Ejecutar en Neon (via psql o dashboard):
--   psql $DATABASE_URL -f scripts/migrations/normalize-account-colors.sql
--
-- O manual:
--   BEGIN;
--   ... (los 6 UPDATE de abajo)
--   -- Verificar con SELECT antes de COMMIT
--   COMMIT;
--
-- Rollback: no aplica (los colores nuevos son la única fuente de verdad).

BEGIN;

-- Revolut #7c3aed → azul oficial alterno.
UPDATE accounts SET color = '#0075EB' WHERE LOWER(color) = '#7c3aed';

-- Violeta/morado brand generic.
UPDATE accounts SET color = '#0EA5E9' WHERE LOWER(color) = '#8b5cf6';
UPDATE accounts SET color = '#38BDF8' WHERE LOWER(color) = '#a78bfa';

-- Índigo default antiguo (cuentas custom creadas sin bank reconocido).
UPDATE accounts SET color = '#6b7280' WHERE LOWER(color) = '#6366f1';
UPDATE accounts SET color = '#0EA5E9' WHERE LOWER(color) = '#4f46e5';
UPDATE accounts SET color = '#38BDF8' WHERE LOWER(color) = '#818cf8';

-- Verificación post-migración (devuelve 0 filas si todo OK):
SELECT id, slug, name, color FROM accounts
WHERE LOWER(color) IN ('#7c3aed', '#8b5cf6', '#a78bfa', '#6366f1', '#4f46e5', '#818cf8');

COMMIT;
