"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, Trash2, MessageSquare } from "lucide-react";

interface Row {
  id: number;
  user_id: number | null;
  email: string | null;
  sentiment: "love" | "bug" | "idea" | "hate" | null;
  message: string;
  url: string | null;
  created_at: string;
}

interface SummaryRow {
  sentiment: string | null;
  n: number;
}

interface Resp {
  rows: Row[];
  summary: SummaryRow[];
}

const SENTIMENT_LABEL: Record<string, { emoji: string; label: string; color: string }> = {
  love: { emoji: "💚", label: "Love", color: "text-emerald-600" },
  bug: { emoji: "🐛", label: "Bug", color: "text-amber-600" },
  idea: { emoji: "💡", label: "Idea", color: "text-sky-600" },
  hate: { emoji: "😤", label: "Hate", color: "text-red-600" },
};

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export default function AdminFeedbackPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter ? `/api/admin/feedback?sentiment=${filter}&limit=200` : "/api/admin/feedback?limit=200";
      const res = await apiFetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm("¿Borrar este feedback?")) return;
    const res = await apiFetch("/api/admin/feedback", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) load();
  }

  return (
    <div className="animate-in space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare size={18} /> Feedback
            </h1>
            <p className="text-[11px] text-muted-foreground">Reportes de usuarios desde el widget de la app</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {data?.summary && data.summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${filter === "" ? "bg-[#2D6A4F] text-white border-[#2D6A4F]" : "bg-card border-border"}`}
          >
            Todos
          </button>
          {data.summary.map((s) => {
            const meta = SENTIMENT_LABEL[s.sentiment ?? ""] ?? { emoji: "·", label: s.sentiment ?? "N/A", color: "text-muted-foreground" };
            return (
              <button
                key={s.sentiment ?? "null"}
                onClick={() => setFilter(s.sentiment ?? "")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 ${
                  filter === s.sentiment ? "bg-[#2D6A4F] text-white border-[#2D6A4F]" : "bg-card border-border"
                }`}
              >
                <span>{meta.emoji}</span> {meta.label}
                <span className="opacity-70">{s.n}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && !data && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {data && data.rows.length === 0 && !loading && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">Sin feedback todavía.</p>
          </CardContent>
        </Card>
      )}

      {data && data.rows.length > 0 && (
        <div className="space-y-2">
          {data.rows.map((r) => {
            const meta = SENTIMENT_LABEL[r.sentiment ?? ""] ?? { emoji: "·", label: "", color: "text-muted-foreground" };
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{meta.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold">
                          {r.email ?? `user ${r.user_id ?? "?"}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground" title={formatDateTime(r.created_at)}>
                          {timeAgo(r.created_at)} {r.url && `· ${r.url}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="w-8 h-8 rounded-full hover:bg-red-500/10 flex items-center justify-center"
                      aria-label="Borrar"
                    >
                      <Trash2 size={14} className="text-red-500/70" />
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.message}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
