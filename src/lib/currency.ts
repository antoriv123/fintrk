/**
 * Helper central para formatear monedas.
 *
 * Hasta ahora había varios lugares con `currency === "EUR" ? "€" : currency === "USD" ? "$" : currency`
 * y eso hacía que monedas como COP, MXN o ARS acabaran imprimiendo literal "COP" o cayendo al
 * fallback EUR por defecto. Esto rompía visualmente la UI para usuarios hispanohablantes fuera
 * de zona euro (p.ej. un colombiano veía "€1.234.567" en vez de "$1.234.567").
 */

const SYMBOLS: Record<string, string> = {
  EUR: "\u20AC",
  USD: "$",
  GBP: "\u00A3",
  // Monedas hispanoamericanas que usan $ como símbolo local.
  COP: "$", // peso colombiano
  MXN: "$", // peso mexicano
  ARS: "$", // peso argentino
  CLP: "$", // peso chileno
  UYU: "$", // peso uruguayo
  DOP: "$", // peso dominicano
  // Otras monedas con símbolos específicos.
  PEN: "S/", // sol peruano
  BRL: "R$", // real brasileño
  CHF: "CHF",
  JPY: "\u00A5",
  CNY: "\u00A5",
};

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return SYMBOLS.EUR;
  const code = currency.toUpperCase();
  return SYMBOLS[code] ?? code;
}

/**
 * Formatea un importe con el símbolo de la moneda correcta.
 * - `compact: true` redondea a enteros cuando el valor es entero.
 * - `localeCode` controla el separador de miles (es-ES usa punto, en-US coma).
 */
export function formatMoney(
  amount: number,
  currency?: string | null,
  localeCode = "es-ES",
  opts: { compact?: boolean } = {},
): string {
  const symbol = getCurrencySymbol(currency);
  const abs = Math.abs(amount);
  const compact = opts.compact ?? false;
  const minFrac = compact && abs % 1 === 0 ? 0 : 2;
  const formatted = abs.toLocaleString(localeCode, {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol}${formatted}`;
}
