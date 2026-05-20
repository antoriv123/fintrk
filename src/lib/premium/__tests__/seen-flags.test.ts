import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: () => null,
  length: 0,
};

vi.stubGlobal('localStorage', fakeStorage);
vi.stubGlobal('window', { localStorage: fakeStorage });

import { markSeen, hasSeen, clearSeen } from '../seen-flags';

describe('seen-flags', () => {
  beforeEach(() => { store.clear(); });

  it('devuelve false si no se ha marcado', () => {
    expect(hasSeen('onboarding-welcome')).toBe(false);
  });

  it('marca y recuerda', () => {
    markSeen('onboarding-welcome');
    expect(hasSeen('onboarding-welcome')).toBe(true);
  });

  it('keys con parametro', () => {
    markSeen('milestone', 7);
    expect(hasSeen('milestone', 7)).toBe(true);
    expect(hasSeen('milestone', 14)).toBe(false);
  });

  it('clearSeen borra un flag', () => {
    markSeen('first-expense');
    clearSeen('first-expense');
    expect(hasSeen('first-expense')).toBe(false);
  });
});
