"use client";

import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, ArrowUpDown, Wallet, Upload, FolderOpen,
  Lightbulb, PiggyBank, CalendarDays, CalendarCheck, Target, Scale,
  RefreshCw, TrendingUp, Settings2, Settings, Menu,
  Sun, Moon, CircleDot, Smartphone, Sparkles, CreditCard, Trophy,
  type LucideIcon,
} from "lucide-react";

const NAV_ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, ArrowUpDown, Wallet, Upload, FolderOpen,
  Lightbulb, PiggyBank, CalendarDays, CalendarCheck, Target, Scale,
  RefreshCw, TrendingUp, Settings2, Settings, Menu,
  Sun, Moon, CircleDot, Smartphone, Sparkles, CreditCard, Trophy,
};

export function NavIcon({ name, size = 20, className, active = false }: { name: string; size?: number; className?: string; active?: boolean }) {
  const Icon = NAV_ICON_MAP[name] ?? CircleDot;
  // `triggerId` se incrementa cada vez que el tab pasa de inactivo a activo.
  // Al aplicarse como key al <span>, React remonta el nodo y la animación
  // CSS (que es one-shot, sin infinite) se dispara de nuevo. Así las flechas
  // rebotan, los cuadrados hacen pop, etc. SÓLO en el momento del cambio,
  // no en bucle mientras la tab está activa.
  const [triggerId, setTriggerId] = useState(0);
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && !prevActive.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- increments trigger key to replay CSS animation when tab becomes active; synchronous to ensure key change before paint
      setTriggerId((t) => t + 1);
    }
    prevActive.current = active;
  }, [active]);

  return (
    <span
      key={triggerId}
      data-icon-name={name}
      data-active={active ? "1" : "0"}
      className="inline-flex nav-icon-wrapper"
    >
      <Icon size={size} strokeWidth={1.75} className={className} />
    </span>
  );
}
