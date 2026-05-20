"use client";

import { useFetch } from "@/hooks/use-fetch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Trophy, Target, TrendingUp, Calendar, Coins, Sparkles, Lock, Check, Clock, Flame,
  Activity, LineChart, Award, Leaf, Gem, Rocket, CalendarCheck, CalendarRange, CalendarHeart,
  LayoutGrid, CheckCircle2, Compass, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StreakFlame } from "@/components/streak-flame";
import { useState, useEffect, useRef } from "react";
import { useT, useLocaleCode } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { usePremium } from "@/components/premium/premium-provider";
import { AnimatedNumber } from "@/components/animated-number";

type Tier = "bronze" | "silver" | "gold" | "platinum";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier?: Tier;
  unlocked: boolean;
  progress?: number;
  target?: number;
}

interface StreaksData {
  streaks: { savings: number; bestSavings: number; underBudget: number };
  records: {
    bestMonth: { month: string; saved: number } | null;
    cheapestMonth: { month: string; expenses: number } | null;
    highestEarning: { month: string; income: number } | null;
  };
  totals: { transactions: number; income: number; expenses: number; saved: number };
  tracking: { since: string | null; days: number };
  achievements: Achievement[];
}

interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  todayStatus: "checked_in" | "has_transactions" | "pending" | "waiting_for_night";
  canMarkNoExpense: boolean;
  hasTransactionsToday: boolean;
}

function fmtAchieve(n: number, localeCode: string) {
  return n.toLocaleString(localeCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  Sparkles, Activity, LineChart, Trophy, Leaf, TrendingUp, Target, Award,
  Coins, Gem, Rocket, CalendarCheck, CalendarRange, CalendarHeart,
  LayoutGrid, CheckCircle2, Compass, Wallet, Calendar, Flame, Clock,
};

// Fallback by id para compatibilidad con payloads antiguos.
const ICON_BY_ID: Record<string, LucideIcon> = {
  "first-tx": Sparkles,
  "tx-100": Activity,
  "tx-500": LineChart,
  "tx-1000": Trophy,
  "savings-1": Leaf,
  "savings-3": TrendingUp,
  "savings-6": Target,
  "savings-12": Award,
  "saved-1k": Coins,
  "saved-5k": Gem,
  "saved-10k": Rocket,
  "tracking-30": CalendarCheck,
  "tracking-90": CalendarRange,
  "tracking-365": CalendarHeart,
  "categorized-50": LayoutGrid,
  "clean-slate": CheckCircle2,
  "explorer": Compass,
  "multi-account": Wallet,
};

function resolveIcon(a: Achievement): LucideIcon {
  return LUCIDE_ICON_MAP[a.icon] ?? ICON_BY_ID[a.id] ?? Trophy;
}

const TIER_STYLES: Record<Tier, { ring: string; bg: string; iconBg: string; iconColor: string; label: string; labelColor: string }> = {
  bronze: {
    ring: "border-[#B87333]/30",
    bg: "bg-gradient-to-br from-[#B87333]/[0.06] to-transparent",
    iconBg: "bg-gradient-to-br from-[#B87333]/20 to-[#8C5527]/10",
    iconColor: "text-[#B87333]",
    label: "Bronce",
    labelColor: "text-[#B87333]",
  },
  silver: {
    ring: "border-slate-400/40",
    bg: "bg-gradient-to-br from-slate-400/[0.06] to-transparent",
    iconBg: "bg-gradient-to-br from-slate-300/30 to-slate-500/10",
    iconColor: "text-slate-500",
    label: "Plata",
    labelColor: "text-slate-500",
  },
  gold: {
    ring: "border-amber-500/35",
    bg: "bg-gradient-to-br from-amber-400/[0.08] to-transparent",
    iconBg: "bg-gradient-to-br from-amber-300/30 to-amber-600/10",
    iconColor: "text-amber-600",
    label: "Oro",
    labelColor: "text-amber-600",
  },
  platinum: {
    ring: "border-[#2D6A4F]/35",
    bg: "bg-gradient-to-br from-[#2D6A4F]/[0.08] to-transparent",
    iconBg: "bg-gradient-to-br from-[#2D6A4F]/25 to-[#84CC16]/15",
    iconColor: "text-[#2D6A4F]",
    label: "Platino",
    labelColor: "text-[#2D6A4F]",
  },
};

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90, 180, 365];

function getNextMilestone(current: number): number | null {
  return STREAK_MILESTONES.find(m => m > current) ?? null;
}

export default function AchievementsPage() {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt = (n: number) => fmtAchieve(n, localeCode);
  const { data, refresh } = useFetch<StreaksData>("/api/streaks");
  const tz = typeof window !== "undefined" ? Math.round(new Date().getTimezoneOffset() / -60) : 2;
  const { data: streakData, refresh: refreshStreak } = useFetch<StreakInfo>(`/api/streak?tz=${tz}`);
  const [markingNoExpense, setMarkingNoExpense] = useState(false);
  const premium = usePremium();
  const seenIdsRef = useRef<Set<string> | null>(null);

  // Detectar logros recien desbloqueados: comparar con set guardado en localStorage
  useEffect(() => {
    if (!data?.achievements) return;
    if (typeof window === "undefined") return;

    if (seenIdsRef.current === null) {
      const stored = localStorage.getItem("fintrk.premium.seenAchievements");
      seenIdsRef.current = new Set(stored ? (JSON.parse(stored) as string[]) : []);
    }

    const unlockedNow = data.achievements.filter((a) => a.unlocked);
    const newlyUnlocked = unlockedNow.find((a) => !seenIdsRef.current!.has(a.id));

    // En primera carga, marcar todos como vistos sin celebrar
    if (seenIdsRef.current.size === 0 && unlockedNow.length > 0) {
      unlockedNow.forEach((a) => seenIdsRef.current!.add(a.id));
      localStorage.setItem(
        "fintrk.premium.seenAchievements",
        JSON.stringify(Array.from(seenIdsRef.current)),
      );
      return;
    }

    if (newlyUnlocked) {
      premium.achievementUnlocked({ title: newlyUnlocked.name });
      seenIdsRef.current.add(newlyUnlocked.id);
      localStorage.setItem(
        "fintrk.premium.seenAchievements",
        JSON.stringify(Array.from(seenIdsRef.current)),
      );
    }
  }, [data?.achievements, premium]);


  async function handleNoExpense() {
    setMarkingNoExpense(true);
    try {
      const res = await apiFetch("/api/streak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "no_expense", tz }),
      });
      if (res.ok) {
        await Promise.all([refresh(), refreshStreak()]);
        const { haptic } = await import("@/lib/premium/haptics");
        haptic.confirm();
        const { premiumToast } = await import("@/components/premium/premium-provider");
        void premiumToast({
          title: t("streakMaintained"),
          icon: "🔥",
          duration: 2800,
        });
      }
    } catch { /* ignore */ }
    finally { setMarkingNoExpense(false); }
  }

  if (!data || !streakData) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const { achievements, totals, tracking, records } = data;
  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);
  const dailyStreak = streakData.currentStreak;
  const bestDailyStreak = streakData.bestStreak;
  const nextMilestone = getNextMilestone(dailyStreak);
  const milestoneProgress = nextMilestone ? Math.round((dailyStreak / nextMilestone) * 100) : 100;

  const todayCheckedIn = streakData.todayStatus === "checked_in" || streakData.todayStatus === "has_transactions";

  return (
    <div className="animate-in animate-stagger space-y-6">

      <div>
        <h1 className="text-xl font-bold">{t("yourProgress")}</h1>
        <p className="text-sm text-muted-foreground">{unlocked.length} {t("of")} {achievements.length} {t("achievementsUnlocked")}</p>
      </div>

      {/* Daily streak card — expanded with explanation */}
      <div data-tour="streak-card" className="rounded-3xl bg-card border border-border p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium tracking-wide mb-1">{t("dailyStreak")}</p>
            <div className="flex items-baseline gap-2">
              <AnimatedNumber
                value={dailyStreak}
                className="text-4xl font-extrabold tabular-nums"
                formatOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }}
              />
              <span className="text-sm text-muted-foreground">{dailyStreak !== 1 ? t("days") : t("day")}</span>
            </div>
          </div>
          <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
            todayCheckedIn
              ? dailyStreak >= 30
                ? "bg-gradient-to-br from-[#FF4D00]/15 to-[#FFD23F]/15"
                : "bg-gradient-to-br from-[#FF6B35]/15 to-[#FFD23F]/15"
              : "bg-muted/40"
          }`}>
            {todayCheckedIn && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-2xl blur-md opacity-60 motion-reduce:hidden"
                style={{
                  background: dailyStreak >= 30
                    ? "radial-gradient(circle, rgba(255,77,0,0.6), transparent 70%)"
                    : "radial-gradient(circle, rgba(255,107,53,0.55), transparent 70%)",
                  animation: "streak-glow-pulse 2.2s ease-in-out infinite",
                }}
              />
            )}
            <StreakFlame
              lit={todayCheckedIn}
              streak={dailyStreak}
              size={30}
              withSparks={true}
            />
          </div>
        </div>

        {/* Best streak */}
        {bestDailyStreak > dailyStreak && (
          <p className="text-xs text-muted-foreground">{t("bestStreak")}: {bestDailyStreak} {t("days")}</p>
        )}

        {/* Next milestone progress */}
        {nextMilestone && dailyStreak > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground">{t("streakNextMilestone")}: {nextMilestone} {t("days")}</span>
              <span className="text-[11px] font-medium tabular-nums">{dailyStreak}/{nextMilestone}</span>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2D6A4F] rounded-full transition-all duration-500"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Today status */}
        <div className={`rounded-xl p-3 ${
          todayCheckedIn
            ? "bg-[#2D6A4F]/10 border border-[#2D6A4F]/20"
            : "bg-muted/50 border border-border"
        }`}>
          <div className="flex items-center gap-2.5">
            {todayCheckedIn ? (
              <>
                <div className="w-7 h-7 rounded-lg bg-[#2D6A4F]/20 flex items-center justify-center">
                  <Check size={14} className="text-[#2D6A4F]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#2D6A4F]">{t("todayComplete")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("todayCompleteDesc")}</p>
                </div>
              </>
            ) : streakData.canMarkNoExpense ? (
              <>
                <div className="flex-1 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                    <Clock size={14} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t("noExpenseToday")}</p>
                    <p className="text-[11px] text-muted-foreground">{t("confirmToKeepStreak")}</p>
                  </div>
                </div>
                <Button
                  onClick={handleNoExpense}
                  disabled={markingNoExpense}
                  size="sm"
                  className="rounded-xl bg-primary hover:bg-primary/90 text-xs font-semibold shrink-0"
                >
                  {markingNoExpense ? "..." : t("didntSpend")}
                </Button>
              </>
            ) : (
              <>
                <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                  <Clock size={14} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t("pendingToday")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("registerOrWait")}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* How streak works */}
        <div className="border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground font-medium tracking-wide mb-2">{t("howStreakWorks")}</p>
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t("streakExplain1")}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t("streakExplain2")}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t("streakExplain3")}</p>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-card border border-border p-3 text-center shadow-sm">
          <p className="text-lg font-bold tabular-nums">{fmt(totals.transactions)}</p>
          <p className="text-[10px] text-muted-foreground">{t("movements")}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center shadow-sm">
          <p className="text-lg font-bold tabular-nums text-[#2D6A4F]">{"\u20AC"}{fmt(totals.saved)}</p>
          <p className="text-[10px] text-muted-foreground">{t("totalSaved")}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center shadow-sm">
          <p className="text-lg font-bold tabular-nums">{tracking.days}</p>
          <p className="text-[10px] text-muted-foreground">{t("daysTracking")}</p>
        </div>
      </div>

      {/* Records */}
      {records.bestMonth && records.bestMonth.saved > 0 && (
        <div className="rounded-2xl bg-[#2D6A4F]/10 border border-[#2D6A4F]/20 p-4 shadow-sm">
          <p className="text-[10px] text-[#2D6A4F] font-medium tracking-wide mb-1">{t("bestMonthLabel")}</p>
          <p className="text-sm font-bold">{records.bestMonth.month}</p>
          <p className="text-xs text-muted-foreground">{t("youSaved")} {"\u20AC"}{fmt(records.bestMonth.saved)}</p>
        </div>
      )}

      {/* Unlocked achievements */}
      {unlocked.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3">{t("unlocked")}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {unlocked.map(a => {
              const Icon = resolveIcon(a);
              const tier = a.tier ?? "silver";
              const style = TIER_STYLES[tier];
              return (
                <div
                  key={a.id}
                  className={`relative rounded-2xl border ${style.ring} ${style.bg} p-4 shadow-sm overflow-hidden`}
                >
                  <div className={`w-12 h-12 rounded-2xl ${style.iconBg} flex items-center justify-center mb-3 shadow-sm`}>
                    <Icon size={22} className={style.iconColor} strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-bold mb-0.5 leading-tight">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{a.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${style.labelColor}`}>
                      {style.label}
                    </span>
                    <span className="w-5 h-5 rounded-full bg-[#2D6A4F] flex items-center justify-center">
                      <Check size={11} strokeWidth={3.5} className="text-white" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked achievements */}
      {locked.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3">{t("toUnlock")}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {locked.map(a => {
              const Icon = resolveIcon(a);
              const tier = a.tier ?? "silver";
              const style = TIER_STYLES[tier];
              const pct = a.progress !== undefined && a.target ? Math.round((a.progress / a.target) * 100) : 0;
              return (
                <div
                  key={a.id}
                  className="relative rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mb-3 relative">
                    <Icon size={22} className="text-muted-foreground/50" strokeWidth={1.5} />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center">
                      <Lock size={9} className="text-muted-foreground" />
                    </span>
                  </div>
                  <p className="text-sm font-bold mb-0.5 leading-tight text-muted-foreground">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground/80 leading-snug mb-2">{a.description}</p>
                  {a.target ? (
                    <div>
                      <div className="h-1.5 bg-border/70 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${style.iconColor.replace("text-", "bg-")}`}
                          style={{ width: `${pct}%`, opacity: 0.7 }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{a.progress}/{a.target}</p>
                    </div>
                  ) : (
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${style.labelColor} opacity-60`}>
                      {style.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Savings streak */}
      {data.streaks.savings > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm text-center">
          <p className="text-3xl font-extrabold text-[#2D6A4F]">{data.streaks.savings}</p>
          <p className="text-xs text-muted-foreground">{t("consecutiveMonthsSaving")}</p>
        </div>
      )}

    </div>
  );
}
