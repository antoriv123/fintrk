"use client";

import { useEffect, useState } from "react";

const COLORS = ["#2D6A4F", "#4ADE80", "#F4A261", "#0EA5E9", "#14B8A6", "#E76F51", "#10B981"];

interface ConfettiPiece {
  id: number;
  left: string;
  color: string;
  width: string;
  height: string;
  duration: string;
  delay: string;
}

export function Confetti({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears confetti pieces synchronously when deactivated to prevent stale display
      setPieces([]);
      return;
    }

    const newPieces = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: `${Math.random() * 8 + 5}px`,
      height: `${Math.random() * 8 + 5}px`,
      duration: `${Math.random() * 2 + 1.5}s`,
      delay: `${Math.random() * 0.8}s`,
    }));

    setPieces(newPieces);
    const timer = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(timer);
  }, [active]);

  if (pieces.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute -top-5 rounded-sm"
          style={{
            left: p.left,
            background: p.color,
            width: p.width,
            height: p.height,
            animation: `confetti-drop ${p.duration} ${p.delay} linear forwards`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-drop {
          0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(600px) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
