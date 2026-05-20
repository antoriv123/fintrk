"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useT } from "@/lib/i18n";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/premium/haptics";
import { normalizeAccountColor } from "@/lib/account-color";

interface AccountInfo {
  slug: string;
  name: string;
  color: string;
}

interface TagCount {
  tag: string;
  count: number;
}

export interface FilterValues {
  account: string;
  direction: string;
  category: string;
  expenseType: string;
  tag: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  values: FilterValues;
  onApply: (next: FilterValues) => void;
}

/**
 * Bottom sheet con todos los filtros de /transactions en un único sitio:
 * cuenta, tipo (ingreso/gasto), categoría, clasificación (fijo/trabajo/
 * capricho) y etiquetas. Reemplaza al antiguo panel inline con <Select>s
 * que mostraba tres veces "Todos" indistinguibles.
 *
 * Se apoya en estado local mientras está abierto — los cambios no se
 * aplican hasta que el usuario pulsa "Aplicar filtros", lo que permite
 * cancelar sin ensuciar el estado del padre.
 */
export function FiltersSheet({ open, onClose, values, onApply }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = useT() as (key: any) => string;
  const { data: accountsData } = useFetch<{ accounts: AccountInfo[] }>("/api/accounts");
  const accounts = accountsData?.accounts ?? [];
  const { data: availableTags } = useFetch<TagCount[]>("/api/tags");

  const [local, setLocal] = useState<FilterValues>(values);
  // Secciones expandidas — por defecto ninguna. Al abrir el sheet,
  // el user ve un listado de filtros y elige cuál desplegar.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleSection(id: string) {
    haptic.tap();
    setExpanded(prev => {
      // Comportamiento acordeón: solo una sección abierta a la vez.
      // Cerrar la que estaba abierta si se toca otra — así los demás
      // resúmenes siempre quedan visibles.
      if (prev.has(id)) return new Set();
      return new Set([id]);
    });
  }

  // Sincronizamos cuando el sheet se abre: si el padre cambió valores
  // mientras estaba cerrado, el usuario ve la selección actualizada.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local filter state from parent when sheet opens; must be synchronous to show correct values before render
      setLocal(values);
      setExpanded(new Set()); // reset de qué secciones están abiertas
    }
  }, [open, values]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeCount = [local.account, local.direction, local.category, local.expenseType, local.tag].filter(Boolean).length;
  const allCategories = { ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES };
  // Evitamos proponer transferencia / otros-ingreso como filtro — no aportan.
  const categoryEntries = Object.entries(allCategories).filter(([slug]) => slug !== "transferencia" && slug !== "otros-ingreso");

  function reset() {
    haptic.tap();
    const cleared: FilterValues = { account: "", direction: "", category: "", expenseType: "", tag: "" };
    setLocal(cleared);
    // Aplica directamente sin necesidad de pulsar "Aplicar filtros" después.
    onApply(cleared);
    onClose();
  }

  function apply() {
    haptic.confirm();
    onApply(local);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: "fade-in 0.2s ease-out" }}
      />

      {/* Sheet — fullscreen de arriba abajo, sin bordes redondeados.
          Entra con slide vertical desde abajo (500ms cubic) y se
          queda anclado ocupando todo el viewport. */}
      <div
        className="relative bg-background shadow-2xl h-[100dvh] flex flex-col overflow-hidden"
        style={{
          animation: "slideInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h2 className="text-base font-bold">{t("filters")}</h2>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <button onClick={reset} className="text-xs font-semibold text-[#2D6A4F] px-2 py-1">
                {t("resetFilters")}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t("close")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body scrollable — cada filtro es un dropdown. Padding y gap
            reducidos para que los ~4-5 filtros colapsados quepan sin
            scroll. Al abrir uno (acordeón), el resto se queda arriba
            como headers y el despliegue aparece justo debajo. */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

          {/* Cuenta */}
          {accounts.length > 0 && (() => {
            const acc = accounts.find(a => a.slug === local.account);
            const summary = acc ? acc.name : t("all");
            return (
              <FilterSection
                id="account"
                title={t("filterAccount")}
                summary={summary}
                expanded={expanded.has("account")}
                onToggle={toggleSection}
              >
                <div className="flex flex-wrap gap-2.5 pt-3">
                  <Chip active={!local.account} onClick={() => setLocal(s => ({ ...s, account: "" }))}>
                    {t("all")}
                  </Chip>
                  {accounts.map(a => (
                    <Chip
                      key={a.slug}
                      active={local.account === a.slug}
                      onClick={() => setLocal(s => ({ ...s, account: s.account === a.slug ? "" : a.slug }))}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: normalizeAccountColor(a.color) }} />
                      {a.name}
                    </Chip>
                  ))}
                </div>
              </FilterSection>
            );
          })()}

          {/* Tipo (direction) */}
          {(() => {
            const summary =
              local.direction === "expense" ? t("expense")
              : local.direction === "income" ? t("income")
              : t("filterAllDirection");
            return (
              <FilterSection
                id="direction"
                title={t("type")}
                summary={summary}
                expanded={expanded.has("direction")}
                onToggle={toggleSection}
              >
                <div className="grid grid-cols-3 gap-2.5 pt-3">
                  {([
                    { value: "", label: t("filterAllDirection") },
                    { value: "expense", label: t("expense") },
                    { value: "income", label: t("income") },
                  ] as const).map(opt => (
                    <button
                      key={opt.value || "all"}
                      onClick={() => setLocal(s => ({ ...s, direction: opt.value }))}
                      className={`h-12 rounded-xl text-sm font-semibold transition-colors ${
                        local.direction === opt.value
                          ? "bg-[#2D6A4F] text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>
            );
          })()}

          {/* Clasificación (expense_type) */}
          {(() => {
            const summary =
              local.expenseType === "necesario" ? t("fixed")
              : local.expenseType === "negocio" ? t("business")
              : local.expenseType === "discrecional" ? t("discretionary")
              : t("filterAllClassification");
            return (
              <FilterSection
                id="classification"
                title={t("classification")}
                summary={summary}
                expanded={expanded.has("classification")}
                onToggle={toggleSection}
              >
                <div className="grid grid-cols-2 gap-2.5 pt-3">
                  {([
                    { value: "", label: t("filterAllClassification") },
                    { value: "necesario", label: t("fixed") },
                    { value: "negocio", label: t("business") },
                    { value: "discrecional", label: t("discretionary") },
                  ] as const).map(opt => (
                    <button
                      key={opt.value || "all"}
                      onClick={() => setLocal(s => ({ ...s, expenseType: opt.value }))}
                      className={`h-12 rounded-xl text-sm font-semibold transition-colors ${
                        local.expenseType === opt.value
                          ? "bg-[#2D6A4F] text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterSection>
            );
          })()}

          {/* Categoría */}
          {(() => {
            const catInfo = local.category ? (allCategories as Record<string, { label: string }>)[local.category] : null;
            const summary = catInfo ? catInfo.label : t("filterAllCategory");
            return (
              <FilterSection
                id="category"
                title={t("category")}
                summary={summary}
                expanded={expanded.has("category")}
                onToggle={toggleSection}
              >
                <div className="grid grid-cols-3 gap-2.5 pt-3">
                  <button
                    onClick={() => setLocal(s => ({ ...s, category: "" }))}
                    className={`h-12 rounded-xl text-sm font-semibold transition-colors col-span-3 ${
                      !local.category ? "bg-[#2D6A4F] text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t("filterAllCategory")}
                  </button>
                  {categoryEntries.map(([slug, info]) => {
                    const active = local.category === slug;
                    return (
                      <button
                        key={slug}
                        onClick={() => setLocal(s => ({ ...s, category: s.category === slug ? "" : slug }))}
                        className={`h-[92px] rounded-xl flex flex-col items-center justify-center gap-2 px-2 transition-all ${
                          active
                            ? "bg-[#2D6A4F]/15 ring-2 ring-[#2D6A4F]/40 shadow-sm"
                            : "bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        <CategoryIcon icon={info.icon} color={active ? "#2D6A4F" : info.color} size="md" withBackground={false} />
                        <span className={`text-[11px] font-semibold text-center leading-tight ${active ? "text-[#2D6A4F]" : "text-foreground/80"}`}>
                          {info.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FilterSection>
            );
          })()}

          {/* Etiquetas */}
          {(availableTags ?? []).length > 0 && (() => {
            const summary = local.tag ? `#${local.tag}` : t("filterAllTag");
            return (
              <FilterSection
                id="tag"
                title={t("tag")}
                summary={summary}
                expanded={expanded.has("tag")}
                onToggle={toggleSection}
              >
                <div className="flex flex-wrap gap-2.5 pt-3">
                  <Chip active={!local.tag} onClick={() => setLocal(s => ({ ...s, tag: "" }))}>
                    {t("filterAllTag")}
                  </Chip>
                  {(availableTags ?? []).map(({ tag, count }) => (
                    <Chip
                      key={tag}
                      active={local.tag === tag}
                      onClick={() => setLocal(s => ({ ...s, tag: s.tag === tag ? "" : tag }))}
                    >
                      #{tag} <span className="text-muted-foreground/70 font-normal ml-0.5">({count})</span>
                    </Chip>
                  ))}
                </div>
              </FilterSection>
            );
          })()}
        </div>

        {/* Footer sticky — botones altos y con aire. shrink-0 garantiza
            que nunca queda oculto cuando el body se expande (p.ej. al
            abrir la sección de categorías con 4 filas de 92px). */}
        <div className="shrink-0 border-t border-border/60 px-5 pt-4 pb-5 flex items-center gap-3 bg-background shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <Button
            variant="outline"
            className="flex-1 h-14 rounded-2xl font-semibold text-sm"
            onClick={reset}
            disabled={activeCount === 0}
          >
            {t("resetFilters")}
          </Button>
          <Button
            className="flex-[2] h-14 rounded-2xl font-semibold text-sm bg-primary hover:bg-primary/90"
            onClick={apply}
          >
            {activeCount > 0 ? `${t("applyFilters")} (${activeCount})` : t("applyFilters")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-11 px-4 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${
        active
          ? "bg-[#2D6A4F] text-white shadow-sm"
          : "bg-muted text-muted-foreground hover:bg-muted/70"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Sección colapsable con header (label + summary + chevron) y body
 * animado con grid-template-rows. El body solo se renderiza visible
 * cuando `expanded` es true; el resto del tiempo ocupa 0 de alto.
 */
function FilterSection({
  id,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 active:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-semibold text-foreground text-left min-w-0 truncate">
          {title}
        </span>
        <span className="flex items-center gap-2 shrink-0 min-w-0">
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {summary}
          </span>
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-500 shrink-0 ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:duration-0"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 border-t border-border/40">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
