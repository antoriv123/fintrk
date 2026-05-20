-- Migration 2026-04-19: FK hardening + consent trail
-- Idempotent: safe to run multiple times. Run against Neon prod after reviewing.
--
-- What it does:
--   1. Rewrites transfers.from_transaction_id / to_transaction_id FKs with ON DELETE CASCADE.
--   2. Adds user_id FK (ON DELETE CASCADE) to push_log and import_error_reports so hard-delete cleans them.
--   3. Adds privacy_accepted_at / privacy_version columns to users (consent trail).
--
-- Apply via:
--   psql "$DATABASE_URL" -f scripts/migrate-2026-04-19.sql

BEGIN;

-- 1a. transfers.from_transaction_id -> ON DELETE CASCADE
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'transfers'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'transfers'::regclass AND attname = 'from_transaction_id'
    );
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE transfers DROP CONSTRAINT %I', fk_name);
  END IF;
  EXECUTE 'ALTER TABLE transfers ADD CONSTRAINT transfers_from_transaction_id_fkey
           FOREIGN KEY (from_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 1b. transfers.to_transaction_id -> ON DELETE CASCADE
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'transfers'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'transfers'::regclass AND attname = 'to_transaction_id'
    );
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE transfers DROP CONSTRAINT %I', fk_name);
  END IF;
  EXECUTE 'ALTER TABLE transfers ADD CONSTRAINT transfers_to_transaction_id_fkey
           FOREIGN KEY (to_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 2a. push_log.user_id FK (runtime-created table may lack it)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_log') THEN
    -- Clean any orphan rows first so ADD CONSTRAINT doesn't fail
    DELETE FROM push_log
    WHERE user_id IS NOT NULL
      AND user_id NOT IN (SELECT id FROM users);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'push_log'::regclass
        AND contype = 'f'
        AND conkey = (SELECT array_agg(attnum) FROM pg_attribute
                      WHERE attrelid = 'push_log'::regclass AND attname = 'user_id')
    ) THEN
      ALTER TABLE push_log
        ADD CONSTRAINT push_log_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 2b. import_error_reports.user_id FK (runtime-created table may lack it)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_error_reports') THEN
    DELETE FROM import_error_reports
    WHERE user_id IS NOT NULL
      AND user_id NOT IN (SELECT id FROM users);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'import_error_reports'::regclass
        AND contype = 'f'
        AND conkey = (SELECT array_agg(attnum) FROM pg_attribute
                      WHERE attrelid = 'import_error_reports'::regclass AND attname = 'user_id')
    ) THEN
      ALTER TABLE import_error_reports
        ADD CONSTRAINT import_error_reports_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 3. Consent trail on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;

COMMIT;
