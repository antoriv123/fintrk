# Contributing to Fintrk

Thanks for your interest in contributing.

## Quick rules

- Open an issue before sending a non-trivial PR. Saves both sides time.
- One concern per PR. Smaller is better.
- Tests are mandatory for new logic. Bug fixes need a regression test.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`, `ci:`).

## Local setup

```bash
bun install
cp .env.example .env.local   # fill in DATABASE_URL, JWT_SECRET, etc.
psql "$DATABASE_URL" < src/lib/schema.sql
bun run dev
```

## Quality gates (CI runs these)

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

All must pass before requesting review.

## Project layout

```
src/app/          Next.js App Router pages + route handlers
src/components/   UI components (Radix + shadcn primitives)
src/lib/          Domain logic, DB helpers, AI clients, schema.sql
scripts/          SQL migrations and one-off utilities
tests/            Playwright e2e
src/**/__tests__/ Vitest unit tests colocated with source
```

## Filing an issue

- **Bug**: include steps to reproduce, expected vs actual, environment (Node version, browser, OS).
- **Feature**: describe the problem first, then the proposed solution. Alternatives considered are a plus.
- **Security**: do NOT open a public issue. See [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree your code is released under the MIT License (see [`LICENSE`](LICENSE)).
