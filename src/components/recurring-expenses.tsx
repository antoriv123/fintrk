"use client";

import { useState, useEffect, useRef } from "react";
import { useFetch } from "@/hooks/use-fetch";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { Check, RefreshCw } from "lucide-react";

interface RecurringItem {
  id: number;
  description: string;
  category: string;
  expense_type: string | null;
  direction: string;
  average_amount: number;
  currency: string;
  frequency: string;
  last_seen: string | null;
  paid_this_month: boolean;
}

interface RecurringResponse {
  recurring: RecurringItem[];
}

export function RecurringExpenses() {
  const { data, loading, refresh } = useFetch<RecurringResponse>("/api/recurring");
  const [detecting, setDetecting] = useState(false);
  const autoDetected = useRef(false);

  // Auto-detect on first load if no recurring items
  useEffect(() => {
    if (loading || autoDetected.current) return;
    if (data && data.recurring.length === 0) {
      autoDetected.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronously shows loading state when auto-detect fires on empty recurring list; deferred update would leave misleading empty state briefly
      setDetecting(true);
      apiFetch("/api/recurring/detect", { method: "POST" })
        .then(() => refresh())
        .finally(() => setDetecting(false));
    }
  }, [loading, data, refresh]);

  if (loading || detecting) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-3 w-24 mb-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full mb-2" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.recurring.length === 0) return null;

  const expenses = data.recurring.filter((r) => r.direction === "expense");
  const incomes = data.recurring.filter((r) => r.direction === "income");

  const totalFixed = expenses.reduce((sum, r) => sum + r.average_amount, 0);
  const pendingCount = expenses.filter((r) => !r.paid_this_month).length;

  const handleRefreshDetection = async () => {
    setDetecting(true);
    await apiFetch("/api/recurring/detect", { method: "POST" });
    await refresh();
    setDetecting(false);
  };

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground text-[10px] tracking-wide">GASTOS FIJOS</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshDetection}
              disabled={detecting}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Re-detectar gastos fijos"
            >
              <RefreshCw size={12} className={detecting ? "animate-spin" : ""} />
            </button>
            {pendingCount > 0 ? (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-income border-income">
                Al dia
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        <div className="flex flex-col gap-2">
          {expenses.map((item) => {
            const cat = getCategoryInfo(item.category);
            return (
              <div key={item.id} className="flex items-center gap-3">
                <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs capitalize truncate">
                    {item.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">{item.category}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">
                    ~{"\u20AC"}{item.average_amount.toFixed(0)}
                  </span>
                  <Badge variant={item.paid_this_month ? "default" : "outline"} className="text-[10px] px-1.5 py-0.5">
                    {item.frequency}
                  </Badge>
                  {item.paid_this_month ? (
                    <div
                      className="w-5 h-5 rounded-full bg-income flex items-center justify-center"
                      title="Pagado este mes"
                    >
                      <Check size={10} className="text-white" />
                    </div>
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full border-2 border-muted-foreground opacity-50"
                      title="Pendiente este mes"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {incomes.length > 0 && (
          <>
            <div className="border-t border-border my-3" />
            <p className="text-muted-foreground text-[10px] tracking-wide mb-2">INGRESOS FIJOS</p>
            <div className="flex flex-col gap-2">
              {incomes.map((item) => {
                const cat = getCategoryInfo(item.category);
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs capitalize truncate">{item.description}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{item.category}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-income">
                        +{"\u20AC"}{item.average_amount.toFixed(0)}
                      </span>
                      {item.paid_this_month ? (
                        <div
                          className="w-5 h-5 rounded-full bg-income flex items-center justify-center"
                          title="Recibido este mes"
                        >
                          <Check size={10} className="text-white" />
                        </div>
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full border-2 border-muted-foreground opacity-50"
                          title="Pendiente este mes"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="border-t border-border mt-3 pt-3 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Total gastos fijos</span>
          <span className="text-sm font-semibold">{"\u20AC"}{totalFixed.toFixed(0)}/mes</span>
        </div>
      </CardContent>
    </Card>
  );
}

