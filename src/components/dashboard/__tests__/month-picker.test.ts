import { describe, it, expect } from 'vitest';
import { monthToRange, isCurrentMonth } from '../month-picker';

describe('monthToRange', () => {
  it('abril tiene 30 dias', () => {
    expect(monthToRange({ year: 2026, month: 4 })).toEqual({
      from: '2026-04-01',
      to: '2026-04-30',
    });
  });

  it('febrero no bisiesto', () => {
    expect(monthToRange({ year: 2025, month: 2 })).toEqual({
      from: '2025-02-01',
      to: '2025-02-28',
    });
  });

  it('febrero bisiesto 2024', () => {
    expect(monthToRange({ year: 2024, month: 2 })).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('diciembre tiene 31 dias', () => {
    expect(monthToRange({ year: 2025, month: 12 })).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('isCurrentMonth', () => {
  it('true si coincide año y mes con now', () => {
    const now = new Date(2026, 3, 20); // abril 2026
    expect(isCurrentMonth({ year: 2026, month: 4 }, now)).toBe(true);
  });
  it('false si el mes difiere', () => {
    const now = new Date(2026, 3, 20);
    expect(isCurrentMonth({ year: 2026, month: 3 }, now)).toBe(false);
  });
});
