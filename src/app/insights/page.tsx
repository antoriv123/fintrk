"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import {
  Sparkles, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  Repeat, PiggyBank, AlertTriangle, Trophy, X,
} from "lucide-react";
import { Lupo } from "@/components/personality/lupo";
import { useT, useLocaleCode } from "@/lib/i18n";
import { usePremium } from "@/components/premium/premium-provider";
import { InsightsGenerating } from "@/components/premium/insights-generating";

interface InsightAction {
  label: string;
  intent: "route" | "category" | "subscription" | "budget";
  value: string;
}

interface InsightItem {
  type: "pattern" | "saving" | "investment" | "alert" | "achievement";
  title: string;
  body: string;
  metric: string;
  metricLabel: string;
  action?: InsightAction | null;
}

interface AIResult {
  healthScore: number;
  healthLabel: string;
  summary: string;
  insights: InsightItem[];
  projectionEndOfMonth?: { expenses: number; oneLiner: string } | null;
  generatedAt: string;
}

interface AIStatusResponse {
  canGenerate: boolean;
  lastGenerated: string | null;
  nextAvailable: string | null;
  cached: AIResult | null;
}

interface InsightsData {
  velocity: { dailyAvg: number; projected: number; daysLeft: number; daysElapsed: number };
  currentSavingsRate: number;
  categoryChanges: { category: string; current: number; previous: number; changePct: number; direction: "up" | "down" | "same" }[];
  topExpenses: { description: string; eur_amount: number; category: string; date: string }[];
  savingsStreak: number;
}

function fmtWithLocale(n: number, localeCode: string) {
  if (n === 0) return "0";
  const isRound = n % 1 === 0;
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: isRound ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatTimeAgo(dateStr: string, t: (key: string) => string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  if (diffMins < 1) return t("timeNow");
  if (diffMins < 60) return t("timeMinAgo").replace("{n}", String(diffMins));
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t("timeHoursAgo").replace("{n}", String(diffHours));
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return t("timeYesterday");
  return t("timeDaysAgo").replace("{n}", String(diffDays));
}

function getInsightConfig(t: (key: string) => string) {
  return {
    pattern: { icon: Repeat, color: "#0EA5E9", gradient: "from-sky-600 to-cyan-500", label: t("insightPattern") },
    saving: { icon: PiggyBank, color: "#2D6A4F", gradient: "from-emerald-600 to-green-500", label: t("insightSaving") },
    investment: { icon: TrendingUp, color: "#0EA5E9", gradient: "from-sky-600 to-blue-500", label: t("insightInvestment") },
    alert: { icon: AlertTriangle, color: "#F4A261", gradient: "from-amber-600 to-orange-500", label: t("insightAlert") },
    achievement: { icon: Trophy, color: "#2D6A4F", gradient: "from-emerald-600 to-teal-500", label: t("insightAchievement") },
  };
}

/* ─── STORY OVERLAY ─── */
function InsightStories({ result, onClose, t, router }: { result: AIResult; onClose: () => void; t: ReturnType<typeof useT>; router: { push: (href: string) => void } }) {
  // Screens: 0 = health score, 1..N = insights, N+1 = summary
  const totalScreens = 1 + result.insights.length + 1;
  const [screen, setScreen] = useState(0);
  const [animPhase, setAnimPhase] = useState<"enter" | "active">("enter");
  const touchStartX = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets animation phase synchronously when screen changes; deferred update would cause visible flicker
    setAnimPhase("enter");
    const t = setTimeout(() => setAnimPhase("active"), 100);
    return () => clearTimeout(t);
  }, [screen]);

  function next() {
    if (screen < totalScreens - 1) setScreen(screen + 1);
    else onClose();
  }

  function prev() {
    if (screen > 0) setScreen(screen - 1);
  }

  function handleTap(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) prev();
    else next();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff < 0) next();
      else prev();
    }
  }

  const isEntering = animPhase === "enter";

  return (
    <div
      className="fixed inset-0 z-[100] bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Progress bar */}
      <div className="flex gap-1 px-4 pt-3 pb-2">
        {Array.from({ length: totalScreens }).map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
              style={{ width: i < screen ? "100%" : i === screen ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-muted/60 flex items-center justify-center active:scale-90 transition-transform"
        style={{
          marginTop: "env(safe-area-inset-top)",
          marginRight: "env(safe-area-inset-right)",
        }}
      >
        <X size={18} />
      </button>

      {/* Content area */}
      <div
        className="flex-1 overflow-y-auto px-6 py-6 flex flex-col"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex-1 flex flex-col justify-center min-h-0 py-4">
          {/* Screen 0: Health Score */}
          {screen === 0 && (
            <HealthScreen score={result.healthScore} label={result.healthLabel} entering={isEntering} t={t} />
          )}

          {/* Screens 1..N: Individual insights */}
          {screen > 0 && screen <= result.insights.length && (
            <InsightScreen
              insight={result.insights[screen - 1]}
              entering={isEntering}
              t={t}
              onAction={(href) => { onClose(); router.push(href); }}
            />
          )}

          {/* Final screen: Summary */}
          {screen === totalScreens - 1 && (
            <SummaryScreen result={result} entering={isEntering} onClose={onClose} t={t} />
          )}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="text-center pb-4 px-6 shrink-0">
        <p className="text-[10px] text-muted-foreground/40">
          {screen < totalScreens - 1 ? t("tapToContinue") : ""}
        </p>
      </div>
    </div>
  );
}

function HealthScreen({ score, label, entering, t }: { score: number; label: string; entering: boolean; t: ReturnType<typeof useT> }) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayScore / 100) * circumference;
  const offset = circumference - progress;
  const color = score >= 80 ? "#2D6A4F" : score >= 60 ? "#2D6A4F" : score >= 40 ? "#F4A261" : "#EF4444";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets score to 0 synchronously when entering to avoid stale display; deferring causes flash of previous score
    if (entering) { setDisplayScore(0); return; }
    let frame: number;
    const start = performance.now();
    const duration = 1500;
    const animate = (time: number) => {
      const elapsed = time - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplayScore(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score, entering]);

  return (
    <div className={`flex flex-col items-center gap-8 transition-all duration-700 ${entering ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}>
      <div>
        <p className="text-[11px] text-muted-foreground tracking-wide text-center mb-1">{t("financialHealth")}</p>
      </div>

      <div className="relative w-44 h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
          <circle
            cx="70" cy="70" r={radius}
            fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-6xl font-extrabold tabular-nums" style={{ color }}>{displayScore}</span>
          <span className="text-xs text-muted-foreground font-medium mt-1">{label}</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-center max-w-[250px]">
        {t("letsSeeFull")}
      </p>
    </div>
  );
}

function resolveActionHref(action: InsightAction | null | undefined): string | null {
  if (!action) return null;
  switch (action.intent) {
    case "route":
      return action.value.startsWith("/") ? action.value : `/${action.value}`;
    case "category":
      return `/transactions?category=${encodeURIComponent(action.value)}`;
    case "subscription":
      return `/subscriptions`;
    case "budget":
      return `/budgets`;
    default:
      return null;
  }
}

function InsightScreen({ insight, entering, t, onAction }: { insight: InsightItem; entering: boolean; t: ReturnType<typeof useT>; onAction: (href: string) => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const INSIGHT_CONFIG = getInsightConfig(t as (key: any) => string);
  const config = INSIGHT_CONFIG[insight.type] ?? INSIGHT_CONFIG.alert;
  const Icon = config.icon;
  const actionHref = resolveActionHref(insight.action);

  return (
    <div className={`w-full max-w-sm mx-auto transition-all duration-700 ${entering ? "opacity-0 translate-x-8" : "opacity-100 translate-x-0"}`}>
      {/* Type badge */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg`}>
          <Icon size={20} className="text-white" />
        </div>
        <span className="text-xs font-bold tracking-wide text-muted-foreground">{config.label.toUpperCase()}</span>
      </div>

      {/* Metric — big and bold */}
      {insight.metric && (
        <div className={`mb-4 transition-all duration-1000 delay-200 ${entering ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
          <div className="text-4xl sm:text-5xl font-extrabold tabular-nums tracking-tight break-words" style={{ color: config.color }}>
            {insight.metric}
          </div>
          {insight.metricLabel && (
            <p className="text-sm text-muted-foreground mt-1">{insight.metricLabel}</p>
          )}
        </div>
      )}

      {/* Title */}
      <h2 className={`text-xl font-bold mb-3 transition-all duration-700 delay-300 ${entering ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
        {insight.title}
      </h2>

      {/* Body */}
      <p className={`text-sm text-muted-foreground leading-relaxed transition-all duration-700 delay-500 ${entering ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
        {insight.body}
      </p>

      {/* Action CTA */}
      {actionHref && insight.action && (
        <button
          onClick={(e) => { e.stopPropagation(); onAction(actionHref); }}
          className={`mt-6 w-full h-11 rounded-2xl font-semibold text-sm text-white shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2 bg-gradient-to-br ${config.gradient} transition-all duration-700 delay-700 ${entering ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
          style={{ boxShadow: `0 8px 24px ${config.color}40` }}
        >
          {insight.action.label}
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

function SummaryScreen({ result, entering, onClose, t }: { result: AIResult; entering: boolean; onClose: () => void; t: ReturnType<typeof useT> }) {
  return (
    <div className={`w-full max-w-sm mx-auto text-center transition-all duration-700 ${entering ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
      <div className="w-16 h-16 rounded-2xl bg-[#2D6A4F]/15 flex items-center justify-center mx-auto mb-6">
        <Sparkles size={28} className="text-[#2D6A4F]" />
      </div>

      <h2 className="text-xl font-bold mb-3">{t("fullAnalysis")}</h2>

      {result.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[280px] mx-auto">
          {result.summary}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 font-semibold text-base"
        >
          {t("understood")}
        </Button>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ─── */
export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-muted-foreground text-sm">…</div>}>
      <InsightsContent />
    </Suspense>
  );
}

function InsightsContent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const localeCode = useLocaleCode();
  const INSIGHT_CONFIG = getInsightConfig(t);
  const fmt = (n: number) => fmtWithLocale(n, localeCode);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Welcome banner: aparece cuando el SetupPanel termina y redirige a
  // /insights?welcome=1. Sirve como onboarding a la seccion de analisis.
  const [showWelcome, setShowWelcome] = useState(searchParams?.get("welcome") === "1");
  const { data } = useFetch<InsightsData>("/api/insights");
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingStartedAt, setAiLoadingStartedAt] = useState<number | null>(null);
  const [aiError, setAiError] = useState("");
  const [canGenerate, setCanGenerate] = useState(true);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [nextAvailable, setNextAvailable] = useState<string | null>(null);
  const [showStories, setShowStories] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const premium = usePremium();

  // Dispara monthInsight cuando aparece un insight nuevo (generatedAt cambia)
  useEffect(() => {
    if (!aiResult?.generatedAt) return;
    if (typeof window === "undefined") return;
    const lastSeen = localStorage.getItem("fintrk.premium.lastSeenInsight");
    if (lastSeen !== aiResult.generatedAt) {
      premium.monthInsight();
      localStorage.setItem("fintrk.premium.lastSeenInsight", aiResult.generatedAt);
    }
  }, [aiResult?.generatedAt, premium]);

  useEffect(() => {
    apiFetch("/api/ai/insights")
      .then(r => r.json())
      .then((status: AIStatusResponse) => {
        setCanGenerate(status.canGenerate);
        setLastGenerated(status.lastGenerated);
        setNextAvailable(status.nextAvailable);
        if (status.cached && typeof status.cached.healthScore === "number") {
          setAiResult(status.cached);
        }
      })
      .catch(() => {});
  }, []);


  async function generateAI() {
    setAiLoading(true);
    setAiLoadingStartedAt(Date.now());
    setAiError("");
    try {
      const res = await apiFetch("/api/ai/insights", { method: "POST" });
      let result;
      try {
        result = await res.json();
      } catch {
        setAiError(`Error del servidor (${res.status})`);
        return;
      }
      if (!res.ok) {
        setAiError(result.error || `Error al generar análisis (${res.status})`);
        return;
      }
      setAiResult(result);
      setLastGenerated(new Date().toISOString());
      setShowStories(true);

      apiFetch("/api/ai/insights").then(r => r.json()).then((s: AIStatusResponse) => {
        setCanGenerate(s.canGenerate);
        setNextAvailable(s.nextAvailable);
      }).catch(() => {});
    } catch (e) {
      console.error("AI generate error:", e);
      setAiError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setAiLoading(false);
      setAiLoadingStartedAt(null);
    }
  }

  const velocity = data?.velocity ?? { dailyAvg: 0, projected: 0, daysLeft: 0, daysElapsed: 0 };
  const currentSavingsRate = data?.currentSavingsRate ?? 0;
  const categoryChanges = data?.categoryChanges ?? [];
  const topExpenses = data?.topExpenses ?? [];
  const statsLoaded = !!data;

  const minsUntilNext = nextAvailable
    ? Math.max(0, Math.ceil((new Date(nextAvailable).getTime() - Date.now()) / (60 * 1000)))
    : 0;

  return (
    <>
      {/* Story overlay */}
      {showStories && aiResult && (
        <InsightStories result={aiResult} onClose={() => setShowStories(false)} t={t} router={router} />
      )}

      <div className="animate-in animate-stagger space-y-5">

        <div>
          <h1 className="text-xl font-bold">{t("insights")}</h1>
          <p className="text-sm text-muted-foreground">{t("insightsDesc")}</p>
        </div>

        {/* Welcome banner: solo la primera vez (cuando viene del setup
            panel completado). Cierra al pulsar X o al generar el primer
            analisis. */}
        {showWelcome && (
          <div className="rounded-2xl border border-[#2D6A4F]/30 bg-gradient-to-br from-[#2D6A4F]/10 via-[#2D6A4F]/5 to-transparent p-5 relative animate-in">
            <button
              type="button"
              onClick={() => setShowWelcome(false)}
              aria-label="Cerrar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-muted/60 active:scale-90 transition-all flex items-center justify-center"
            >
              <X size={14} className="text-muted-foreground" />
            </button>
            <div className="flex items-start gap-3">
              <Lupo state="thinking" size={72} />
              <div className="flex-1 min-w-0 pr-6">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#2D6A4F] font-bold">
                  {t("insightsWelcomeChip")}
                </span>
                <h2 className="text-lg font-extrabold leading-tight mt-1">
                  {t("insightsWelcomeTitle")}
                </h2>
                <p className="text-xs text-muted-foreground leading-snug mt-1">
                  {t("insightsWelcomeBody")}
                </p>
              </div>
            </div>
            <ul className="mt-3 grid gap-1.5">
              {[
                t("insightsWelcomeBullet1"),
                t("insightsWelcomeBullet2"),
                t("insightsWelcomeBullet3"),
              ].map((b, i) => (
                <li key={i} className="text-[12px] leading-snug flex items-start gap-2">
                  <Sparkles size={12} className="text-[#2D6A4F] shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground italic mt-3">
              {t("insightsWelcomeHint")}
            </p>
          </div>
        )}

        {/* Previous analysis card — tap to re-view stories */}
        {aiResult && (
          <button
            onClick={() => setShowStories(true)}
            className="w-full rounded-2xl bg-card border border-border p-5 shadow-sm text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
              {/* Mini gauge */}
              <div className="relative w-16 h-16 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
                  <circle
                    cx="60" cy="60" r="50"
                    fill="none"
                    stroke={aiResult.healthScore >= 60 ? "#2D6A4F" : aiResult.healthScore >= 40 ? "#F4A261" : "#EF4444"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 50}
                    strokeDashoffset={2 * Math.PI * 50 * (1 - aiResult.healthScore / 100)}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-extrabold tabular-nums">{aiResult.healthScore}</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-0.5">{aiResult.healthLabel}</p>
                <p className="text-xs text-muted-foreground truncate">{aiResult.summary}</p>
                {lastGenerated && (
                  <p className="text-[10px] text-muted-foreground/50 mt-1">{formatTimeAgo(lastGenerated, t)}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </div>

            {/* Insight type badges */}
            <div className="flex gap-1.5 mt-3 overflow-hidden">
              {aiResult.insights.map((ins, i) => {
                const cfg = INSIGHT_CONFIG[ins.type] ?? INSIGHT_CONFIG.alert;
                const Icon = cfg.icon;
                return (
                  <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r ${cfg.gradient}/10`}>
                    <Icon size={10} style={{ color: cfg.color }} />
                    <span className="text-[9px] font-medium" style={{ color: cfg.color }}>{cfg.label.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </button>
        )}

        {/* Quick stats */}
        {statsLoaded && (
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl bg-card border border-border p-3 text-center shadow-sm">
              <div className="text-lg font-bold tabular-nums">{"\u20AC"}{fmt(velocity.dailyAvg)}</div>
              <div className="text-[10px] text-muted-foreground">{t("perDay")}</div>
            </div>
            <div className="flex-1 rounded-xl bg-card border border-border p-3 text-center shadow-sm">
              <div className={`text-lg font-bold tabular-nums ${currentSavingsRate >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                {currentSavingsRate}%
              </div>
              <div className="text-[10px] text-muted-foreground">{t("savings")}</div>
            </div>
            <div className="flex-1 rounded-xl bg-card border border-border p-3 text-center shadow-sm">
              <div className="text-lg font-bold tabular-nums">{"\u20AC"}{fmt(velocity.projected)}</div>
              <div className="text-[10px] text-muted-foreground">{t("projected")}</div>
            </div>
          </div>
        )}

        {/* Generate button — el atributo data-tour se mantiene en los 3 branches
            para que el tour siempre encuentre un elemento al que apuntar,
            incluso mientras la IA está cargando o está en cooldown. */}
        {aiLoading ? (
          <InsightsGenerating open={aiLoading} startedAt={aiLoadingStartedAt ?? undefined} />
        ) : canGenerate ? (
          <Button
            onClick={generateAI}
            data-tour="insights-generate"
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 font-semibold text-base shadow-lg shadow-[#2D6A4F]/20"
          >
            <Sparkles size={16} className="mr-2" />
            {aiResult ? t("newAnalysis") : t("generateAnalysis")}
          </Button>
        ) : (
          <div data-tour="insights-generate" className="rounded-xl bg-muted/40 p-3 text-center">
            <p className="text-xs text-muted-foreground">
              {t("nextAnalysisIn")} {minsUntilNext} {minsUntilNext !== 1 ? t("minutePlural") : t("minute")}
            </p>
          </div>
        )}

        {aiError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-sm text-red-400 text-center">{aiError}</p>
          </div>
        )}

        {/* Details */}
        {statsLoaded && (categoryChanges.length > 0 || topExpenses.length > 0) && (
          <>
            <button onClick={() => setShowDetails(!showDetails)} className="w-full flex items-center justify-between px-1 py-2">
              <span className="text-sm font-semibold">{t("monthDetails")}</span>
              <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-300 ${showDetails ? "rotate-180" : ""}`} />
            </button>

            {showDetails && (
              <div className="space-y-5 animate-in">
                {categoryChanges.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium tracking-wide mb-2 px-1">{t("vsPreviousMonth")}</p>
                    <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
                      {categoryChanges.slice(0, 6).map((cat, i) => (
                        <div key={cat.category} className={`flex items-center justify-between py-3 px-4 ${i > 0 ? "border-t border-border/50" : ""}`}>
                          <span className="text-sm capitalize">{cat.category}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold tabular-nums">{"\u20AC"}{fmt(cat.current)}</span>
                            {cat.changePct !== 0 && (
                              <span className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                                cat.direction === "up" ? "bg-red-500/10 text-red-400" : "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                              }`}>
                                {cat.direction === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {cat.changePct > 0 ? "+" : ""}{cat.changePct}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {topExpenses.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium tracking-wide mb-2 px-1">{t("biggestExpenses")}</p>
                    <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
                      {topExpenses.slice(0, 5).map((exp, i) => (
                        <div key={i} className={`flex items-center justify-between py-3 px-4 ${i > 0 ? "border-t border-border/50" : ""}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{exp.description}</p>
                            <p className="text-[11px] text-muted-foreground capitalize">{exp.category}</p>
                          </div>
                          <span className="text-sm font-bold tabular-nums text-red-400 ml-3">-{"\u20AC"}{fmt(exp.eur_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </>
  );
}
