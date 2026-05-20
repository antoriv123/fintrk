# Database schema

Fintrk uses a single `schema.sql` file as the source of truth for the database. No Prisma, no ORM-generated migrations.

## Why no ORM?

- `@neondatabase/serverless` (the official Neon HTTP driver) is already a thin client. Adding Prisma adds bundle weight and a second connection pool.
- Raw SQL with tagged templates is type-safe enough for our schema size.
- Migrations live in `scripts/migrate-*.sql` (historical) and the consolidated `src/lib/schema.sql` is what you run on a fresh DB.

## Applying the schema

```bash
psql "$DATABASE_URL" < src/lib/schema.sql
```

Re-running is safe (statements use `CREATE TABLE IF NOT EXISTS`).

## Tables

| Table | Purpose |
| --- | --- |
| `users` | Auth (bcrypt hash) + role + subscription tier |
| `transactions` | Income / expense rows |
| `transaction_tags` | Many-to-many user-defined tags on transactions |
| `transaction_splits` | Split a single transaction into multiple categories |
| `recurring_transactions` | Auto-detected recurring patterns |
| `subscriptions` | Subscription tracking + fixed expenses |
| `accounts` | Bank, savings, cash accounts |
| `transfers` | Money moved between accounts |
| `savings_goals` | Goals with target amount and deadline |
| `envelopes` | Envelope budgeting |
| `budgets` | Monthly category budgets |
| `categorization_rules` | User-defined rules for auto-categorization |
| `custom_categories` | User-defined categories |
| `app_settings` | Per-user preferences |
| `investment_positions` | Portfolio holdings |
| `investment_transactions` | Buys / sells |
| `investment_prices` | Cached price history (Yahoo Finance) |
| `net_worth_snapshots` | Historical net worth |
| `daily_checkins` | Gamification — daily app open |
| `streaks` | Consecutive checkin streak per user |
| `apple_pay_tokens` | Tokens used by the Apple Pay iOS Shortcut ingest endpoint |
| `apple_pay_imports` | Audit log of Apple Pay imports |

All user-data tables include `user_id` as the multi-tenancy key. RLS is not enabled at the DB level; isolation is enforced at the application layer (`@/lib/get-user-id`).

## Foreign keys + indexes

`schema.sql` declares FK constraints with `ON DELETE CASCADE` so dropping a user removes all their data. Indexes are placed on the FK columns where read paths require them. See the inline comments in `schema.sql` for the rationale on each index.

## Future migrations

For schema changes:

1. Write a new file `scripts/migrate-YYYY-MM-DD-description.sql` with idempotent SQL (`ALTER TABLE ... IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
2. Update `src/lib/schema.sql` so a fresh DB starts at the new state.
3. Document the migration in the PR description.
