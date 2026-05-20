import { describe, it, expect } from 'vitest';
import { currentMonthKey, prevMonthKey } from '../month-celebration';

describe('month-celebration keys', () => {
  it('currentMonthKey formato YYYY-MM', () => {
    const d = new Date(2026, 3, 20);
    expect(currentMonthKey(d)).toBe('2026-04');
  });

  it('prevMonthKey cruza año en enero', () => {
    const d = new Date(2026, 0, 2);
    expect(prevMonthKey(d)).toBe('2025-12');
  });

  it('prevMonthKey dentro del año', () => {
    const d = new Date(2026, 3, 20);
    expect(prevMonthKey(d)).toBe('2026-03');
  });
});
