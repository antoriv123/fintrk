"use client";
import { motion, AnimatePresence } from "motion/react";
import { premium, prefersReducedMotion } from "@/lib/premium/motion";
import { useEffect, useState } from "react";

interface GlowProps {
  show: boolean;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<GlowProps["size"]>, string> = {
  sm: "w-24 h-24",
  md: "w-40 h-40",
  lg: "w-64 h-64",
};

export function Glow({ show, color = "bg-primary", size = "md", className = "" }: GlowProps) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads matchMedia on mount to respect prefers-reduced-motion; must run in browser context only
    setReduced(prefersReducedMotion());
  }, []);

  if (reduced) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.55, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: premium.duration.slow, ease: premium.ease.in }}
          className={`pointer-events-none absolute inset-0 m-auto ${SIZE_CLASS[size]} rounded-full ${color} blur-3xl ${className}`}
          aria-hidden
        />
      )}
    </AnimatePresence>
  );
}
