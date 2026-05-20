"use client";

import { useEffect, useState } from "react";
import { WifiOff, CheckCircle2 } from "lucide-react";
import { isOnline, queueSize } from "@/lib/offline-queue";
import { useT } from "@/lib/i18n";

/**
 * Sticky banner at the top of the shell when:
 *  - The device is offline (dim banner with pending count).
 *  - Just came back online and synced N pending items (flash green 3s).
 */
export function OfflineBanner() {
  const t = useT();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [justSynced, setJustSynced] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialises online/pending state from window on mount; cannot run during SSR
    setOnline(isOnline());
    setPending(queueSize());

    const refresh = () => {
      setOnline(isOnline());
      setPending(queueSize());
    };
    const onFlushed = (e: Event) => {
      const detail = (e as CustomEvent<{ sent: number; failed: number }>).detail;
      if (detail?.sent > 0) {
        setJustSynced(detail.sent);
        setTimeout(() => setJustSynced(null), 3500);
      }
      refresh();
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("fintrk-offline-enqueued", refresh);
    window.addEventListener("fintrk-offline-flushed", onFlushed as EventListener);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("fintrk-offline-enqueued", refresh);
      window.removeEventListener("fintrk-offline-flushed", onFlushed as EventListener);
    };
  }, []);

  if (online && !justSynced) return null;

  if (justSynced && justSynced > 0) {
    return (
      <div
        className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-[#2D6A4F] text-white text-xs font-semibold px-3 py-2 animate-[slideInUp_0.3s_ease-out]"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <CheckCircle2 size={14} />
        {t("offlineSynced").replace("{n}", String(justSynced))}
      </div>
    );
  }

  if (!online) {
    return (
      <div
        className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500/10 text-amber-900 border-b border-amber-500/30 text-xs font-medium px-3 py-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <WifiOff size={13} />
        <span>
          {t("offlineBanner")}
          {pending > 0 && (
            <span className="ml-1 opacity-80">
              · {pending} {t("offlinePending")}
            </span>
          )}
        </span>
      </div>
    );
  }

  return null;
}
