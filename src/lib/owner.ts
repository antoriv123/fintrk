// Owner / operator metadata for the deployment.
//
// Open-source forks: override these via NEXT_PUBLIC_* env vars in your
// deployment. The defaults are deliberately generic placeholders so that
// nothing in the repo carries the upstream maintainer's PII.
//
// These are intentionally NEXT_PUBLIC_* because they appear in the privacy
// policy, terms of service, and email footers — all of which render on the
// client.

export const OWNER_NAME =
  process.env.NEXT_PUBLIC_OWNER_NAME ?? "[Your Name]";

export const OWNER_LOCATION =
  process.env.NEXT_PUBLIC_OWNER_LOCATION ?? "[Your Location]";

export const OWNER_EMAIL =
  process.env.NEXT_PUBLIC_OWNER_EMAIL ?? "owner@example.com";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com";
