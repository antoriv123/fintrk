export interface NavItem {
  href: string;
  labelKey: string; // translation key
  label: string; // fallback label (Spanish)
  icon: string;
  mobile?: boolean;
  section?: "main" | "manage" | "reports" | "intelligence" | "config";
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  // Core — mobile tabs
  { href: "/dashboard", labelKey: "dashboard", label: "Dashboard", icon: "LayoutDashboard", mobile: true, section: "main" },
  { href: "/transactions", labelKey: "transactions", label: "Transacciones", icon: "ArrowUpDown", mobile: true, section: "main" },
  { href: "/accounts", labelKey: "accounts", label: "Cuentas", icon: "Wallet", mobile: true, section: "main" },

  // Manage — presupuestos (fusionado con categorias), gastos fijos, objetivos
  { href: "/budgets", labelKey: "budgets", label: "Presupuestos", icon: "PiggyBank", section: "manage" },
  { href: "/fixed-expenses", labelKey: "fixedExpenses", label: "Gastos fijos", icon: "CalendarCheck", section: "manage" },
  { href: "/goals", labelKey: "goals", label: "Objetivos", icon: "Target", section: "manage" },

  // Reports — resumen anual, comparar meses
  { href: "/annual", labelKey: "annualSummary", label: "Anual", icon: "CalendarDays", section: "reports" },
  { href: "/compare", labelKey: "compareMonths", label: "Comparar meses", icon: "Scale", section: "reports" },

  // Intelligence — tu progreso, análisis financiero
  { href: "/achievements", labelKey: "yourProgress", label: "Tu progreso", icon: "Trophy", section: "intelligence" },
  { href: "/insights", labelKey: "insights", label: "Analisis financiero", icon: "Sparkles", section: "intelligence" },
  { href: "/investments", labelKey: "investments", label: "Inversiones", icon: "TrendingUp", section: "intelligence", adminOnly: true },

  // Config — ajustes, instalar
  { href: "/settings", labelKey: "settings", label: "Ajustes", icon: "Settings", section: "config" },
  { href: "/install", labelKey: "installApp", label: "Instalar app", icon: "Smartphone", section: "config" },
];

export const MAIN_NAV = NAV_ITEMS.filter((item) => item.section === "main");
export const MORE_ITEMS = NAV_ITEMS.filter((item) => !item.mobile);
