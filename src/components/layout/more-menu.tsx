"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-icon";
import { MORE_ITEMS } from "@/lib/navigation";
import { features } from "@/lib/platform";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import useSWR from "swr";
import { haptic } from "@/lib/premium/haptics";

const SECTION_ORDER = ["manage", "reports", "intelligence", "config"] as const;

export function MoreMenu() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [open, setOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSWR<{ user: { role?: string } | null }>("/api/auth/session");
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    setIsStandalone(!features.showInstallPrompt());
  }, []);

  const visibleItems = MORE_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.href === "/install" && isStandalone) return false;
    return true;
  });
  const isMoreActive = visibleItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  // Group by section in defined order
  const sections = SECTION_ORDER.map((key) => ({
    key,
    items: visibleItems.filter((item) => item.section === key),
  })).filter((s) => s.items.length > 0);

  let itemIndex = 0;

  return (
    <>
      <button
        onClick={() => { haptic.nav(); setOpen(true); }}
        aria-label={t("more")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 w-16 h-full transition-all duration-200 ease-out",
          isMoreActive
            ? "text-primary"
            : "text-muted-foreground active:scale-90"
        )}
      >
        {isMoreActive && (
          <span className="absolute top-1.5 w-10 h-8 rounded-2xl bg-primary/12" />
        )}
        <span className="relative z-10">
          <NavIcon
            name="Menu"
            size={22}
            active={isMoreActive}
            className={cn(
              "transition-all duration-200",
              isMoreActive && "drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]"
            )}
          />
        </span>
        <span
          className={cn(
            "text-[10px] leading-none tracking-wide transition-all duration-200",
            isMoreActive ? "font-semibold text-primary" : "font-normal"
          )}
        >
          {t("more")}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex justify-end items-center px-3"
          role="dialog"
          aria-modal="true"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
          }}
        >
          {/* Backdrop — cierra al tocar fuera */}
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
          />

          {/* Drawer — card flotante, altura solo la del contenido
              (max 80dvh), con bordes redondeados. El backdrop se ve
              por encima y por debajo, así no cubre toda la pantalla. */}
          <aside className="relative w-[85%] max-w-[380px] max-h-full bg-background shadow-2xl rounded-2xl overflow-hidden flex flex-col drawer-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between pl-6 pr-3 pt-4 pb-3 shrink-0">
              <h2 className="text-base font-bold">{t("more")}</h2>
              <button
                onClick={() => { haptic.tap(); setOpen(false); }}
                aria-label={t("close")}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors active:scale-90"
              >
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            {/* Lista — scroll interno si la lista excede el alto máximo. */}
            <div className="flex-1 overflow-y-auto pl-5 pr-3 pb-5">
              <div className="flex flex-col gap-3">
                {sections.map((section) => (
                  <div key={section.key} className="flex flex-col">
                    {section.items.map((item) => {
                      const active = pathname === item.href;
                      const delay = itemIndex * 35;
                      itemIndex++;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => { haptic.nav(); setOpen(false); }}
                          className={cn(
                            "flex items-center gap-3.5 pl-2 pr-3 py-2.5 rounded-xl transition-all active:scale-[0.98] animate-in fade-in slide-in-from-right-4 duration-500",
                            active
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted/40 text-foreground/80"
                          )}
                          style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center w-9 h-9 rounded-xl shrink-0",
                              active ? "bg-primary/15" : "bg-muted/50"
                            )}
                          >
                            <NavIcon
                              name={item.icon}
                              size={17}
                              className={active ? "text-primary" : "text-foreground/60"}
                            />
                          </span>
                          <span
                            className={cn(
                              "text-sm font-medium flex-1 truncate",
                              active ? "text-primary" : "text-foreground/85"
                            )}
                          >
                            {t(item.labelKey) || item.label}
                          </span>
                        </Link>
                      );
                    })}
                    {/* Separador entre secciones */}
                    <div className="h-px bg-border/50 ml-2 mr-3 mt-1.5" />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
