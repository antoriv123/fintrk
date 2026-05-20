"use client";

import { useRef } from "react";
import { motion, AnimatePresence, useInView } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

// Light theme palette — keep in sync with app (#FAFAF7 / #1A1A1A / #2D6A4F).
const SURFACE = "#FFFFFF";
const SURFACE_MUTED = "#F4F4F0";
const TEXT = "#1A1A1A";
const TEXT_MUTED = "#888888";
const BORDER = "#E8E8E4";
const PRIMARY = "#2D6A4F";
const ACCENT = "#84CC16";
const DANGER = "#EF4444";

function ScanScreen() {
  return (
    <div className="flex flex-col px-3 sm:px-4 py-3 sm:py-5">
      <div
        className="w-full aspect-[4/3] rounded-xl sm:rounded-2xl flex items-center justify-center mb-2.5 sm:mb-4 overflow-hidden relative"
        style={{ backgroundColor: SURFACE_MUTED }}
      >
        <motion.div
          className="absolute left-3 right-3 h-0.5 rounded-full"
          style={{ backgroundColor: PRIMARY, opacity: 0.8 }}
          initial={{ top: "20%" }}
          animate={{ top: ["20%", "75%", "20%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="w-10 sm:w-14 h-10 sm:h-14 rounded-lg" style={{ border: `2px solid ${PRIMARY}` }} />
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px]"
          style={{ color: TEXT_MUTED }}
        >
          Apunta al ticket...
        </div>
      </div>

      <motion.div
        className="w-full rounded-lg sm:rounded-xl p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5"
        style={{ backgroundColor: SURFACE_MUTED }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.5, ease: EASE }}
      >
        <p className="text-[8px] sm:text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Detectado</p>
        {[
          { label: "Mercadona", value: "-€23.45", color: DANGER },
          { label: "Categoría", value: "Alimentación", color: PRIMARY },
          { label: "Fecha", value: "Hoy, 14:32", color: TEXT },
        ].map((row, i) => (
          <motion.div
            key={row.label}
            className="flex justify-between text-[9px] sm:text-[11px]"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.15, duration: 0.4, ease: EASE }}
          >
            <span style={{ color: TEXT_MUTED }}>{row.label}</span>
            <span className="font-semibold" style={{ color: row.color }}>{row.value}</span>
          </motion.div>
        ))}
      </motion.div>

      <motion.button
        className="mt-2 sm:mt-3 w-full py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-[9px] sm:text-xs font-semibold text-white"
        style={{ backgroundColor: PRIMARY }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.4, ease: EASE }}
      >
        Confirmar gasto
      </motion.button>
    </div>
  );
}

function DashboardScreen() {
  const BARS = [35, 20, 45, 30, 55, 25, 40];

  return (
    <div className="px-3 sm:px-4 py-3 sm:py-5 space-y-2.5 sm:space-y-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <p className="text-[8px] sm:text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Abril 2026</p>
        <p className="text-lg sm:text-2xl font-bold mt-0.5" style={{ color: TEXT }}>€1,362.87</p>
        <div className="flex gap-3 sm:gap-4 mt-1 sm:mt-2">
          <div>
            <p className="text-[8px] sm:text-[10px]" style={{ color: TEXT_MUTED }}>Ingresos</p>
            <p className="text-[10px] sm:text-xs font-semibold" style={{ color: PRIMARY }}>+€1,450</p>
          </div>
          <div>
            <p className="text-[8px] sm:text-[10px]" style={{ color: TEXT_MUTED }}>Gastos</p>
            <p className="text-[10px] sm:text-xs font-semibold" style={{ color: DANGER }}>-€87.13</p>
          </div>
        </div>
      </motion.div>

      <div className="flex items-end gap-0.5 sm:gap-1 h-8 sm:h-12">
        {BARS.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{ backgroundColor: PRIMARY, opacity: 0.75 }}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: EASE }}
          />
        ))}
      </div>

      <div className="space-y-1 sm:space-y-1.5">
        <p className="text-[8px] sm:text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Recientes</p>
        {[
          { name: "Mercadona", cat: "Alimentación", amount: "-€23.45", type: "expense" },
          { name: "Spotify", cat: "Suscripciones", amount: "-€9.99", type: "expense" },
          { name: "Salario", cat: "Transferencia", amount: "+€1,450", type: "income" },
          { name: "Uber Eats", cat: "Restaurantes", amount: "-€18.70", type: "expense" },
        ].map((tx, i) => (
          <motion.div
            key={tx.name}
            className="flex items-center justify-between py-0.5 sm:py-1"
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 + i * 0.1, duration: 0.5, ease: EASE }}
          >
            <div>
              <p className="text-[10px] sm:text-xs font-medium" style={{ color: TEXT }}>{tx.name}</p>
              <p className="text-[8px] sm:text-[10px]" style={{ color: TEXT_MUTED }}>{tx.cat}</p>
            </div>
            <span
              className="text-[10px] sm:text-xs font-semibold"
              style={{ color: tx.type === "income" ? PRIMARY : DANGER }}
            >
              {tx.amount}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function InsightsScreen() {
  return (
    <div className="px-3 sm:px-4 py-3 sm:py-5 space-y-2 sm:space-y-3">
      <motion.p
        className="text-[10px] sm:text-xs font-semibold"
        style={{ color: TEXT }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        Resumen semanal
      </motion.p>

      {[
        { text: "Gastaste ", hl: "34% más", hlc: DANGER, suffix: " en restaurantes que la semana pasada." },
        { text: "A este ritmo, acabas el mes con ", hl: "+€320", hlc: PRIMARY, suffix: " de ahorro." },
        { text: "Si reduces ocio un 15%, llegas a tu meta de ", hl: "€500/mes", hlc: TEXT, suffix: "." },
      ].map((ins, i) => (
        <motion.div
          key={i}
          className="rounded-lg sm:rounded-xl p-2 sm:p-3"
          style={{ backgroundColor: SURFACE_MUTED }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.2, duration: 0.5, ease: EASE }}
        >
          <p className="text-[9px] sm:text-[11px] leading-relaxed" style={{ color: TEXT_MUTED }}>
            {ins.text}<span className="font-semibold" style={{ color: ins.hlc }}>{ins.hl}</span>{ins.suffix}
          </p>
        </motion.div>
      ))}

      <div className="space-y-1.5 sm:space-y-2 pt-0.5">
        <motion.p
          className="text-[8px] sm:text-[10px] uppercase tracking-wider"
          style={{ color: TEXT_MUTED }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          Top categorías
        </motion.p>
        {[
          { name: "Alimentación", pct: 42, color: PRIMARY },
          { name: "Restaurantes", pct: 28, color: DANGER },
          { name: "Transporte", pct: 18, color: ACCENT },
        ].map((cat, i) => (
          <motion.div
            key={cat.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 + i * 0.12, duration: 0.4 }}
          >
            <div className="flex justify-between text-[9px] sm:text-[11px] mb-0.5 sm:mb-1">
              <span style={{ color: TEXT }}>{cat.name}</span>
              <span style={{ color: TEXT_MUTED }}>{cat.pct}%</span>
            </div>
            <div className="h-1 sm:h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: SURFACE_MUTED }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: cat.color }}
                initial={{ width: 0 }}
                animate={{ width: `${cat.pct}%` }}
                transition={{ delay: 1 + i * 0.15, duration: 0.8, ease: EASE }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const SCREENS = [ScanScreen, DashboardScreen, InsightsScreen];

export function PhoneMockup({ activeScreen = 0 }: { activeScreen?: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const Screen = SCREENS[activeScreen] ?? DashboardScreen;

  return (
    <motion.div
      ref={ref}
      className="relative mx-auto w-[170px] sm:w-[260px]"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <div
        className="relative rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl"
        style={{
          border: `3px solid ${BORDER}`,
          backgroundColor: SURFACE,
          boxShadow: "0 40px 80px -20px rgba(45, 106, 79, 0.18), 0 20px 40px -10px rgba(0,0,0,0.12)",
        }}
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-16 sm:w-24 h-3.5 sm:h-5 rounded-b-lg sm:rounded-b-2xl z-20"
          style={{ backgroundColor: TEXT }}
        />
        <div className="h-[340px] sm:h-[480px] pt-4 sm:pt-6 overflow-hidden rounded-[calc(2rem-3px)] sm:rounded-[calc(2.5rem-3px)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeScreen}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <Screen />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex justify-center py-1.5 sm:py-2">
          <div className="w-14 sm:w-24 h-0.5 sm:h-1 rounded-full" style={{ backgroundColor: BORDER }} />
        </div>
      </div>
    </motion.div>
  );
}
