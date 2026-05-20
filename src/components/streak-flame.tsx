"use client";

interface StreakFlameProps {
  lit: boolean;
  streak?: number;
  size?: number;
  withRing?: boolean;
  withSparks?: boolean;
  className?: string;
}

export function StreakFlame({
  lit,
  streak = 0,
  size = 28,
  withRing = false,
  withSparks = false,
  className = "",
}: StreakFlameProps) {
  const intense = lit && streak >= 30;
  const animClass = !lit ? "" : intense ? "streak-flame-intense" : "streak-flame-lit";

  const coreTop = lit ? (intense ? "#FF4D00" : "#FFD23F") : "transparent";
  const coreMid = lit ? (intense ? "#FF7A00" : "#F7931E") : "transparent";
  const coreBottom = lit ? (intense ? "#E63900" : "#FF6B35") : "transparent";
  const strokeColor = lit ? "transparent" : "currentColor";

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {withRing && lit && (
        <span
          className="streak-flame-ring absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${intense ? "rgba(255,77,0,0.32)" : "rgba(255,107,53,0.28)"} 0%, transparent 70%)`,
          }}
        />
      )}

      <svg
        className={animClass}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ transformOrigin: "50% 85%", color: lit ? coreBottom : "var(--muted-foreground)" }}
      >
        <defs>
          <linearGradient id={`flame-gradient-${intense ? "intense" : "normal"}`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={coreTop} stopOpacity={lit ? 1 : 0} />
            <stop offset="55%" stopColor={coreMid} stopOpacity={lit ? 1 : 0} />
            <stop offset="100%" stopColor={coreBottom} stopOpacity={lit ? 1 : 0} />
          </linearGradient>
        </defs>

        <path
          d="M12 2C11 6 7 7.5 7 12.5c0 3.5 2.5 7 5 7.5 2.5-.5 5-4 5-7.5 0-3-2-5-3-7.5-.5 1.5-1 2.5-2 3.5-.5-2-.5-4 0-6.5z"
          fill={`url(#flame-gradient-${intense ? "intense" : "normal"})`}
          stroke={strokeColor}
          strokeWidth={lit ? 0 : 1.7}
          strokeLinejoin="round"
        />
        {lit && (
          <path
            d="M12 10c-.6 1.2-1.8 2-1.8 3.8 0 1.3 1 2.4 1.8 2.6.8-.2 1.8-1.3 1.8-2.6 0-1.2-.7-1.9-1.2-2.7-.3.6-.4 1-1.6 1.6-.2-.8-.2-1.6 1-2.7z"
            fill={intense ? "#FFE066" : "#FFF3B0"}
            opacity={0.85}
          />
        )}
      </svg>

      {withSparks && lit && intense && (
        <>
          <span
            className="streak-flame-spark absolute"
            style={{ left: "18%", top: "18%", width: 3, height: 3, borderRadius: 999, background: "#FFD23F", "--spark-x": "-6px", "--spark-y": "-10px", "--spark-delay": "0s" } as React.CSSProperties}
          />
          <span
            className="streak-flame-spark absolute"
            style={{ left: "70%", top: "22%", width: 2, height: 2, borderRadius: 999, background: "#FF9900", "--spark-x": "6px", "--spark-y": "-14px", "--spark-delay": "0.5s" } as React.CSSProperties}
          />
          <span
            className="streak-flame-spark absolute"
            style={{ left: "48%", top: "12%", width: 2.5, height: 2.5, borderRadius: 999, background: "#FFEA80", "--spark-x": "2px", "--spark-y": "-16px", "--spark-delay": "0.9s" } as React.CSSProperties}
          />
        </>
      )}
    </span>
  );
}
