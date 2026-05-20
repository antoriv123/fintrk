"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useT, useLocaleCode } from "@/lib/i18n";
import { useState } from "react";
import { Camera, ChevronRight, ChevronDown, User, Sparkles } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { haptic } from "@/lib/premium/haptics";
import { StreakFlame } from "@/components/streak-flame";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryInfo } from "@/lib/categories";
import { getCurrencySymbol } from "@/lib/currency";
import { useInitialLoad } from "@/lib/initial-load";
import { CategoryIcon } from "@/components/category-icon";
import { AnimatedNumber } from "@/components/animated-number";
import { FintrkLogo } from "@/components/fintrk-logo";
import { EmptyState as EmptyStateSmall } from "@/components/empty-state";
import { CategoryBreakdown } from "@/components/dashboard/category-breakdown";
import { UpcomingFixed } from "@/components/dashboard/upcoming-fixed";
import { MonthPicker, readStoredMonth, monthToRange, isCurrentMonth, type MonthValue } from "@/components/dashboard/month-picker";
import { QuickSearch } from "@/components/dashboard/quick-search";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { MonthCelebration } from "@/components/premium/month-celebration";
import { usePremium } from "@/components/premium/premium-provider";
import { Glow } from "@/components/premium/glow";
import { Inbox } from "lucide-react";
import { SetupPanel } from "@/components/setup/setup-panel";
import { Lupo } from "@/components/personality/lupo";
import { StatsEasterEgg } from "@/components/personality/stats-easter-egg";
import type { Summary } from "@/lib/queries";
import type { Transaction } from "@/lib/db";

interface NetWorthResponse {
  current: { total: number };
}

interface DashboardInitialResponse {
  summary: Summary;
  recentTransactions: Transaction[];
  streak: StreakResponse;
  primaryCurrency: string;
}



interface StreakResponse {
  currentStreak: number;
  bestStreak: number;
  todayStatus: "checked_in" | "has_transactions" | "pending" | "waiting_for_night";
  canMarkNoExpense: boolean;
  canMarkNoExpenseYesterday?: boolean;
  hasTransactionsToday: boolean;
}

function fmtLocale(n: number, localeCode: string) {
  if (n === 0) return "0";
  const isRound = n % 1 === 0;
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: isRound ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// Estado vacio del dashboard cuando el user aun no tiene cuentas ni
// transacciones. Antes vivia inline aqui como un checklist de 3 pasos —
// ahora delega al panel persistente <SetupPanel /> que se reusa en el
// dashboard normal una vez que el user empieza a tener datos.
function EmptyState() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <FintrkLogo size="md" />
        <Link
          href="/settings"
          className="w-9 h-9 min-h-[44px] min-w-[44px] rounded-full bg-[#2D6A4F] flex items-center justify-center"
        >
          <User size={16} className="text-white" />
        </Link>
      </div>
      <div className="flex flex-col items-center text-center gap-3">
        <Lupo state="welcome" size={96} />
        <div>
          <h1 className="text-xl font-extrabold mb-1">{t("checklistTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("checklistSubtitle")}</p>
        </div>
      </div>
      <SetupPanel />
      <div className="rounded-xl bg-muted/40 p-4 text-center">
        <p className="text-xs text-muted-foreground">{t("checklistTip")}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt = (n: number) => fmtLocale(n, localeCode);
  const shouldReduceMotion = useReducedMotion();

  const [month, setMonth] = useState<MonthValue>(() => readStoredMonth());
  const range = monthToRange(month);
  const isThisMonth = isCurrentMonth(month);

  const tz = typeof window !== "undefined" ? Math.round(new Date().getTimezoneOffset() / -60) : 2;
  const { data: initial, refresh: refreshInitial } = useFetch<DashboardInitialResponse>(`/api/dashboard/initial?from=${range.from}&to=${range.to}&tz=${tz}`);
  const summary = initial?.summary ?? null;
  const transactions = initial?.recentTransactions ?? null;
  const streak = initial?.streak ?? null;
  const primaryCurrency = initial?.primaryCurrency ?? "EUR";
  const { data: session } = useFetch<{ user: { name: string | null } | null }>("/api/auth/session");
  const userFirstName = session?.user?.name?.split(" ")[0] ?? "";
  const { data: networth, refresh: refreshNw } = useFetch<NetWorthResponse>("/api/networth");
  const currencySymbol = getCurrencySymbol(primaryCurrency);

  // Streak
  const [markingNoExpense, setMarkingNoExpense] = useState(false);
  const [streakGlow, setStreakGlow] = useState(false);
  const premium = usePremium();
  const prevStreakStatus = useRef<StreakResponse["todayStatus"] | null>(null);
  const prevStreakDays = useRef<number>(0);
  // Con limit=5 el listado cabe sin colapsar; arranca abierto.
  const [recentExpanded, setRecentExpanded] = useState(true);

  // Easter egg: triple-tap en el logo abre el modal de stats curiosas.
  // Tres taps en menos de 1.2s (cada tap fuera de ventana se descarta).
  const [statsOpen, setStatsOpen] = useState(false);
  const tapTimesRef = useRef<number[]>([]);
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    tapTimesRef.current = [...tapTimesRef.current.filter((t) => now - t < 1200), now];
    if (tapTimesRef.current.length >= 3) {
      tapTimesRef.current = [];
      haptic.success();
      setStatsOpen(true);
    }
  }, []);

  // Dispara celebracion cuando la racha pasa de pending/waiting a lit, o cuando cruza milestone
  useEffect(() => {
    if (!streak) return;
    const nowLit = streak.todayStatus === "checked_in" || streak.todayStatus === "has_transactions";
    const wasLit =
      prevStreakStatus.current === "checked_in" ||
      prevStreakStatus.current === "has_transactions";
    if (nowLit && !wasLit && prevStreakStatus.current !== null) {
      premium.streakActivated();
      setStreakGlow(true);
      setTimeout(() => setStreakGlow(false), 700);
    }
    if (
      streak.currentStreak > prevStreakDays.current &&
      [7, 14, 30, 100].includes(streak.currentStreak)
    ) {
      premium.streakMilestone(streak.currentStreak);
    }
    prevStreakStatus.current = streak.todayStatus;
    prevStreakDays.current = streak.currentStreak;
  }, [streak, premium]);

  // Onboarding welcome: si viene ?welcome=1, dispara haptic + fade-in
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      premium.onboardingWelcome();
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());
    }
  }, [premium]);

  async function handleNoExpense(target: "today" | "yesterday" = "today") {
    setMarkingNoExpense(true);
    try {
      const res = await apiFetch("/api/streak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "no_expense", tz, target }),
      });
      if (res.ok) {
        refreshInitial();
        haptic.confirm();
        const { premiumToast } = await import("@/components/premium/premium-provider");
        void premiumToast({
          title: t("streakMaintained"),
          icon: "🔥",
          duration: 2800,
        });
      } else {
        const data = await res.json();
        const { toast } = await import("sonner");
        toast.error(data.error || "Error");
      }
    } catch { /* ignore */ }
    finally { setMarkingNoExpense(false); }
  }

  const handleRefresh = useCallback(async () => {
    haptic.tap();
    await Promise.all([refreshInitial(), refreshNw()]);
  }, [refreshInitial, refreshNw]);

  const ptr = usePullToRefresh({ onRefresh: handleRefresh, threshold: 80 });

  // Auto-calculate interest on remunerated accounts (once per session)
  const interestChecked = useRef(false);
  useEffect(() => {
    if (interestChecked.current) return;
    interestChecked.current = true;
    apiFetch("/api/interest", { method: "POST" })
      .then(r => r.json())
      .then(result => {
        if (result.created > 0) {
          refreshInitial();
          refreshNw();
        }
      })
      .catch(() => {});
  }, [refreshInitial, refreshNw]);

  // Avisa al splash global (ver GlobalSplash en providers.tsx) de que el
  // dashboard ya tiene sus datos iniciales. El splash se desmonta y no
  // vuelve a aparecer aunque el dashboard re-fetchee al cambiar mes o al
  // navegar entre tabs.
  const { markLoaded } = useInitialLoad();
  useEffect(() => {
    if (initial) markLoaded();
  }, [initial, markLoaded]);

  // Gate: no renderizar dashboard hasta tener datos. El splash global
  // cubre la pantalla mientras tanto — aquí no mostramos nada porque
  // quedaría detrás del splash y crearía flashes innecesarios.
  if (!summary) return null;

  const isEmpty = summary.income === 0 && summary.expenses === 0 && (transactions ?? []).length === 0;
  if (isEmpty) return <EmptyState />;

  const hasDemo = (transactions ?? []).some((tx) => tx.is_demo === 1);
  const patrimonio = networth?.current?.total ?? 0;

  return (
    <>
    {(ptr.pulling || ptr.refreshing) && (
      <div
        className="fixed top-0 left-0 right-0 z-[110] flex items-center justify-center pointer-events-none"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          transform: `translateY(${Math.min(ptr.distance, 120)}px)`,
          transition: ptr.refreshing ? "transform 0.3s ease" : "none",
          opacity: ptr.refreshing ? 1 : Math.min(ptr.distance / 80, 1),
        }}
      >
        <div className="flex items-center gap-2 rounded-full bg-card border border-border shadow-md px-3 py-1.5">
          <div className={`w-3 h-3 rounded-full border-2 border-[#2D6A4F] ${
            ptr.refreshing ? "animate-spin border-t-transparent" : ptr.armed ? "bg-[#2D6A4F]" : ""
          }`} />
          <span className="text-[10px] font-semibold text-muted-foreground">
            {ptr.refreshing ? t("refreshing") : ptr.armed ? t("releaseToRefresh") : t("pullToRefresh")}
          </span>
        </div>
      </div>
    )}
    <div className="animate-in space-y-6">

      {/* Top bar: logo + quick search + avatar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleLogoTap}
          className="-m-2 p-2 rounded-lg active:opacity-80 transition-opacity"
          aria-label="Fintrk"
        >
          <FintrkLogo size="md" />
        </button>
        <div className="flex items-center gap-2">
          <QuickSearch />
          <Link
            href="/settings"
            className="w-9 h-9 min-h-[44px] min-w-[44px] rounded-full bg-[#2D6A4F] flex items-center justify-center"
          >
            <User size={16} className="text-white" />
          </Link>
        </div>
      </div>

      {/* Demo banner */}
      {hasDemo && (
        <div className="rounded-xl border border-[#2D6A4F]/25 bg-[#2D6A4F]/5 px-4 py-3 flex items-start gap-3">
          <Sparkles size={16} className="text-[#2D6A4F] shrink-0 mt-0.5" />
          <div className="flex-1 text-[12px] leading-relaxed">
            <p className="font-semibold text-foreground">{t("demoBannerTitle")}</p>
            <p className="text-muted-foreground">{t("demoBannerDesc")}</p>
          </div>
        </div>
      )}

      {/* Setup panel persistente: solo se renderiza mientras queden tareas
          pendientes y el user no lo haya cerrado tras completarlo. El propio
          componente decide si mostrarse leyendo /api/setup/status. */}
      <SetupPanel />

      {/* Greeting + Streak */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold leading-tight">
          {(() => {
            const h = new Date().getHours();
            // Easter egg: madrugada (1-5am) tiene saludo propio en vez de
            // "buenas noches", para premiar al que abre la app a las 3am.
            const greet =
              h >= 1 && h < 5
                ? t("greetingLateNight")
                : h < 12
                ? t("greetingMorning")
                : h < 20
                ? t("greetingAfternoon")
                : t("greetingEvening");
            return userFirstName ? `${greet}, ${userFirstName}` : t("yourSummary");
          })()}
        </h1>
        {streak && streak.currentStreak > 0 && (
          <div className="relative">
            <Glow show={streakGlow} color="bg-[#FF6B35]" size="sm" />
            <Link
              href="/achievements"
              className={`relative min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-95 transition-transform ${
                streak.todayStatus === "checked_in" || streak.todayStatus === "has_transactions"
                  ? "bg-gradient-to-r from-[#FF6B35]/10 to-[#FFD23F]/10 border border-[#FF6B35]/20"
                  : "bg-muted/40 border border-border"
              }`}
            >
              <StreakFlame
                lit={streak.todayStatus === "checked_in" || streak.todayStatus === "has_transactions"}
                streak={streak.currentStreak}
                size={16}
              />
              <span className={`text-xs font-bold tabular-nums ${
                streak.todayStatus === "checked_in" || streak.todayStatus === "has_transactions"
                  ? "text-[#E76F51]" : "text-muted-foreground"
              }`}>{streak.currentStreak}</span>
            </Link>
          </div>
        )}
      </div>

      {/* Check-in prompt — only when no activity today */}
      {streak && streak.todayStatus === "pending" && streak.canMarkNoExpense && (
        <div className="rounded-3xl border border-[#FF6B35]/20 bg-gradient-to-br from-[#FF6B35]/5 to-[#FFD23F]/5 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <StreakFlame lit={false} size={32} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{t("noExpenseToday")}</p>
                <p className="text-[11px] text-muted-foreground">{t("confirmStreak")} {streak.currentStreak} {streak.currentStreak !== 1 ? t("days") : t("day")}</p>
              </div>
            </div>
            <Button
              onClick={() => handleNoExpense("today")}
              disabled={markingNoExpense}
              className="rounded-xl bg-primary hover:bg-primary/90 text-xs font-semibold shrink-0 h-11 px-4"
            >
              {markingNoExpense ? "..." : t("didntSpend")}
            </Button>
          </div>
        </div>
      )}

      {/* Yesterday grace period prompt — morning window to mark yesterday */}
      {streak && streak.canMarkNoExpenseYesterday && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{t("noExpenseYesterday")}</p>
              <p className="text-[11px] text-muted-foreground">{t("noExpenseYesterdayDesc")}</p>
            </div>
            <Button
              onClick={() => handleNoExpense("yesterday")}
              disabled={markingNoExpense}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-xs font-semibold shrink-0 h-11 px-4"
            >
              {markingNoExpense ? "..." : t("didntSpendYesterday")}
            </Button>
          </div>
        </div>
      )}

      {streak && streak.todayStatus === "waiting_for_night" && !streak.hasTransactionsToday && streak.currentStreak > 0 && (
        <div className="rounded-2xl border border-border/50 bg-muted/20 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            {t("registerOrWait")}
          </p>
        </div>
      )}

      {/* Control center: balance + CTAs apretados como un solo bloque */}
      <div className="space-y-2">
        {/* Balance card */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-muted-foreground font-medium">
              {isThisMonth ? t("moneyInAccounts") : t("selectMonth")}
            </div>
            <MonthPicker value={month} onChange={setMonth} localeCode={localeCode} />
          </div>

          <div className="mb-5">
            <motion.div
              className="text-4xl font-extrabold tracking-tight origin-left tabular-nums"
              animate={shouldReduceMotion ? undefined : { scale: [1, 1.005, 1] }}
              transition={shouldReduceMotion ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              {isThisMonth && !networth ? (
                <Skeleton className="h-11 w-44 rounded-xl bg-[#2D6A4F]/5" />
              ) : (
                <>
                  <span className="text-2xl font-bold text-muted-foreground mr-1">{currencySymbol}</span>
                  {fmt(isThisMonth ? patrimonio : summary.income - summary.expenses)}
                </>
              )}
            </motion.div>
          </div>

          {/* Income / Expenses this month */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <div className="text-[11px] text-muted-foreground font-medium mb-1">{t("incomeThisMonth")}</div>
              <div className="text-lg font-bold text-[#2D6A4F]">
                {currencySymbol}<AnimatedNumber value={summary.income} />
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground font-medium mb-1">{t("expensesThisMonth")}</div>
              <div className="text-lg font-bold text-red-400">
                {currencySymbol}<AnimatedNumber value={summary.expenses} />
              </div>
            </div>
          </div>
        </div>

        {/* CTAs pegados al card de saldo */}
        <Link
          href="/transactions/new"
          className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm hover:bg-muted/40 transition-all active:scale-[0.98]"
        >
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#2D6A4F]/15 shrink-0">
            <Camera size={20} className="text-[#2D6A4F]" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("scanTicket")}</p>
            <p className="text-[11px] text-muted-foreground">{t("scanTicketDesc")}</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
        </Link>

        <Link
          href="/insights"
          className="flex items-center gap-4 p-4 rounded-2xl bg-[#2D6A4F]/8 border border-[#2D6A4F]/15 shadow-sm hover:bg-[#2D6A4F]/12 transition-all active:scale-[0.98]"
        >
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#2D6A4F] shrink-0">
            <Sparkles size={20} className="text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("financeAnalysis")}</p>
            <p className="text-[11px] text-muted-foreground">{t("financeAnalysisDesc")}</p>
          </div>
          <ChevronRight size={16} className="text-[#2D6A4F]/40 shrink-0" />
        </Link>
      </div>

      {/* Spending by category */}
      <CategoryBreakdown
        byCategory={summary.byCategory ?? []}
        totalExpenses={summary.expenses ?? 0}
        localeCode={localeCode}
        onRefresh={handleRefresh}
      />

      {/* Upcoming fixed expenses */}
      <UpcomingFixed localeCode={localeCode} />

      {/* Recent expenses */}
      <div>
      {/* Push notification popup */}
        {transactions && transactions.length > 0 ? (
          <button
            type="button"
            onClick={() => { haptic.tap(); setRecentExpanded((v) => !v); }}
            aria-expanded={recentExpanded}
            aria-controls="recent-expenses-list"
            className="w-full min-h-[44px] flex items-center gap-2 mb-3 px-1 active:opacity-70 transition-opacity"
          >
            <span className="w-7 h-7 min-h-[44px] min-w-[44px] -ml-1 rounded-full flex items-center justify-center hover:bg-muted/60">
              <ChevronDown
                size={16}
                className={`text-muted-foreground transition-transform ${recentExpanded ? "rotate-180" : ""}`}
              />
            </span>
            <p className="text-sm font-semibold">
              {t("recentExpenses")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">({transactions.length})</span>
            </p>
          </button>
        ) : (
          <p className="text-sm font-semibold mb-3 px-1">{t("recentExpenses")}</p>
        )}

        {transactions === null ? (
          <div className="space-y-2" aria-label="Cargando gastos recientes">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl bg-[#2D6A4F]/5" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border">
            <EmptyStateSmall
              icon={Inbox}
              title={t("firstExpenseHere")}
              description={t("quickAddTitle")}
              cta={{ label: t("quickAddSave"), href: "/transactions/new" }}
              tone="brand"
            />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {recentExpanded && (
              <motion.div
                id="recent-expenses-list"
                key="recent-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
            {(() => {
              const rows = transactions ?? [];
              const renderRow = (tx: typeof rows[number], i: number) => {
                const cat = getCategoryInfo(tx.category);
                const isIncome = tx.direction === "income";
                const d = new Date(tx.date + "T00:00:00");
                const today = new Date();
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const dateLabel = d.toDateString() === today.toDateString() ? t("today")
                  : d.toDateString() === yesterday.toDateString() ? t("yesterday")
                  : d.toLocaleDateString(localeCode, { day: "numeric", month: "short" });

                return (
                  <Link
                    key={tx.id}
                    href={`/transactions/detail?id=${tx.id}`}
                    className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 active:bg-muted/60 transition-all ${
                      i > 0 ? "border-t border-border/50" : ""
                    }`}
                  >
                    <CategoryIcon icon={cat.icon} color={cat.color} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {tx.description || cat.label}
                        {tx.is_demo === 1 && (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#2D6A4F]/10 text-[#2D6A4F] font-semibold shrink-0">
                            {t("demoBadge")}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{cat.label} · {dateLabel}</div>
                    </div>
                    <span className={`font-bold text-sm tabular-nums ${
                      isIncome ? "text-[#2D6A4F]" : "text-foreground"
                    }`}>
                      {isIncome ? "+" : "-"}{currencySymbol}{fmt(tx.eur_amount)}
                    </span>
                  </Link>
                );
              };
              return <>{rows.map(renderRow)}</>;
            })()}

                  <Link
                    href="/transactions"
                    className="flex items-center justify-center gap-1 px-4 py-3 border-t border-border/50 text-xs text-primary font-medium hover:bg-muted/40 transition-all"
                  >
                    {t("viewAll")} <ChevronRight size={12} />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

    </div>
    {/* QuickAdd flotante retirado: el FAB central del bottom tab bar
        (Plus en bottom-tabs.tsx) ya cubre la acción, con un look más
        limpio y consistente en todas las pantallas. */}
    <MonthCelebration positiveLastMonth={(summary?.income ?? 0) >= (summary?.expenses ?? 0)} />
    {(() => {
      // Stats que muestra el easter egg. Top category = la categoria con
      // mas transacciones del mes (entre todas las disponibles, no solo
      // las visibles en el widget de recientes — si vinieron 5 es porque
      // limit=5).
      const counts = new Map<string, number>();
      for (const tx of transactions ?? []) {
        counts.set(tx.category, (counts.get(tx.category) ?? 0) + 1);
      }
      let topCategory: string | null = null;
      let topCount = 0;
      for (const [cat, n] of counts) {
        if (n > topCount) { topCount = n; topCategory = cat; }
      }
      const topLabel = topCategory ? getCategoryInfo(topCategory).label : null;
      return (
        <StatsEasterEgg
          open={statsOpen}
          onClose={() => setStatsOpen(false)}
          stats={{
            totalTx: (transactions ?? []).length,
            streak: streak?.currentStreak ?? 0,
            topCategory: topLabel,
            monthBalance: (summary?.income ?? 0) - (summary?.expenses ?? 0),
            currencySymbol,
          }}
        />
      );
    })()}
    </>
  );
}
