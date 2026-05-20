"use client";

import { Check } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORY_ICON_LIBRARY, CATEGORY_COLOR_PRESETS } from "@/lib/category-icon-library";
import { haptic } from "@/lib/premium/haptics";

interface Props {
  name: string;
  icon: string;
  color: string;
  onName: (v: string) => void;
  onIcon: (v: string) => void;
  onColor: (v: string) => void;
  placeholder: string;
  pickIconLabel: string;
  pickColorLabel: string;
}

// Editor visual de una categoria custom. Tres bloques: input nombre, grid
// de iconos y paleta de colores. Se renderiza inline dentro del step de
// categoria en /transactions/new cuando el user clickea "Crear categoria".
export function CategoryCreate({
  name,
  icon,
  color,
  onName,
  onIcon,
  onColor,
  placeholder,
  pickIconLabel,
  pickColorLabel,
}: Props) {
  return (
    <div className="rounded-2xl border border-[#2D6A4F]/30 bg-card p-4 flex flex-col gap-4 animate-in">
      {/* Preview + nombre */}
      <div className="flex items-center gap-3">
        <CategoryIcon icon={icon} color={color} size="lg" />
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="flex-1 text-sm font-semibold bg-transparent border-b border-border focus:border-[#2D6A4F] outline-none py-2"
        />
      </div>

      {/* Iconos */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          {pickIconLabel}
        </p>
        <div className="grid grid-cols-6 gap-2">
          {CATEGORY_ICON_LIBRARY.map((opt) => {
            const selected = icon === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                title={opt.hint}
                aria-label={opt.hint || opt.key}
                onClick={() => {
                  haptic.tap();
                  onIcon(opt.key);
                }}
                className={`aspect-square rounded-lg flex items-center justify-center transition-all active:scale-90 ${
                  selected
                    ? "ring-2 ring-[#2D6A4F] bg-[#2D6A4F]/10"
                    : "bg-muted/60 hover:bg-muted active:bg-muted"
                }`}
              >
                <CategoryIcon
                  icon={opt.key}
                  color={selected ? color : "#71717a"}
                  size="sm"
                  withBackground={false}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Colores */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          {pickColorLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLOR_PRESETS.map((c) => {
            const selected = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  haptic.tap();
                  onColor(c);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  selected ? "ring-2 ring-offset-2 ring-offset-card ring-foreground/40" : ""
                }`}
                style={{ backgroundColor: c }}
              >
                {selected && <Check size={14} className="text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
