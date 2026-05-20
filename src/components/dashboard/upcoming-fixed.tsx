"use client";

import Link from "next/link";
import { useFetch } from "@/hooks/use-fetch";
import { useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency";
import { Calendar, ChevronRight } from "lucide-react";

interface Subscription {
  id: number;
  name: string;
  amount: number;
  currency: string;
  next_renewal: string;
  type: string;
}

interface Resp {
  subscriptions: Subscription[];
}

export function UpcomingFixed({ localeCode = "es-ES" }: { localeCode?: string }) {
  const t = useT();
  const { data } = useFetch<Resp>("/api/subscriptions");
  const all = data?.subscriptions ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 14 * 86_400_000);

  const upcoming = all
    .filter((s) => {
      const d = new Date(s.next_renewal + "T00:00:00");
      return d >= today && d <= horizon;
    })
    .sort((a, b) => (a.next_renewal < b.next_renewal ? -1 : 1))
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-semibold mb-3 px-1">{t("upcomingFixed")}</p>
      <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        {upcoming.map((s, i) => {
          const d = new Date(s.next_renewal + "T00:00:00");
          const daysOut = Math.round((d.getTime() - today.getTime()) / 86_400_000);
          const label =
            daysOut === 0
              ? t("today")
              : daysOut === 1
              ? t("tomorrow")
              : d.toLocaleDateString(localeCode, { day: "numeric", month: "short" });
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#2D6A4F]/10 shrink-0">
                <Calendar size={15} className="text-[#2D6A4F]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">{label}</div>
              </div>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatMoney(s.amount, s.currency, localeCode)}
              </span>
            </div>
          );
        })}
        <Link
          href="/subscriptions"
          className="flex items-center justify-center gap-1 px-4 py-3 border-t border-border/50 text-xs text-primary font-medium hover:bg-muted/40 transition-all"
        >
          {t("viewAll")} <ChevronRight size={12} />
        </Link>
      </div>
    </div>
  );
}
