"use client";

import { useEffect, useRef, useState } from "react";
import { useLocaleCode } from "@/lib/i18n";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatOptions?: Intl.NumberFormatOptions;
  className?: string;
  prefix?: string;
}

export function AnimatedNumber({
  value,
  duration = 600,
  formatOptions = { minimumFractionDigits: 0, maximumFractionDigits: 2 },
  className,
  prefix = "",
}: AnimatedNumberProps) {
  const localeCode = useLocaleCode();
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- short-circuit: values equal, sync update avoids a no-op animation frame
      setDisplay(to);
      return;
    }

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;

      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const isRound = display % 1 === 0 && value % 1 === 0;
  const formatted = display.toLocaleString(localeCode, {
    ...formatOptions,
    minimumFractionDigits: isRound ? 0 : (formatOptions.minimumFractionDigits ?? 2),
  });

  return (
    <span className={className}>
      {prefix}{formatted}
    </span>
  );
}
