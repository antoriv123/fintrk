-- Migration: Money columns DOUBLE PRECISION -> NUMERIC(14, 2)
-- Date: 2026-04-20
-- Context: auditoria 2026-04-19 detecto que almacenar importes en DOUBLE PRECISION
-- causa rounding errors (e.g. 0.1 + 0.2 = 0.30000000000000004) que son pre-paywall
-- un riesgo moderado y post-paywall serian un problema serio de confianza.
-- NUMERIC(14,2) soporta hasta 999,999,999,999.99 EUR — 1e12 EUR por fila — mas que
-- suficiente para un usuario consumer. 2 decimales fijos, aritmetica exacta.
--
-- ⚠️  EJECUCION MANUAL. Revisar antes de correrlo en Neon prod.
-- ⚠️  Correr DURANTE baja actividad (noche) — lock breve por tabla.
-- ⚠️  Hacer backup (pg_dump) antes de ejecutar.
--
-- Rollback: restaurar desde backup. ALTER COLUMN ... TYPE DOUBLE PRECISION USING col::float
-- es tecnicamente posible pero no reversible sin perder el contrato de 2 decimales.

BEGIN;

-- transactions
ALTER TABLE transactions
  ALTER COLUMN amount TYPE NUMERIC(14, 2) USING amount::numeric(14, 2),
  ALTER COLUMN eur_amount TYPE NUMERIC(14, 2) USING eur_amount::numeric(14, 2);

-- recurring_transactions
ALTER TABLE recurring_transactions
  ALTER COLUMN average_amount TYPE NUMERIC(14, 2) USING average_amount::numeric(14, 2);

-- subscriptions
ALTER TABLE subscriptions
  ALTER COLUMN amount TYPE NUMERIC(14, 2) USING amount::numeric(14, 2);

-- accounts
ALTER TABLE accounts
  ALTER COLUMN initial_balance TYPE NUMERIC(14, 2) USING initial_balance::numeric(14, 2),
  ALTER COLUMN annual_interest_rate TYPE NUMERIC(8, 4) USING annual_interest_rate::numeric(8, 4);

-- savings_goals
ALTER TABLE savings_goals
  ALTER COLUMN target_amount TYPE NUMERIC(14, 2) USING target_amount::numeric(14, 2),
  ALTER COLUMN current_amount TYPE NUMERIC(14, 2) USING current_amount::numeric(14, 2);

-- investment_transactions
ALTER TABLE investment_transactions
  ALTER COLUMN shares TYPE NUMERIC(18, 6) USING shares::numeric(18, 6),
  ALTER COLUMN price_per_share TYPE NUMERIC(14, 4) USING price_per_share::numeric(14, 4),
  ALTER COLUMN commission TYPE NUMERIC(14, 2) USING commission::numeric(14, 2);

-- investment_prices
ALTER TABLE investment_prices
  ALTER COLUMN price TYPE NUMERIC(14, 4) USING price::numeric(14, 4);

-- transaction_splits
ALTER TABLE transaction_splits
  ALTER COLUMN amount TYPE NUMERIC(14, 2) USING amount::numeric(14, 2);

-- transfers
ALTER TABLE transfers
  ALTER COLUMN amount TYPE NUMERIC(14, 2) USING amount::numeric(14, 2);

-- envelopes
ALTER TABLE envelopes
  ALTER COLUMN budgeted TYPE NUMERIC(14, 2) USING budgeted::numeric(14, 2);

-- budgets
ALTER TABLE budgets
  ALTER COLUMN monthly_limit TYPE NUMERIC(14, 2) USING monthly_limit::numeric(14, 2);

-- net_worth_snapshots
ALTER TABLE net_worth_snapshots
  ALTER COLUMN cash TYPE NUMERIC(14, 2) USING cash::numeric(14, 2),
  ALTER COLUMN investments TYPE NUMERIC(14, 2) USING investments::numeric(14, 2),
  ALTER COLUMN savings_goals TYPE NUMERIC(14, 2) USING savings_goals::numeric(14, 2),
  ALTER COLUMN debts TYPE NUMERIC(14, 2) USING debts::numeric(14, 2),
  ALTER COLUMN total TYPE NUMERIC(14, 2) USING total::numeric(14, 2);

COMMIT;
