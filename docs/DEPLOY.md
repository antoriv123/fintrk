# Deploying Fintrk

Recommended stack: **Vercel** (hosting + cron) + **Neon** (PostgreSQL).

## 1. Create the database

1. Sign up at [neon.tech](https://neon.tech) (free tier is sufficient).
2. Create a project. Note the connection string (it looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`).
3. Apply the schema:

   ```bash
   psql "$DATABASE_URL" < src/lib/schema.sql
   ```

   You can also paste `schema.sql` into the Neon SQL editor.

## 2. Set up Vercel

1. Push this repo to your GitHub account (fork or clone).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Vercel auto-detects Next.js. Use the default build settings.

## 3. Environment variables

In Vercel **Settings → Environment Variables**, add at minimum:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon connection string from step 1 |
| `JWT_SECRET` | 32+ random bytes — `openssl rand -base64 48` |
| `CRON_SECRET` | 32+ random bytes — `openssl rand -base64 48` |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `NEXT_PUBLIC_OWNER_NAME` | Your name (data controller) |
| `NEXT_PUBLIC_OWNER_LOCATION` | Your jurisdiction (city, country) |
| `NEXT_PUBLIC_OWNER_EMAIL` | Privacy contact email |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Support contact email |

Optional:

| Name | Value |
| --- | --- |
| `SENTRY_DSN` | Sentry DSN for error tracking |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `IMPORT_ERROR_REPORT_TO` | Email to receive import-error reports |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

## 4. Cron jobs

`vercel.json` declares 4 cron jobs that run on Vercel's free Hobby cron tier:

- `streak-reminder` — daily 19:00 UTC
- `weekly-recap` — Mondays 09:00 UTC
- `reengagement` — daily 17:00 UTC
- `purge-import-errors` — Mondays 04:00 UTC

Vercel calls these with `Authorization: Bearer $CRON_SECRET`. Make sure `CRON_SECRET` is set in your project env vars.

## 5. Deploy

```bash
vercel --prod
```

Or push to `main` and Vercel auto-deploys.

## 6. First user

Open your deployment URL and use `/register` to create the first account. The first registered user is granted `role = "admin"` (see `schema.sql`).

## Troubleshooting

- **`tsc` errors during build**: run `bun run typecheck` locally to see them. CI also runs this check.
- **`schema.sql` partially applied**: drop and recreate the database, then re-run. The schema is not yet split into individual migrations.
- **OpenAI errors**: verify `OPENAI_API_KEY` is set and has billing configured at [platform.openai.com](https://platform.openai.com).
- **Service Worker not updating**: clear the browser's Application → Service Workers tab, or hard-refresh (Cmd+Shift+R).
