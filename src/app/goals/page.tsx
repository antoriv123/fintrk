"use client";
import { apiFetch } from "@/lib/api";
import { useT, useLocaleCode } from "@/lib/i18n";
import { haptic } from "@/lib/premium/haptics";
import { premiumToast } from "@/components/premium/premium-provider";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { FetchError } from "@/components/fetch-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, PiggyBank, Home, Plane, Car, Laptop, GraduationCap, Dumbbell,
  Globe, Guitar, Smartphone, Coffee, Gamepad2, BookOpen, Trophy, Lock,
  type LucideIcon,
} from "lucide-react";

const GOAL_ICON_MAP: Record<string, LucideIcon> = {
  Target, PiggyBank, Home, Plane, Car, Laptop, GraduationCap, Dumbbell,
  Globe, Guitar, Smartphone, Coffee, Gamepad2, BookOpen, Trophy, Lock,
};

function GoalIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const Icon = GOAL_ICON_MAP[name] ?? Target;
  return <Icon size={size} strokeWidth={1.75} className={className} />;
}

type GoalType = "savings" | "income" | "expense_limit";
type GoalPeriod = "monthly" | "quarterly" | "yearly" | "total";

interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  is_completed: number;
  created_at: string;
  type: GoalType;
  period: GoalPeriod;
  reward: string | null;
  icon: string;
  progress_amount: number;
  progress_pct: number;
  period_from: string;
  period_to: string;
}

const TYPE_LABEL_KEYS: Record<GoalType, string> = {
  savings: "savingsGoalType",
  income: "incomeGoalType",
  expense_limit: "expenseLimitType",
};

const TYPE_COLORS: Record<GoalType, string> = {
  savings: "text-[#2D6A4F] bg-[#2D6A4F]/10",
  income: "text-[#2D6A4F] bg-[#2D6A4F]/10",
  expense_limit: "text-amber-400 bg-amber-400/10",
};

const PERIOD_LABEL_KEYS: Record<GoalPeriod, string> = {
  monthly: "periodMonthly",
  quarterly: "periodQuarterly",
  yearly: "periodYearly",
  total: "periodTotal",
};

const ICON_OPTIONS = [
  "Target", "PiggyBank", "Home", "Plane", "Car", "Laptop", "GraduationCap", "Dumbbell",
  "Globe", "Guitar", "Smartphone", "Coffee", "Gamepad2", "BookOpen", "Trophy", "Lock",
];

const MILESTONES = [
  { pct: 25, label: "25%", color: "bg-amber-700", ring: "ring-amber-700" },
  { pct: 50, label: "50%", color: "bg-zinc-400", ring: "ring-zinc-400" },
  { pct: 75, label: "75%", color: "bg-amber-400", ring: "ring-amber-400" },
  { pct: 100, label: "100%", color: "bg-[#2D6A4F]", ring: "ring-[#2D6A4F]" },
];

function fmtGoal(n: number, localeCode: string) {
  return `€${n.toLocaleString(localeCode, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function daysLeft(deadline: string, t: (key: string) => string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return t("expired");
  if (days === 0) return t("today");
  return `${days}${t("daysRemaining")}`;
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="relative w-full h-4 bg-muted rounded-full overflow-visible my-3">
      {/* Milestone markers */}
      {MILESTONES.map((m) => {
        const hit = pct >= m.pct;
        return (
          <div
            key={m.pct}
            className="absolute top-1/2 -translate-y-1/2 z-10"
            style={{ left: `calc(${m.pct}% - 6px)` }}
          >
            <div
              className={`w-3 h-3 rounded-full border-2 transition-all duration-500 ${
                hit
                  ? `${m.color} border-background shadow-lg`
                  : "bg-muted border-border"
              }`}
              title={m.label}
            />
          </div>
        );
      })}

      {/* Fill */}
      <div
        className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-[#2D6A4F] to-[#2D6A4F]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface ModalProps {
  goal?: Goal;
  onClose: () => void;
  onSave: () => void;
}

function GoalModal({ goal, onClose, onSave }: ModalProps) {
  const t = useT();
  const localeCode = useLocaleCode();
  const [name, setName] = useState(goal?.name ?? "");
  const [type, setType] = useState<GoalType>(goal?.type ?? "savings");
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? "monthly");
  const [target, setTarget] = useState(goal?.target_amount ? String(goal.target_amount) : "");
  const initialDeadline = goal?.deadline?.slice(0, 7) ?? "";
  const [deadlineMonth, setDeadlineMonth] = useState(initialDeadline ? initialDeadline.slice(5, 7) : "");
  const [deadlineYear, setDeadlineYear] = useState(initialDeadline ? initialDeadline.slice(0, 4) : "");
  const deadline = deadlineMonth && deadlineYear ? `${deadlineYear}-${deadlineMonth}` : "";
  const [reward, setReward] = useState(goal?.reward ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "Target");
  const [saving, setSaving] = useState(false);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear + i);
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    const label = new Date(2000, i, 1).toLocaleDateString(localeCode, { month: "long" });
    return { value: m, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !target) return;
    setSaving(true);
    try {
      const body = {
        name,
        type,
        period,
        target_amount: parseFloat(target),
        deadline: deadline ? `${deadline}-01` : null,
        reward: reward || null,
        icon,
      };

      const res = goal
        ? await apiFetch(`/api/goals/${goal.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorSavingGoal")); return; }
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        paddingLeft: "1rem",
        paddingRight: "1rem",
      }}
    >
      <Card className="w-full max-w-md shadow-2xl my-auto">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-lg font-bold">
              {goal ? t("editGoal") : t("newGoal")}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground h-11 w-11 p-0 text-xl leading-none"
              aria-label={t("close")}
            >
              ×
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Icon selector */}
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wide block mb-2">{t("iconLabel")}</label>
              <div className="grid grid-cols-8 gap-1.5">
                {ICON_OPTIONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`p-2 rounded-lg transition-all flex items-center justify-center ${
                      icon === ic
                        ? "bg-[#2D6A4F]/20 ring-1 ring-[#2D6A4F] text-[#2D6A4F]"
                        : "bg-muted hover:bg-accent text-muted-foreground"
                    }`}
                  >
                    <GoalIcon name={ic} size={18} />
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("goalName")}
              required
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-[#2D6A4F] transition-colors"
            />

            {/* Type */}
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wide block mb-2">{t("typeLabel")}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["savings", "income", "expense_limit"] as GoalType[]).map((gt) => (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => setType(gt)}
                    className={`py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                      type === gt
                        ? "bg-[#2D6A4F] text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(TYPE_LABEL_KEYS[gt] as "savingsGoalType" | "incomeGoalType" | "expenseLimitType")}
                  </button>
                ))}
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wide block mb-2">{t("periodLabel")}</label>
              <div className="grid grid-cols-4 gap-2">
                {(["monthly", "quarterly", "yearly", "total"] as GoalPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`py-2 px-2 rounded-xl text-xs font-medium transition-all ${
                      period === p
                        ? "bg-[#2D6A4F] text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(PERIOD_LABEL_KEYS[p] as "periodMonthly" | "periodQuarterly" | "periodYearly" | "periodTotal")}
                  </button>
                ))}
              </div>
            </div>

            {/* Target */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0"
                required
                min="1"
                step="0.01"
                className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm text-foreground outline-none focus:border-[#2D6A4F] transition-colors"
              />
            </div>

            {/* Deadline — selectores mes/año (más fiables que type=month en iOS WKWebView) */}
            <div>
              <label className="text-[10px] text-muted-foreground tracking-wide block mb-1.5">
                {t("deadlineOptional")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={deadlineMonth}
                  onChange={(e) => setDeadlineMonth(e.target.value)}
                  className="w-full min-w-0 bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#2D6A4F] transition-colors appearance-none"
                >
                  <option value="">—</option>
                  {monthOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={deadlineYear}
                  onChange={(e) => setDeadlineYear(e.target.value)}
                  className="w-full min-w-0 bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#2D6A4F] transition-colors appearance-none tabular-nums"
                >
                  <option value="">—</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reward */}
            <input
              type="text"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder={t("rewardPlaceholder")}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 transition-colors"
            />

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-primary hover:bg-primary/90 text-white"
            >
              {saving ? t("saving") : goal ? t("savingChanges") : t("createGoal")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

interface GoalCardProps {
  goal: Goal;
  onEdit: (g: Goal) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
  fmt: (n: number) => string;
}

function GoalCard({ goal, onEdit, onDelete, onComplete, t, fmt }: GoalCardProps) {
  const unlocked = goal.progress_pct >= 100;
  const nextMilestone = MILESTONES.find((m) => goal.progress_pct < m.pct);

  return (
    <Card
      className={`relative flex flex-col gap-3 transition-all duration-300 ${
        unlocked
          ? "border-amber-500/50 shadow-lg shadow-amber-500/10"
          : ""
      }`}
    >
      <CardContent className="pt-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <GoalIcon name={goal.icon} size={20} className="text-foreground" />
                    </div>
            <div>
              <div className="font-semibold leading-tight">{goal.name}</div>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[goal.type]}`}>
                  {t(TYPE_LABEL_KEYS[goal.type])}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
                  {t(PERIOD_LABEL_KEYS[goal.period])}
                </span>
                {goal.deadline && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                    {daysLeft(goal.deadline, t)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-2xl font-black tabular-nums ${unlocked ? "text-amber-400" : "text-foreground"}`}>
              {goal.progress_pct}%
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <ProgressBar pct={goal.progress_pct} />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{fmt(goal.progress_amount)}</span>
            <span>{fmt(goal.target_amount)}</span>
          </div>
        </div>

        {/* Next milestone hint */}
        {nextMilestone && goal.progress_pct < 100 && (
          <div className="text-[10px] text-muted-foreground">
            {t("nextMilestone")} {nextMilestone.label} — {t("missingAmount")} {fmt(goal.target_amount * (nextMilestone.pct / 100) - goal.progress_amount)}
          </div>
        )}

        {/* Reward */}
        {goal.reward && (
          <div
            className={`rounded-xl p-3 flex items-center gap-3 transition-all duration-500 ${
              unlocked
                ? "bg-amber-500/10 border border-amber-500/30"
                : "bg-muted border border-border"
            }`}
          >
            <span className="flex-shrink-0">{unlocked ? <Trophy size={18} className="text-amber-400" /> : <Lock size={18} className="text-muted-foreground" />}</span>
            <div>
              <div className={`text-[10px] font-medium tracking-wide ${unlocked ? "text-amber-400" : "text-muted-foreground"}`}>
                {unlocked ? t("rewardUnlocked") : t("rewardLabel")}
              </div>
              <div className={`text-sm mt-0.5 ${unlocked ? "text-amber-300 font-medium" : "text-muted-foreground"}`}>
                {goal.reward}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {unlocked && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onComplete(goal.id)}
              className="flex-1 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
            >
              {t("markCompleted")}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(goal)}
            className="flex-1"
          >
            {t("edit")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(goal.id)}
            className="px-3"
          >
            {t("delete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GoalsPage() {
  const t = useT();
  const localeCode = useLocaleCode();
  const fmt = (n: number) => fmtGoal(n, localeCode);
  const { data, error, refresh } = useFetch<{ goals: Goal[]; completed: Goal[] }>("/api/goals");
  const goals = data?.goals ?? [];
  const completed = data?.completed ?? [];

  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [showCompleted, setShowCompleted] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  if (error) return <FetchError onRetry={handleRefresh} />;

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  function openCreate() {
    setEditingGoal(undefined);
    setShowModal(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setShowModal(true);
  }

  async function handleDelete(id: number) {
    const res = await apiFetch(`/api/goals/${id}`, { method: "DELETE" });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorDeletingGoal")); return; }
    refresh();
  }

  async function handleComplete(id: number) {
    const res = await apiFetch(`/api/goals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_completed: 1 }),
    });
    if (!res.ok) {
      haptic.error();
      const { toast } = await import("sonner");
      toast.error(t("errorCompletingGoal"));
      return;
    }
    haptic.success();
    void premiumToast({
      title: t("goalCompleted"),
      icon: "🏆",
      duration: 3500,
    });
    refresh();
  }

  const totalPct =
    goals.length > 0
      ? Math.round(goals.reduce((s, g) => s + g.progress_pct, 0) / goals.length)
      : 0;

  return (
    <div className="animate-in animate-stagger">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">{t("goals")}</h1>
          <p className="text-sm text-muted-foreground">
            {goals.length > 0
              ? <>{t("avgProgress")} <span className="text-[#2D6A4F] font-semibold">{totalPct}%</span> — {goals.length} {goals.length !== 1 ? t("inGoalsPlural") : t("inGoals")}</>
              : t("goalsEmptyDesc")
            }
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-[#2D6A4F]/20"
        >
          <span className="text-base leading-none mr-1">+</span>
          <span>{t("newGoal")}</span>
        </Button>
      </div>

      {/* Empty state */}
      {goals.length === 0 && completed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Target size={28} className="text-muted-foreground" />
          </div>
          <div className="text-muted-foreground text-lg font-semibold mb-2">{t("noGoalsYet")}</div>
          <div className="text-muted-foreground text-sm mb-6">{t("goalsEmptyDesc")}</div>
          <Button
            onClick={openCreate}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            {t("createFirstGoal")}
          </Button>
        </div>
      )}

      {/* Active goals grid */}
      {goals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
              onComplete={handleComplete}
              t={t}
              fmt={fmt}
            />
          ))}
        </div>
      )}

      {/* Completed goals */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <span className={`transition-transform ${showCompleted ? "rotate-90" : ""}`}>▶</span>
            <span>
              {completed.length} {completed.length !== 1 ? t("inGoalsPlural") : t("inGoals")} {completed.length !== 1 ? t("goalsCompletedPlural") : t("goalsCompleted")}
            </span>
          </button>

          {showCompleted && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {completed.map((goal) => (
                <Card key={goal.id} className="opacity-60">
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <GoalIcon name={goal.icon} size={20} className="text-foreground" />
                    </div>
                      <div>
                        <div className="font-semibold">{goal.name}</div>
                        <div className="text-xs text-muted-foreground">{fmt(goal.target_amount)} — {t("completed")}</div>
                      </div>
                      <div className="ml-auto"><Trophy size={18} className="text-amber-400" /></div>
                    </div>
                    {goal.reward && (
                      <div className="mt-3 text-xs text-amber-600 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                        {goal.reward}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <GoalModal
          goal={editingGoal}
          onClose={() => setShowModal(false)}
          onSave={refresh}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={t("deleteGoalConfirm")}
        description={t("cannotUndo")}
        confirmLabel={t("delete")}
        onConfirm={async () => { if (deleteId) await handleDelete(deleteId); }}
      />
    </div>
  );
}
