"use client";

import { useEffect, useState } from "react";
import { Search, BarChart3, PenLine, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  startedAt?: number;
}

/**
 * Narrative overlay while /api/ai/insights is generating.
 * Three messages cross-fade based on elapsed time:
 *   0-8s  — "Reviewing your last 90 days"  (magnifier icon)
 *   8-18s — "Finding patterns in your spending" (chart icon)
 *   18s+  — "Writing your stories" (pen icon)
 * Respects prefers-reduced-motion (still shows final text without transitions).
 */
export function InsightsGenerating(props: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!props.open) return;
    const started = props.startedAt ?? Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialises elapsed immediately on open so the first render shows real elapsed time before the first interval tick (400ms later)
    setElapsed(Date.now() - started);
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => setElapsed(Date.now() - started);
    const start = () => {
      if (id) return;
      id = setInterval(tick, 400);
    };
    const stop = () => {
      if (id) { clearInterval(id); id = null; }
    };
    start();
    // Pausa el interval si la pestaña/app pierde foco (evita CPU en background).
    const handleVis = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) stop();
      else { tick(); start(); }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVis);
    }
    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVis);
      }
    };
  }, [props.open, props.startedAt]);

  if (!props.open) return null;

  const stage = elapsed < 8000 ? 0 : elapsed < 18000 ? 1 : 2;
  const icons = [Search, BarChart3, PenLine] as const;
  const titles = [t("insightsGenStage1Title"), t("insightsGenStage2Title"), t("insightsGenStage3Title")];
  const subs = [t("insightsGenStage1Sub"), t("insightsGenStage2Sub"), t("insightsGenStage3Sub")];
  const Icon = icons[stage];

  return (
    <div
      data-tour="insights-generate"
      className="rounded-2xl bg-card border border-border p-6 shadow-sm animate-in fade-in duration-300"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Pulsing ring with rotating spinner and active icon */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-[3px] border-border" />
          <div
            className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#2D6A4F] animate-spin"
            style={{ animationDuration: "1.2s" }}
          />
          <div className="absolute inset-0 rounded-full bg-[#2D6A4F]/10 blur-md insights-halo" />
          <div key={stage} className="absolute inset-0 flex items-center justify-center insights-icon">
            <Icon size={24} className="text-[#2D6A4F]" />
          </div>
        </div>

        {/* Narrative text cross-fades by key */}
        <div key={`txt-${stage}`} className="text-center insights-text space-y-1">
          <p className="text-sm font-semibold">{titles[stage]}</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[260px]">
            {subs[stage]}
          </p>
        </div>

        {/* 3 tiny dots showing stage progression */}
        <div className="flex items-center gap-1.5 pt-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === stage ? "w-5 bg-[#2D6A4F]" : i < stage ? "w-1.5 bg-[#2D6A4F]/50" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 mt-1">
          <Sparkles size={10} />
          <span>{t("insightsGenFoot")}</span>
        </div>
      </div>

      <style jsx>{`
        .insights-icon {
          animation: insights-pop 0.4s ease-out;
        }
        .insights-text {
          animation: insights-fade 0.5s ease-out;
        }
        .insights-halo {
          animation: insights-halo 2.4s ease-in-out infinite;
        }
        @keyframes insights-pop {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes insights-fade {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes insights-halo {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .insights-icon, .insights-text, .insights-halo { animation: none; }
        }
      `}</style>
    </div>
  );
}
