-- Finance Tracker — PostgreSQL Schema (Neon)
-- Multi-tenant: every table has user_id for data isolation

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  failed_login_attempts INTEGER DEFAULT 0,
  last_failed_login TIMESTAMPTZ,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  eur_amount DOUBLE PRECISION NOT NULL,
  direction TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  expense_type TEXT,
  date TEXT NOT NULL,
  image_path TEXT,
  telegram_message_id INTEGER,
  account TEXT,
  has_splits INTEGER DEFAULT 0,
  is_reconciled INTEGER DEFAULT 0,
  transfer_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(user_id, account);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  expense_type TEXT,
  direction TEXT NOT NULL,
  average_amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, description)
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (transaction_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON transaction_tags(tag);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'EUR',
  category TEXT DEFAULT 'suscripciones',
  billing_cycle TEXT NOT NULL,
  next_renewal TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal ON subscriptions(user_id, next_renewal);

-- Migration: add type and day_of_month columns for fixed expenses/income support
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS day_of_month INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account TEXT;

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏦',
  initial_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active INTEGER NOT NULL DEFAULT 1,
  annual_interest_rate DOUBLE PRECISION DEFAULT 0,
  interest_payment_frequency TEXT DEFAULT 'monthly',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_payment_frequency TEXT DEFAULT 'monthly';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal';

CREATE TABLE IF NOT EXISTS savings_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount DOUBLE PRECISION NOT NULL,
  current_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  deadline TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL DEFAULT 'savings',
  period TEXT NOT NULL DEFAULT 'monthly',
  reward TEXT,
  icon TEXT NOT NULL DEFAULT 'Target'
);

CREATE TABLE IF NOT EXISTS app_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS investment_positions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  account TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL REFERENCES investment_positions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  shares DOUBLE PRECISION NOT NULL,
  price_per_share DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'EUR',
  commission DOUBLE PRECISION DEFAULT 0,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_prices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'EUR',
  date TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker, date)
);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL,
  category TEXT NOT NULL,
  expense_type TEXT,
  priority INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  times_applied INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_splits (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL,
  expense_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_splits_transaction ON transaction_splits(transaction_id);

CREATE TABLE IF NOT EXISTS transfers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  to_transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'EUR',
  date TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS envelopes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  budgeted DOUBLE PRECISION DEFAULT 0,
  month TEXT NOT NULL,
  rollover INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, month)
);

CREATE TABLE IF NOT EXISTS budgets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  monthly_limit DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  cash DOUBLE PRECISION NOT NULL DEFAULT 0,
  investments DOUBLE PRECISION NOT NULL DEFAULT 0,
  savings_goals DOUBLE PRECISION NOT NULL DEFAULT 0,
  debts DOUBLE PRECISION NOT NULL DEFAULT 0,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nw_date ON net_worth_snapshots(user_id, date);

-- Daily check-in & streaks for gamification
CREATE TABLE IF NOT EXISTS daily_checkins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL, -- 'expense_logged' or 'no_expense'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  tz_offset INTEGER NOT NULL DEFAULT 2,
  invalid_at TIMESTAMPTZ,
  invalid_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_sub_invalid ON push_subscriptions(invalid_at);

CREATE TABLE IF NOT EXISTS streaks (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_checkin_date TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Last login tracking for admin panel
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2026-04-19: consent trail (GDPR art. 7)
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- 2026-04-19: runtime-created tables (push_log, import_error_reports) must have user_id FK
-- with ON DELETE CASCADE so GDPR delete-user cleans them. See scripts/migrate-2026-04-19.sql
-- for the migration on existing tables.

-- 2026-04-21: Apple Pay Shortcut ingest (personal access tokens + import log)
CREATE TABLE IF NOT EXISTS apple_pay_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'iPhone',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apple_pay_tokens_user ON apple_pay_tokens(user_id);

CREATE TABLE IF NOT EXISTS apple_pay_imports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id INTEGER REFERENCES apple_pay_tokens(id) ON DELETE SET NULL,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  external_id TEXT,
  raw_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apple_pay_imports_user ON apple_pay_imports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apple_pay_imports_ext ON apple_pay_imports(user_id, external_id) WHERE external_id IS NOT NULL;

-- 2026-04-25: custom categories que el user crea desde el flujo de
-- nuevo gasto. La tabla existia ya en BD (creada via migration ad-hoc)
-- pero faltaba en el schema canonico. Anadidas columnas icon y color
-- para el selector visual al crear categoria.
CREATE TABLE IF NOT EXISTS custom_categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'expense',
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_custom_categories_user ON custom_categories(user_id);
ALTER TABLE custom_categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE custom_categories ADD COLUMN IF NOT EXISTS color TEXT;
