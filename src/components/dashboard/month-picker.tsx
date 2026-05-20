"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { haptic } from "@/lib/premium/haptics";
import { useT } from "@/lib/i18n";

export interface MonthValue {
  year: number;
  month: number; // 1-12
}

const STORAGE_KEY = "fintrk.dashboard.month";

export function readStoredMonth(now = new Date()): MonthValue {
  if (typeof window === "undefined") {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { year: now.getFullYear(), month: now.getMonth() + 1 };
    const parsed = JSON.parse(raw) as MonthValue;
    if (
      typeof parsed.year === "number" &&
      typeof parsed.month === "number" &&
      parsed.month >= 1 &&
      parsed.month <= 12
    ) {
      return parsed;
    }
  } catch { /* ignore */ }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function storeMonth(v: MonthValue) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

export function monthToRange(v: MonthValue): { from: string; to: string } {
  const m = String(v.month).padStart(2, "0");
  const lastDay = new Date(v.year, v.month, 0).getDate();
  return {
    from: `${v.year}-${m}-01`,
    to: `${v.year}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

function buildOptions(now = new Date(), count = 12): MonthValue[] {
  const out: MonthValue[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

export function isCurrentMonth(v: MonthValue, now = new Date()): boolean {
  return v.year === now.getFullYear() && v.month === now.getMonth() + 1;
}

interface Props {
  value: MonthValue;
  onChange: (next: MonthValue) => void;
  localeCode?: string;
}

const POPOVER_WIDTH = 260;
const VIEWPORT_MARGIN = 12;

export function MonthPicker({ value, onChange, localeCode = "es-ES" }: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const now = new Date();
  const options = buildOptions(now, 12);

  // Recalculate anchor whenever the trigger's position changes (scroll, resize).
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      // Align right edge of popover to right edge of trigger by default, but
      // clamp inside the viewport with a 12px safety margin on both sides.
      const preferredLeft = rect.right - POPOVER_WIDTH;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(preferredLeft, vw - POPOVER_WIDTH - VIEWPORT_MARGIN),
      );
      setAnchor({ top: rect.bottom + 8, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close on ESC or click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onPointer = (e: Event) => {
      const tgt = e.target as Node | null;
      if (!tgt) return;
      if (popoverRef.current?.contains(tgt)) return;
      if (triggerRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("touchstart", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  function label(v: MonthValue) {
    const d = new Date(v.year, v.month - 1, 1);
    const name = d.toLocaleDateString(localeCode, { month: "long", year: "numeric" });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function shortLabel(v: MonthValue) {
    const d = new Date(v.year, v.month - 1, 1);
    const name = d.toLocaleDateString(localeCode, { month: "short" });
    const mon = name.replace(/\.$/, "").charAt(0).toUpperCase() + name.replace(/\.$/, "").slice(1);
    return `${mon} ${v.year % 100 < 10 ? "0" : ""}${v.year % 100}`;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        aria-label={t("selectMonth")}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 hover:bg-muted px-3 py-1.5 text-xs font-semibold active:scale-95 transition-all"
      >
        {label(value)}
        <ChevronDown
          size={12}
          className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && anchor && (
            <motion.div
              ref={popoverRef}
              role="dialog"
              aria-label={t("selectMonth")}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "fixed",
                top: anchor.top,
                left: anchor.left,
                width: POPOVER_WIDTH,
                transformOrigin: "top right",
                zIndex: 120,
              }}
              className="rounded-2xl border border-border bg-card shadow-2xl shadow-black/20 overflow-hidden"
            >
              <div className="max-h-[320px] overflow-y-auto p-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {options.map((opt) => {
                    const active = opt.year === value.year && opt.month === value.month;
                    const current = isCurrentMonth(opt, now);
                    return (
                      <button
                        key={`${opt.year}-${opt.month}`}
                        onClick={() => {
                          haptic.nav();
                          onChange(opt);
                          storeMonth(opt);
                          setOpen(false);
                        }}
                        className={`px-1.5 py-2.5 rounded-lg text-[11px] font-semibold leading-tight transition-all active:scale-95 ${
                          active
                            ? "bg-[#2D6A4F] text-white shadow-sm shadow-[#2D6A4F]/25"
                            : current
                            ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                            : "bg-muted/40 text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {shortLabel(opt)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
