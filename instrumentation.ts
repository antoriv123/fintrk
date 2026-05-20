/**
 * Next.js instrumentation hook (runs once at server startup).
 * Validates required env vars in production and crashes loudly if missing.
 * Lets dev environments boot without all secrets.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const env = process.env.NODE_ENV ?? "development";
  if (env !== "production") {
    console.log("[fintrk] dev mode — skipping strict env validation");
    return;
  }

  // Hard-required: app no arranca sin estos. Incluye pagos (RevenueCat),
  // push iOS (APNs) y observabilidad (Sentry). Sin cualquiera de ellos, una
  // parte critica del producto esta rota en prod y preferimos un crash
  // visible en deploy a un fallo silencioso en runtime (ej: paywall que no
  // abre = rechazo App Store 2.1, push sin auth = sin alertas).
  const required = [
    // Core
    "DATABASE_URL",
    "JWT_SECRET",
    "CRON_SECRET",
    "OPENAI_API_KEY",
    // Pagos / IAP
    "NEXT_PUBLIC_REVENUECAT_API_KEY_IOS",
    "REVENUECAT_SECRET_KEY",
    "REVENUECAT_WEBHOOK_SECRET",
    // Push iOS (APNs)
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_KEY",
    "APNS_ENV",
    // Observabilidad
    "SENTRY_DSN",
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    const msg = `Missing required env vars in production: ${missing.join(", ")}`;
    console.error(`[fintrk startup] ${msg}`);
    throw new Error(msg);
  }

  // Opcional: emails y push web. La app funciona sin ellos pero con features
  // degradadas. REVENUECAT_PUBLIC_KEY se elimino (nombre obsoleto — el valor
  // real esta en NEXT_PUBLIC_REVENUECAT_API_KEY_IOS, ya en required).
  const optional = [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "RESEND_API_KEY",
  ] as const;
  const missingOptional = optional.filter((k) => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(
      `[fintrk startup] optional env vars missing — features will be degraded: ${missingOptional.join(", ")}`,
    );
  }

  console.log("[fintrk startup] env validated — boot OK");
}

export const onRequestError = async (
  err: unknown,
  request: { path: string; method: string },
): Promise<void> => {
  const { logError } = await import("./src/lib/log-error");
  logError(`API ${request.method} ${request.path}`, err);
};
