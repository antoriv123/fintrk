"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, Loader2, Check, FileSearch, Layers, Brain } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { haptic } from "@/lib/premium/haptics";
import { markRecategorizeAttempt } from "./category-breakdown";

interface PreviewItem {
  id: number;
  description: string;
  amount: number;
  date: string;
  direction: "income" | "expense";
  suggestedCategory: string;
  suggestedExpenseType: string | null;
  source: "rule" | "ai";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
}

export function RecategorizeModal({ open, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, string>>({}); // id -> category override
  const [total, setTotal] = useState(0);
  const [totalInWindow, setTotalInWindow] = useState(0);
  const [, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [kept, setKept] = useState(0);
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lote pequeno (20) y ventana 30d. Al aplicar -> cargamos siguiente lote
  // desde offset+total para que el user no repita las mismas sugerencias.
  const BATCH_LIMIT = 20;
  const DAYS_BACK = 30;

  const loadBatch = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setLoadingStartedAt(Date.now());
    setLoadingElapsed(0);
    setError(null);
    try {
      const r = await apiFetch("/api/ai/recategorize-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, limit: BATCH_LIMIT, daysBack: DAYS_BACK, offset: nextOffset }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const base = data?.error ?? "No se pudo analizar";
        const detail = data?.detail ? ` — ${data.detail}` : "";
        setError(`${base}${detail}`);
        return;
      }
      const items = (data.preview ?? []) as PreviewItem[];
      setPreview(items);
      setTotal(Number(data.total ?? items.length));
      setTotalInWindow(Number(data.totalInWindow ?? items.length));
      setHasMore(Boolean(data.hasMore));
      setKept(Number(data.kept ?? 0));
      setOffset(nextOffset);
      const init: Record<number, boolean> = {};
      for (const it of items) init[it.id] = true;
      setSelected(init);
      setEdits({});
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
      setLoadingStartedAt(null);
    }
  }, []);

  // Elapsed timer for adaptive loading copy.
  useEffect(() => {
    if (!loading || !loadingStartedAt) return;
    const id = setInterval(() => setLoadingElapsed(Date.now() - loadingStartedAt), 400);
    return () => clearInterval(id);
  }, [loading, loadingStartedAt]);

  useEffect(() => {
    if (!open) return;
    loadBatch(0);
  }, [open, loadBatch]);

  const applyCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  async function handleApply() {
    if (!preview || applyCount === 0) return;
    setApplying(true);
    haptic.tap();
    const apply = preview
      .filter((p) => selected[p.id])
      .map((p) => ({
        id: p.id,
        category: edits[p.id] ?? p.suggestedCategory,
        expense_type: p.suggestedExpenseType,
      }));
    try {
      const res = await apiFetch("/api/ai/recategorize-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      });
      const data = await res.json().catch(() => ({}));
      const { toast } = await import("sonner");
      if (res.ok) {
        haptic.success();
        toast.success(`${data.updated ?? apply.length} gastos actualizados`);
        onApplied?.();
        // Si quedan mas "otros" en la ventana, traemos el siguiente lote
        // en vez de cerrar — asi el user puede seguir o cerrar.
        const nextStart = offset + preview.length;
        if (nextStart < totalInWindow) {
          await loadBatch(nextStart);
        } else {
          markRecategorizeAttempt();
          onClose();
        }
      } else {
        toast.error(data?.error ?? "No se pudo aplicar");
      }
    } catch {
      const { toast } = await import("sonner");
      toast.error("Error de red");
    } finally {
      setApplying(false);
    }
  }

  // Cerrar el modal manualmente tambien activa el cooldown si la IA ya nos
  // dio un resultado (exito o "nada que categorizar"). Asi evitamos que el
  // user abra el modal, vea 0 sugerencias y pueda reabrirlo acto seguido.
  function handleClose() {
    if (preview !== null && !error) {
      markRecategorizeAttempt();
    }
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-2xl flex flex-col max-h-[90dvh]"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#2D6A4F]/10">
                  <Sparkles size={16} className="text-[#2D6A4F]" />
                </span>
                <div>
                  <p className="text-sm font-bold leading-tight">Categorizar con IA</p>
                  <p className="text-[11px] text-muted-foreground">
                    {loading
                      ? "Analizando…"
                      : preview
                        ? totalInWindow > preview.length
                          ? `Lote de ${preview.length} · ${totalInWindow} pendientes (30 días)`
                          : `${preview.length} ${preview.length === 1 ? "sugerencia" : "sugerencias"}`
                        : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-90"
                aria-label="Cerrar"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && (() => {
                const stage = loadingElapsed < 4000 ? 0 : loadingElapsed < 12000 ? 1 : 2;
                const icons = [FileSearch, Layers, Brain] as const;
                const titles = [
                  "Leyendo tus gastos sin categoría…",
                  "Agrupando por descripción similar…",
                  "La IA está pensando en las mejores categorías…",
                ];
                const subs = [
                  "Revisamos los últimos 30 días para no repetir sugerencias.",
                  "Así evitamos pedirle a la IA lo mismo dos veces.",
                  "Un momento — mezclamos tus reglas con el contexto del gasto.",
                ];
                const Icon = icons[stage];
                return (
                  <div className="p-8 flex flex-col items-center gap-4 text-center">
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border-[3px] border-border" />
                      <div
                        className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[#2D6A4F] animate-spin"
                        style={{ animationDuration: "1.1s" }}
                      />
                      <div className="absolute inset-0 rounded-full bg-[#2D6A4F]/8 blur-md" />
                      <div key={stage} className="absolute inset-0 flex items-center justify-center recat-icon">
                        <Icon size={20} className="text-[#2D6A4F]" />
                      </div>
                    </div>
                    <div key={`txt-${stage}`} className="recat-text space-y-1 max-w-[280px]">
                      <p className="text-sm font-semibold">{titles[stage]}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{subs[stage]}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            i === stage ? "w-4 bg-[#2D6A4F]" : i < stage ? "w-1.5 bg-[#2D6A4F]/50" : "w-1.5 bg-border"
                          }`}
                        />
                      ))}
                    </div>
                    <style jsx>{`
                      .recat-icon { animation: recat-pop 0.35s ease-out; }
                      .recat-text { animation: recat-fade 0.5s ease-out; }
                      @keyframes recat-pop {
                        0% { opacity: 0; transform: scale(0.85); }
                        100% { opacity: 1; transform: scale(1); }
                      }
                      @keyframes recat-fade {
                        0% { opacity: 0; transform: translateY(6px); }
                        100% { opacity: 1; transform: translateY(0); }
                      }
                      @media (prefers-reduced-motion: reduce) {
                        .recat-icon, .recat-text { animation: none; }
                      }
                    `}</style>
                  </div>
                );
              })()}
              {error && !loading && (
                <div className="p-10 text-center">
                  <p className="text-sm font-medium text-red-500 mb-2">{error}</p>
                  <a
                    href="/api/ai/health"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted-foreground underline"
                  >
                    Ver diagnóstico técnico
                  </a>
                </div>
              )}
              {!loading && preview && preview.length === 0 && (
                <div className="p-10 text-center">
                  <p className="text-sm font-medium mb-1">Nada que recategorizar</p>
                  <p className="text-[11px] text-muted-foreground">
                    {total > 0 ? `Hay ${kept} gastos que ni las reglas ni la IA han podido clasificar con confianza.` : "No tienes gastos en \"otros\"."}
                  </p>
                </div>
              )}
              {!loading && preview && preview.length > 0 && (
                <div className="divide-y divide-border/60">
                  {preview.map((p) => {
                    const catSlug = edits[p.id] ?? p.suggestedCategory;
                    const info = getCategoryInfo(catSlug);
                    const isChecked = !!selected[p.id];
                    return (
                      <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          onClick={() => setSelected((s) => ({ ...s, [p.id]: !s[p.id] }))}
                          className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center active:scale-90 transition-all ${
                            isChecked ? "bg-[#2D6A4F] border-[#2D6A4F]" : "bg-transparent border-border"
                          }`}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} className="text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{p.description || "(sin descripción)"}</p>
                            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                              {"\u20AC"}{Number(p.amount).toFixed(Number(p.amount) % 1 === 0 ? 0 : 2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenPicker((cur) => (cur === p.id ? null : p.id))}
                            className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-muted/60 hover:bg-muted"
                          >
                            <CategoryIcon icon={info.icon} color={info.color} size="sm" withBackground={false} />
                            <span>{info.label}</span>
                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                              {p.source === "rule" ? "· regla" : "· IA"}
                            </span>
                          </button>
                          {openPicker === p.id && (
                            <div className="mt-2 grid grid-cols-3 gap-1">
                              {Object.entries(
                                p.direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES,
                              ).map(([slug, ci]) => {
                                const active = catSlug === slug;
                                return (
                                  <button
                                    key={slug}
                                    type="button"
                                    onClick={() => {
                                      setEdits((e) => ({ ...e, [p.id]: slug }));
                                      setOpenPicker(null);
                                    }}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] active:scale-95 transition-all ${
                                      active ? "bg-[#2D6A4F]/10 border-[#2D6A4F]" : "bg-card border-border"
                                    }`}
                                  >
                                    <CategoryIcon icon={ci.icon} color={ci.color} size="sm" withBackground={false} />
                                    <span className="truncate">{ci.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border/60 flex flex-col gap-2">
              <button
                onClick={handleApply}
                disabled={applying || loading || !preview || applyCount === 0}
                className="w-full h-12 rounded-2xl bg-[#2D6A4F] text-white font-bold text-sm shadow-lg shadow-[#2D6A4F]/25 active:scale-[0.97] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {applying ? (
                  <><Loader2 size={16} className="animate-spin" /> Aplicando…</>
                ) : (
                  <><Check size={16} /> Aplicar a {applyCount} {applyCount === 1 ? "gasto" : "gastos"}</>
                )}
              </button>
              <button
                onClick={handleClose}
                className="w-full h-10 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
