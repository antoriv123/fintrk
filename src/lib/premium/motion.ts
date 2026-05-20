import type { Transition } from 'motion/react';

export const premium = {
  spring: {
    snappy: { type: 'spring', stiffness: 400, damping: 26 } as Transition,
    soft:   { type: 'spring', stiffness: 180, damping: 22 } as Transition,
    bounce: { type: 'spring', stiffness: 260, damping: 14 } as Transition,
  },
  ease: {
    in:  [0.22, 1, 0.36, 1] as [number, number, number, number],
    out: [0.32, 0, 0.67, 0] as [number, number, number, number],
  },
  duration: {
    fast: 0.16,
    base: 0.24,
    slow: 0.42,
    celebrate: 0.9,
  },
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('fintrk.premium.reduceMotion') === '1') return true;
  } catch {
    // ignore
  }
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
