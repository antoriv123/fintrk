"use client";
import { motion } from "motion/react";
import { useMemo, useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/premium/motion";

interface ParticlesProps {
  count?: number;
  color?: string;
  durationMs?: number;
}

export function Particles({ count = 14, color = "bg-amber-400", durationMs = 1000 }: ParticlesProps) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  /* eslint-disable react-hooks/purity -- Math.random() calls inside useMemo are intentional:
     particle positions computed once per count change for visual variety */
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const distance = 110 + Math.random() * 70;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const size = 6 + Math.random() * 6;
        const delay = Math.random() * 0.12;
        return { x, y, size, delay, id: i };
      }),
    [count],
  );
  /* eslint-enable react-hooks/purity */

  if (reduced) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute rounded-full ${color}`}
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1, 0.7] }}
          transition={{ duration: durationMs / 1000, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}
