"use client";

import { useEffect, useState } from "react";
import { Camera, ScanLine, FileSearch, Sparkles, CheckCircle2, Loader2, ImagePlus } from "lucide-react";
import { useT } from "@/lib/i18n";

export type ScanStage = "capturing" | "recognizing" | "extracting" | "categorizing";

interface Props {
  open: boolean;
  /** single ticket vs bulk (multi-ticket) vs bank screenshot */
  mode: "single" | "multi" | "bank";
  /** Timestamp when the scan started (used to drive elapsed + auto stages) */
  startedAt?: number;
  /** Only for multi mode */
  done?: number;
  /** Only for multi mode */
  total?: number;
}

/**
 * Full feedback during AI scan. Kills the "is it frozen?" feeling by surfacing:
 *   - Which stage the AI is on (capturing → recognizing → extracting → categorizing)
 *   - Adaptive hint copy that softens as latency grows
 *   - Multi-scan counter "X de Y" + per-item progress bar
 *   - Pulsing icon + spinner ring (respects prefers-reduced-motion via CSS)
 */
export function ScanProgressOverlay(props: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!props.open) return;
    const started = props.startedAt ?? Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialises elapsed immediately so first render shows real elapsed time before first interval tick (500ms later)
    setElapsed(Date.now() - started);
    const id = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(id);
  }, [props.open, props.startedAt]);

  if (!props.open) return null;

  const isMulti = props.mode === "multi";
  const isBank = props.mode === "bank";

  const headerIcon = isBank ? ImagePlus : Camera;
  const HeaderIcon = headerIcon;

  const stages: Array<{ id: ScanStage; label: string; icon: typeof Camera }> = [
    { id: "capturing", label: t("scanStageCapturing"), icon: Camera },
    { id: "recognizing", label: t("scanStageRecognizing"), icon: ScanLine },
    { id: "extracting", label: t("scanStageExtracting"), icon: FileSearch },
    { id: "categorizing", label: t("scanStageCategorizing"), icon: Sparkles },
  ];

  // Auto-advance stages by elapsed time.
  let currentPhase: ScanStage;
  if (elapsed < 800) currentPhase = "capturing";
  else if (elapsed < 3000) currentPhase = "recognizing";
  else if (elapsed < 8000) currentPhase = "extracting";
  else currentPhase = "categorizing";

  const currentIdx = stages.findIndex((s) => s.id === currentPhase);

  // Progress: multi mode uses done/total; single uses stage progression.
  const multiPct = isMulti && props.total ? ((props.done ?? 0) / props.total) * 100 : 0;
  const stagePct = Math.max(10, ((currentIdx + 1) / stages.length) * 100);
  const progressPct = isMulti ? multiPct : stagePct;

  // Adaptive hint that grows more reassuring as time passes. A partir de
  // elapsed >= 5s rotamos por un pool corto de mensajes con personalidad
  // ("Lupo afina el olfato...") cada 1.8s para no parecer congelado.
  const baseHint =
    elapsed < 5000
      ? t("scanHintShort")
      : elapsed < 20000
      ? t("scanHintMedium")
      : elapsed < 45000
      ? t("scanHintLong")
      : t("scanHintVeryLong");

  const personalityPool = [
    t("scanHintPool1"),
    t("scanHintPool2"),
    t("scanHintPool3"),
  ];
  const rotateIdx = Math.floor(elapsed / 1800) % (personalityPool.length + 1);
  const hint = elapsed < 5000 || rotateIdx === 0 ? baseHint : personalityPool[rotateIdx - 1];

  const title = isMulti
    ? t("scanHeaderMulti")
    : isBank
    ? t("scanHeaderBank")
    : t("scanHeaderSingle");

  return (
    <div className="w-full rounded-3xl border border-[#2D6A4F]/20 bg-gradient-to-br from-[#2D6A4F]/8 to-transparent p-6 space-y-5 animate-in fade-in duration-300">
      {/* Header with pulsing ring */}
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 shrink-0">
          <div className="absolute inset-0 rounded-full border-[3px] border-[#2D6A4F]/15" />
          <div
            className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#2D6A4F] animate-spin"
            style={{ animationDuration: "0.9s" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <HeaderIcon size={22} className="text-[#2D6A4F] scan-pulse" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold truncate">{title}</p>
          {isMulti && props.total ? (
            <p className="text-[11px] text-muted-foreground truncate">
              {t("scanProgressPrefix")} {props.done ?? 0} {t("scanProgressOf")} {props.total}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{stages[currentIdx]?.label}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#2D6A4F]/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#2D6A4F] to-[#40916C] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Stage checklist (hidden in multi mode to avoid dual progress views) */}
      {!isMulti && (
        <div className="space-y-2">
          {stages.map((s, idx) => {
            const active = idx === currentIdx;
            const done = idx < currentIdx;
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 text-xs transition-all ${
                  active ? "text-foreground font-semibold" : done ? "text-muted-foreground" : "text-muted-foreground/40"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    done ? "bg-[#2D6A4F]/20" : active ? "bg-[#2D6A4F]/15" : "bg-muted/30"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 size={13} className="text-[#2D6A4F]" />
                  ) : active ? (
                    <Loader2 size={13} className="animate-spin text-[#2D6A4F]" />
                  ) : (
                    <Icon size={12} />
                  )}
                </span>
                <span className="truncate flex-1">{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Live hint */}
      <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/60">
        {hint}
      </p>

      <style jsx>{`
        .scan-pulse {
          animation: scan-pulse 1.4s ease-in-out infinite;
        }
        @keyframes scan-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.92); }
        }
        @media (prefers-reduced-motion: reduce) {
          .scan-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
