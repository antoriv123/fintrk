/**
 * Human-friendly error messages for client-side toasts and inline errors.
 * Maps error types to copy that sounds like a person, not a server.
 *
 * Usage:
 *   const msg = humanizeError("timeout", locale);
 *   toast.error(msg);
 */

export type ErrorKind =
  | "timeout"
  | "network"
  | "offline"
  | "rate_limit"
  | "invalid"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "server"
  | "ai_unavailable"
  | "unknown";

type Locale = "es" | "en";

const COPY: Record<ErrorKind, Record<Locale, { title: string; hint?: string }>> = {
  timeout: {
    es: { title: "La conexión va lenta", hint: "Reintenta en unos segundos." },
    en: { title: "The connection is slow", hint: "Try again in a few seconds." },
  },
  network: {
    es: { title: "Se nos fue la conexión", hint: "Revisa tu red y vuelve a intentarlo." },
    en: { title: "Lost connection", hint: "Check your network and try again." },
  },
  offline: {
    es: { title: "Estás sin conexión", hint: "Guardamos tus cambios y los sincronizamos cuando vuelvas." },
    en: { title: "You're offline", hint: "We'll save your changes and sync when you're back." },
  },
  rate_limit: {
    es: { title: "Espera un momento", hint: "Estás yendo rápido. Inténtalo en un rato." },
    en: { title: "Hold on a sec", hint: "You're moving fast. Try again in a moment." },
  },
  invalid: {
    es: { title: "Algo no cuadra", hint: "Revisa los datos y vuelve a probar." },
    en: { title: "Something doesn't match", hint: "Check the details and try again." },
  },
  unauthorized: {
    es: { title: "Necesitas iniciar sesión", hint: "Vuelve a entrar con tu cuenta." },
    en: { title: "You need to sign in", hint: "Sign in again to continue." },
  },
  forbidden: {
    es: { title: "No tienes acceso a esto" },
    en: { title: "You don't have access to this" },
  },
  not_found: {
    es: { title: "No encontramos lo que buscas" },
    en: { title: "We couldn't find that" },
  },
  server: {
    es: { title: "Algo falló de nuestro lado", hint: "Ya lo estamos mirando — prueba en un minuto." },
    en: { title: "Something broke on our side", hint: "We're looking into it — try again in a minute." },
  },
  ai_unavailable: {
    es: { title: "La IA está ocupada", hint: "Intenta de nuevo en unos segundos." },
    en: { title: "The AI is busy", hint: "Try again in a few seconds." },
  },
  unknown: {
    es: { title: "Algo no fue bien", hint: "Vuelve a intentarlo." },
    en: { title: "Something went wrong", hint: "Please try again." },
  },
};

/** Returns { title, hint } for the given kind + locale. */
export function humanizeError(kind: ErrorKind, locale: Locale = "es"): { title: string; hint?: string } {
  return COPY[kind]?.[locale] ?? COPY.unknown[locale];
}

/**
 * Best-effort classification of unknown errors. Inspects common shapes
 * (fetch Response, Error, status codes, reason strings) and maps to ErrorKind.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifyError(e: any): ErrorKind {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const msg = typeof e === "string" ? e : e?.message ?? e?.error ?? "";
  const status: number | undefined = e?.status ?? e?.statusCode;

  if (/aborterror|timeout/i.test(msg)) return "timeout";
  if (/networkerror|failed to fetch|load failed/i.test(msg)) return "network";
  if (status === 401 || /unauthorized/i.test(msg)) return "unauthorized";
  if (status === 403 || /forbidden/i.test(msg)) return "forbidden";
  if (status === 404 || /not\s*found/i.test(msg)) return "not_found";
  if (status === 429 || /rate[_ ]?limit|too many requests/i.test(msg)) return "rate_limit";
  if (status && status >= 500) return "server";
  if (status && status >= 400) return "invalid";
  if (/openai|claude|anthropic|model/i.test(msg)) return "ai_unavailable";
  return "unknown";
}
