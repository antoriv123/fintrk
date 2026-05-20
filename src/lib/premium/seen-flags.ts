const PREFIX = 'fintrk.premium.seen';

export type SeenKey =
  | 'onboarding-welcome'
  | 'first-expense'
  | 'milestone';

function buildKey(key: SeenKey, param?: string | number): string {
  return param !== undefined ? `${PREFIX}.${key}.${param}` : `${PREFIX}.${key}`;
}

export function hasSeen(key: SeenKey, param?: string | number): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(buildKey(key, param)) === '1';
  } catch {
    return false;
  }
}

export function markSeen(key: SeenKey, param?: string | number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildKey(key, param), '1');
  } catch {
    // ignore: localStorage bloqueado (modo privado, quota, etc.)
  }
}

export function clearSeen(key: SeenKey, param?: string | number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildKey(key, param));
  } catch {
    // ignore
  }
}
