"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, CircleCheck, FileSpreadsheet, Repeat, Sparkles, Tag, Target, Wallet } from "lucide-react";
import { useT } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { usePremium } from "@/components/premium/premium-provider";

interface SetupStatus {
  tasks: {
    account: boolean;
    importStatement: boolean;
    fixedExpenses: boolean;
    customCategory: boolean;
    goal: boolean;
  };
  completed: number;
  total: number;
  panelDismissed: boolean;
  allDone: boolean;
}

type TaskKey = keyof SetupStatus["tasks"];

interface TaskMeta {
  key: TaskKey;
  icon: typeof Wallet;
  color: string;
  titleKey: string;
  descKey: string;
  href: string;
}

// Orden = orden visual en el panel.
const TASKS: TaskMeta[] = [
  {
    key: "account",
    icon: Wallet,
    color: "#3B82F6",
    titleKey: "setupTaskAccountTitle",
    descKey: "setupTaskAccountDesc",
    href: "/setup/account",
  },
  {
    key: "importStatement",
    icon: FileSpreadsheet,
    color: "#0EA5E9",
    titleKey: "setupTaskImportTitle",
    descKey: "setupTaskImportDesc",
    href: "/import",
  },
  {
    key: "fixedExpenses",
    icon: Repeat,
    color: "#F59E0B",
    titleKey: "setupTaskFixedTitle",
    descKey: "setupTaskFixedDesc",
    href: "/setup/fixed-expenses",
  },
  {
    key: "customCategory",
    icon: Tag,
    color: "#2D6A4F",
    titleKey: "setupTaskCategoryTitle",
    descKey: "setupTaskCategoryDesc",
    href: "/setup/category",
  },
  {
    key: "goal",
    icon: Target,
    color: "#EC4899",
    titleKey: "setupTaskGoalTitle",
    descKey: "setupTaskGoalDesc",
    href: "/goals",
  },
];

export function SetupPanel() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const premium = usePremium();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const celebratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/setup/status");
        if (!res.ok) return;
        const data = (await res.json()) as SetupStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // best-effort: si falla el endpoint, el panel simplemente no aparece
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nextTaskKey = useMemo<TaskKey | null>(() => {
    if (!status) return null;
    const next = TASKS.find((tt) => !status.tasks[tt.key]);
    return next?.key ?? null;
  }, [status]);

  // Cuando se completa la ultima tarea: dispara celebracion, marca el
  // panel como dismissed y manda al user a /insights con welcome=1 para
  // introducirle a la seccion de analisis.
  useEffect(() => {
    if (!status || celebratedRef.current) return;
    if (status.allDone && !status.panelDismissed) {
      celebratedRef.current = true;
      premium.firstExpenseEver();
      apiFetch("/api/setup/dismiss", { method: "POST" }).catch(() => {});
      const timer = setTimeout(() => {
        setHidden(true);
        router.push("/insights?welcome=1");
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [status, premium, router]);

  if (!status) return null;
  if (status.panelDismissed) return null;
  if (hidden) return null;

  const progress = Math.round((status.completed / status.total) * 100);

  return (
    <div className="rounded-2xl bg-[#2D6A4F]/8 border border-[#2D6A4F]/20 p-5 mb-6 animate-in">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            {status.allDone ? <CheckCircle2 size={18} className="text-[#2D6A4F]" /> : null}
            {status.allDone ? t("setupTitleDone") : t("setupTitle")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status.allDone ? t("setupSubtitleDone") : t("setupSubtitle")}
          </p>
        </div>
        <span className="text-xs font-bold text-[#2D6A4F] tabular-nums shrink-0 mt-1">
          {status.completed}/{status.total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-border rounded-full overflow-hidden mb-4 mt-2">
        <div
          className="h-full bg-[#2D6A4F] rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-2">
        {TASKS.map((task, i) => {
          const Icon = task.icon;
          const done = status.tasks[task.key];
          const isNext = !done && task.key === nextTaskKey;
          return (
            <Link
              key={task.key}
              href={task.href}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] animate-in ${
                done
                  ? "border-[#2D6A4F]/20 bg-[#2D6A4F]/5 opacity-60"
                  : isNext
                  ? "border-[#2D6A4F]/30 bg-card shadow-md shadow-[#2D6A4F]/10"
                  : "border-border bg-card"
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {done ? (
                <CircleCheck size={22} className="text-[#2D6A4F] shrink-0" />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: task.color + "1a" }}
                >
                  <Icon size={18} style={{ color: task.color }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${done ? "line-through text-muted-foreground" : ""}`}>
                  {t(task.titleKey)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">{t(task.descKey)}</p>
              </div>
              {!done && isNext && <ArrowRight size={16} className="text-[#2D6A4F] shrink-0" />}
              {!done && !isNext && (
                <Circle size={16} className="text-muted-foreground/30 shrink-0" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Hint final: cuando todas done aparece el preview de "que viene
          ahora" para suavizar la transicion al overlay + redirect. */}
      {status.allDone && (
        <div className="mt-4 rounded-xl bg-[#2D6A4F]/12 border border-[#2D6A4F]/25 p-3 flex items-center gap-2">
          <Sparkles size={16} className="text-[#2D6A4F] shrink-0" />
          <p className="text-[11px] font-semibold text-[#2D6A4F]">
            {t("setupAllDoneHint")}
          </p>
        </div>
      )}
    </div>
  );
}
