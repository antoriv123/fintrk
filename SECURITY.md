# Security Policy

## Reporting a Vulnerability

Please do NOT open a public GitHub issue for security vulnerabilities.

Use GitHub's **private vulnerability reporting** instead: go to the [Security tab](https://github.com/antoriv123/fintrk/security) and click **Report a vulnerability**. We aim to acknowledge reports within 72 hours.

If private reporting is unavailable, email the maintainer (address in the repo's `package.json` `repository` URL → contact via GitHub profile).

When reporting, please include:

- Description of the vulnerability and its impact
- Steps to reproduce
- Affected versions (commit SHA or tag)
- Any proposed mitigation

## Scope

In scope:

- The Fintrk web application source code in this repository
- The database schema in `src/lib/schema.sql`
- The dependency graph declared in `package.json`

Out of scope:

- Vulnerabilities in deployed instances (e.g. `fintrk.app`) — report directly to that instance's operator
- Social engineering attacks
- Findings from automated scanners without a reproducible scenario

## Known upstream issues (informational)

These packages have known CVEs without upstream fixes at the time of release. They are flagged here for transparency:

- **`next`** — Several HIGH-severity CVEs are tracked in [Next.js advisories](https://github.com/vercel/next.js/security/advisories). Keep `next` on the latest patch release.
- **`xlsx`** — Two HIGH CVEs (CVE-2023-30533, CVE-2024-22363) without official fix. Workarounds: validate XLSX inputs are user-uploaded only (never machine-to-machine), and limit upload size.
- **`pdf-parse`** / **`pdfjs-dist`** — Past advisories on malformed PDFs. Validate file size + only parse user-uploaded files.

Run `bun audit` or `npm audit` regularly to see current advisories. CI runs `npm audit` on every PR.

## Disclosure timeline

We follow coordinated disclosure:

1. Report acknowledged within 72 hours
2. Fix developed and tested
3. Patch released; advisory published on the GitHub Security tab
4. Public disclosure 7-14 days after patch release (depending on severity)

## Hardening recommendations for self-hosters

If you deploy your own instance of Fintrk:

- Use a long random `JWT_SECRET` (32+ bytes from `openssl rand -base64 48`)
- Restrict the database role to the minimum privileges required by `schema.sql`
- Set `CRON_SECRET` to a 32+ byte random value
- Configure `Strict-Transport-Security` and a strict CSP (defaults in `next.config.ts` are a starting point)
- Rotate `OPENAI_API_KEY` periodically and set spending caps in the OpenAI dashboard
- Back up your database off-site
