"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import type { Transaction } from "@/lib/db";
import { getCategoryInfo } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { apiFetch } from "@/lib/api";
import { haptic } from "@/lib/premium/haptics";
import { Trash2 } from "lucide-react";
import { useLocaleCode } from "@/lib/i18n";

interface TransactionListProps {
  transactions: Transaction[];
  title?: string;
  showAll?: boolean;
  onToggleReconcile?: (id: number) => void;
  onDelete?: (id: number) => void;
}

function fmtAmount(n: number, localeCode: string) {
  const isRound = n % 1 === 0;
  return n.toLocaleString(localeCode, {
    minimumFractionDigits: isRound ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(dateStr: string, localeCode: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return localeCode.startsWith("en") ? "Today" : "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return localeCode.startsWith("en") ? "Yesterday" : "Ayer";
  return d.toLocaleDateString(localeCode, { day: "numeric", month: "short" });
}

const SWIPE_THRESHOLD = 80;

function SwipeableRow({
  tx,
  onDelete,
}: {
  tx: Transaction;
  onDelete?: (id: number) => void;
}) {
  const localeCode = useLocaleCode();
  const cat = getCategoryInfo(tx.category);
  const isIncome = tx.direction === "income";
  const sign = isIncome ? "+" : "-";

  const rowRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isHorizontalRef = useRef<boolean | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isHorizontalRef.current = null;
    setSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    // Determine direction on first significant movement
    if (isHorizontalRef.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }

    if (!isHorizontalRef.current) return;

    // Only allow left swipe (negative dx)
    if (dx > 0) {
      setOffsetX(0);
      return;
    }
    const clamped = Math.max(dx, -140);
    setOffsetX(clamped);

    if (Math.abs(clamped) >= SWIPE_THRESHOLD) {
      haptic.tap();
    }
  }, [swiping]);

  const handleTouchEnd = useCallback(async () => {
    setSwiping(false);
    isHorizontalRef.current = null;

    if (offsetX <= -SWIPE_THRESHOLD) {
      // Snap to reveal delete
      setOffsetX(-100);
    } else {
      setOffsetX(0);
    }
  }, [offsetX]);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    haptic.confirm();
    try {
      const res = await apiFetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
      if (res.ok) {
        haptic.success();
        const { toast } = await import("sonner");
        toast.success("Transacción eliminada");
        onDelete?.(tx.id);
      } else {
        const { toast } = await import("sonner");
        toast.error("Error al eliminar");
        setDeleting(false);
        setOffsetX(0);
      }
    } catch {
      setDeleting(false);
      setOffsetX(0);
    }
  }, [tx.id, onDelete, deleting]);

  const isRevealed = offsetX <= -SWIPE_THRESHOLD;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete action behind */}
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-center transition-colors ${
          deleting ? "bg-red-600" : isRevealed ? "bg-red-500" : "bg-red-400"
        }`}
        style={{ width: 100 }}
      >
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex flex-col items-center gap-0.5 text-white"
        >
          <Trash2 size={18} />
          <span className="text-[10px] font-medium">
            {deleting ? "..." : "Eliminar"}
          </span>
        </button>
      </div>

      {/* Swipeable content */}
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-[var(--background)] transition-transform"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Link
          href={`/transactions/detail?id=${tx.id}`}
          className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-muted/40 active:bg-muted/60 transition-all active:scale-[0.99] group"
          onClick={(e) => {
            // Prevent navigation if swiped
            if (offsetX !== 0) {
              e.preventDefault();
              setOffsetX(0);
            }
          }}
        >
          <CategoryIcon icon={cat.icon} color={cat.color} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{tx.description || cat.label}</div>
            <div className="text-[11px] text-muted-foreground">
              {cat.label} · {fmtDate(tx.date, localeCode)}
            </div>
          </div>
          <span className={`font-semibold text-sm tabular-nums ${
            isIncome ? "text-[#2D6A4F]" : "text-foreground"
          }`}>
            {sign}{"\u20AC"}{fmtAmount(tx.eur_amount, localeCode)}
          </span>
        </Link>
      </div>
    </div>
  );
}

export function TransactionList({ transactions, title = "ULTIMOS MOVIMIENTOS", showAll = false, onDelete }: TransactionListProps) {
  const items = showAll ? transactions : transactions.slice(0, 10);

  return (
    <div>
      {title && <p className="text-muted-foreground text-[10px] tracking-wide mb-3 px-1">{title}</p>}
      {items.length === 0 && (
        <div className="rounded-2xl bg-muted/30 p-6 text-center">
          <p className="text-muted-foreground text-sm">No hay movimientos todavía</p>
        </div>
      )}
      <div className="flex flex-col gap-1">
        {items.map((tx) => (
          <SwipeableRow key={tx.id} tx={tx} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
