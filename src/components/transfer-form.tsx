"use client";
import { apiFetch } from "@/lib/api";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AccountOption {
  slug: string;
  name: string;
  emoji: string;
  color: string;
}

export function TransferForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: accountsData } = useFetch<{ accounts: AccountOption[] }>("/api/accounts");
  const accounts = (accountsData?.accounts ?? []).map((a) => ({
    slug: a.slug,
    name: a.name,
    color: a.color || "#3b82f6",
  }));

  const [amount, setAmount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const labelClass = "text-[10px] tracking-wide text-muted-foreground mb-1.5 block";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Cantidad debe ser un numero positivo");
      setSaving(false);
      return;
    }

    if (!fromAccount) {
      setError("Selecciona la cuenta de origen");
      setSaving(false);
      return;
    }

    if (!toAccount) {
      setError("Selecciona la cuenta de destino");
      setSaving(false);
      return;
    }

    if (fromAccount === toAccount) {
      setError("Las cuentas deben ser diferentes");
      setSaving(false);
      return;
    }

    const payload = {
      amount: parsedAmount,
      currency: "EUR",
      from_account: fromAccount,
      to_account: toAccount,
      date,
      description: description || undefined,
      notes: notes || undefined,
    };

    try {
      const res = await apiFetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      const { toast } = await import("sonner");
      toast.success("Transferencia creada");
      router.push("/transactions");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Amount */}
      <div>
        <Label className={labelClass}>CANTIDAD</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />
      </div>

      {/* From account */}
      <div>
        <Label className={labelClass}>DESDE</Label>
        <div className="grid grid-cols-4 gap-2">
          {accounts.map((acc) => (
            <button
              key={acc.slug}
              type="button"
              onClick={() => setFromAccount(fromAccount === acc.slug ? "" : acc.slug)}
              className={`flex items-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors border ${
                fromAccount === acc.slug
                  ? "border-[var(--expense)]/40 bg-[var(--expense)]/15 text-foreground"
                  : toAccount === acc.slug
                    ? "border-border bg-background text-muted-foreground/40 cursor-not-allowed"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
              }`}
              disabled={toAccount === acc.slug}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: acc.color }}
              />
              {acc.name}
            </button>
          ))}
        </div>
      </div>

      {/* To account */}
      <div>
        <Label className={labelClass}>HACIA</Label>
        <div className="grid grid-cols-4 gap-2">
          {accounts.map((acc) => (
            <button
              key={acc.slug}
              type="button"
              onClick={() => setToAccount(toAccount === acc.slug ? "" : acc.slug)}
              className={`flex items-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors border ${
                toAccount === acc.slug
                  ? "border-[var(--income)]/40 bg-[var(--income)]/15 text-foreground"
                  : fromAccount === acc.slug
                    ? "border-border bg-background text-muted-foreground/40 cursor-not-allowed"
                    : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
              }`}
              disabled={fromAccount === acc.slug}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: acc.color }}
              />
              {acc.name}
            </button>
          ))}
        </div>
      </div>

      {/* Date */}
      <div>
        <Label className={labelClass}>FECHA</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* Description */}
      <div>
        <Label className={labelClass}>DESCRIPCION (OPCIONAL)</Label>
        <Input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={fromAccount && toAccount ? `Transferencia ${fromAccount} \u2192 ${toAccount}` : "Transferencia entre cuentas"}
        />
      </div>

      {/* Notes */}
      <div>
        <Label className={labelClass}>NOTAS (OPCIONAL)</Label>
        <Input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas adicionales..."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="text-expense text-sm bg-[var(--expense)]/10 border border-[var(--expense)]/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={saving}
        className="w-full gap-2"
      >
        <ArrowLeftRight size={16} />
        {saving ? "Guardando..." : "Crear transferencia"}
      </Button>
    </form>
  );
}
