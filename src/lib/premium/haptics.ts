// Haptics generales y haptic de escaneo. Web-only (OSS edition — Capacitor removed).
// Backend: navigator.vibrate(). API publica preservada para no romper call sites.
let enabled = true;
let scanEnabled = true;

const STORAGE_KEY = 'fintrk.premium.hapticsEnabled';
const STORAGE_KEY_SCAN = 'fintrk.premium.scanHapticEnabled';

if (typeof window !== 'undefined') {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === '0') enabled = false;
    const vs = window.localStorage.getItem(STORAGE_KEY_SCAN);
    if (vs === '0') scanEnabled = false;
  } catch { /* ignore */ }
}

function webVibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate === 'function') {
    try {
      nav.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

let scanTimer: ReturnType<typeof setInterval> | null = null;
let scanVisibilityListener: (() => void) | null = null;

function reduceMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export const haptic = {
  setEnabled(value: boolean): void {
    enabled = value;
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* ignore */ }
    }
    if (!value) haptic.scanStop();
  },

  isEnabled(): boolean {
    return enabled;
  },

  setScanHapticEnabled(value: boolean): void {
    scanEnabled = value;
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY_SCAN, value ? '1' : '0'); } catch { /* ignore */ }
    }
    if (!value) haptic.scanStop();
  },

  isScanHapticEnabled(): boolean {
    return scanEnabled;
  },

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof navigator === 'undefined') return false;
    const vib = (navigator as Navigator & { vibrate?: unknown }).vibrate;
    return typeof vib === 'function';
  },

  async tap(): Promise<void> {
    if (!enabled) return;
    webVibrate(10);
  },

  async confirm(): Promise<void> {
    if (!enabled) return;
    webVibrate(15);
  },

  // "pum" — pulso medio claro para navegacion entre secciones (tabs bottom,
  // MoreMenu, cambios de seccion principales). Mas fuerte que tap/confirm
  // pero sin ser milestone (que es doble-impact reservado para celebracion).
  async nav(): Promise<void> {
    if (!enabled) return;
    webVibrate(25);
  },

  async success(): Promise<void> {
    if (!enabled) return;
    webVibrate([10, 50, 10]);
  },

  async milestone(): Promise<void> {
    if (!enabled) return;
    webVibrate([20, 100, 40]);
  },

  async error(): Promise<void> {
    if (!enabled) return;
    webVibrate([50, 100, 50]);
  },

  // Patron "ola" que simula un escaner: intensidad crescendo-decrescendo en
  // 6 pasos sobre ~2s, se repite mientras dure el escaneo. No es un pulso
  // uniforme; se siente mas organico. Idempotente.
  // Si el usuario bloquea la pantalla, se pausa automaticamente
  // (visibilitychange) para no vibrar con pantalla apagada.
  scanStart(): void {
    if (!enabled || !scanEnabled) return;
    if (reduceMotion()) return;
    if (scanTimer) return;
    // Pasos de la ola (ms). Suave -> fuerte -> suave.
    const WAVE = [18, 32, 60, 60, 32, 18];
    let i = 0;
    const tick = () => {
      const step = WAVE[i % WAVE.length];
      webVibrate(step);
      i++;
    };
    tick();
    // 320ms por paso -> ola completa ~2s.
    scanTimer = setInterval(tick, 320);

    // Listener de visibilidad: si el user bloquea pantalla, para el loop.
    // Se guarda la referencia para retirarla en scanStop().
    if (typeof document !== 'undefined' && !scanVisibilityListener) {
      scanVisibilityListener = () => {
        if (document.hidden) haptic.scanStop();
      };
      document.addEventListener('visibilitychange', scanVisibilityListener);
    }
  },

  scanStop(): void {
    const wasRunning = scanTimer !== null;
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
    if (typeof document !== 'undefined' && scanVisibilityListener) {
      document.removeEventListener('visibilitychange', scanVisibilityListener);
      scanVisibilityListener = null;
    }
    if (wasRunning && typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
      if (typeof nav.vibrate === 'function') {
        try { nav.vibrate(0); } catch { /* ignore */ }
      }
    }
  },
};
