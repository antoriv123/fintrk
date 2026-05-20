"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus, X, Loader2, Send } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Sentiment = "love" | "bug" | "idea" | "hate";

const SENTIMENTS: { id: Sentiment; emoji: string; labelKey: string }[] = [
  { id: "love", emoji: "💚", labelKey: "feedbackLove" },
  { id: "bug", emoji: "🐛", labelKey: "feedbackBug" },
  { id: "idea", emoji: "💡", labelKey: "feedbackIdea" },
  { id: "hate", emoji: "😤", labelKey: "feedbackHate" },
];

export function FeedbackWidget() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Auto-abrir cuando llega ?feedback=1 (push de pre-launch que pide
  // feedback). Limpia el query param tras abrir para que F5 no reabra.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("feedback") === "1") {
      setOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("feedback");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function submit() {
    if (message.trim().length < 3) return;
    setSending(true);
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sentiment,
          url: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const { toast } = await import("sonner");
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        const errMsg = typeof data.error === "string" ? data.error : `Error ${res.status}`;
        toast.error(errMsg);
        return;
      }
      toast.success(t("feedbackThanks"));
      setMessage("");
      setSentiment(null);
      setOpen(false);
    } catch (e) {
      const { toast } = await import("sonner");
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("feedbackButton")}
        className="fixed z-40 w-10 h-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:bg-muted/60 transition-all active:scale-90"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)", right: "16px" }}
      >
        <MessageSquarePlus size={18} className="text-muted-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={() => !sending && setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-card border-t sm:border border-border shadow-2xl p-5 animate-[slideInUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-bold">{t("feedbackTitle")}</p>
              <button
                onClick={() => !sending && setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">{t("feedbackSubtitle")}</p>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {SENTIMENTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSentiment(s.id === sentiment ? null : s.id)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all active:scale-95 ${
                    sentiment === s.id ? "bg-[#2D6A4F]/10 border-[#2D6A4F]/40" : "bg-card border-border"
                  }`}
                >
                  <span className="text-xl">{s.emoji}</span>
                  <span className={`text-[10px] font-semibold ${sentiment === s.id ? "text-[#2D6A4F]" : "text-muted-foreground"}`}>
                    {t(s.labelKey)}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("feedbackPlaceholder")}
              rows={4}
              maxLength={4000}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 resize-none"
            />

            <button
              onClick={submit}
              disabled={sending || message.trim().length < 3}
              className="w-full h-12 mt-3 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-sm shadow-lg shadow-[#2D6A4F]/25 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {sending ? (
                <><Loader2 size={16} className="animate-spin" /> {t("feedbackSending")}</>
              ) : (
                <><Send size={14} /> {t("feedbackSend")}</>
              )}
            </button>

            <p className="text-[10px] text-muted-foreground text-center mt-3">
              {t("feedbackFooter")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
