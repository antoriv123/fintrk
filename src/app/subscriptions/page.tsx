"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback } from "react";
import { CreditCard } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useT } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/components/fetch-error";
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

interface Subscription {
  id: number;
  name: string;
  amount: number;
  currency: string;
  category: string;
  billing_cycle: string;
  next_renewal: string;
  active: number;
  created_at: string;
  account: string | null;
}

interface AccountOption {
  slug: string;
  name: string;
  emoji?: string | null;
  color?: string | null;
}

interface SubscriptionsData {
  subscriptions: Subscription[];
  paused: Subscription[];
  upcoming: Subscription[];
}

const CYCLE_LABELS: Record<string, string> = {
  monthly: "Mensual",
  yearly: "Anual",
  weekly: "Semanal",
};

const CATEGORY_OPTIONS = [
  "suscripciones",
  "streaming",
  "software",
  "hosting",
  "musica",
  "almacenamiento",
  "productividad",
  "educacion",
  "otro",
];

function toMonthly(amount: number, cycle: string): number {
  if (cycle === "yearly") return amount / 12;
  if (cycle === "weekly") return amount * 4.33;
  return amount;
}

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Hoy";
  if (dateStr === tomorrow) return "Mañana";

  const [year, month, day] = dateStr.split("-").map(Number);
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

const emptyForm = {
  name: "",
  amount: "",
  currency: "EUR",
  category: "suscripciones",
  billing_cycle: "monthly",
  next_renewal: new Date().toISOString().slice(0, 10),
  account: "",
};

export default function SubscriptionsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const { data, refresh, error: fetchError } = useFetch<SubscriptionsData>("/api/subscriptions");
  const { data: accountsData } = useFetch<{ accounts: AccountOption[] }>("/api/accounts?transactions=0");
  const accounts = accountsData?.accounts ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  function openCreate() {
    setEditingSub(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(sub: Subscription) {
    setEditingSub(sub);
    setForm({
      name: sub.name,
      amount: String(sub.amount),
      currency: sub.currency,
      category: sub.category,
      billing_cycle: sub.billing_cycle,
      next_renewal: sub.next_renewal,
      account: sub.account ?? "",
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    const amount = parseFloat(form.amount);
    if (!form.name.trim()) { setError("Nombre requerido"); return; }
    if (isNaN(amount) || amount <= 0) { setError("Importe inválido"); return; }
    if (!form.next_renewal) { setError("Fecha de renovación requerida"); return; }

    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      amount,
      currency: form.currency,
      category: form.category,
      billing_cycle: form.billing_cycle,
      next_renewal: form.next_renewal,
      account: form.account || null,
    };

    const url = editingSub ? `/api/subscriptions/${editingSub.id}` : "/api/subscriptions";
    const method = editingSub ? "PUT" : "POST";

    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al guardar");
      setSaving(false);
      return;
    }

    setDialogOpen(false);
    setSaving(false);
    refresh();
  }

  async function handleDelete(id: number) {
    const res = await apiFetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteConfirm(null);
      refresh();
    }
  }

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  async function toggleActive(sub: Subscription) {
    const { haptic } = await import("@/lib/premium/haptics");
    haptic.confirm();
    const res = await apiFetch(`/api/subscriptions/${sub.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !sub.active }),
    });
    if (!res.ok) {
      haptic.error();
      const { toast } = await import("sonner");
      toast.error("Error al cambiar estado");
      return;
    }
    refresh();
  }

  if (fetchError) return <FetchError onRetry={handleRefresh} />;

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
    );
  }

  const subscriptions = data.subscriptions ?? [];
  const paused = data.paused ?? [];
  const upcoming = data.upcoming ?? [];

  const totalMonthly = subscriptions.reduce(
    (sum, s) => sum + toMonthly(s.amount, s.billing_cycle),
    0
  );

  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-2">
        <div className="text-muted-foreground text-xs tracking-wide">{t("subscriptions").toUpperCase()}</div>
        <Button size="sm" onClick={openCreate}>+ {t("newItem")}</Button>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        {t("subscriptionsTrackerHint")}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">ACTIVAS</div>
            <div className="text-2xl font-bold text-foreground">{subscriptions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">COSTE MENSUAL</div>
            <div className="text-2xl font-bold text-foreground">{"\u20AC"}{totalMonthly.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming renewals */}
      {upcoming.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 mb-6">
          <div className="text-amber-400 text-[10px] tracking-wide mb-3">RENOVACIONES PROXIMAS</div>
          <div className="flex flex-col gap-2">
            {upcoming.map((sub) => {
              const days = daysUntil(sub.next_renewal);
              return (
                <div key={sub.id} className="flex justify-between items-center">
                  <div>
                    <span className="text-sm font-medium text-foreground">{sub.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} dias`}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-amber-400">{"\u20AC"}{sub.amount.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="border-t border-amber-700/40 pt-2 mt-1 flex justify-between">
              <span className="text-xs text-amber-400">Total próximas</span>
              <span className="text-sm font-bold text-amber-400">
                {"\u20AC"}{upcoming.reduce((s, sub) => s + sub.amount, 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions list */}
      <div className="flex flex-col gap-3">
        {subscriptions.length === 0 && (
          <EmptyState
            icon={CreditCard}
            title={t("noSubscriptions")}
            description={t("noSubscriptionsDesc")}
            tone="brand"
            cta={{ label: t("addSubscription"), onClick: () => { setEditingSub(null); setDialogOpen(true); } }}
          />
        )}

        {subscriptions.map((sub) => {
          const monthly = toMonthly(sub.amount, sub.billing_cycle);
          const days = daysUntil(sub.next_renewal);
          const isSoon = days <= 3;

          return (
            <Card key={sub.id} className="group">
              <CardContent className="pt-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">{sub.name}</span>
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                        {CYCLE_LABELS[sub.billing_cycle] ?? sub.billing_cycle}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Renueva:{" "}
                      <span className={isSoon ? "text-amber-400 font-medium" : ""}>
                        {formatDate(sub.next_renewal)}
                      </span>
                      {sub.billing_cycle !== "monthly" && (
                        <span className="ml-2 text-muted-foreground">
                          ({"\u2248"} {"\u20AC"}{monthly.toFixed(2)}/mes)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{sub.category}</span>
                      {sub.account && (
                        <>
                          <span className="opacity-40">·</span>
                          <span>{accounts.find((a) => a.slug === sub.account)?.name ?? sub.account}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="text-lg font-bold text-foreground">{"\u20AC"}{sub.amount.toFixed(2)}</div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  <Button variant="ghost" size="sm" className="text-xs flex-1" onClick={() => openEdit(sub)}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs flex-1" onClick={() => toggleActive(sub)}>
                    Pausar
                  </Button>
                  {deleteConfirm === sub.id ? (
                    <div className="flex gap-1 flex-1">
                      <Button variant="destructive" size="sm" className="text-xs flex-1" onClick={() => handleDelete(sub.id)}>
                        Confirmar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDeleteConfirm(null)}>
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-xs flex-1 text-destructive" onClick={() => setDeleteConfirm(sub.id)}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Paused subscriptions */}
      {paused.length > 0 && (
        <div className="mt-6">
          <div className="text-muted-foreground text-[10px] tracking-wide mb-3">PAUSADAS</div>
          <div className="flex flex-col gap-2">
            {paused.map((sub) => (
              <Card key={sub.id} className="opacity-60">
                <CardContent className="pt-3 pb-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-foreground text-sm">{sub.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {"\u20AC"}{sub.amount.toFixed(2)} / {CYCLE_LABELS[sub.billing_cycle]}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleActive(sub)}>
                        Reactivar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleDelete(sub.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {subscriptions.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total mensual estimado</span>
              <span className="text-lg font-bold text-foreground">{"\u20AC"}{totalMonthly.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-muted-foreground">Total anual estimado</span>
              <span className="text-sm text-muted-foreground">{"\u20AC"}{(totalMonthly * 12).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSub ? "Editar suscripción" : "Nueva suscripción"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div>
              <Label htmlFor="sub-name">Nombre</Label>
              <Input
                id="sub-name"
                placeholder="Netflix, Spotify..."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sub-amount">Importe</Label>
                <Input
                  id="sub-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="9.99"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="sub-currency">Moneda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger id="sub-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sub-cycle">Ciclo</Label>
                <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                  <SelectTrigger id="sub-cycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sub-category">Categoría</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="sub-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="sub-renewal">Próxima renovación</Label>
              <Input
                id="sub-renewal"
                type="date"
                value={form.next_renewal}
                onChange={(e) => setForm({ ...form, next_renewal: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="sub-account">Cuenta de cobro</Label>
              <Select
                value={form.account || "none"}
                onValueChange={(v) => setForm({ ...form, account: v === "none" ? "" : v })}
              >
                <SelectTrigger id="sub-account">
                  <SelectValue placeholder="Selecciona cuenta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin cuenta asignada</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>
                      {a.emoji ? `${a.emoji} ` : ""}{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  No tienes cuentas todavía. Créalas en <a href="/accounts" className="underline text-primary">Cuentas</a>.
                </p>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : editingSub ? "Guardar cambios" : "Crear suscripción"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
