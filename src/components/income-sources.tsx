"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLocaleCode, useT } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/currency";
import { getCategoryInfo, INCOME_CATEGORIES } from "@/lib/categories";

/**
 * Fallback de colores para slugs de ingreso no registrados en
 * INCOME_CATEGORIES. El mapa principal consume `getCategoryInfo(slug)`
 * como single source of truth — si luego añades categoría nueva en
 * `lib/categories.ts`, este componente la hereda automáticamente.
 */
const FALLBACK_SOURCE_COLORS: Record<string, string> = {
  salario:     "#22c55e",
  freelance:   "#f59e0b",
  negocio:     "#3b82f6",
  inversiones: "#0EA5E9",
  alquiler:    "#F4A261",
  otros:       "#6b7280",
};

function getSourceColor(category: string): string {
  const slug = category.toLowerCase();
  // 1) Traducir slugs legacy (p.ej. "inversiones" → "inversiones-retorno" en
  //    el catálogo de ingresos).
  const aliased = slug === "inversiones" ? "inversiones-retorno" : slug === "otros" ? "otros-ingreso" : slug;
  // 2) Si el slug (original o aliased) existe en INCOME_CATEGORIES, usar ese color.
  if (aliased in INCOME_CATEGORIES) {
    return getCategoryInfo(aliased).color;
  }
  if (slug in INCOME_CATEGORIES) {
    return getCategoryInfo(slug).color;
  }
  // 3) Fallback estático para slugs libres.
  return FALLBACK_SOURCE_COLORS[slug] ?? "#6b7280";
}

function getSourceLabel(category: string, t: (key: string) => string): string {
  const slug = category.toLowerCase();
  const aliased = slug === "inversiones" ? "inversiones-retorno" : slug === "otros" ? "otros-ingreso" : slug;
  if (aliased in INCOME_CATEGORIES) {
    return getCategoryInfo(aliased).label;
  }
  return category;
}

interface IncomeSourcesProps {
  sources: { category: string; total: number }[];
  totalIncome: number;
  currency?: string | null;
}

export function IncomeSources({ sources, totalIncome, currency }: IncomeSourcesProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const localeCode = useLocaleCode();
  const sym = getCurrencySymbol(currency);
  const fmtInt = (n: number) => Math.round(n).toLocaleString(localeCode);

  if (sources.length === 0) return null;

  return (
    <Card className="mt-3">
      <CardContent className="p-4">
        <p className="text-muted-foreground text-[10px] tracking-wide mb-3">FUENTES DE INGRESOS</p>
        <div className="flex flex-col gap-3">
          {sources.map((src) => {
            const pct = totalIncome > 0 ? Math.round((src.total / totalIncome) * 100) : 0;
            const color = getSourceColor(src.category);
            const label = getSourceLabel(src.category, t);
            return (
              <div key={src.category}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                      {sym}{fmtInt(src.total)}
                    </span>
                  </div>
                </div>
                <div className="bg-muted rounded h-1">
                  <div
                    className="rounded h-1 transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
