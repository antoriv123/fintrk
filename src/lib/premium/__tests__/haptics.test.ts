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

const vibrateMock = vi.fn();

vi.stubGlobal('localStorage', fakeStorage);
vi.stubGlobal('window', { localStorage: fakeStorage });
vi.stubGlobal('navigator', { vibrate: vibrateMock });

import { haptic } from '../haptics';

describe('haptic (web fallback path)', () => {
  beforeEach(() => {
    store.clear();
    vibrateMock.mockClear();
    haptic.setEnabled(true);
  });

  it('tap llama a navigator.vibrate(10)', async () => {
    await haptic.tap();
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('confirm llama a navigator.vibrate(15)', async () => {
    await haptic.confirm();
    expect(vibrateMock).toHaveBeenCalledWith(15);
  });

  it('success llama a navigator.vibrate patron corto', async () => {
    await haptic.success();
    expect(vibrateMock).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('milestone llama a navigator.vibrate patron doble', async () => {
    await haptic.milestone();
    expect(vibrateMock).toHaveBeenCalledWith([20, 100, 40]);
  });

  it('error llama a navigator.vibrate patron largo', async () => {
    await haptic.error();
    expect(vibrateMock).toHaveBeenCalledWith([50, 100, 50]);
  });

  it('no-op cuando setEnabled(false)', async () => {
    haptic.setEnabled(false);
    await haptic.success();
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('isSupported devuelve true con navigator.vibrate', () => {
    expect(haptic.isSupported()).toBe(true);
  });
});

describe('haptic scan loop', () => {
  beforeEach(() => {
    store.clear();
    vibrateMock.mockClear();
    haptic.setEnabled(true);
    haptic.setScanHapticEnabled(true);
    haptic.scanStop();
  });

  it('scanStart dispara vibrate inmediato con primer paso de la ola', () => {
    vi.useFakeTimers();
    haptic.scanStart();
    // Primer paso de la ola es 18ms.
    expect(vibrateMock).toHaveBeenCalledWith(18);
    vibrateMock.mockClear();
    vi.advanceTimersByTime(320);
    // Segundo paso crescendo
    expect(vibrateMock).toHaveBeenCalledWith(32);
    haptic.scanStop();
    vi.useRealTimers();
  });

  it('scanStop limpia el interval (no mas vibraciones tras stop)', () => {
    vi.useFakeTimers();
    haptic.scanStart();
    vibrateMock.mockClear();
    haptic.scanStop();
    vi.advanceTimersByTime(1000);
    // Solo la llamada final vibrate(0) de scanStop
    const nonZero = vibrateMock.mock.calls.filter((c) => c[0] !== 0);
    expect(nonZero.length).toBe(0);
    vi.useRealTimers();
  });

  it('scanStop sin scanStart no rompe', () => {
    expect(() => haptic.scanStop()).not.toThrow();
  });

  it('scanStart es no-op cuando setEnabled(false)', () => {
    vi.useFakeTimers();
    haptic.setEnabled(false);
    vibrateMock.mockClear();
    haptic.scanStart();
    vi.advanceTimersByTime(500);
    const nonZero = vibrateMock.mock.calls.filter((c) => c[0] !== 0);
    expect(nonZero.length).toBe(0);
    vi.useRealTimers();
  });

  it('scanStart es no-op cuando setScanHapticEnabled(false)', () => {
    vi.useFakeTimers();
    haptic.setScanHapticEnabled(false);
    vibrateMock.mockClear();
    haptic.scanStart();
    vi.advanceTimersByTime(500);
    const nonZero = vibrateMock.mock.calls.filter((c) => c[0] !== 0);
    expect(nonZero.length).toBe(0);
    vi.useRealTimers();
  });

  it('scanStart consecutivos son idempotentes (un solo timer)', () => {
    vi.useFakeTimers();
    haptic.scanStart();
    vibrateMock.mockClear();
    haptic.scanStart();
    haptic.scanStart();
    vi.advanceTimersByTime(320);
    // Con un solo timer hay exactamente una vibracion por tick
    expect(vibrateMock).toHaveBeenCalledTimes(1);
    haptic.scanStop();
    vi.useRealTimers();
  });
});
