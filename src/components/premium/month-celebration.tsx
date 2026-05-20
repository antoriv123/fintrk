"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const STORAGE_KEY = "fintrk.premium.lastMonthCelebrated";

export function currentMonthKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function prevMonthKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface Props {
  // Si el mes anterior se cerró en positivo (income >= expenses).
  positiveLastMonth: boolean;
}

export function MonthCelebration({ positiveLastMonth }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!positiveLastMonth) return;
    if (typeof window === "undefined") return;
    const now = new Date();
    // Solo el primer día del mes.
    if (now.getDate() !== 1) return;
    const prev = prevMonthKey(now);
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (seen === prev) return;
      window.localStorage.setItem(STORAGE_KEY, prev);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- triggers celebration synchronously after localStorage check; deferred update would cause the animation to miss the frame
    setShow(true);
    const id = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(id);
  }, [positiveLastMonth]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[80] pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const delay = i * 0.04;
            const xOffset = -40 + i * 8;
            return (
              <motion.span
                key={i}
                initial={{ y: -20, x: xOffset, opacity: 0, scale: 0.8 }}
                animate={{ y: 320, opacity: [0, 1, 1, 0], scale: 1 }}
                transition={{ duration: 1.4, delay, ease: "easeOut" }}
                className="absolute top-0 left-1/2 w-2 h-2 rounded-full"
                style={{ backgroundColor: i % 2 === 0 ? "#2D6A4F" : "#84CC16" }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
