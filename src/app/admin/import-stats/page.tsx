"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, TrendingUp, AlertCircle, Zap, Clock } from "lucide-react";

interface Totals {
  total: number;
  previews: number;
  imports: number;
  ai_escalations: number;
  weak_detections: number;
  failures: number;
  inconsistent: number;
  avg_duration_ms: number;
  avg_tx_count: number;
}

interface BankRow {
  detected_bank: string;
  count: number;
  failures: number;
  ai_escalations: number;
  avg_tx: number;
  avg_duration_ms: number;
}

interface ReasonRow {
  ai_reason: string | null;
  count: number;
}

interface ErrorRow {
  id: number;
  user_id: number;
  detected_bank: string;
  error: string;
  created_at: string;
}

interface StatsResponse {
  totals: Totals;
  byBank: BankRow[];
  byReason: ReasonRow[];
  recentErrors: ErrorRow[];
}

function pct(num: number, den: number): string {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AdminImportStatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setRefreshing(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/import-stats");
      if (!res.ok) {
        setError(res.status === 403 ? "Requiere rol admin" : "Error cargando stats");
        return;
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        <Link href="/admin" className="text-sm text-muted-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Atrás
        </Link>
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 px-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle size={16} />
            {error || "Sin datos"}
          </CardContent>
        </Card>
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Import stats</h1>
            <p className="text-xs text-muted-foreground">Últimos 30 días · {t.total} eventos</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refrescar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Imports totales" value={t.imports} hint={`${t.previews} previews`} />
        <StatCard
          label="Escalado a IA"
          value={t.ai_escalations}
          hint={`${pct(t.ai_escalations, t.total)} del total`}
          icon={<Zap size={12} className="text-[#2D6A4F]" />}
        />
        <StatCard
          label="Fallos"
          value={t.failures}
          hint={`${pct(t.failures, t.total)} del total`}
          tone={t.failures > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Inconsistencias"
          value={t.inconsistent}
          hint="saldo no cuadra"
          tone={t.inconsistent > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Duración media"
          value={formatMs(t.avg_duration_ms)}
          icon={<Clock size={12} className="text-blue-600" />}
        />
        <StatCard label="Tx media/import" value={t.avg_tx_count} icon={<TrendingUp size={12} className="text-green-600" />} />
        <StatCard label="Weak detection" value={t.weak_detections} hint={`${pct(t.weak_detections, t.total)}`} />
      </div>

      {/* Bank breakdown */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-bold">Por banco detectado</p>
          {data.byBank.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos todavía</p>
          ) : (
            <div className="space-y-1">
              {data.byBank.map((row) => (
                <div key={row.detected_bank} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                  <span className="flex-1 font-mono min-w-0 truncate">{row.detected_bank}</span>
                  <span className="tabular-nums w-12 text-right">{row.count}</span>
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {row.failures > 0 ? (
                      <span className="text-amber-600">{row.failures} fallos</span>
                    ) : (
                      <span className="text-green-600">OK</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground w-16 text-right">{row.avg_tx} tx/avg</span>
                  <span className="text-xs text-muted-foreground w-16 text-right">{formatMs(row.avg_duration_ms)}</span>
                  {row.ai_escalations > 0 && (
                    <Zap size={12} className="text-purple-600 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Escalation reasons */}
      {data.byReason.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-bold">Por qué escala a IA</p>
            <div className="space-y-1">
              {data.byReason.map((row, i) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span className="font-mono text-xs">{row.ai_reason ?? "(null)"}</span>
                  <span className="tabular-nums text-muted-foreground">{row.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent errors */}
      {data.recentErrors.length > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-bold text-destructive">Últimos fallos</p>
            <div className="space-y-2">
              {data.recentErrors.map((row) => (
                <div key={row.id} className="text-xs border-l-2 border-destructive/40 pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">#{row.id}</span>
                    <span className="font-mono">{row.detected_bank}</span>
                    <span className="text-muted-foreground">· user {row.user_id}</span>
                    <span className="ml-auto text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-destructive mt-0.5 break-words">{row.error}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  label, value, hint, icon, tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "ok" | "warn";
}) {
  const toneClass = tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-green-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
          {icon}
          <span>{label}</span>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
