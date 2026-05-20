"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, CheckCircle2, Trash2, Download, RefreshCw, AlertCircle, Clock, X,
} from "lucide-react";

interface ReportSummary {
  id: number;
  user_id: number | null;
  email: string | null;
  error_message: string;
  file_type: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  notes: string | null;
  user_agent: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface ReportDetail extends ReportSummary {
  file_base64: string | null;
  csv_text: string | null;
}

interface ListResponse {
  total: number;
  reports: ReportSummary[];
}

function formatBytes(n: number | null): string {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/import-error-reports");
      if (!res.ok) {
        setError(res.status === 403 ? "Requiere rol admin" : "Error cargando reports");
        setReports([]);
        return;
      }
      const data = (await res.json()) as ListResponse;
      setReports(data.reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/admin/import-error-reports?id=${id}`);
      if (!res.ok) throw new Error("No se pudo cargar");
      const data = await res.json();
      setDetail(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const markResolved = useCallback(async (id: number, resolved: boolean) => {
    setActionId(id);
    try {
      const res = await apiFetch("/api/admin/import-error-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolved }),
      });
      if (!res.ok) throw new Error("Error");
      await load();
      if (detail?.id === id) setDetail({ ...detail, resolved_at: resolved ? new Date().toISOString() : null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setActionId(null);
    }
  }, [detail, load]);

  const deleteReport = useCallback(async (id: number) => {
    if (!confirm("¿Eliminar este reporte definitivamente?")) return;
    setActionId(id);
    try {
      const res = await apiFetch(`/api/admin/import-error-reports?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      await load();
      if (detail?.id === id) setDetail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setActionId(null);
    }
  }, [detail, load]);

  const downloadFile = useCallback((report: ReportDetail) => {
    const filename = report.file_name || `report-${report.id}.${report.file_type || "bin"}`;
    let blob: Blob;
    if (report.file_base64) {
      const bytes = Uint8Array.from(atob(report.file_base64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes.buffer as ArrayBuffer], { type: report.file_type === "pdf" ? "application/pdf" : "application/octet-stream" });
    } else if (report.csv_text) {
      blob = new Blob([report.csv_text], { type: "text/csv" });
    } else {
      alert("Este reporte no tiene archivo adjunto");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const filtered = reports.filter((r) => {
    if (filter === "open") return !r.resolved_at;
    if (filter === "resolved") return !!r.resolved_at;
    return true;
  });

  const openCount = reports.filter((r) => !r.resolved_at).length;
  const resolvedCount = reports.filter((r) => !!r.resolved_at).length;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Import error reports</h1>
            <p className="text-xs text-muted-foreground">
              {openCount} abiertos · {resolvedCount} resueltos
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refrescar
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
        {(["open", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === f ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            {f === "open" ? `Abiertos (${openCount})` : f === "resolved" ? `Resueltos (${resolvedCount})` : `Todos (${reports.length})`}
          </button>
        ))}
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 px-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Reports list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {filter === "open" ? "Ningún reporte abierto 🎉" : filter === "resolved" ? "Ninguno resuelto todavía" : "Aún no hay reports"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className={r.resolved_at ? "opacity-60" : ""}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => openDetail(r.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">#{r.id}</span>
                      {r.resolved_at ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-medium">resuelto</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">abierto</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {r.file_type?.toUpperCase()} · {formatBytes(r.file_size_bytes)}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{r.email ?? `user ${r.user_id}`}</p>
                    <p className="text-sm text-muted-foreground truncate">{r.error_message}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock size={11} /> {timeAgo(r.created_at)} · {r.file_name}
                    </p>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    {!r.resolved_at && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markResolved(r.id, true)}
                        disabled={actionId === r.id}
                        title="Marcar resuelto"
                      >
                        <CheckCircle2 size={16} className="text-green-600" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteReport(r.id)}
                      disabled={actionId === r.id}
                      title="Eliminar"
                    >
                      <Trash2 size={16} className="text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-card border shadow-2xl"
          >
            <div className="sticky top-0 bg-card border-b p-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-base font-bold">Report #{detail.id}</p>
                <p className="text-xs text-muted-foreground truncate">{detail.email ?? `user ${detail.user_id}`}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 -m-1 text-muted-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {detailLoading && <Skeleton className="h-20" />}

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Error</p>
                <pre className="text-sm bg-destructive/5 border border-destructive/30 rounded-lg p-3 whitespace-pre-wrap font-mono text-destructive">
                  {detail.error_message}
                </pre>
              </div>

              {detail.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notas del usuario</p>
                  <pre className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{detail.notes}</pre>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Archivo</p>
                  <p className="font-mono truncate">{detail.file_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo / tamaño</p>
                  <p>{detail.file_type?.toUpperCase()} · {formatBytes(detail.file_size_bytes)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fecha</p>
                  <p>{formatDateTime(detail.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <p className={detail.resolved_at ? "text-green-600" : "text-amber-600"}>
                    {detail.resolved_at ? `Resuelto ${formatDateTime(detail.resolved_at)}` : "Abierto"}
                  </p>
                </div>
              </div>

              {detail.user_agent && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">User-Agent</p>
                  <p className="text-xs font-mono text-muted-foreground break-all">{detail.user_agent}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button onClick={() => downloadFile(detail)} className="gap-2" disabled={!detail.file_base64 && !detail.csv_text}>
                  <Download size={14} />
                  Descargar archivo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => markResolved(detail.id, !detail.resolved_at)}
                  disabled={actionId === detail.id}
                  className="gap-2"
                >
                  <CheckCircle2 size={14} />
                  {detail.resolved_at ? "Reabrir" : "Marcar resuelto"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => deleteReport(detail.id)}
                  disabled={actionId === detail.id}
                  className="gap-2 text-destructive border-destructive/40"
                >
                  <Trash2 size={14} />
                  Eliminar
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Tip: descarga el archivo y súbelo en <Link href="/import" className="underline">/import</Link> en tu sesión para reproducir.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
