"use client";

import { useEffect, useState } from "react";
import {
  FileText, FileSearch, Sparkles, Database, CheckCircle2, Loader2,
} from "lucide-react";
import { useT } from "@/lib/i18n";

export type ImportPhase =
  | "reading"
  | "uploading"
  | "analyzing"
  | "categorizing"
  | "saving"
  | "done";

interface Props {
  /** Whether the overlay should be visible */
  open: boolean;
  /** Current explicit phase. Leave undefined to let the timer auto-advance. */
  phase?: ImportPhase;
  /** Milliseconds elapsed (used only when phase is undefined for auto-advance). */
  startedAt?: number;
  /** Action in progress: analyzing vs saving. Changes the stage set. */
  mode: "preview" | "import";
  /** Optional contextual message (e.g. "Procesando extracto de Santander") */
  contextLabel?: string;
  /** Optional file name to show as hint. */
  fileName?: string;
  /** Optional file size in KB — used to scale stage thresholds and show ETA. */
  fileSizeKB?: number;
  /** Optional total transactions when saving. */
  txCount?: number;
}

/**
 * Estimate seconds based on file size in KB.
 * Small PDFs (<200KB) parse fast. Large PDFs (>2MB) typically hit the AI Vision
 * path and can take 30-60s. We map conservatively so estimates don't oversell.
 */
function estimateSeconds(fileSizeKB?: number): number {
  if (!fileSizeKB || fileSizeKB <= 0) return 10;
  if (fileSizeKB < 200) return 6;
  if (fileSizeKB < 800) return 14;
  if (fileSizeKB < 2000) return 28;
  if (fileSizeKB < 5000) return 45;
  return 60;
}

/**
 * Full-width progress card that shows the user exactly what the app is doing
 * while /api/import runs. Prevents the "it's stuck" feeling on long scans.
 *
 * Auto-advances stages based on elapsed time if no explicit phase is provided,
 * but always stays on the last stage until the parent dismisses the overlay.
 */
export function ImportProgressOverlay(props: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!props.open) return;
    const started = props.startedAt ?? Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialises elapsed immediately on open so the first render shows real elapsed time before the first interval tick (1s later)
    setElapsed(Date.now() - started);
    const id = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(id);
  }, [props.open, props.startedAt]);

  if (!props.open) return null;

  // Stages differ slightly between preview (analyze) and import (save).
  const stages: Array<{ id: ImportPhase; label: string; icon: typeof FileText }> =
    props.mode === "preview"
      ? [
          { id: "reading", label: t("importStageReading"), icon: FileText },
          { id: "analyzing", label: t("importStageAnalyzing"), icon: FileSearch },
          { id: "categorizing", label: t("importStageCategorizing"), icon: Sparkles },
        ]
      : [
          { id: "saving", label: t("importStageSaving"), icon: Database },
        ];

  // Auto-advance if no explicit phase. Thresholds scale with file size so that
  // small PDFs don't get stuck on "reading" and huge ones don't jump to
  // "categorizing" prematurely.
  const totalEstMs = estimateSeconds(props.fileSizeKB) * 1000;
  const readingCutoff = Math.max(1200, totalEstMs * 0.18);
  const analyzingCutoff = Math.max(8000, totalEstMs * 0.65);

  let currentPhase: ImportPhase | undefined = props.phase;
  if (!currentPhase) {
    if (props.mode === "preview") {
      if (elapsed < readingCutoff) currentPhase = "reading";
      else if (elapsed < analyzingCutoff) currentPhase = "analyzing";
      else currentPhase = "categorizing";
    } else {
      currentPhase = "saving";
    }
  }

  const currentIdx = stages.findIndex((s) => s.id === currentPhase);

  // Progress bar reflects elapsed vs estimated total, capped at 95% until done.
  const elapsedPct = Math.min(95, (elapsed / totalEstMs) * 100);
  const stageMinPct = Math.max(6, ((currentIdx + 1) / stages.length) * 100);
  const progressPct = Math.max(stageMinPct, elapsedPct);

  // Adaptive hint. In AI/long mode, we mix the static i18n hint with the
  // runtime estimation so the user sees "~28s aprox" on a 1.5MB PDF.
  const estSec = estimateSeconds(props.fileSizeKB);
  const showEstimate = props.mode === "preview" && !!props.fileSizeKB && elapsed < 4000;

  const hint = props.mode === "preview"
    ? (elapsed < 15000 ? t("importHintAnalyze") : elapsed < 40000 ? t("importHintAI") : t("importHintAILong"))
    : (elapsed < 10000 ? t("importHintSave") : t("importHintSaveLong"));

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-accent p-5 space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-primary/15" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          <Sparkles size={16} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">
            {props.contextLabel ?? (props.mode === "preview" ? t("importHeaderAnalyze") : t("importHeaderSave"))}
          </p>
          {props.fileName && (
            <p className="text-[11px] text-muted-foreground truncate">{props.fileName}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Stage checklist */}
      <div className="space-y-2">
        {stages.map((s, idx) => {
          const active = idx === currentIdx;
          const done = idx < currentIdx;
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 text-xs transition-all ${
                active ? "text-foreground font-semibold" : done ? "text-muted-foreground" : "text-muted-foreground/50"
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                done ? "bg-primary/20" : active ? "bg-primary/15" : "bg-muted/30"
              }`}>
                {done ? (
                  <CheckCircle2 size={13} className="text-primary" />
                ) : active ? (
                  <Loader2 size={13} className="animate-spin text-primary" />
                ) : (
                  <Icon size={12} />
                )}
              </span>
              <span className="truncate flex-1">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Live hint + optional file-size estimation */}
      <div className="pt-1 border-t border-border/60 space-y-1">
        {showEstimate && (
          <p className="text-[11px] text-foreground font-medium">
            {t("importEstPrefix")} {Math.round((props.fileSizeKB ?? 0) / 1024 * 10) / 10}MB · {t("importEstAboutPrefix")} {estSec}s {t("importEstSuffix")}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {hint}
          {props.mode === "import" && props.txCount ? (
            <> · {props.txCount} {t("transactionsLabel")}</>
          ) : null}
        </p>
      </div>
    </div>
  );
}
