"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_TYPES, getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { useLocaleCode } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";
import type { Transaction, TransactionSplit } from "@/lib/db";

interface SplitRow {
  amount: string;
  category: string;
  expense_type: string;
  description: string;
}

function emptySplitRow(): SplitRow {
  return { amount: "", category: "", expense_type: "", description: "" };
}

interface SplitDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SplitDialog({ transaction, open, onOpenChange, onSaved }: SplitDialogProps) {
  const localeCode = useLocaleCode();
  const sym = getCurrencySymbol(transaction.currency);
  const fmt2 = (n: number) =>
    n.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [rows, setRows] = useState<SplitRow[]>([emptySplitRow(), emptySplitRow()]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [existingSplits, setExistingSplits] = useState<TransactionSplit[]>([]);

  const categories = transaction.direction === "income"
    ? Object.entries(INCOME_CATEGORIES)
    : Object.entries(EXPENSE_CATEGORIES);

  const loadSplits = useCallback(async () => {
    const res = await apiFetch(`/api/transactions/${transaction.id}/splits`);
    if (res.ok) {
      const data: TransactionSplit[] = await res.json();
      setExistingSplits(data);
      if (data.length > 0) {
        setRows(data.map(s => ({
          amount: s.amount.toFixed(2),
          category: s.category,
          expense_type: s.expense_type ?? "",
          description: s.description ?? "",
        })));
      } else {
        setRows([emptySplitRow(), emptySplitRow()]);
      }
    }
  }, [transaction.id]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loadSplits fetches data and sets rows/splits; must fire synchronously when dialog opens to populate before render
      loadSplits();
    }
  }, [open, loadSplits]);

  const total = transaction.eur_amount;
  const sum = rows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
  const remaining = total - sum;
  const canSave = Math.abs(remaining) < 0.01 && rows.every(r => r.amount && r.category);

  const updateRow = (index: number, field: keyof SplitRow, value: string) => {
    const updated = rows.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    setRows(updated);
  };

  const addRow = () => {
    setRows([...rows, emptySplitRow()]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 2) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    const splits = rows.map(r => ({
      amount: parseFloat(r.amount),
      category: r.category,
      expense_type: r.expense_type || undefined,
      description: r.description || undefined,
    }));

    const res = await apiFetch(`/api/transactions/${transaction.id}/splits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splits }),
    });

    setSaving(false);
    if (res.ok) {
      onOpenChange(false);
      onSaved();
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await apiFetch(`/api/transactions/${transaction.id}/splits`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (res.ok) {
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dividir transacción</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total de la transacción:</span>
            <span className="font-bold text-lg">{sym}{fmt2(total)}</span>
          </div>

          <div className="space-y-3">
            {rows.map((row, i) => {
              const catInfo = row.category ? getCategoryInfo(row.category) : null;
              return (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] tracking-wide text-muted-foreground">IMPORTE</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => updateRow(i, "amount", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] tracking-wide text-muted-foreground">CATEGORIA</label>
                      <Select value={row.category} onValueChange={(v) => updateRow(i, "category", v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar">
                            {catInfo ? <span className="flex items-center gap-2"><CategoryIcon icon={catInfo.icon} color={catInfo.color} size="sm" withBackground={false} /> {catInfo.label}</span> : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(([slug, info]) => (
                            <SelectItem key={slug} value={slug}>
                              <span className="flex items-center gap-2"><CategoryIcon icon={info.icon} color={info.color} size="sm" withBackground={false} /> {info.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {transaction.direction === "expense" && (
                      <div>
                        <label className="text-[10px] tracking-wide text-muted-foreground">TIPO</label>
                        <Select value={row.expense_type} onValueChange={(v) => updateRow(i, "expense_type", v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Opcional" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(EXPENSE_TYPES).map(([slug, info]) => (
                              <SelectItem key={slug} value={slug}>
                                {info.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] tracking-wide text-muted-foreground">DESCRIPCION</label>
                      <Input
                        placeholder="Opcional"
                        value={row.description}
                        onChange={(e) => updateRow(i, "description", e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 mt-5 text-muted-foreground hover:text-expense"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 2}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </Button>
                </div>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={addRow}>
            + Añadir split
          </Button>

          <div className={`flex items-center justify-between text-sm p-2 rounded-md ${
            Math.abs(remaining) < 0.01 ? "bg-green-500/10 text-income" : "bg-yellow-500/10 text-yellow-600"
          }`}>
            <span>Restante:</span>
            <span className="font-mono font-bold">{sym}{fmt2(remaining)}</span>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          {existingSplits.length > 0 && (
            <Button
              variant="outline"
              className="text-expense border-red-500/30 bg-red-500/15 hover:bg-red-500/25"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Eliminar splits"}
            </Button>
          )}
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Guardando..." : "Guardar splits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
