"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { useT, useLocaleCode } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";
import { AnimatedNumber } from "@/components/animated-number";
import { FetchError } from "@/components/fetch-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Copy, PiggyBank, Sparkles, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

// MONTH_NAMES resolved via t() inside the component
const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

interface Envelope {
  id: number;
  name: string;
  category: string;
  budgeted: number;
  spent: number;
  remaining: number;
  percentage: number;
  rollover: number;
  rollover_amount: number;
}

interface BudgetsData {
  month: string;
  envelopes: Envelope[];
  totals: { income: number; budgeted: number; spent: number; unassigned: number };
}

interface Suggestion {
  category: string;
  monthlyAverage: number;
  suggestedBudget: number;
  reason: string;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  summary?: { income: number; necessaryTotal: number; discretionaryTotal: number; savingsTarget: number };
  monthsOfData: number;
  monthlyIncome: number;
  fixedTotal: number;
  source?: "ai" | "heuristic";
  message?: string;
}

function formatMonthWithT(month: string, tFn: (key: string) => string): string {
  const [y, m] = month.split("-").map(Number);
  return `${tFn(MONTH_KEYS[m - 1])} ${y}`;
}
function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function fmtLocale(n: number, localeCode: string) {
  return n.toLocaleString(localeCode, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const categoryEntries = Object.entries(EXPENSE_CATEGORIES) as [string, { label: string; icon: string; color: string }][];

export default function BudgetsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const localeCode = useLocaleCode();
  const fmt = (n: number) => fmtLocale(n, localeCode);
  const [month, setMonth] = useState(getCurrentMonth);
  const { data, error, refresh } = useFetch<BudgetsData>(`/api/budgets?month=${month}`);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newRollover, setNewRollover] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleteEnvId, setDeleteEnvId] = useState<number | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const existingCategories = new Set(data?.envelopes.map((e) => e.category) ?? []);
  const availableCategories = categoryEntries.filter(([slug]) => !existingCategories.has(slug) && slug !== "transferencia");

  const saveEnvelope = useCallback(async (category: string, budgeted: number, rollover?: boolean) => {
    const catInfo = EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES];
    const res = await apiFetch("/api/budgets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, budgeted, month, name: catInfo?.label ?? category, rollover: rollover ?? false }),
    });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorSaving")); return; }
    refresh();
  }, [month, refresh, t]);

  const deleteEnvelope = useCallback(async (id: number) => {
    const res = await apiFetch("/api/budgets", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorDeleting")); return; }
    refresh();
  }, [refresh, t]);

  const copyFromPrevious = useCallback(async () => {
    setCopying(true);
    try {
      const res = await apiFetch("/api/budgets/copy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_month: prevMonth(month), to_month: month }),
      });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorCopying")); return; }
      await refresh();
    } finally { setCopying(false); }
  }, [month, refresh, t]);

  const handleAdd = useCallback(async () => {
    if (!newCategory || !newAmount) return;
    await saveEnvelope(newCategory, parseFloat(newAmount), newRollover);
    setNewCategory(""); setNewAmount(""); setNewRollover(false); setShowAdd(false);
  }, [newCategory, newAmount, newRollover, saveEnvelope]);

  const handleEditSave = useCallback(async (env: Envelope) => {
    const amount = parseFloat(editAmount);
    if (isNaN(amount)) return;
    await saveEnvelope(env.category, amount, env.rollover === 1);
    setEditingId(null); setEditAmount("");
  }, [editAmount, saveEnvelope]);

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  const isCurrentMonth = month === getCurrentMonth();

  // Month-progress metrics (solo útiles en el mes actual)
  const today = new Date();
  const totalDays = daysInMonth(month);
  const dayOfMonth = isCurrentMonth ? today.getDate() : totalDays;
  const daysLeft = Math.max(0, totalDays - dayOfMonth);
  const monthProgressPct = Math.round((dayOfMonth / totalDays) * 100);

  // Enriquecer envelopes con proyección y estado.
  const enrichedEnvelopes = useMemo(() => {
    const envs = data?.envelopes ?? [];
    return envs.map(env => {
      const totalAvailable = env.budgeted + env.rollover_amount;
      const projected = isCurrentMonth && dayOfMonth > 0
        ? Math.round((env.spent / dayOfMonth) * totalDays * 100) / 100
        : env.spent;
      const expectedByNow = isCurrentMonth && totalAvailable > 0
        ? Math.round(totalAvailable * (dayOfMonth / totalDays) * 100) / 100
        : totalAvailable;
      const pace = expectedByNow > 0 ? env.spent / expectedByNow : env.percentage / 100;
      const status: "exceeded" | "warning" | "on_track" | "ahead" =
        env.percentage >= 100 ? "exceeded"
        : pace >= 1.15 ? "warning"
        : pace <= 0.85 ? "ahead"
        : "on_track";
      return { ...env, totalAvailable, projected, expectedByNow, status };
    }).sort((a, b) => {
      // Pasados primero, luego aviso, luego on_track, luego ahead.
      const order = { exceeded: 0, warning: 1, on_track: 2, ahead: 3 } as const;
      return order[a.status] - order[b.status] || b.percentage - a.percentage;
    });
  }, [data, isCurrentMonth, dayOfMonth, totalDays]);

  if (error) return <FetchError onRetry={handleRefresh} />;

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    );
  }

  const { envelopes, totals } = data;
  const totalPct = totals.budgeted > 0 ? Math.round((totals.spent / totals.budgeted) * 100) : 0;
  const expectedSpentByNow = totals.budgeted * (dayOfMonth / totalDays);
  const projectedEOM = isCurrentMonth && dayOfMonth > 0
    ? Math.round((totals.spent / dayOfMonth) * totalDays)
    : totals.spent;
  const dailyAllowance = daysLeft > 0
    ? Math.max(0, Math.round(((totals.budgeted - totals.spent) / daysLeft) * 100) / 100)
    : 0;
  const paceDelta = totals.spent - expectedSpentByNow;
  const paceStatus: "ahead" | "warning" | "on_track" =
    !isCurrentMonth || totals.budgeted === 0 ? "on_track"
    : paceDelta > totals.budgeted * 0.05 ? "warning"
    : paceDelta < -totals.budgeted * 0.05 ? "ahead"
    : "on_track";

  const paceLabel = paceStatus === "warning"
    ? t("budgetPaceAhead")
    : paceStatus === "ahead"
    ? t("budgetPaceBehind")
    : t("budgetPaceOk");

  return (
    <div className="animate-in animate-stagger space-y-5">

      <div>
        <h1 className="text-xl font-bold">{t("budgets")}</h1>
        <p className="text-sm text-muted-foreground">{t("budgetsDesc")}</p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(prevMonth(month))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-90">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setMonth(getCurrentMonth())}
          className={`px-5 py-2 rounded-full text-sm font-semibold capitalize transition-all active:scale-95 ${
            isCurrentMonth ? "bg-[#2D6A4F]/15 text-[#2D6A4F]" : "bg-muted/60 text-foreground hover:bg-muted"
          }`}>
          {formatMonthWithT(month, t)}
        </button>
        <button onClick={() => setMonth(nextMonth(month))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-all active:scale-90">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Header health card */}
      <div className="rounded-3xl bg-gradient-to-br from-[#2D6A4F]/8 to-card border border-border p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium tracking-wide mb-1 uppercase">{t("spentSlashBudgeted")}</p>
            <p className="text-3xl font-extrabold tabular-nums leading-tight">
              <AnimatedNumber value={totals.spent} prefix={getCurrencySymbol("EUR")} formatOptions={{ minimumFractionDigits: 0, maximumFractionDigits: 2 }} />
            </p>
            <p className="text-sm text-muted-foreground">
              {t("outOf")} {getCurrencySymbol("EUR")}{fmt(totals.budgeted)}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-extrabold tabular-nums ${totalPct > 100 ? "text-red-400" : totalPct > 80 ? "text-amber-400" : "text-[#2D6A4F]"}`}>
              {totalPct}%
            </p>
            {isCurrentMonth && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("dayOfMonthLabel").replace("{day}", String(dayOfMonth)).replace("{total}", String(totalDays))}
              </p>
            )}
          </div>
        </div>

        {/* Dual progress bar: spent vs month progress */}
        <div className="relative h-2.5 bg-border/60 rounded-full overflow-hidden">
          {isCurrentMonth && (
            <div
              className="absolute top-0 h-full w-px bg-foreground/40 z-10"
              style={{ left: `${Math.min(monthProgressPct, 100)}%` }}
              title={`Dia ${dayOfMonth}/${totalDays}`}
            />
          )}
          <div className={`h-full rounded-full transition-all duration-500 ${totalPct > 100 ? "bg-red-400" : totalPct > 80 ? "bg-amber-400" : "bg-[#2D6A4F]"}`}
            style={{ width: `${Math.min(totalPct, 100)}%` }} />
        </div>

        {/* Pace + projection + daily allowance — solo mes actual */}
        {isCurrentMonth && totals.budgeted > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <div className="flex items-center gap-1 mb-0.5">
                {paceStatus === "warning" ? <TrendingUp size={12} className="text-amber-400" /> :
                 paceStatus === "ahead" ? <TrendingDown size={12} className="text-[#2D6A4F]" /> :
                 <Minus size={12} className="text-muted-foreground" />}
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("budgetPace")}</p>
              </div>
              <p className={`text-xs font-bold ${paceStatus === "warning" ? "text-amber-400" : paceStatus === "ahead" ? "text-[#2D6A4F]" : "text-foreground"}`}>
                {paceLabel}
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("projectedEOM")}</p>
              <p className={`text-xs font-bold tabular-nums ${projectedEOM > totals.budgeted ? "text-red-400" : "text-foreground"}`}>
                {getCurrencySymbol("EUR")}{fmt(projectedEOM)}
              </p>
            </div>
            <div className="rounded-xl bg-background/60 border border-border/60 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("dailyAllowance")}</p>
              <p className="text-xs font-bold tabular-nums text-foreground">
                {getCurrencySymbol("EUR")}{fmt(dailyAllowance)}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-1 border-t border-border/50">
          <span className="text-[11px] text-muted-foreground">{t("incomeLabel")}: {getCurrencySymbol("EUR")}{fmt(totals.income)}</span>
          <span className={`text-[11px] font-medium ${totals.unassigned >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
            {getCurrencySymbol("EUR")}{fmt(totals.unassigned)} {t("unassigned")}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowAdd(true)} size="sm" className="rounded-xl bg-primary hover:bg-primary/90 flex-1">
          <Plus size={14} className="mr-1" /> {t("addBudget")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowSuggestions(true)} className="rounded-xl">
          <Sparkles size={14} className="mr-1" /> {envelopes.length === 0 ? t("budgetSuggestAI") : t("budgetSuggestAdjust")}
        </Button>
        <Button variant="outline" size="sm" onClick={copyFromPrevious} disabled={copying} className="rounded-xl">
          <Copy size={14} className="mr-1" /> {copying ? t("copying") : t("copyPrevious")}
        </Button>
      </div>

      {/* Empty state */}
      {envelopes.length === 0 && (
        <div className="flex flex-col items-center text-center py-10 gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[#2D6A4F]/10 flex items-center justify-center">
            <PiggyBank size={24} className="text-[#2D6A4F]" />
          </div>
          <div>
            <p className="font-semibold text-base mb-1">{t("budgetEmptyTitle")}</p>
            <p className="text-muted-foreground text-sm max-w-[260px] mx-auto">
              {t("budgetEmptyDesc")}
            </p>
          </div>
          <Button
            className="rounded-xl gap-2 bg-primary hover:bg-primary/90"
            onClick={() => setShowSuggestions(true)}
          >
            <Sparkles size={16} />
            {t("budgetSuggestAI")}
          </Button>
          <p className="text-[11px] text-muted-foreground">{t("budgetSuggestAIDesc")}</p>
        </div>
      )}

      {/* Envelope list */}
      <div className="space-y-3">
        {enrichedEnvelopes.map((env) => {
          const catInfo = EXPENSE_CATEGORIES[env.category as keyof typeof EXPENSE_CATEGORIES] ?? { label: env.category, icon: "CircleDot", color: "#71717a" };
          const isEditing = editingId === env.id;
          const pct = env.percentage;
          const barColor = pct >= 100 ? "bg-red-400" : env.status === "warning" ? "bg-amber-400" : pct >= 80 ? "bg-amber-400" : "bg-[#2D6A4F]";
          const textColor = pct >= 100 ? "text-red-400" : env.status === "warning" ? "text-amber-400" : pct >= 80 ? "text-amber-400" : "text-[#2D6A4F]";

          const statusLabel =
            env.status === "exceeded" ? t("statusExceeded")
            : env.status === "warning" ? t("statusWarning")
            : env.status === "ahead" ? t("statusAhead")
            : t("statusOnTrack");
          const statusClass =
            env.status === "exceeded" ? "bg-red-500/10 text-red-400"
            : env.status === "warning" ? "bg-amber-500/10 text-amber-500"
            : env.status === "ahead" ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
            : "bg-muted text-muted-foreground";

          return (
            <div key={env.id} className="rounded-2xl bg-card border border-border p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <CategoryIcon icon={catInfo.icon} color={catInfo.color} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{catInfo.label}</p>
                      {isCurrentMonth && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${statusClass}`}>
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {getCurrencySymbol("EUR")}{fmt(env.spent)} {t("outOf")} {getCurrencySymbol("EUR")}{fmt(env.totalAvailable)}
                      {env.rollover_amount > 0 && <span> (+{getCurrencySymbol("EUR")}{fmt(env.rollover_amount)})</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-sm font-bold tabular-nums ${textColor}`}>{pct}%</span>
                  <button onClick={() => { if (isEditing) { setEditingId(null); } else { setEditingId(env.id); setEditAmount(String(env.budgeted)); } }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                    {isEditing ? <X size={14} /> : <Pencil size={14} />}
                  </button>
                  <button onClick={() => setDeleteEnvId(env.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {isEditing && (
                <div className="flex gap-2 mb-3 animate-in">
                  <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                    className="h-9 flex-1" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(env); }} />
                  <Button size="sm" className="h-9 bg-primary hover:bg-primary/90" onClick={() => handleEditSave(env)}>{t("save")}</Button>
                </div>
              )}

              {/* Progress bar with month-progress tick */}
              <div className="relative h-2 bg-border rounded-full overflow-hidden">
                {isCurrentMonth && (
                  <div
                    className="absolute top-0 h-full w-px bg-foreground/40 z-10"
                    style={{ left: `${Math.min(monthProgressPct, 100)}%` }}
                  />
                )}
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>

              <div className="flex justify-between mt-1.5">
                <span className={`text-[11px] font-medium ${env.remaining >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                  {env.remaining >= 0 ? `${getCurrencySymbol("EUR")}${fmt(env.remaining)} ${t("available")}` : `${getCurrencySymbol("EUR")}${fmt(Math.abs(env.remaining))} ${t("overBudget")}`}
                </span>
                {isCurrentMonth && env.projected !== env.spent && (
                  <span className={`text-[10px] font-medium ${env.projected > env.totalAvailable ? "text-red-400" : "text-muted-foreground"}`}>
                    {t("projectedEOMShort")}: {getCurrencySymbol("EUR")}{fmt(env.projected)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Suggestions dialog */}
      <SuggestionsDialog
        open={showSuggestions}
        onOpenChange={setShowSuggestions}
        existing={existingCategories}
        month={month}
        onApplied={async () => { await refresh(); setShowSuggestions(false); }}
      />

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newBudget")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{t("category")}</label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue placeholder={t("selectCategoryBudget")} /></SelectTrigger>
                <SelectContent>
                  {availableCategories.map(([slug, info]) => (
                    <SelectItem key={slug} value={slug}>
                      <span className="flex items-center gap-2">
                        <CategoryIcon icon={info.icon} color={info.color} size="sm" withBackground={false} />
                        {info.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{t("monthlyLimit")}</label>
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">{getCurrencySymbol("EUR")}</span>
                <Input type="number" placeholder="0" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="text-lg font-bold" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">{t("rollover")}</label>
                <p className="text-[11px] text-muted-foreground">{t("rolloverDesc")}</p>
              </div>
              <Switch checked={newRollover} onCheckedChange={setNewRollover} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>{t("cancel")}</Button>
            <Button onClick={handleAdd} disabled={!newCategory || !newAmount} className="bg-primary hover:bg-primary/90">{t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteEnvId !== null}
        onOpenChange={(open) => { if (!open) setDeleteEnvId(null); }}
        title={t("deleteBudgetTitle")}
        description={t("deleteBudgetDesc")}
        confirmLabel={t("delete")}
        onConfirm={async () => { if (deleteEnvId) await deleteEnvelope(deleteEnvId); }}
      />
    </div>
  );
}

/* ── AI Suggestions dialog ── */
function SuggestionsDialog({
  open, onOpenChange, existing, month, onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Set<string>;
  month: string;
  onApplied: () => Promise<void> | void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const localeCode = useLocaleCode();
  const fmt = (n: number) => fmtLocale(n, localeCode);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [edits, setEdits] = useState<Record<string, { amount: number; keep: boolean }>>({});
  const [saving, setSaving] = useState(false);

  // Fetch on open
  const load = useCallback(async () => {
    setLoading(true);
    setData(null);
    setEdits({});
    try {
      const res = await apiFetch("/api/ai/suggest-budgets");
      const json = await res.json() as SuggestionsResponse;
      setData(json);
      const initial: Record<string, { amount: number; keep: boolean }> = {};
      (json.suggestions ?? []).forEach(s => {
        initial[s.category] = { amount: s.suggestedBudget, keep: !existing.has(s.category) };
      });
      setEdits(initial);
    } catch {
      const { toast } = await import("sonner");
      toast.error(t("error"));
    } finally {
      setLoading(false);
    }
  }, [existing, t]);

  // Trigger load when dialog opens (use effect, not memo — load has side effects).
  useEffect(() => {
    if (open && !data && !loading) void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleApply = async () => {
    if (!data) return;
    setSaving(true);
    const toCreate = data.suggestions.filter(s => edits[s.category]?.keep && edits[s.category].amount > 0);

    const results = await Promise.all(toCreate.map(async (s) => {
      const catInfo = EXPENSE_CATEGORIES[s.category as keyof typeof EXPENSE_CATEGORIES];
      try {
        const res = await apiFetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: s.category,
            budgeted: edits[s.category].amount,
            month,
            name: catInfo?.label ?? s.category,
            rollover: false,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error(`POST /api/budgets failed for ${s.category}:`, res.status, detail);
          return { ok: false as const, category: s.category };
        }
        return { ok: true as const, category: s.category };
      } catch (e) {
        console.error(`POST /api/budgets threw for ${s.category}:`, e);
        return { ok: false as const, category: s.category };
      }
    }));

    const created = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).map(r => r.category);

    setSaving(false);

    const { toast } = await import("sonner");
    if (created === 0) {
      toast.error(t("errorSaving"));
      return; // dejar el modal abierto para reintentar
    }
    if (failed.length > 0) {
      toast.warning(`${created}/${toCreate.length} ${t("budgetsCreated")}`);
    } else {
      toast.success(`${created} ${t("budgetsCreated")}`);
    }
    await onApplied();
  };

  const totalSelected = data
    ? data.suggestions.reduce((sum, s) => sum + (edits[s.category]?.keep ? edits[s.category].amount : 0), 0)
    : 0;
  const selectedCount = data
    ? data.suggestions.filter(s => edits[s.category]?.keep).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-[#2D6A4F]" />
            {t("aiBudgetTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("aiBudgetDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={28} className="animate-spin text-[#2D6A4F]" />
              <p className="text-sm text-muted-foreground">{t("aiBudgetAnalyzing")}</p>
            </div>
          )}

          {!loading && data && data.suggestions.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{data.message ?? t("needMoreData")}</p>
            </div>
          )}

          {!loading && data && data.suggestions.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              {data.summary && (
                <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("aiIncomeLabel")}</span>
                    <span className="font-semibold tabular-nums">{getCurrencySymbol("EUR")}{fmt(data.summary.income)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("aiFixedLabel")}</span>
                    <span className="font-semibold tabular-nums">{getCurrencySymbol("EUR")}{fmt(data.fixedTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">{t("aiSavingsTarget")}</span>
                    <span className={`font-semibold tabular-nums ${data.summary.savingsTarget > 0 ? "text-[#2D6A4F]" : "text-amber-400"}`}>
                      {getCurrencySymbol("EUR")}{fmt(data.summary.savingsTarget)}
                    </span>
                  </div>
                </div>
              )}

              {/* Editable suggestions list */}
              <div className="space-y-2">
                {data.suggestions.map(s => {
                  const info = EXPENSE_CATEGORIES[s.category as keyof typeof EXPENSE_CATEGORIES] ?? { label: s.category, icon: "CircleDot", color: "#71717a" };
                  const entry = edits[s.category] ?? { amount: s.suggestedBudget, keep: true };
                  const alreadyExists = existing.has(s.category);
                  return (
                    <div key={s.category} className={`rounded-xl border p-3 transition-all ${entry.keep ? "bg-card border-border" : "bg-muted/20 border-border/50 opacity-60"}`}>
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setEdits(prev => ({ ...prev, [s.category]: { ...entry, keep: !entry.keep } }))}
                          className={`w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center transition-colors ${entry.keep ? "bg-[#2D6A4F]" : "bg-muted border border-border"}`}
                        >
                          {entry.keep && <span className="text-white text-xs leading-none">✓</span>}
                        </button>
                        <CategoryIcon icon={info.icon} color={info.color} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{info.label}</p>
                            {alreadyExists && <span className="text-[9px] text-muted-foreground">({t("aiBudgetExists")})</span>}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{s.reason}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                            {t("aiBudgetAvg")}: {getCurrencySymbol("EUR")}{fmt(s.monthlyAverage)}/mes
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-sm text-muted-foreground">{getCurrencySymbol("EUR")}</span>
                          <Input
                            type="number"
                            value={entry.amount}
                            disabled={!entry.keep}
                            onChange={(e) => setEdits(prev => ({ ...prev, [s.category]: { ...entry, amount: parseFloat(e.target.value) || 0 } }))}
                            className="h-8 w-20 text-right text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-4 border-t border-border flex items-center sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground flex-1 text-left">
            {selectedCount > 0 && (
              <>
                <span className="font-semibold text-foreground">{selectedCount}</span> {t("aiBudgetSelected")}
                {" · "}
                <span className="font-semibold tabular-nums text-foreground">{getCurrencySymbol("EUR")}{fmt(totalSelected)}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("cancel")}</Button>
            <Button
              onClick={handleApply}
              disabled={saving || selectedCount === 0}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? <><Loader2 size={14} className="mr-1 animate-spin" /> {t("saving")}</> : t("aiBudgetApply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
