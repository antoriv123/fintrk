// Input sanitization for user-facing data
// Strips HTML/script tags, trims whitespace, enforces max lengths

// Remove HTML tags and script content
export function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

// Sanitize a text field: strip HTML, trim, enforce max length
export function sanitizeText(input: unknown, maxLength = 500): string {
  if (typeof input !== "string") return "";
  return stripHtml(input).slice(0, maxLength);
}

// Validate and parse a positive number
export function parsePositiveNumber(input: unknown): number | null {
  if (typeof input === "number") {
    return input > 0 && isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const n = parseFloat(input);
    return !isNaN(n) && n > 0 && isFinite(n) ? n : null;
  }
  return null;
}

// Validate a number (can be zero or negative)
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") {
    return isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const n = parseFloat(input);
    return !isNaN(n) && isFinite(n) ? n : null;
  }
  return null;
}

// Validate a date string (YYYY-MM-DD)
export function validateDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(trimmed + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 2000 || year > new Date().getFullYear() + 1) return null;
  return trimmed;
}

// Validate direction
export function validateDirection(input: unknown): "income" | "expense" | null {
  if (input === "income" || input === "expense") return input;
  return null;
}

// Validate currency
export function validateCurrency(input: unknown): string {
  if (typeof input !== "string") return "EUR";
  const upper = input.trim().toUpperCase().slice(0, 3);
  const allowed = ["EUR", "USD", "GBP"];
  return allowed.includes(upper) ? upper : "EUR";
}

// Sanitize a slug (alphanumeric + hyphens only)
export function sanitizeSlug(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50);
}

// Validate expense type
export function validateExpenseType(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const allowed = ["necesario", "negocio", "discrecional"];
  return allowed.includes(input) ? input : null;
}
