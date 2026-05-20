"use client";

import {
  Home, ShoppingCart, Car, CreditCard, Film, GraduationCap,
  Wrench, Shirt, Heart, TrendingUp, MoreHorizontal, ArrowLeftRight,
  Briefcase, Laptop, Building2, Coins, CircleDot,
  // Iconos extra para categorias custom (selector visual al crear)
  Sofa, Lightbulb, Hammer, UtensilsCrossed, Coffee, Wine, Pizza,
  Fuel, Plane, Train, Bike, Bus, Pill, Stethoscope, Dumbbell,
  Music, Gamepad2, Camera, Ticket, ShoppingBag, Gift,
  Smartphone, Headphones, Wifi, Users, Mail, BookOpen, PenTool,
  Wallet, PiggyBank, Banknote, Receipt, MapPin, Mountain, Tent,
  PawPrint, Star, Sparkles, Flame, Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Toda key nueva debe estar tambien en src/lib/category-icon-library.ts
// (CATEGORY_ICON_LIBRARY) para que aparezca en el picker de categorias.
const ICON_MAP: Record<string, LucideIcon> = {
  Home, ShoppingCart, Car, CreditCard, Film, GraduationCap,
  Wrench, Shirt, Heart, TrendingUp, MoreHorizontal, ArrowLeftRight,
  Briefcase, Laptop, Building2, Coins, CircleDot,
  Sofa, Lightbulb, Hammer, UtensilsCrossed, Coffee, Wine, Pizza,
  Fuel, Plane, Train, Bike, Bus, Pill, Stethoscope, Dumbbell,
  Music, Gamepad2, Camera, Ticket, ShoppingBag, Gift,
  Smartphone, Headphones, Wifi, Users, Mail, BookOpen, PenTool,
  Wallet, PiggyBank, Banknote, Receipt, MapPin, Mountain, Tent,
  PawPrint, Star, Sparkles, Flame, Tag,
};

interface CategoryIconProps {
  icon: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  withBackground?: boolean;
}

const SIZES = {
  sm: { icon: 14, container: "w-7 h-7" },
  md: { icon: 18, container: "w-10 h-10" },
  lg: { icon: 22, container: "w-12 h-12" },
};

export function CategoryIcon({ icon, color, size = "md", className, withBackground = true }: CategoryIconProps) {
  const Icon = ICON_MAP[icon] ?? CircleDot;
  const s = SIZES[size];

  if (!withBackground) {
    return <Icon size={s.icon} style={color ? { color } : undefined} className={className} />;
  }

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center shrink-0",
        s.container,
        className,
      )}
      style={{
        backgroundColor: color ? `${color}20` : undefined,
        color: color ?? "currentColor",
      }}
    >
      <Icon size={s.icon} strokeWidth={1.75} />
    </div>
  );
}
