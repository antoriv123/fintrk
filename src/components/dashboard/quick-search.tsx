"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Search, X } from "lucide-react";
import { useFetch, getMonthRange } from "@/hooks/use-fetch";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { useT, useLocaleCode } from "@/lib/i18n";
import { haptic } from "@/lib/premium/haptics";
import type { Transaction } from "@/lib/db";

function fmtLocale(n: number, localeCode: string) {
  const isRound = n % 1 === 0;
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: isRound ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function QuickSearch() {
  const t = useT();
  const localeCode = useLocaleCode();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim().toLowerCase()), 180);
    return () => clearTimeout(id);
  }, [query]);

  // Últimos 90 días, hasta 200 transacciones.
  const now = new Date();
  const past = new Date(now.getTime() - 90 * 86_400_000);
  const from = past.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  // Solo fetch cuando el modal está abierto.
  const url = open ? `/api/transactions?from=${from}&to=${to}&limit=200` : null;
  const { data } = useFetch<Transaction[]>(url);

  const results = useMemo(() => {
    if (!debounced) return [];
    const rows = data ?? [];
    const q = debounced;
    return rows.filter((tx) => {
      const desc = (tx.description ?? "").toLowerCase();
      const cat = (tx.category ?? "").toLowerCase();
      return desc.includes(q) || cat.includes(q);
    }).slice(0, 40);
  }, [data, debounced]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  // Fallback range usage - silence lint
  void getMonthRange;

  return (
    <>
      <button
        type="button"
        onClick={() => { haptic.tap(); setOpen(true); }}
        aria-label={t("search")}
        className="w-9 h-9 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center active:scale-90 transition-transform"
      >
        <Search size={16} className="text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[120] bg-background"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
              <div className="flex-1 flex items-center gap-2 rounded-full bg-muted/50 px-3 py-2">
                <Search size={15} className="text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear"
                    className="w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center"
                  >
                    <X size={12} className="text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto h-[calc(100dvh-64px)] pb-8">
              {!debounced && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("searchHint")}
                </div>
              )}
              {debounced && results.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("noResults")}
                </div>
              )}
              {results.map((tx, i) => {
                const cat = getCategoryInfo(tx.category);
                const isIncome = tx.direction === "income";
                const d = new Date(tx.date + "T00:00:00");
                const dateLabel = d.toLocaleDateString(localeCode, { day: "numeric", month: "short" });
                return (
                  <Link
                    key={tx.id}
                    href={`/transactions/detail?id=${tx.id}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 active:bg-muted/60 ${
                      i > 0 ? "border-t border-border/50" : ""
                    }`}
                  >
                    <CategoryIcon icon={cat.icon} color={cat.color} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tx.description || cat.label}</div>
                      <div className="text-[11px] text-muted-foreground">{cat.label} · {dateLabel}</div>
                    </div>
                    <span className={`font-bold text-sm tabular-nums ${isIncome ? "text-[#2D6A4F]" : "text-foreground"}`}>
                      {isIncome ? "+" : "-"}{"\u20AC"}{fmtLocale(tx.eur_amount, localeCode)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
