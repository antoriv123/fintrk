"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useT } from "@/lib/i18n";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { haptic } from "@/lib/premium/haptics";
import type { FilterValues } from "./filters-sheet";

interface AccountInfo {
  slug: string;
  name: string;
  color: string;
}

interface Props {
  values: FilterValues;
  onOpen: () => void;
  onClear: (key: keyof FilterValues) => void;
}

/**
 * Fila que reemplaza al carrusel de bancos + botón de filtros del header.
 * Muestra un botón "Filtrar" (siempre) y, junto a él, chips descartables
 * con los filtros activos — cuenta, tipo, categoría, clasificación, tag.
 * El usuario toca la X de un chip para borrar solo ese filtro sin abrir
 * el sheet, o toca "Filtrar" para abrir la hoja completa.
 */
export function ActiveFiltersRow({ values, onOpen, onClear }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const { data: accountsData } = useFetch<{ accounts: AccountInfo[] }>("/api/accounts");
  const accountName = values.account
    ? accountsData?.accounts.find(a => a.slug === values.account)?.name ?? values.account
    : "";

  const allCategories = { ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES };
  const categoryLabel = values.category
    ? (allCategories as Record<string, { label: string }>)[values.category]?.label ?? values.category
    : "";

  const directionLabel = values.direction === "expense" ? t("expense") : values.direction === "income" ? t("income") : "";
  const expenseTypeLabel =
    values.expenseType === "necesario" ? t("fixed")
    : values.expenseType === "negocio" ? t("business")
    : values.expenseType === "discrecional" ? t("discretionary")
    : "";

  const activeCount = [values.account, values.direction, values.category, values.expenseType, values.tag].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1">
      <button
        onClick={() => { haptic.tap(); onOpen(); }}
        className={`shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
          activeCount > 0
            ? "bg-[#2D6A4F] text-white shadow-sm"
            : "bg-muted text-foreground/80 hover:bg-muted/70"
        }`}
      >
        <SlidersHorizontal size={13} />
        {t("filterCta")}
        {activeCount > 0 && (
          <span className="ml-0.5 min-w-[18px] h-4 px-1 rounded-full bg-white/25 text-[10px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {values.account && (
        <ActiveChip label={accountName} onClear={() => onClear("account")} />
      )}
      {values.direction && (
        <ActiveChip label={directionLabel} onClear={() => onClear("direction")} />
      )}
      {values.category && (
        <ActiveChip label={categoryLabel} onClear={() => onClear("category")} />
      )}
      {values.expenseType && (
        <ActiveChip label={expenseTypeLabel} onClear={() => onClear("expenseType")} />
      )}
      {values.tag && (
        <ActiveChip label={`#${values.tag}`} onClear={() => onClear("tag")} />
      )}
    </div>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 h-9 pl-3 pr-1.5 rounded-full bg-[#2D6A4F]/10 text-[#2D6A4F] text-xs font-semibold animate-scale-in">
      {label}
      <button
        onClick={() => { haptic.tap(); onClear(); }}
        aria-label={`Quitar ${label}`}
        className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-[#2D6A4F]/20 active:scale-90 transition-all"
      >
        <X size={12} />
      </button>
    </span>
  );
}
