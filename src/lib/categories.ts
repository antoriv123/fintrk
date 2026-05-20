export const EXPENSE_CATEGORIES = {
  alquiler: { label: "Alquiler", icon: "Home", color: "#F4A261" },
  supermercado: { label: "Supermercado", icon: "ShoppingCart", color: "#22c55e" },
  transporte: { label: "Transporte", icon: "Car", color: "#f59e0b" },
  suscripciones: { label: "Suscripciones", icon: "CreditCard", color: "#E76F51" },
  ocio: { label: "Ocio", icon: "Film", color: "#ef4444" },
  universidad: { label: "Universidad", icon: "GraduationCap", color: "#06b6d4" },
  "herramientas-negocio": { label: "Herramientas negocio", icon: "Wrench", color: "#ec4899" },
  ropa: { label: "Ropa", icon: "Shirt", color: "#14b8a6" },
  salud: { label: "Salud", icon: "Heart", color: "#10b981" },
  inversiones: { label: "Inversiones", icon: "TrendingUp", color: "#0EA5E9" },
  otros: { label: "Otros", icon: "MoreHorizontal", color: "#71717a" },
  transferencia: { label: "Transferencia", icon: "ArrowLeftRight", color: "#94a3b8" },
} as const;

export const INCOME_CATEGORIES = {
  salario: { label: "Salario", icon: "Briefcase", color: "#22c55e" },
  freelance: { label: "Freelance", icon: "Laptop", color: "#f59e0b" },
  negocio: { label: "Negocio", icon: "Building2", color: "#3b82f6" },
  alquiler: { label: "Alquiler", icon: "Home", color: "#14b8a6" },
  "inversiones-retorno": { label: "Inversiones", icon: "TrendingUp", color: "#0EA5E9" },
  "otros-ingreso": { label: "Otros", icon: "Coins", color: "#71717a" },
  transferencia: { label: "Transferencia", icon: "ArrowLeftRight", color: "#94a3b8" },
} as const;

export const ALL_CATEGORIES = { ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES };

export type CategorySlug = keyof typeof ALL_CATEGORIES;

export function getCategoryInfo(slug: string) {
  return ALL_CATEGORIES[slug as CategorySlug] ?? { label: slug, icon: "CircleDot", color: "#71717a" };
}

export const EXPENSE_TYPES = {
  necesario: { label: "Fijo", color: "#22c55e" },
  negocio: { label: "Trabajo", color: "#3b82f6" },
  discrecional: { label: "Capricho", color: "#f59e0b" },
} as const;
