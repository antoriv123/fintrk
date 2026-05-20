/**
 * Smart deduplication para import de extractos.
 *
 * Tres niveles de detección, en orden de severidad:
 *   1. Exact  — misma fecha, mismo importe, misma descripción normalizada.
 *   2. Counterparty-same-day — mismo merchant normalizado + misma fecha + importe ±0.01.
 *   3. Fuzzy  — misma fecha, importe ±0.50, descripción similar (Levenshtein normalizado ≥0.85).
 *
 * Devuelve cada tx marcada con flags para que la UI decida:
 *   - `duplicate: true` → omitir por defecto, exact o counterparty-same-day.
 *   - `possibleDuplicate: true` → marcar visualmente, usuario decide.
 *   - Ninguna → entra limpia.
 *
 * Se compara contra las tx ya en BD del usuario (existing) y contra las del mismo
 * lote de import (entre sí, por si el extracto duplica filas).
 */

export interface DedupCandidate {
  date: string;           // YYYY-MM-DD
  amount: number;         // importe, valor absoluto
  description: string;
}

export interface DedupFlags {
  duplicate: boolean;
  possibleDuplicate: boolean;
  reason?: "exact" | "counterparty-same-day" | "fuzzy";
}

export function normalizeDesc(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrae un "merchant key" de la descripción: primeras 2-3 palabras útiles.
 * Útil para detectar "MERCADONA MADRID 1234" == "MERCADONA BARCELONA 5678".
 */
export function merchantKey(s: string): string {
  const normalized = normalizeDesc(s);
  if (!normalized) return "";
  const tokens = normalized.split(" ").filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  // Solo el primer token alfa significativo: "MERCADONA MADRID 1234" y
  // "MERCADONA BARCELONA 9999" comparten clave porque el merchant es el mismo.
  return tokens[0] ?? "";
}

/**
 * Levenshtein distance. Devuelve 0-1 normalizado: 1 = idéntico, 0 = completamente distinto.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const v0: number[] = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1: number[] = new Array(b.length + 1).fill(0);

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }

  return 1 - v1[b.length] / maxLen;
}

function sameDateAmount(a: DedupCandidate, b: DedupCandidate, toleranceEur = 0.01): boolean {
  return a.date === b.date && Math.abs(a.amount - b.amount) <= toleranceEur;
}

function classify(newTx: DedupCandidate, candidates: DedupCandidate[]): DedupFlags {
  const newNorm = normalizeDesc(newTx.description);
  const newKey = merchantKey(newTx.description);

  // Exact
  for (const ex of candidates) {
    if (sameDateAmount(newTx, ex, 0.01) && normalizeDesc(ex.description) === newNorm) {
      return { duplicate: true, possibleDuplicate: false, reason: "exact" };
    }
  }

  // Counterparty same day (±0.01 eur por diferencias de comisión idénticas son raras)
  if (newKey.length >= 3) {
    for (const ex of candidates) {
      if (
        ex.date === newTx.date &&
        Math.abs(ex.amount - newTx.amount) <= 0.01 &&
        merchantKey(ex.description) === newKey
      ) {
        return { duplicate: true, possibleDuplicate: false, reason: "counterparty-same-day" };
      }
    }
  }

  // Fuzzy: misma fecha, importe ±0.50, similitud ≥0.85
  for (const ex of candidates) {
    if (ex.date !== newTx.date) continue;
    if (Math.abs(ex.amount - newTx.amount) > 0.5) continue;
    const sim = similarity(newNorm, normalizeDesc(ex.description));
    if (sim >= 0.85) {
      return { duplicate: false, possibleDuplicate: true, reason: "fuzzy" };
    }
  }

  return { duplicate: false, possibleDuplicate: false };
}

/**
 * Recorre el lote nuevo y clasifica cada fila contra el resto del lote + las existentes.
 */
export function smartDeduplicate<T extends DedupCandidate>(
  incoming: T[],
  existing: DedupCandidate[],
): (T & DedupFlags)[] {
  const accepted: DedupCandidate[] = [];
  const result: (T & DedupFlags)[] = [];

  for (const tx of incoming) {
    const candidate: DedupCandidate = {
      date: tx.date,
      amount: Math.abs(tx.amount),
      description: tx.description,
    };
    // Compara contra BD + contra las ya aceptadas en este lote (orden por aparición).
    const flags = classify(candidate, [...existing, ...accepted]);
    result.push({ ...tx, ...flags });
    if (!flags.duplicate) accepted.push(candidate);
  }

  return result;
}
