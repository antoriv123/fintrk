/**
 * Alias de colores para cuentas antiguas.
 *
 * La regla de marca de Fintrk prohíbe morado, violeta e índigo en toda la app
 * (ver decision log 2026-04-23). Cambiamos los defaults en `banks-by-country.ts`
 * y `categories.ts`, pero las cuentas creadas ANTES del cambio tienen colores
 * morados/índigo persistidos en DB (ej. Revolut `#7c3aed`).
 *
 * Este helper los traduce en render-time a colores de la paleta oficial,
 * evitando una migración SQL ahora. La migración definitiva se aplicará
 * cuando se ejecute `scripts/migrations/normalize-account-colors.sql`.
 */

const BANNED_TO_APPROVED: Record<string, string> = {
  // Revolut — azul oficial alterno en lugar del violeta brand.
  "#7c3aed": "#0075EB",
  "#8b5cf6": "#0EA5E9",
  "#a78bfa": "#38BDF8",
  // Índigo default antiguo que nacía en cuentas custom.
  "#6366f1": "#6b7280",
  "#4f46e5": "#0EA5E9",
  "#818cf8": "#38BDF8",
};

export function normalizeAccountColor(color?: string | null): string {
  if (!color) return "#6b7280";
  const key = color.trim().toLowerCase();
  return BANNED_TO_APPROVED[key] ?? color;
}
