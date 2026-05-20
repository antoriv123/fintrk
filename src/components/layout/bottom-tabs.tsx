"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import { cn } from "@/lib/utils";
import { MoreMenu } from "./more-menu";
import { Plus } from "lucide-react";
import { haptic } from "@/lib/premium/haptics";
import { useT } from "@/lib/i18n";

export function BottomTabs() {
  const pathname = usePathname();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;

  const TABS = [
    { href: "/dashboard", label: t("dashboard"), icon: "LayoutDashboard" },
    { href: "/transactions", label: t("transactions"), icon: "ArrowUpDown" },
    { href: "/transactions/new", label: t("addManual"), icon: "Plus", isFab: true },
    { href: "/accounts", label: t("accounts"), icon: "Wallet" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom" aria-label="Navegacion principal">
      {/* Glass background */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl border-t border-white/[0.06]" />

      <div className="relative flex items-end justify-around h-16 px-1">
        {TABS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");

          /* Center FAB button */
          if (item.isFab) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => haptic.nav()}
                aria-label={item.label}
                className="relative -mt-5 flex flex-col items-center justify-end h-full"
              >
                {/* Glow */}
                <span className="absolute top-0 w-12 h-12 rounded-2xl bg-[#2D6A4F]/25 blur-lg" aria-hidden />
                {/* Button */}
                <span className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2D6A4F] to-[#245A42] shadow-lg shadow-[#2D6A4F]/30 active:scale-90 transition-transform duration-150 mb-2">
                  <Plus size={26} className="text-white" strokeWidth={2.5} />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => haptic.nav()}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 w-16 h-full transition-all duration-200 ease-out",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:scale-90"
              )}
            >
              {active && (
                <span className="absolute top-1.5 w-10 h-8 rounded-2xl bg-primary/12" />
              )}
              <span className="relative z-10">
                <NavIcon
                  name={item.icon}
                  size={22}
                  active={active}
                  className={cn(
                    "transition-all duration-200",
                    active && "drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]"
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-[10px] leading-none tracking-wide transition-all duration-200",
                  active ? "font-semibold text-primary" : "font-normal"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        <MoreMenu />
      </div>
    </nav>
  );
}
