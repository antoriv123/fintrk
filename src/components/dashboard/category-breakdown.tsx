"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";
import { ChevronRight, Sparkles } from "lucide-react";
import { haptic } from "@/lib/premium/haptics";
import { RecategorizeModal } from "./recategorize-modal";

// Cooldown tras usar la IA de categorizacion. Evita que el user pulse el boton
// a cada rato y gaste llamadas a OpenAI sin motivo — se reactiva pasadas 72h.
const RECATEGORIZE_COOLDOWN_MS = 72 * 60 * 60 * 1000;
const LAST_ATTEMPT_KEY = "fintrk.recategorize.lastAttempt";

export function markRecategorizeAttempt(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_ATTEMPT_KEY, String(Date.now()));
  } catch { /* ignore */ }
}

function readLastAttempt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = Number(window.localStorage.getItem(LAST_ATTEMPT_KEY) ?? 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

interface Props {
  byCategory: { category: string; total: number }[];
  totalExpenses: number;
  loading?: boolean;
  localeCode?: string;
  onRefresh?: () => void;
}

function fmtEur(n: number, localeCode = "es-ES") {
  const isRound = n % 1 === 0;
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: isRound ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function selectTopCategories(
  byCategory: { category: string; total: number }[],
  totalExpenses: number,
  topN = 5,
): {
  top: { category: string; total: number; pct: number }[];
  rest: { category: string; total: number }[];
  restTotal: number;
} {
  const sorted = [...byCategory]
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  if (totalExpenses <= 0 || sorted.length === 0) {
    return { top: [], rest: [], restTotal: 0 };
  }
  const top = sorted.slice(0, topN).map((c) => ({
    ...c,
    pct: Math.round((c.total / totalExpenses) * 100),
  }));
  const rest = sorted.slice(topN);
  const restTotal = rest.reduce((s, c) => s + c.total, 0);
  return { top, rest, restTotal };
}

export function CategoryBreakdown({ byCategory, totalExpenses, loading = false, localeCode = "es-ES", onRefresh }: Props) {
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);

  useEffect(() => {
    const last = readLastAttempt();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage on mount/modal-open to compute cooldown; must be synchronous to reflect current state immediately
    setCooldownActive(Date.now() - last < RECATEGORIZE_COOLDOWN_MS);
  }, [modalOpen]);

  if (loading) {
    return (
      <div>
        <p className="text-sm font-semibold mb-3 px-1">{t("spendingByCategory")}</p>
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-full rounded-md bg-[#2D6A4F]/5" />
          ))}
        </div>
      </div>
    );
  }

  const { top, rest, restTotal } = selectTopCategories(byCategory, totalExpenses, 5);

  if (top.length === 0) return null;

  // CTA de recategorizar: visible cuando existe "otros" con total > 0 y no
  // hemos intentado recategorizar en las ultimas 72h. Asi evitamos que el user
  // pulse el boton sin fin si la IA ya no tiene nada claro que ajustar.
  const othersItem = [...top, ...rest].find((c) => c.category === "otros");
  const othersPct = othersItem && totalExpenses > 0 ? Math.round((othersItem.total / totalExpenses) * 100) : 0;
  const showRecategorizeCta = !!othersItem && Number(othersItem.total) > 0 && !cooldownActive;

  return (
    <div>
      <p className="text-sm font-semibold mb-3 px-1">{t("spendingByCategory")}</p>
      <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        <div className="p-4 space-y-3">
          {top.map((c) => {
            const info = getCategoryInfo(c.category);
            const pct = c.pct;
            return (
              <div key={c.category} className="flex items-center gap-3">
                <CategoryIcon icon={info.icon} color={info.color} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{info.label}</span>
                    <span className="text-xs font-semibold tabular-nums">
                      {"\u20AC"}{fmtEur(c.total, localeCode)}
                      <span className="text-muted-foreground font-normal ml-1.5">{pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2D6A4F] transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: info.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {rest.length > 0 && (
            <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
              <span>+ {rest.length} {rest.length === 1 ? "categoría" : "categorías"}</span>
              <span className="tabular-nums">{"\u20AC"}{fmtEur(restTotal, localeCode)}</span>
            </div>
          )}
        </div>
        {showRecategorizeCta && (
          <button
            type="button"
            onClick={() => { haptic.tap(); setModalOpen(true); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-t border-border/50 text-xs font-semibold bg-[#2D6A4F]/5 text-[#2D6A4F] hover:bg-[#2D6A4F]/10 active:scale-[0.99] transition-all"
          >
            <Sparkles size={12} /> Categorizar “otros” con IA{othersPct > 0 ? ` (${othersPct}%)` : ""}
          </button>
        )}
        <Link
          href="/budgets"
          className="flex items-center justify-center gap-1 px-4 py-3 border-t border-border/50 text-xs text-primary font-medium hover:bg-muted/40 transition-all"
        >
          {t("viewAll")} <ChevronRight size={12} />
        </Link>
      </div>
      <RecategorizeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onApplied={() => { onRefresh?.(); }}
      />
    </div>
  );
}
