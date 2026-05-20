"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback } from "react";
import { CalendarCheck, CreditCard, ArrowDownRight, Repeat, Sparkles, Check, Loader2 } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useT, useLocaleCode } from "@/lib/i18n";
import { formatMoney } from "@/lib/currency";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeAccountColor } from "@/lib/account-color";
import { haptic } from "@/lib/premium/haptics";

interface FixedItem {
  id: number;
  name: string;
  amount: number;
  currency: string;
  category: string;
  billing_cycle: string;
  next_renewal: string;
  active: number;
  type: string;
  day_of_month: number | null;
  account: string | null;
  created_at: string;
}

interface FixedItemsData {
  subscriptions: FixedItem[];
  paused: FixedItem[];
  upcoming: FixedItem[];
}

// Cycle labels are resolved via t() at render time — see badge rendering below
const CYCLE_KEYS: Record<string, "monthly" | "annual" | "weekly" | "biweekly"> = {
  monthly: "monthly",
  yearly: "annual",
  weekly: "weekly",
  biweekly: "biweekly",
};

// Category value arrays — labels resolved via t() inside the component
const EXPENSE_CAT_VALUES = ["alquiler", "servicios", "seguros", "transporte", "telefono", "gimnasio", "otros_fijos"] as const;
const EXPENSE_CAT_KEYS: Record<string, string> = {
  alquiler: "fixedCatAlquiler", servicios: "fixedCatServicios", seguros: "fixedCatSeguros",
  transporte: "fixedCatTransporte", telefono: "fixedCatTelefono", gimnasio: "fixedCatGimnasio", otros_fijos: "fixedCatOtros",
};
const SUB_CAT_VALUES = ["suscripciones", "streaming", "software", "hosting", "musica", "almacenamiento", "productividad", "educacion"] as const;
const SUB_CAT_KEYS: Record<string, string> = {
  suscripciones: "subCatGeneral", streaming: "subCatStreaming", software: "subCatSoftware",
  hosting: "subCatHosting", musica: "subCatMusica", almacenamiento: "subCatAlmacenamiento",
  productividad: "subCatProductividad", educacion: "subCatEducacion",
};
const INCOME_CAT_VALUES = ["nomina", "freelance", "alquiler_ingreso", "inversiones", "otros_ingresos"] as const;
const INCOME_CAT_KEYS: Record<string, string> = {
  nomina: "incomeCatNomina", freelance: "incomeCatFreelance", alquiler_ingreso: "incomeCatAlquiler",
  inversiones: "incomeCatInversiones", otros_ingresos: "incomeCatOtros",
};

type ItemType = "fixed_expense" | "subscription" | "fixed_income";

function toMonthly(amount: number, cycle: string): number {
  if (cycle === "yearly") return amount / 12;
  if (cycle === "weekly") return amount * 4.33;
  if (cycle === "biweekly") return amount * 2.17;
  return amount;
}

function formatDateRaw(dateStr: string, shortMonths: string[]): { isToday: boolean; isTomorrow: boolean; formatted: string } {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return { isToday: true, isTomorrow: false, formatted: "" };
  if (dateStr === tomorrow) return { isToday: false, isTomorrow: true, formatted: "" };
  const [year, month, day] = dateStr.split("-").map(Number);
  return { isToday: false, isTomorrow: false, formatted: `${day} ${shortMonths[month - 1]} ${year}` };
}

const emptyForm = {
  name: "",
  amount: "",
  currency: "EUR",
  category: "",
  billing_cycle: "monthly",
  next_renewal: new Date().toISOString().slice(0, 10),
  day_of_month: "",
  account: "",
};

interface AccountInfo { slug: string; name: string; color: string; }

export default function FixedExpensesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const localeCode = useLocaleCode();

  const EXPENSE_CATEGORIES = EXPENSE_CAT_VALUES.map(v => ({ value: v, label: t(EXPENSE_CAT_KEYS[v]) }));
  const SUB_CATEGORIES = SUB_CAT_VALUES.map(v => ({ value: v, label: t(SUB_CAT_KEYS[v]) }));
  const INCOME_CATEGORIES = INCOME_CAT_VALUES.map(v => ({ value: v, label: t(INCOME_CAT_KEYS[v]) }));

  const SHORT_MONTHS = [
    t("shortMonthJan"), t("shortMonthFeb"), t("shortMonthMar"), t("shortMonthApr"),
    t("shortMonthMay"), t("shortMonthJun"), t("shortMonthJul"), t("shortMonthAug"),
    t("shortMonthSep"), t("shortMonthOct"), t("shortMonthNov"), t("shortMonthDec"),
  ];
  const { data: allData, refresh, error: fetchError } = useFetch<FixedItemsData>("/api/subscriptions");
  const { data: accountsData } = useFetch<{ accounts: AccountInfo[] }>("/api/accounts");
  const accounts = accountsData?.accounts ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FixedItem | null>(null);
  const [createType, setCreateType] = useState<ItemType>("fixed_expense");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"expenses" | "subscriptions" | "income">("expenses");

  const handleRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  function openCreate(type: ItemType) {
    setEditingItem(null);
    setCreateType(type);
    const defaultCategory = type === "fixed_expense" ? "alquiler" : type === "subscription" ? "suscripciones" : "nomina";
    setForm({ ...emptyForm, category: defaultCategory });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(item: FixedItem) {
    setEditingItem(item);
    setCreateType(item.type as ItemType);
    setForm({
      name: item.name,
      amount: String(item.amount),
      currency: item.currency,
      category: item.category,
      billing_cycle: item.billing_cycle,
      next_renewal: item.next_renewal,
      day_of_month: item.day_of_month ? String(item.day_of_month) : "",
      account: item.account || "",
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSave() {
    const amount = parseFloat(form.amount);
    if (!form.name.trim()) { setError(t("nameRequired")); return; }
    if (isNaN(amount) || amount <= 0) { setError(t("invalidAmount")); return; }
    if (!form.next_renewal) { setError(t("dateRequired")); return; }

    setSaving(true);
    setError("");

    const dayNum = parseInt(form.day_of_month, 10);
    const payload = {
      name: form.name.trim(),
      amount,
      currency: form.currency,
      category: form.category,
      billing_cycle: form.billing_cycle,
      next_renewal: form.next_renewal,
      type: editingItem ? editingItem.type : createType,
      day_of_month: !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31 ? dayNum : null,
      account: form.account || null,
    };

    const url = editingItem ? `/api/subscriptions/${editingItem.id}` : "/api/subscriptions";
    const method = editingItem ? "PUT" : "POST";

    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("errorSaving"));
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

  async function toggleActive(item: FixedItem) {
    const res = await apiFetch(`/api/subscriptions/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    if (!res.ok) { const { toast } = await import("sonner"); toast.error(t("errorChangingStatus")); return; }
    refresh();
  }

  if (fetchError) return <FetchError onRetry={handleRefresh} />;

  if (!allData) {
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

  const all = [...allData.subscriptions, ...allData.paused];
  const fixedExpenses = all.filter(i => i.type === "fixed_expense" && i.active);
  const subscriptions = all.filter(i => (i.type === "subscription" || !i.type) && i.active);
  const fixedIncome = all.filter(i => i.type === "fixed_income" && i.active);
  const pausedItems = all.filter(i => !i.active);

  const currentItems = activeTab === "expenses" ? fixedExpenses : activeTab === "subscriptions" ? subscriptions : fixedIncome;
  const currentType: ItemType = activeTab === "expenses" ? "fixed_expense" : activeTab === "subscriptions" ? "subscription" : "fixed_income";
  const currentLabel = activeTab === "expenses" ? t("fixedExpenseLabel") : activeTab === "subscriptions" ? t("subscriptionLabel") : t("fixedIncomeLabel");
  const currentCategories = activeTab === "expenses" ? EXPENSE_CATEGORIES : activeTab === "subscriptions" ? SUB_CATEGORIES : INCOME_CATEGORIES;

  const totalMonthlyExpenses = fixedExpenses.reduce((s, i) => s + toMonthly(i.amount, i.billing_cycle), 0);
  const totalMonthlySubs = subscriptions.reduce((s, i) => s + toMonthly(i.amount, i.billing_cycle), 0);
  const totalMonthlyIncome = fixedIncome.reduce((s, i) => s + toMonthly(i.amount, i.billing_cycle), 0);

  const tabs = [
    { key: "expenses" as const, label: t("fixedExpenses"), count: fixedExpenses.length, total: totalMonthlyExpenses, icon: CalendarCheck },
    { key: "subscriptions" as const, label: t("subscriptions"), count: subscriptions.length, total: totalMonthlySubs, icon: CreditCard },
    { key: "income" as const, label: t("fixedIncome"), count: fixedIncome.length, total: totalMonthlyIncome, icon: ArrowDownRight },
  ];

  return (
    <div className="animate-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">{t("fixedExpenses")}</h1>
        <Button size="sm" onClick={() => openCreate(currentType)}>+ {t("newItem")}</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted/40 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 text-xs font-medium py-2 px-2 rounded-lg transition-all ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">
              {activeTab === "income" ? t("income2") : t("active")}
            </div>
            <div className="text-2xl font-bold">{currentItems.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-muted-foreground text-[10px] tracking-wide mb-1">{t("totalMonthly")}</div>
            <div className={`text-2xl font-bold ${activeTab === "income" ? "text-[#2D6A4F]" : ""}`}>
              {"\u20AC"}{tabs.find(t => t.key === activeTab)!.total.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-3">
        {currentItems.length === 0 && (
          <div className="flex flex-col items-center text-center py-10 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              {activeTab === "expenses" ? <CalendarCheck size={24} className="text-primary" /> :
               activeTab === "subscriptions" ? <CreditCard size={24} className="text-primary" /> :
               <ArrowDownRight size={24} className="text-primary" />}
            </div>
            <div>
              <p className="font-semibold text-base mb-1">
                {activeTab === "expenses" ? t("noFixedExpenses") : activeTab === "subscriptions" ? t("noSubscriptions") : t("noFixedIncome")}
              </p>
              <p className="text-muted-foreground text-sm max-w-[240px] mx-auto">
                {activeTab === "expenses" ? t("noFixedExpensesDesc") : activeTab === "subscriptions" ? t("noSubscriptionsDesc") : t("noFixedIncomeDesc")}
              </p>
            </div>
            <Button size="sm" onClick={() => openCreate(currentType)} className="bg-primary hover:bg-primary/90">
              {t("addItem")} {currentLabel}
            </Button>
          </div>
        )}

        {currentItems.map((item) => {
          const monthly = toMonthly(item.amount, item.billing_cycle);
          return (
            <Card key={item.id} className="group">
              <CardContent className="pt-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">{item.name}</span>
                      {item.billing_cycle !== "monthly" && (
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          {CYCLE_KEYS[item.billing_cycle] ? t(CYCLE_KEYS[item.billing_cycle]) : item.billing_cycle}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.day_of_month
                        ? t("dayXOfMonth").replace("{day}", String(item.day_of_month))
                        : (() => { const d = formatDateRaw(item.next_renewal, SHORT_MONTHS); return `${t("nextRenewal")}: ${d.isToday ? t("today") : d.isTomorrow ? t("tomorrow") : d.formatted}`; })()}
                      {item.billing_cycle !== "monthly" && (
                        <span className="ml-2">({"\u2248"} {formatMoney(monthly, item.currency, localeCode)}{t("perMonth")})</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {item.category}
                      {item.account && (() => {
                        const acc = accounts.find(a => a.slug === item.account);
                        return acc ? <span> · {acc.name}</span> : null;
                      })()}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className={`text-lg font-bold ${activeTab === "income" ? "text-[#2D6A4F]" : "text-foreground"}`}>
                      {formatMoney(item.amount, item.currency, localeCode)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  <Button variant="ghost" size="sm" className="text-xs flex-1" onClick={() => openEdit(item)}>
                    {t("edit")}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs flex-1" onClick={() => toggleActive(item)}>
                    {t("pause")}
                  </Button>
                  {deleteConfirm === item.id ? (
                    <div className="flex gap-1 flex-1">
                      <Button variant="destructive" size="sm" className="text-xs flex-1" onClick={() => handleDelete(item.id)}>
                        {t("confirm")}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDeleteConfirm(null)}>
                        {t("no")}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-xs flex-1 text-destructive" onClick={() => setDeleteConfirm(item.id)}>
                      {t("delete")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Paused items */}
      {pausedItems.length > 0 && (
        <div className="mt-6">
          <div className="text-muted-foreground text-[10px] tracking-wide mb-3">{t("paused")}</div>
          <div className="flex flex-col gap-2">
            {pausedItems.map((item) => (
              <Card key={item.id} className="opacity-60">
                <CardContent className="pt-3 pb-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-foreground text-sm">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatMoney(item.amount, item.currency, localeCode)} / {CYCLE_KEYS[item.billing_cycle] ? t(CYCLE_KEYS[item.billing_cycle]) : item.billing_cycle}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => toggleActive(item)}>
                        {t("reactivate")}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleDelete(item.id)}>
                        {t("delete")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Monthly total */}
      {(totalMonthlyExpenses + totalMonthlySubs) > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t("totalFixedExpensesMonth")}</span>
              <span className="text-lg font-bold">{"\u20AC"}{(totalMonthlyExpenses + totalMonthlySubs).toFixed(2)}</span>
            </div>
            {totalMonthlyIncome > 0 && (
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-muted-foreground">{t("totalFixedIncomeMonth")}</span>
                <span className="text-lg font-bold text-[#2D6A4F]">{"\u20AC"}{totalMonthlyIncome.toFixed(2)}</span>
              </div>
            )}
            {totalMonthlyIncome > 0 && (
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">{t("availableAfterFixed")}</span>
                <span className={`text-lg font-bold ${totalMonthlyIncome - totalMonthlyExpenses - totalMonthlySubs >= 0 ? "text-[#2D6A4F]" : "text-red-400"}`}>
                  {"\u20AC"}{(totalMonthlyIncome - totalMonthlyExpenses - totalMonthlySubs).toFixed(2)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog — layout premium con hero + secciones */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          {/* Hero header con icono + título + descripción */}
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                {activeTab === "subscriptions" ? (
                  <CreditCard size={20} className="text-primary" />
                ) : activeTab === "income" ? (
                  <Sparkles size={20} className="text-primary" />
                ) : (
                  <Repeat size={20} className="text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h2 className="text-base font-bold leading-tight">
                  {editingItem ? `${t("editItem")} ${currentLabel.toLowerCase()}` : `${t("newItem")} ${currentLabel.toLowerCase()}`}
                </h2>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {activeTab === "subscriptions"
                    ? "Registra una suscripción recurrente que se paga sola cada ciclo."
                    : activeTab === "income"
                    ? "Apunta un ingreso fijo que entra cada ciclo (nómina, renta, dividendos…)."
                    : "Apunta un gasto fijo que se cobra cada ciclo (alquiler, luz, internet…)."}
                </p>
              </div>
            </div>
          </div>

          {/* Scrollable form body */}
          <div className="flex flex-col gap-4 px-5 py-4 max-h-[65vh] overflow-y-auto">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="item-name" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("name")}
              </Label>
              <Input
                id="item-name"
                placeholder={activeTab === "expenses" ? "Alquiler, Luz…" : activeTab === "subscriptions" ? "Netflix, Spotify…" : "Nómina, Freelance…"}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-11 rounded-xl text-sm"
              />
            </div>

            {/* Importe + Día en grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-amount" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("amount")}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
                  <Input
                    id="item-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="750,00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="h-11 rounded-xl text-sm pl-7 tabular-nums"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-day" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("dayOfMonth")}
                </Label>
                <Input
                  id="item-day"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="1"
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
                  className="h-11 rounded-xl text-sm tabular-nums"
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Frecuencia como pills (más premium que Select) */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("frequency")}
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["monthly", "biweekly", "weekly", "yearly"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { haptic.tap(); setForm({ ...form, billing_cycle: c }); }}
                    aria-pressed={form.billing_cycle === c}
                    className={`h-10 rounded-xl text-xs font-semibold transition-all active:scale-[0.97] ${
                      form.billing_cycle === c
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {c === "monthly" ? t("monthly") : c === "yearly" ? t("annual") : c === "weekly" ? t("weekly") : t("biweekly")}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <Label htmlFor="item-category" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("category")}
              </Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="item-category" className="h-11 rounded-xl text-sm">
                  <SelectValue placeholder={t("category")} />
                </SelectTrigger>
                <SelectContent>
                  {currentCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Próxima fecha */}
            <div className="space-y-1.5">
              <Label htmlFor="item-renewal" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("nextDate")}
              </Label>
              <Input
                id="item-renewal"
                type="date"
                value={form.next_renewal}
                onChange={(e) => setForm({ ...form, next_renewal: e.target.value })}
                className="h-11 rounded-xl text-sm"
              />
            </div>

            {/* Cuenta — pills con color normalizado (nunca morado) */}
            {accounts.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("account")}
                </Label>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                  {accounts.map((acc) => {
                    const selected = form.account === acc.slug;
                    const dotColor = normalizeAccountColor(acc.color);
                    return (
                      <button
                        key={acc.slug}
                        type="button"
                        onClick={() => { haptic.tap(); setForm({ ...form, account: acc.slug }); }}
                        aria-pressed={selected}
                        className={`shrink-0 h-10 px-3 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 active:scale-[0.97] ${
                          selected
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-foreground hover:bg-muted"
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: selected ? "currentColor" : dotColor }}
                        />
                        {acc.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-3 py-2">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Footer sticky con CTA primario */}
          <div className="px-5 py-4 border-t border-border bg-background shrink-0">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 font-bold text-sm shadow-lg shadow-primary/20 active:scale-[0.97] transition-all"
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> {editingItem ? t("savingChanges") : t("saving")}</>
              ) : (
                <><Check size={16} className="mr-2" /> {editingItem ? t("savingChanges") : `${t("create")} ${currentLabel.toLowerCase()}`}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
