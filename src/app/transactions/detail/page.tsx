"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getCategoryInfo, EXPENSE_TYPES } from "@/lib/categories";
import { useT, useLocaleCode } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";
import { CategoryIcon } from "@/components/category-icon";
import { TransactionForm } from "@/components/transaction-form";
import { SplitDialog } from "@/components/split-dialog";
import type { Transaction, TransactionSplit } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ChevronLeft, Pencil, Split, Trash2 } from "lucide-react";

function TransactionDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const localeCode = useLocaleCode();
  const idParam = searchParams.get("id");
  const id = idParam ? parseInt(idParam, 10) : NaN;

  const [tx, setTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);

  const loadSplits = () => {
    apiFetch(`/api/transactions/${id}/splits`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSplits(data))
      .catch(() => setSplits([]));
  };

  const reloadTransaction = () => {
    apiFetch(`/api/transactions/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { setTx(data); });
    loadSplits();
  };

  useEffect(() => {
    if (Number.isNaN(id)) {
      setLoading(false);
      return;
    }
    apiFetch(`/api/transactions/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { setTx(data); setLoading(false); })
      .catch(() => setLoading(false));
    loadSplits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (res.ok) {
      const { toast } = await import("sonner");
      toast.success(t("transactionDeleted"));
      router.push("/transactions");
    } else {
      const { toast } = await import("sonner");
      toast.error(t("errorDeletingTransaction"));
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="text-muted-foreground">{t("transactionNotFound")}</div>
        <Button asChild variant="link">
          <Link href="/transactions">{t("backToTransactions")}</Link>
        </Button>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setEditing(false)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
            {t("cancel")}
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">{t("edit")} #{tx.id}</span>
        </div>

        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold mb-6">{t("editTransaction")}</h1>
          <Card>
            <CardContent className="pt-6">
              <TransactionForm
                mode="edit"
                initial={{
                  id: tx.id,
                  amount: tx.amount,
                  currency: tx.currency,
                  eur_amount: tx.eur_amount,
                  direction: tx.direction,
                  description: tx.description,
                  category: tx.category,
                  expense_type: tx.expense_type,
                  date: tx.date,
                  account: tx.account,
                }}
                onSaved={() => {
                  setEditing(false);
                  reloadTransaction();
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const cat = getCategoryInfo(tx.category);
  const isIncome = tx.direction === "income";
  const amountColorClass = isIncome
    ? "text-income"
    : tx.category === "inversiones"
    ? "text-[var(--invest)]"
    : "text-expense";
  const sign = isIncome ? "+" : "-";
  const typeInfo = tx.expense_type ? EXPENSE_TYPES[tx.expense_type as keyof typeof EXPENSE_TYPES] : null;

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/transactions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          {t("transactions")}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">#{tx.id}</span>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Left: Transaction info */}
        <Card>
          <CardContent className="p-4 sm:pt-6 flex flex-col gap-4 sm:gap-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <CategoryIcon icon={cat.icon} color={cat.color} size="lg" />
              <div>
                <div className="flex items-start gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-semibold leading-tight">{tx.description}</h1>
                  {tx.has_splits === 1 && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {t("dividedLabel")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{cat.label}</p>
              </div>
            </div>

            <div>
              <div className="text-[10px] tracking-wide text-muted-foreground mb-1">IMPORTE</div>
              <div className={`text-3xl font-bold tabular-nums ${amountColorClass}`}>
                {sign}{getCurrencySymbol("EUR")}{tx.eur_amount.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              {tx.currency !== "EUR" && (
                <div className="text-sm text-muted-foreground mt-0.5 tabular-nums">
                  {getCurrencySymbol(tx.currency)}{tx.amount.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] tracking-wide text-muted-foreground mb-1">FECHA</div>
                <div className="text-sm">{tx.date}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-wide text-muted-foreground mb-1">TIPO</div>
                <div className="text-sm capitalize">{tx.direction === "income" ? t("income") : t("expense")}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-wide text-muted-foreground mb-1">CATEGORIA</div>
                <div className="text-sm">{cat.label}</div>
              </div>
              {tx.currency !== "EUR" && (
                <div>
                  <div className="text-[10px] tracking-wide text-muted-foreground mb-1">MONEDA</div>
                  <div className="text-sm">{tx.currency}</div>
                </div>
              )}
              {tx.account && (
                <div>
                  <div className="text-[10px] tracking-wide text-muted-foreground mb-1">CUENTA</div>
                  <div className="text-sm capitalize">{tx.account}</div>
                </div>
              )}
            </div>

            {typeInfo && (
              <div>
                <div className="text-[10px] tracking-wide text-muted-foreground mb-1">TIPO DE GASTO</div>
                <Badge
                  variant="outline"
                  style={{ backgroundColor: typeInfo.color + "22", color: typeInfo.color, borderColor: typeInfo.color + "44" }}
                >
                  {typeInfo.label}
                </Badge>
              </div>
            )}

            <div className="border-t border-border pt-4 text-xs text-muted-foreground space-y-1">
              <div>{t("createdAt")} {new Date(tx.created_at).toLocaleString(localeCode)}</div>
              {tx.updated_at && <div>{t("updatedAt")} {new Date(tx.updated_at).toLocaleString(localeCode)}</div>}
            </div>

            {/* Action buttons */}
            <div className="mt-auto grid grid-cols-2 gap-2">
              <Button
                className="h-11 gap-2"
                onClick={() => setEditing(true)}
              >
                <Pencil size={15} />
                {t("edit")}
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2"
                onClick={() => setShowSplitDialog(true)}
              >
                <Split size={15} />
                {t("splitLabel")}
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-expense border-red-500/30 bg-red-500/15 hover:bg-red-500/25"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={15} />
                {t("delete")}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Splits section */}
      {splits.length > 0 && (
        <div className="max-w-4xl mx-auto mt-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-[10px] tracking-wide text-muted-foreground mb-3">SPLITS</div>
              <div className="space-y-2">
                {splits.map((s) => {
                  const splitCat = getCategoryInfo(s.category);
                  const splitType = s.expense_type ? EXPENSE_TYPES[s.expense_type as keyof typeof EXPENSE_TYPES] : null;
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                      <CategoryIcon icon={splitCat.icon} color={splitCat.color} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{splitCat.label}</div>
                        {s.description && (
                          <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                        )}
                      </div>
                      {splitType && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ backgroundColor: splitType.color + "22", color: splitType.color, borderColor: splitType.color + "44" }}
                        >
                          {splitType.label}
                        </Badge>
                      )}
                      <span className="font-mono text-sm font-bold shrink-0">
                        {getCurrencySymbol(tx.currency)}{s.amount.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Split dialog */}
      <SplitDialog
        transaction={tx}
        open={showSplitDialog}
        onOpenChange={setShowSplitDialog}
        onSaved={reloadTransaction}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t("deleteTransactionTitle")}
        description={t("deleteTransactionDesc")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function TransactionDetailPage() {
  return (
    <Suspense fallback={null}>
      <TransactionDetailContent />
    </Suspense>
  );
}
