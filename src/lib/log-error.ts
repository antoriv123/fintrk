/**
 * Lightweight error reporter. If SENTRY_DSN is set, sends a minimal envelope
 * to Sentry's HTTP endpoint. Otherwise falls back to console.error. This
 * keeps the dependency footprint flat (no @sentry/nextjs install needed for
 * a first iteration) while giving us a single funnel to observe production
 * errors. Replace with the official SDK when dependency budget allows.
 */
type Extras = Record<string, unknown> | undefined;

function parseDsn(dsn: string): { url: string; key: string; projectId: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId || !u.username) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      key: u.username,
      projectId,
    };
  } catch {
    return null;
  }
}

export function logError(message: string, error?: unknown, extras?: Extras): void {
  const errMsg = error instanceof Error ? error.message : (error == null ? "" : String(error));
  const stack = error instanceof Error ? error.stack : undefined;

  // Always log to stdout for Vercel logs.
  console.error(`[fintrk] ${message}${errMsg ? ` — ${errMsg}` : ""}`, extras ?? "");

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;

  const env = process.env.NODE_ENV ?? "production";
  const release = process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    environment: env,
    release,
    message: { formatted: message },
    exception: error
      ? {
          values: [{ type: "Error", value: errMsg, stacktrace: stack ? { frames: parseStack(stack) } : undefined }],
        }
      : undefined,
    extra: extras,
  };

  // Fire-and-forget. Sentry rate-limit can throw, never propagate.
  const auth = `Sentry sentry_version=7,sentry_key=${parsed.key},sentry_client=fintrk-light/0.1`;
  fetch(parsed.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sentry-Auth": auth },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function parseStack(stack: string): { filename?: string; function?: string; lineno?: number }[] {
  return stack
    .split("\n")
    .slice(1)
    .map((line) => {
      const m = line.match(/at\s+(.*?)\s+\((.*?):(\d+):\d+\)/) || line.match(/at\s+(.*?):(\d+):\d+/);
      if (!m) return { function: line.trim() };
      if (m.length === 4) return { function: m[1], filename: m[2], lineno: Number(m[3]) };
      return { filename: m[1], lineno: Number(m[2]) };
    })
    .reverse()
    .slice(0, 30);
}
