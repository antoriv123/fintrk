"use client";
import { useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { PremiumCtx } from "./premium-context";
import { prefersReducedMotion } from "@/lib/premium/motion";
import { Lupo } from "@/components/personality/lupo";

const MILESTONE_COPY: Record<number, { headline: string; sub: string }> = {
  7:   { headline: "Una semana",        sub: "Siete días controlando tu dinero" },
  14:  { headline: "Dos semanas",       sub: "Catorce días seguidos. Sigue así." },
  30:  { headline: "Un mes completo",   sub: "Treinta días. Esto ya es hábito." },
  100: { headline: "Cien días",         sub: "Ya no vuelves atrás." },
};

function Rays({ color, reduced }: { color: string; reduced: boolean }) {
  const rays = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        rotate: (i * 360) / 12,
        delay: i * 0.03,
      })),
    [],
  );

  if (reduced) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {rays.map((r) => (
        <motion.div
          key={r.id}
          className="absolute w-[2px] h-[180px] origin-bottom rounded-full"
          style={{
            background: `linear-gradient(to top, ${color}00 0%, ${color}ff 60%, ${color}00 100%)`,
            transform: `rotate(${r.rotate}deg) translateY(-100px)`,
            filter: "blur(0.5px)",
          }}
          initial={{ opacity: 0, scaleY: 0.4 }}
          animate={{ opacity: [0, 0.9, 0], scaleY: [0.4, 1.2, 0.6] }}
          transition={{ duration: 1.4, delay: r.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

function Sparks({ color, reduced }: { color: string; reduced: boolean }) {
  /* eslint-disable react-hooks/purity -- Math.random() calls inside useMemo are intentional:
     random positions/sizes computed once on mount for visual variety in spark effect */
  const sparks = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => {
        const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.4;
        const distance = 140 + Math.random() * 90;
        return {
          id: i,
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          size: 3 + Math.random() * 4,
          delay: 0.1 + Math.random() * 0.18,
        };
      }),
    [],
  );
  /* eslint-enable react-hooks/purity */

  if (reduced) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            background: color,
            boxShadow: `0 0 ${s.size * 2}px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0, 1, 0.4] }}
          transition={{ duration: 1.3, delay: s.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

export function OverlayCelebrate() {
  const ctx = useContext(PremiumCtx);
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sets mounted flag and reads matchMedia on mount; both required in browser context only
    setMounted(true);
    setReduced(prefersReducedMotion());
  }, []);

  const currentEvent = ctx?.currentEvent ?? null;
  const dismiss = useMemo(() => ctx?.dismiss ?? (() => {}), [ctx?.dismiss]);

  const show =
    currentEvent?.kind === "achievementUnlocked" ||
    currentEvent?.kind === "streakMilestone" ||
    currentEvent?.kind === "firstExpenseEver";

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(dismiss, 3200);
    return () => clearTimeout(timer);
  }, [show, dismiss]);

  if (!mounted || typeof document === "undefined") return null;

  const isMilestone = currentEvent?.kind === "streakMilestone";
  const isFirstExpense = currentEvent?.kind === "firstExpenseEver";
  const days = isMilestone
    ? (currentEvent as { kind: "streakMilestone"; days: number }).days
    : 0;
  const copy = isMilestone ? (MILESTONE_COPY[days] ?? { headline: `${days} días`, sub: "Sigue así." }) : null;

  // Paleta por tipo
  const palette = isMilestone
    ? {
        accent: "#FFB547",
        accentDeep: "#FF6B35",
        accentGlow: "rgba(255, 181, 71, 0.9)",
        rayColor: "rgba(255, 181, 71, 1)",
      }
    : isFirstExpense
    ? {
        accent: "#84CC16",
        accentDeep: "#2D6A4F",
        accentGlow: "rgba(132, 204, 22, 0.85)",
        rayColor: "rgba(132, 204, 22, 0.95)",
      }
    : {
        accent: "#34D399",
        accentDeep: "#059669",
        accentGlow: "rgba(52, 211, 153, 0.9)",
        rayColor: "rgba(52, 211, 153, 1)",
      };

  return createPortal(
    <AnimatePresence>
      {show && currentEvent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={dismiss}
          className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
          role="dialog"
          aria-live="polite"
          style={{
            background: "radial-gradient(ellipse at center, rgba(10, 10, 15, 0.75) 0%, rgba(0, 0, 0, 0.95) 80%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Halo radial pulsante */}
          {!reduced && (
            <motion.div
              className="pointer-events-none absolute"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: [0, 0.6, 0.35], scale: [0.3, 1.4, 1.1] }}
              transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              style={{
                width: 480,
                height: 480,
                background: `radial-gradient(circle, ${palette.accentGlow} 0%, transparent 60%)`,
                filter: "blur(60px)",
              }}
              aria-hidden
            />
          )}

          <Rays color={palette.rayColor} reduced={reduced} />
          <Sparks color={palette.accent} reduced={reduced} />

          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="relative z-10 text-center"
          >
            {isFirstExpense ? (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5"
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  <span
                    className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                    style={{ color: palette.accent }}
                  >
                    Bienvenido a Fintrk
                  </span>
                </motion.div>

                <motion.div
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.1 }}
                  className="mx-auto mb-5 w-28 h-28 rounded-[28px] flex items-center justify-center bg-white/10 backdrop-blur-sm"
                  style={{
                    boxShadow: `0 12px 48px ${palette.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
                  }}
                >
                  {/* Lupo celebrando — sustituye al icono generico de dollar
                      sign para que el primer hito tenga personalidad propia. */}
                  <Lupo state="celebrate" size={104} />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h2 className="text-2xl font-bold text-white tracking-tight max-w-xs mx-auto leading-tight">
                    Tu primer gasto registrado
                  </h2>
                  <p className="mt-2 text-sm text-white/60 font-medium max-w-[260px] mx-auto leading-relaxed">
                    El primer paso para controlar tu dinero. El resto es solo seguir el hilo.
                  </p>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.35 }}
                  transition={{ delay: 1.2, duration: 0.6 }}
                  className="mt-8 text-xs text-white/50 tracking-wide"
                >
                  Toca para continuar
                </motion.p>
              </>
            ) : isMilestone ? (
              <>
                {/* Chip superior */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-4"
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  <span
                    className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                    style={{ color: palette.accent }}
                  >
                    Racha desbloqueada
                  </span>
                </motion.div>

                {/* Numero gigante con gradiente */}
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
                  className="relative"
                >
                  <div
                    className="text-[144px] leading-none font-black tabular-nums tracking-tight"
                    style={{
                      background: `linear-gradient(180deg, ${palette.accent} 0%, ${palette.accentDeep} 100%)`,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: `drop-shadow(0 0 40px ${palette.accentGlow})`,
                    }}
                  >
                    {days}
                  </div>
                </motion.div>

                {/* Headline + sub */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-3"
                >
                  <h2 className="text-3xl font-bold text-white tracking-tight">
                    {copy?.headline}
                  </h2>
                  <p className="mt-2 text-base text-white/60 font-medium">
                    {copy?.sub}
                  </p>
                </motion.div>

                {/* Tap to dismiss hint */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.35 }}
                  transition={{ delay: 1.2, duration: 0.6 }}
                  className="mt-8 text-xs text-white/50 tracking-wide"
                >
                  Toca para continuar
                </motion.p>
              </>
            ) : (
              <>
                {/* Achievement unlocked */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-5"
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  <span
                    className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                    style={{ color: palette.accent }}
                  >
                    Logro desbloqueado
                  </span>
                </motion.div>

                <motion.div
                  initial={{ scale: 0, rotate: -12 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
                  className="mx-auto mb-5 w-24 h-24 rounded-3xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${palette.accent} 0%, ${palette.accentDeep} 100%)`,
                    boxShadow: `0 10px 40px ${palette.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
                  }}
                >
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                    <path d="M4 22h16"></path>
                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                  </svg>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h2 className="text-2xl font-bold text-white tracking-tight max-w-xs mx-auto leading-tight">
                    {(currentEvent as { kind: "achievementUnlocked"; title: string }).title}
                  </h2>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.35 }}
                  transition={{ delay: 1.2, duration: 0.6 }}
                  className="mt-8 text-xs text-white/50 tracking-wide"
                >
                  Toca para continuar
                </motion.p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
