"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { FetchError } from "@/components/fetch-error";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_CATEGORIES, EXPENSE_TYPES, getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";

type MatchType = "contains" | "exact" | "regex" | "account";

interface Rule {
  id: number;
  name: string;
  match_type: MatchType;
  match_value: string;
  category: string;
  expense_type: string | null;
  priority: number;
  is_active: number;
  times_applied: number;
  created_at: string;
}

interface Suggestion {
  name: string;
  match_type: string;
  match_value: string;
  category: string;
  expense_type: string | null;
  priority: number;
  count: number;
}

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  contains: "Contiene",
  exact: "Exacto",
  regex: "Regex",
  account: "Cuenta",
};

const EMPTY_FORM = {
  name: "",
  match_type: "contains" as MatchType,
  match_value: "",
  category: "",
  expense_type: "" as string,
  priority: 0,
};

function RuleDialog({
  open,
  rule,
  onClose,
  onSave,
}: {
  open: boolean;
  rule?: Rule;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState(() =>
    rule
      ? {
          name: rule.name,
          match_type: rule.match_type,
          match_value: rule.match_value,
          category: rule.category,
          expense_type: rule.expense_type ?? "",
          priority: rule.priority,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.match_value || !form.category) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        expense_type: form.expense_type || null,
      };
      const res = rule
        ? await apiFetch(`/api/rules/${rule.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error("Error al guardar regla"); return; }
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regla" : "Nueva regla"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {/* Name */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Nombre</label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ej: Albert Heijn → Supermercado"
              required
            />
          </div>

          {/* Match type */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo de coincidencia</label>
            <Select
              value={form.match_type}
              onValueChange={(v) => set("match_type", v as MatchType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MATCH_TYPE_LABELS) as MatchType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {MATCH_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Match value */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Valor a buscar{form.match_type === "account" ? " (slug de cuenta)" : ""}
            </label>
            <Input
              value={form.match_value}
              onChange={(e) => set("match_value", e.target.value)}
              placeholder={
                form.match_type === "regex"
                  ? "Ej: albert.*heijn"
                  : form.match_type === "account"
                  ? "Ej: revolut"
                  : "Ej: Albert Heijn"
              }
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Categoría</label>
            <Select
              value={form.category}
              onValueChange={(v) => set("category", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ALL_CATEGORIES).map(([slug, info]) => (
                  <SelectItem key={slug} value={slug}>
                    <span className="flex items-center gap-2"><CategoryIcon icon={info.icon} color={info.color} size="sm" withBackground={false} /> {info.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Expense type (optional) */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Tipo de gasto (opcional)
            </label>
            <Select
              value={form.expense_type || "__none__"}
              onValueChange={(v) => set("expense_type", v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin especificar</SelectItem>
                {Object.entries(EXPENSE_TYPES).map(([slug, info]) => (
                  <SelectItem key={slug} value={slug}>
                    {info.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Prioridad (mayor = se aplica primero)
            </label>
            <Input
              type="number"
              value={form.priority}
              onChange={(e) => set("priority", Number(e.target.value))}
              min={0}
              max={100}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Guardando..." : rule ? "Guardar cambios" : "Crear regla"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SuggestionsDialog({
  open,
  onClose,
  onRulesCreated,
}: {
  open: boolean;
  onClose: () => void;
  onRulesCreated: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState<Set<number>>(new Set());
  const [created, setCreated] = useState<Set<number>>(new Set());

  async function loadSuggestions() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/rules/suggest", { method: "POST" });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error("Error al generar sugerencias"); return; }
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
      setDismissed(new Set());
      setCreated(new Set());
    } finally {
      setLoading(false);
    }
  }

  async function acceptSuggestion(idx: number) {
    const s = suggestions[idx];
    setCreating((prev) => new Set(prev).add(idx));
    try {
      const res = await apiFetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!res.ok) { const { toast } = await import("sonner"); toast.error("Error al crear regla"); return; }
      setCreated((prev) => new Set(prev).add(idx));
      onRulesCreated();
    } finally {
      setCreating((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  }

  function dismiss(idx: number) {
    setDismissed((prev) => new Set(prev).add(idx));
  }

  const visible = suggestions.filter((_, i) => !dismissed.has(i));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else loadSuggestions();
      }}
    >
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sugerir reglas desde historico</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Patrones detectados en tus transacciones que se repiten al menos 2 veces.
        </p>
        {loading && (
          <div className="text-center py-8 text-muted-foreground">Analizando transacciones...</div>
        )}
        {!loading && visible.length === 0 && suggestions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay suficientes datos para generar sugerencias.
          </div>
        )}
        {!loading && visible.length === 0 && suggestions.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Has procesado todas las sugerencias.
          </div>
        )}
        {!loading && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {suggestions.map((s, i) => {
              if (dismissed.has(i)) return null;
              const catInfo = getCategoryInfo(s.category);
              const isDone = created.has(i);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{s.match_value}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <CategoryIcon icon={catInfo.icon} color={catInfo.color} size="sm" withBackground={false} /> {catInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {s.count} veces
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {isDone ? (
                      <Badge variant="outline" className="text-[#2D6A4F] border-[#2D6A4F]">
                        Creada
                      </Badge>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => dismiss(i)}
                        >
                          Ignorar
                        </Button>
                        <Button
                          size="sm"
                          disabled={creating.has(i)}
                          onClick={() => acceptSuggestion(i)}
                        >
                          Aceptar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function RulesPage() {
  const { data, refresh, error } = useFetch<{ rules: Rule[] }>("/api/rules");
  const rules = data?.rules ?? [];

  // Todos los useState antes de cualquier return condicional (rules-of-hooks).
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | undefined>(undefined);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<number | null>(null);

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  if (error) return <FetchError onRetry={handleRefresh} />;

  function openCreate() {
    setEditingRule(undefined);
    setDialogOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setDialogOpen(true);
  }

  async function handleDelete(id: number) {
    const res = await apiFetch(`/api/rules/${id}`, { method: "DELETE" });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error("Error al eliminar regla"); return; }
    refresh();
  }

  async function toggleActive(rule: Rule) {
    const res = await apiFetch(`/api/rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
    });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error("Error al cambiar estado"); return; }
    refresh();
  }

  return (
    <div className="animate-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-wide mb-1">
            AUTO-CATEGORIZACIÓN
          </div>
          <h1 className="text-2xl font-black">Reglas</h1>
          {rules.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {rules.filter((r) => r.is_active).length} activas de {rules.length} regla
              {rules.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSuggestOpen(true)}>
            Sugerir reglas
          </Button>
          <Button onClick={openCreate}>+ Nueva regla</Button>
        </div>
      </div>

      {/* Table */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>
            </div>
            <div className="font-semibold text-lg mb-2">Sin reglas todavia</div>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
              Las reglas auto-categorizan tus transacciones. Ej: si la descripcion contiene
              &quot;Albert Heijn&quot;, asignar la categoria Supermercado.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setSuggestOpen(true)}>
                Sugerir desde historico
              </Button>
              <Button onClick={openCreate}>Crear primera regla</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Todas las reglas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-center">Prioridad</TableHead>
                    <TableHead className="text-center">Aplicada</TableHead>
                    <TableHead className="text-center">Activa</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => {
                    const catInfo = getCategoryInfo(rule.category);
                    return (
                      <TableRow key={rule.id} className={rule.is_active ? "" : "opacity-50"}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {MATCH_TYPE_LABELS[rule.match_type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[160px] truncate">
                          {rule.match_value}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm flex items-center gap-2">
                            <CategoryIcon icon={catInfo.icon} color={catInfo.color} size="sm" withBackground={false} /> {catInfo.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">{rule.priority}</TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {rule.times_applied}x
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() => toggleActive(rule)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                              rule.is_active ? "bg-primary" : "bg-muted"
                            }`}
                            title={rule.is_active ? "Desactivar" : "Activar"}
                            aria-pressed={Boolean(rule.is_active)}
                            aria-label={rule.is_active ? "Desactivar" : "Activar"}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                rule.is_active ? "translate-x-4.5" : "translate-x-1"
                              }`}
                              style={{
                                transform: rule.is_active
                                  ? "translateX(18px)"
                                  : "translateX(2px)",
                              }}
                            />
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openEdit(rule)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeleteRuleId(rule.id)}
                            >
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rule create/edit dialog */}
      <RuleDialog
        open={dialogOpen}
        rule={editingRule}
        onClose={() => setDialogOpen(false)}
        onSave={refresh}
      />

      {/* Suggestions dialog */}
      <SuggestionsDialog
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        onRulesCreated={refresh}
      />

      <ConfirmDialog
        open={deleteRuleId !== null}
        onOpenChange={(open) => { if (!open) setDeleteRuleId(null); }}
        title="Eliminar regla?"
        description="Se eliminará esta regla de categorizacion automatica."
        confirmLabel="Eliminar"
        onConfirm={async () => { if (deleteRuleId) await handleDelete(deleteRuleId); }}
      />
    </div>
  );
}
