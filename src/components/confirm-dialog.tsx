"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Trash2, Info, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { haptic } from "@/lib/premium/haptics";

type Variant = "destructive" | "default";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  icon?: ReactNode;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "destructive",
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    // Destructive = patrón fuerte (error notification); default = ligero (confirm).
    if (variant === "destructive") {
      haptic.error();
    } else {
      haptic.confirm();
    }
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onOpenChange(false);
    }
  };

  const defaultIcon =
    variant === "destructive" ? (
      <Trash2 size={26} className="text-red-500" strokeWidth={1.75} />
    ) : (
      <Info size={26} className="text-[#2D6A4F]" strokeWidth={1.75} />
    );

  const resolvedCancel = cancelLabel ?? "Cancelar";
  const resolvedConfirm = confirmLabel ?? (variant === "destructive" ? "Eliminar" : "Confirmar");

  const iconBg =
    variant === "destructive"
      ? "bg-red-500/10 border-red-500/25"
      : "bg-[#2D6A4F]/10 border-[#2D6A4F]/25";

  const confirmBtn =
    variant === "destructive"
      ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
      : "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-[#2D6A4F]/20";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-5"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          onClick={() => !loading && onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] rounded-3xl bg-card border border-border shadow-2xl p-6 flex flex-col items-center text-center gap-4"
          >
            <div
              className={`w-16 h-16 rounded-2xl border flex items-center justify-center ${iconBg}`}
              aria-hidden
            >
              {icon ?? defaultIcon}
            </div>

            <div className="space-y-1.5">
              <h2 id="confirm-title" className="text-lg font-bold leading-tight">{title}</h2>
              <p id="confirm-desc" className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>

            <div className="w-full flex flex-col gap-2 pt-1">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className={`w-full h-12 rounded-2xl font-bold text-sm active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${confirmBtn}`}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : variant === "destructive" ? <Trash2 size={14} /> : null}
                {loading ? "..." : resolvedConfirm}
              </button>
              <button
                onClick={() => !loading && onOpenChange(false)}
                disabled={loading}
                className="w-full h-11 rounded-2xl font-semibold text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-[0.97] transition-all"
              >
                {resolvedCancel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Icono por defecto para casos warning (no destructive pero atención).
export function WarningIcon() {
  return <AlertTriangle size={26} className="text-amber-500" strokeWidth={1.75} />;
}
