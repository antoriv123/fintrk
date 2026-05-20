"use client";
import { useT, useLocaleCode } from "@/lib/i18n";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFetch, getMonthRange } from "@/hooks/use-fetch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import type { Transaction } from "@/lib/db";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search, X, ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";
import { FiltersSheet, type FilterValues } from "@/components/transactions/filters-sheet";
import { ActiveFiltersRow } from "@/components/transactions/active-filters-row";
import { haptic } from "@/lib/premium/haptics";
import { Lupo } from "@/components/personality/lupo";
import { formatMoney } from "@/lib/currency";

export default function TransactionsPage() {
  const t = useT();
  return (
    <Suspense fallback={<div className="p-4 text-center text-muted-foreground text-sm">{t("loading")}</div>}>
      <TransactionsContent />
    </Suspense>
  );
}

function fmtLocale(n: number, localeCode: string) {
  if (n === 0) return "0";
  const isRound = n % 1 === 0;
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: isRound ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtDateGroup(dateStr: string, t: (key: any) => string, localeCode: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return t("today");
  if (d.toDateString() === yesterday.toDateString()) return t("yesterday");
  return d.toLocaleDateString(localeCode, { weekday: "long", day: "numeric", month: "long" });
}

/** Etiqueta "Añadido hoy / ayer / el X de Y" para el modo recientes,
 *  donde agrupamos por created_at (momento del registro), no por la
 *  fecha de la transacción. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtAddedGroup(dateStr: string, t: (key: any) => string, localeCode: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return t("addedToday");
  if (d.toDateString() === yesterday.toDateString()) return t("addedYesterday");
  const human = d.toLocaleDateString(localeCode, { weekday: "long", day: "numeric", month: "long" });
  return `${t("addedOnPrefix")} ${human}`;
}

/** YYYY-MM-DD de un timestamp ISO (created_at) en zona local. */
function ymdFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Devuelve el lunes de la semana ISO de una fecha (YYYY-MM-DD). */
function weekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay(); // 0=domingo, 1=lunes, ...
  const offset = dow === 0 ? -6 : 1 - dow; // lunes como inicio
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Label del rango lunes-domingo de la semana (ej. "14-20 abr" o "28 abr-4 may"). */
function fmtWeekRange(weekStartStr: string, localeCode: string, now: Date = new Date()): { label: string; isCurrent: boolean } {
  const start = new Date(weekStartStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.toLocaleDateString(localeCode, { month: "short" }).replace(".", "");
  const endMonth = end.toLocaleDateString(localeCode, { month: "short" }).replace(".", "");
  const label = start.getMonth() === end.getMonth()
    ? `${startDay}-${endDay} ${endMonth}`
    : `${startDay} ${startMonth}-${endDay} ${endMonth}`;
  const thisWeekStart = weekStart(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
  return { label, isCurrent: weekStartStr === thisWeekStart };
}

function TransactionsContent() {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt = (n: number) => fmtLocale(n, localeCode);
  const searchParams = useSearchParams();
  const [category, setCategory] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [tag, setTag] = useState("");
  const [account, setAccount] = useState(searchParams.get("account") ?? "");
  const [from, setFrom] = useState(getMonthRange().from);
  const [to, setTo] = useState(getMonthRange().to);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  /** When true, lists the most recently added transactions (by created_at)
   * instead of filtering by date of the transaction. Shows last 30 days. */
  const [recentMode, setRecentMode] = useState(false);
  /** Dirección del último cambio de mes. Al pulsar el chevron ➡ marcamos
   *  "forward" y animamos con slide-in-from-right; ⬅ produce slide-in-from-left. */
  const [monthDir, setMonthDir] = useState<"forward" | "back">("forward");
  /** Semanas abiertas explícitamente (default: la primera de la lista,
   *  que suele ser la actual). Días CERRADOS explícitamente (default:
   *  ninguno — todos abiertos cuando su semana lo está). */
  const [openedWeeks, setOpenedWeeks] = useState<Set<string>>(new Set());
  const [closedDays, setClosedDays] = useState<Set<string>>(new Set());
  const weeksInitRef = useRef(false);
  function toggleWeek(id: string) {
    haptic.tap();
    setOpenedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleDay(id: string) {
    haptic.tap();
    setClosedDays(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filterValues: FilterValues = { account, direction, category, expenseType, tag };
  function applyFilters(next: FilterValues) {
    setAccount(next.account);
    setDirection(next.direction);
    setCategory(next.category);
    setExpenseType(next.expenseType);
    setTag(next.tag);
  }
  function clearFilter(key: keyof FilterValues) {
    if (key === "account") setAccount("");
    else if (key === "direction") setDirection("");
    else if (key === "category") setCategory("");
    else if (key === "expenseType") setExpenseType("");
    else if (key === "tag") setTag("");
  }

  const params = new URLSearchParams();
  if (recentMode) {
    // Sort by creation time across all dates — no from/to filter.
    params.set("sort", "created");
  } else {
    params.set("from", from);
    params.set("to", to);
  }
  params.set("limit", "100");
  if (category) params.set("category", category);
  if (expenseType) params.set("expense_type", expenseType);
  if (direction) params.set("direction", direction);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (tag) params.set("tag", tag);
  if (account) params.set("account", account);

  const { data: transactions, loading: txLoading, error: txError, refresh: refreshTransactions } = useFetch<Transaction[]>(`/api/transactions?${params}`);

  const accountName = useAccountName(account);

  // Month navigation
  const currentDate = new Date(from);
  const isCurrentMonth = (() => {
    const now = new Date();
    return currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth();
  })();
  const monthLabel = currentDate.toLocaleDateString(localeCode, { month: "long", year: "numeric" });

  const navigateMonth = (offset: number) => {
    haptic.nav();
    setMonthDir(offset > 0 ? "forward" : "back");
    const [year, month] = from.split("-").map(Number);
    const newMonth = month - 1 + offset; // 0-indexed
    const d = new Date(year, newMonth, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    setFrom(`${y}-${m}-01`);
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
    setTo(`${y}-${m}-${String(lastDay).padStart(2, "0")}`);
  };

  const goToday = () => {
    haptic.nav();
    const { from: f, to: t } = getMonthRange();
    setFrom(f);
    setTo(t);
  };

  // Summary
  const txs = transactions ?? [];
  const income = txs.filter(t => t.direction === "income").reduce((s, t) => s + t.eur_amount, 0);
  const expenses = txs.filter(t => t.direction === "expense").reduce((s, t) => s + t.eur_amount, 0);

  // Group transactions by week → day. Cada semana tiene su mapa de días
  // con sus transacciones, y calculamos totales por semana y por día.
  interface WeekBucket {
    weekId: string;              // lunes de la semana (YYYY-MM-DD)
    total: number;                // neto de la semana (income - expenses)
    days: Record<string, Transaction[]>;
  }
  const weeks: Record<string, WeekBucket> = {};
  for (const tx of txs) {
    const wid = weekStart(tx.date);
    if (!weeks[wid]) weeks[wid] = { weekId: wid, total: 0, days: {} };
    weeks[wid].total += tx.direction === "expense" ? -tx.eur_amount : tx.eur_amount;
    if (!weeks[wid].days[tx.date]) weeks[wid].days[tx.date] = [];
    weeks[wid].days[tx.date].push(tx);
  }
  const sortedWeeks = Object.values(weeks).sort((a, b) => b.weekId.localeCompare(a.weekId));

  // Al cambiar el set de semanas (nuevo mes, nuevos datos), reseteamos la
  // expansión: solo queda abierta la primera (más reciente) y, dentro de
  // ella, SOLO el día actual si existe. Los demás días quedan cerrados
  // por defecto para reducir ruido visual.
  useEffect(() => {
    if (sortedWeeks.length === 0) {
      weeksInitRef.current = false;
      return;
    }
    const firstWeek = sortedWeeks[0];
    const firstId = firstWeek.weekId;
    if (!weeksInitRef.current || !openedWeeks.has(firstId)) {
      weeksInitRef.current = true;
      setOpenedWeeks(new Set([firstId]));
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
      // Marcar como cerrados TODOS los días del mes salvo hoy.
      const toClose = new Set<string>();
      for (const week of sortedWeeks) {
        for (const dayStr of Object.keys(week.days)) {
          if (dayStr !== todayStr) toClose.add(dayStr);
        }
      }
      setClosedDays(toClose);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedWeeks.length > 0 ? sortedWeeks[0].weekId : ""]);

  return (
    <div className="animate-in space-y-4">

      {/* Header — solo título; search y + se movieron a la fila de filtros */}
      <div className="flex items-center">
        <h1 className="text-xl font-bold">
          {account && accountName ? accountName : t("transactions")}
        </h1>
      </div>

      {/* Search bar — expandable */}
      {showSearch && (
        <div className="flex gap-2 items-center animate-in">
          <Input
            type="text"
            placeholder={t("searchTransaction")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="flex-1"
          />
          {search && (
            <button onClick={() => { setSearch(""); setShowSearch(false); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground">
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* Period picker: month navigator OR "recently added" chip */}
      <div className="flex items-center justify-center gap-2">
        {!recentMode ? (
          <>
            <button
              onClick={() => navigateMonth(-1)}
              className="w-8 h-8 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-90"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToday}
              className={`min-h-[44px] px-5 py-2 rounded-full text-sm font-semibold capitalize transition-all active:scale-95 ${
                isCurrentMonth
                  ? "bg-[#2D6A4F]/15 text-[#2D6A4F]"
                  : "bg-muted/60 text-foreground hover:bg-muted"
              }`}
            >
              {monthLabel}
            </button>
            <button
              onClick={() => navigateMonth(1)}
              className="w-8 h-8 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-90"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setRecentMode(true)}
              title={t("recentlyAddedTitle")}
              className="ml-1 min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95"
            >
              <Clock size={13} />
              <span className="hidden xs:inline">{t("recentlyAdded")}</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => setRecentMode(false)}
            className="min-h-[44px] min-w-[44px] flex items-center gap-2 px-4 py-2 rounded-full bg-[#2D6A4F]/15 text-[#2D6A4F] text-sm font-semibold active:scale-95 transition-all"
          >
            <Clock size={14} />
            {t("recentlyAddedLabel")}
            <X size={14} className="ml-1 opacity-70" />
          </button>
        )}
      </div>

      {/* Fila única: filtros (con chips activos) a la izquierda, +
          search y nuevo gasto a la derecha. Fuera del wrapper animado
          para que los filtros no re-animen al cambiar mes. */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <ActiveFiltersRow
            values={filterValues}
            onOpen={() => setShowFiltersSheet(true)}
            onClear={clearFilter}
          />
        </div>
        <button
          onClick={() => { haptic.tap(); setShowSearch(!showSearch); }}
          className="shrink-0 w-9 h-9 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted active:scale-90 transition-all"
          aria-label={t("search")}
        >
          <Search size={18} />
        </button>
        <Link
          href="/transactions/new"
          onClick={() => haptic.tap()}
          className="shrink-0 w-9 h-9 min-h-[44px] min-w-[44px] rounded-full bg-[#2D6A4F] flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label={t("newTransaction")}
        >
          <Plus size={18} />
        </Link>
      </div>

      {/* Content wrapper — se re-monta con key={from} al cambiar mes para
          disparar un slide horizontal. Summary + lista se animan juntos.
          Usamos las mismas keyframes page-slide-* del AppShell para que
          el movimiento sea consistente (56px, 600ms, easing out-quint). */}
      <div
        key={`${from}-${recentMode ? "recent" : "month"}`}
        className={`space-y-4 ${monthDir === "forward" ? "page-slide-forward" : "page-slide-back"}`}
      >

      {/* Summary — caja amplia con 3 columnas (Ingreso / Gasto / Neto) */}
      {txs.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/60 shadow-sm">
          <div className="grid grid-cols-3 items-center">
            <div className="text-center px-3 py-5">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" aria-hidden />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{t("income")}</span>
              </div>
              <div className="text-base font-bold text-[#2D6A4F] tabular-nums">
                {"\u20AC"}{fmt(income)}
              </div>
            </div>
            <div className="text-center px-3 py-5 border-l border-r border-border/60">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" aria-hidden />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{t("expense")}</span>
              </div>
              <div className="text-base font-bold text-red-400 tabular-nums">
                {"\u20AC"}{fmt(expenses)}
              </div>
            </div>
            <div className="text-center px-3 py-5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                {t("net")}
              </div>
              <div className={`text-lg font-extrabold tabular-nums ${income - expenses >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                {income - expenses >= 0 ? "+" : "-"}{"\u20AC"}{fmt(Math.abs(income - expenses))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction list — grouped by day */}
      {txLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {txError && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-center">
          <p className="text-sm text-red-400">{t("errorLoadingMovements")}</p>
          <button onClick={() => refreshTransactions()} className="text-xs text-primary mt-2">{t("retry")}</button>
        </div>
      )}

      {!txLoading && !txError && txs.length === 0 && (
        <div className="rounded-2xl bg-muted/30 p-8 flex flex-col items-center text-center gap-3">
          <Lupo state="empty" size={88} />
          <div>
            <p className="text-sm font-semibold">{t("transactionsEmptyTitle")}</p>
            <p className="text-muted-foreground text-xs mt-1">
              {recentMode ? t("transactionsEmptyDescRecent") : t("transactionsEmptyDescMonth")}
            </p>
          </div>
          <Link
            href="/transactions/new"
            className="mt-1 min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2D6A4F] text-white text-xs font-semibold active:scale-95 transition-transform"
          >
            <Plus size={14} /> {t("addExpense")}
          </Link>
        </div>
      )}

      {/* Recent mode — lista plana agrupada por fecha de REGISTRO
          (created_at). El usuario entra aquí justamente para ver
          qué ha añadido en los últimos días, así que agrupar por
          fecha de la transacción (como hace la vista mensual)
          rompería su expectativa. */}
      {!txLoading && recentMode && txs.length > 0 && (() => {
        const byAddedDay: Record<string, Transaction[]> = {};
        // txs ya viene ordenado por created_at DESC desde la API
        for (const tx of txs) {
          const key = ymdFromIso(tx.created_at);
          if (!byAddedDay[key]) byAddedDay[key] = [];
          byAddedDay[key].push(tx);
        }
        const sortedAddedDays = Object.keys(byAddedDay).sort((a, b) => b.localeCompare(a));

        return (
          <div className="space-y-3 animate-stagger">
            {sortedAddedDays.map((addedDay) => {
              const dayTxs = byAddedDay[addedDay];
              const dayTotal = dayTxs.reduce(
                (s, tx) => s + (tx.direction === "expense" ? -tx.eur_amount : tx.eur_amount),
                0,
              );
              return (
                <div key={addedDay} className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/50">
                    <span className="flex-1 text-[11px] font-semibold text-muted-foreground capitalize">
                      {fmtAddedGroup(addedDay, t, localeCode)}
                    </span>
                    <span className={`text-[11px] font-semibold tabular-nums ${dayTotal >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                      {dayTotal >= 0 ? "+" : "-"}{"€"}{fmt(Math.abs(dayTotal))}
                    </span>
                  </div>
                  {dayTxs.map((tx, i) => {
                    const cat = getCategoryInfo(tx.category);
                    const isIncome = tx.direction === "income";
                    return (
                      <Link
                        key={tx.id}
                        href={`/transactions/detail?id=${tx.id}`}
                        onClick={() => haptic.tap()}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 active:bg-muted/60 active:scale-[0.98] transition-all duration-150 ${
                          i > 0 ? "border-t border-border/40" : ""
                        }`}
                      >
                        <CategoryIcon icon={cat.icon} color={cat.color} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{tx.description || cat.label}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {cat.label}
                            {tx.date !== addedDay && (
                              <span className="opacity-70">
                                {" · "}
                                {new Date(tx.date + "T00:00:00").toLocaleDateString(localeCode, { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`font-semibold text-sm tabular-nums ${
                          isIncome ? "text-[#2D6A4F]" : "text-foreground"
                        }`}>
                          {isIncome ? "+" : "-"}{formatMoney(tx.amount, tx.currency, localeCode)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {!txLoading && !recentMode && (
        <div className="space-y-3 animate-stagger">
          {sortedWeeks.map((week) => {
            const weekOpen = openedWeeks.has(week.weekId);
            const { label: weekLabel, isCurrent } = fmtWeekRange(week.weekId, localeCode);
            const sortedDaysOfWeek = Object.keys(week.days).sort((a, b) => b.localeCompare(a));

            return (
              <div key={week.weekId} className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
                {/* Week header */}
                <button
                  type="button"
                  onClick={() => toggleWeek(week.weekId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors"
                >
                  <span className="flex-1 text-left">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {isCurrent ? t("currentWeek") : t("week")}
                    </span>
                    <span className="ml-2 text-sm font-semibold capitalize">{weekLabel}</span>
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${week.total >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                    {week.total >= 0 ? "+" : "-"}{"\u20AC"}{fmt(Math.abs(week.total))}
                  </span>
                  <ChevronRight
                    size={16}
                    className={`text-muted-foreground transition-transform duration-500 ${weekOpen ? "rotate-90" : ""}`}
                  />
                </button>

                {/* Week body — días como dropdowns individuales */}
                <div
                  className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:duration-0"
                  style={{ gridTemplateRows: weekOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-border/50">
                      {sortedDaysOfWeek.map((date) => {
                        const dayTxs = week.days[date];
                        const dayTotal = dayTxs.reduce((s, tx) => s + (tx.direction === "expense" ? -tx.eur_amount : tx.eur_amount), 0);
                        const dayOpen = !closedDays.has(date);

                        return (
                          <div key={date} className="border-b border-border/40 last:border-b-0">
                            {/* Day header */}
                            <button
                              type="button"
                              onClick={() => toggleDay(date)}
                              className="w-full min-h-[44px] flex items-center gap-2 px-4 py-2.5 bg-muted/20 hover:bg-muted/40 active:bg-muted/50 transition-colors"
                            >
                              <ChevronRight
                                size={12}
                                className={`text-muted-foreground transition-transform duration-500 ${dayOpen ? "rotate-90" : ""}`}
                              />
                              <span className="flex-1 text-[11px] font-semibold text-muted-foreground capitalize text-left">
                                {fmtDateGroup(date, t, localeCode)}
                              </span>
                              <span className={`text-[11px] font-semibold tabular-nums ${dayTotal >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                                {dayTotal >= 0 ? "+" : "-"}{"\u20AC"}{fmt(Math.abs(dayTotal))}
                              </span>
                            </button>

                            {/* Day body — transacciones */}
                            <div
                              className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:duration-0"
                              style={{ gridTemplateRows: dayOpen ? "1fr" : "0fr" }}
                            >
                              <div className="overflow-hidden">
                                {dayTxs.map((tx, i) => {
                                  const cat = getCategoryInfo(tx.category);
                                  const isIncome = tx.direction === "income";
                                  return (
                                    <Link
                                      key={tx.id}
                                      href={`/transactions/detail?id=${tx.id}`}
                                      onClick={() => haptic.tap()}
                                      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 active:bg-muted/60 active:scale-[0.98] transition-all duration-150 ${
                                        i > 0 ? "border-t border-border/40" : ""
                                      }`}
                                    >
                                      <CategoryIcon icon={cat.icon} color={cat.color} size="md" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{tx.description || cat.label}</div>
                                        <div className="text-[11px] text-muted-foreground">{cat.label}</div>
                                      </div>
                                      <span className={`font-semibold text-sm tabular-nums ${
                                        isIncome ? "text-[#2D6A4F]" : "text-foreground"
                                      }`}>
                                        {isIncome ? "+" : "-"}{formatMoney(tx.amount, tx.currency, localeCode)}
                                      </span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>

      {/* Bottom sheet de filtros consolidados */}
      <FiltersSheet
        open={showFiltersSheet}
        onClose={() => setShowFiltersSheet(false)}
        values={filterValues}
        onApply={applyFilters}
      />

    </div>
  );
}

interface AccountInfo {
  slug: string;
  name: string;
  emoji: string;
}

function useAccountName(slug: string): string {
  const { data } = useFetch<{ accounts: AccountInfo[] }>("/api/accounts");
  const accounts = data?.accounts ?? [];
  const match = accounts.find((a) => a.slug === slug);
  return match ? match.name : "";
}
