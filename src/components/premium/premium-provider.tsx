"use client";

import { useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { haptic } from '@/lib/premium/haptics';
import { markSeen, hasSeen } from '@/lib/premium/seen-flags';
import { PremiumCtx, type HeroEvent, type PremiumAPI } from './premium-context';
import { OverlayCelebrate } from './overlay-celebrate';

/**
 * Fires a premium-styled sonner toast with green gradient and soft emphasis.
 * Fire-and-forget; errors swallowed so it never breaks a flow.
 */
export async function premiumToast(opts: { title: string; description?: string; icon?: string; duration?: number }) {
  try {
    const { toast } = await import('sonner');
    toast(opts.title, {
      description: opts.description,
      icon: opts.icon,
      duration: opts.duration ?? 2600,
      className: 'fintrk-premium-toast',
    });
  } catch { /* ignore */ }
}

export type { HeroEvent, PremiumAPI } from './premium-context';

export function usePremium(): PremiumAPI {
  const ctx = useContext(PremiumCtx);
  if (!ctx) throw new Error('usePremium must be used within <PremiumProvider>');
  return ctx;
}

const VALID_MILESTONES = new Set([7, 14, 30, 100]);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [currentEvent, setCurrentEvent] = useState<HeroEvent | null>(null);
  const lastEventAt = useRef<number>(0);

  const fire = useCallback((event: HeroEvent) => {
    const now = Date.now();
    if (currentEvent && now - lastEventAt.current < 200) return;
    lastEventAt.current = now;
    setCurrentEvent(event);
  }, [currentEvent]);

  const dismiss = useCallback(() => setCurrentEvent(null), []);

  const api = useMemo<PremiumAPI>(() => ({
    streakActivated: () => { haptic.success(); fire({ kind: 'streakActivated' }); },
    aiTouchSaved: () => {
      haptic.confirm();
      fire({ kind: 'aiTouchSaved' });
      void premiumToast({ title: 'Lo hicimos por ti', description: 'Campos rellenados con IA. Puedes editar si algo no cuadra.', icon: '✨', duration: 2200 });
    },
    onboardingWelcome: () => {
      if (hasSeen('onboarding-welcome')) return;
      markSeen('onboarding-welcome');
      haptic.success();
      fire({ kind: 'onboardingWelcome' });
      void premiumToast({ title: 'Bienvenido a Fintrk', description: 'Tu dinero es tuyo. Tu información también.', icon: '👋', duration: 3200 });
    },
    importSuccess: (count: number) => {
      haptic.success();
      fire({ kind: 'importSuccess', count });
      void premiumToast({
        title: count === 1 ? '1 movimiento importado' : `${count} movimientos importados`,
        description: 'Ya los tienes en tu historial.',
        icon: '✓',
        duration: 2600,
      });
    },
    firstExpenseEver: () => {
      if (hasSeen('first-expense')) return;
      markSeen('first-expense');
      haptic.success();
      fire({ kind: 'firstExpenseEver' });
      void premiumToast({
        title: '¡Tu primer gasto!',
        description: 'Buen comienzo. Cada registro cuenta.',
        icon: '🎉',
        duration: 3500,
      });
    },
    monthInsight: () => {
      haptic.success();
      fire({ kind: 'monthInsight' });
      void premiumToast({ title: 'Nuevo resumen del mes', description: 'Hay una historia nueva en Insights.', icon: '📊', duration: 2800 });
    },
    achievementUnlocked: (payload) => {
      haptic.milestone();
      fire({ kind: 'achievementUnlocked', title: payload.title, icon: payload.icon });
      void premiumToast({
        title: '¡Logro desbloqueado!',
        description: payload.title,
        icon: payload.icon ?? '🏆',
        duration: 3200,
      });
    },
    streakMilestone: (days: number) => {
      if (!VALID_MILESTONES.has(days)) return;
      if (hasSeen('milestone', days)) return;
      markSeen('milestone', days);
      haptic.milestone();
      fire({ kind: 'streakMilestone', days });
      // Copy diferenciado por milestone — 100 días NO se siente igual que 7.
      const copy =
        days >= 100 ? { title: '¡100 días seguidos!', description: 'Esto ya no es casualidad, es hábito.', icon: '🏔️' } :
        days >= 30  ? { title: '¡30 días de racha!', description: 'Un mes entero controlando tu dinero.', icon: '🔥' } :
        days >= 14  ? { title: '¡2 semanas!', description: 'Vas cogiendo ritmo. Sigue así.', icon: '⚡' } :
                      { title: '¡7 días seguidos!', description: 'Tu primera racha. Ya es costumbre.', icon: '✨' };
      void premiumToast({ ...copy, duration: days >= 100 ? 5000 : days >= 30 ? 4200 : 3400 });
      // Al cruzar 7 días de racha (primer milestone significativo) pedimos
      // review nativa. Apple limita a 3/año internamente; nuestro helper
      // también marca un flag idempotente.
      // in-app review removed in OSS edition
    },
    scanStarted: () => { haptic.scanStart(); },
    scanStopped: () => { haptic.scanStop(); },
    tap: () => { haptic.tap(); },
    currentEvent,
    dismiss,
  }), [currentEvent, dismiss, fire]);

  return (
    <PremiumCtx.Provider value={api}>
      {children}
      <OverlayCelebrate />
    </PremiumCtx.Provider>
  );
}
