"use client";

import { useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Lupo } from "@/components/personality/lupo";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  stats: {
    totalTx: number;
    streak: number;
    topCategory: string | null;
    monthBalance: number;
    currencySymbol: string;
  };
}

// Easter egg: triple-tap en el logo de Fintrk en el dashboard abre este
// modal. Stats curiosas + frase con humor — premia al user que descubre
// la interaccion. No tiene CTA: es puramente personalidad.
export function StatsEasterEgg({ open, onClose, stats }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  // Re-genera funFact solo en cada apertura. Usamos un ref como semilla
  // que solo cambia cuando open transiciona false -> true.
  const seedRef = useRef(0);
  const lastOpenRef = useRef(false);
  if (open && !lastOpenRef.current) {
    seedRef.current = Math.random();
  }
  lastOpenRef.current = open;
  const funFact = useMemo(() => {
    const pool = [
      t("statsFunFact1"),
      t("statsFunFact2"),
      t("statsFunFact3"),
      t("statsFunFact4"),
    ];
    return pool[Math.floor(seedRef.current * pool.length) % pool.length];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queremos recomputar cuando seedRef cambia (al abrir)
  }, [open, t]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                {t("statsEasterEggLabel")}
              </span>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 -mr-2 rounded-full hover:bg-muted/60 active:scale-90 transition-all flex items-center justify-center"
              >
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            <div className="px-5 pb-6 pt-2 flex flex-col items-center text-center gap-3">
              <Lupo state="thinking" size={96} />

              <h2 className="text-lg font-extrabold leading-tight">
                {t("statsEasterEggTitle")}
              </h2>

              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                <StatCard label={t("statsTotalTxs")} value={String(stats.totalTx)} />
                <StatCard
                  label={t("statsStreak")}
                  value={`${stats.streak}d`}
                />
                <StatCard
                  label={t("statsTopCategory")}
                  value={stats.topCategory ?? "—"}
                />
                <StatCard
                  label={t("statsMonthBalance")}
                  value={`${stats.currencySymbol}${stats.monthBalance.toFixed(0)}`}
                />
              </div>

              <p className="text-[12px] text-muted-foreground italic leading-snug mt-3">
                {funFact}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#2D6A4F]/8 border border-[#2D6A4F]/15 px-3 py-2.5 text-left">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
        {label}
      </p>
      <p className="text-sm font-extrabold tabular-nums truncate">{value}</p>
    </div>
  );
}
