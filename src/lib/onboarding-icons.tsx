import {
  Building2, Sparkles, Target, CreditCard, PiggyBank, TrendingUp,
  RefreshCw, ClipboardList, Home, Zap, Bus, Shield, BookOpen,
  FileText, Star, Pencil, CheckCircle2, Play, Music,
  Cloud, Video, Gamepad2, Book, Dumbbell, ShoppingBag, Newspaper,
  Brain, Tv, Smartphone, Wifi, Lightbulb, Droplets, Car, Flame,
  GraduationCap, HeartPulse, Package, Globe, type LucideIcon,
} from "lucide-react";

// Welcome features
export const WELCOME_ICONS: Record<string, LucideIcon> = {
  banks: Building2,
  ai: Sparkles,
  insights: Target,
};

// Goals
export const GOAL_ICONS: Record<string, LucideIcon> = {
  control_spending: CreditCard,
  save: PiggyBank,
  invest: TrendingUp,
  debt: RefreshCw,
  budget: ClipboardList,
};

// Expense categories
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  vivienda: Home,
  servicios: Zap,
  transporte: Bus,
  seguros: Shield,
  educacion: GraduationCap,
  salud: HeartPulse,
  otros: Package,
};

// Subscriptions (by slug)
export const SUBSCRIPTION_ICONS: Record<string, LucideIcon> = {
  netflix: Play,
  spotify: Music,
  icloud: Cloud,
  "youtube-premium": Video,
  "apple-music": Music,
  "amazon-prime": Package,
  "disney-plus": Play,
  hbo: Play,
  "hbo-max": Play,
  max: Play,
  "paramount-plus": Play,
  "apple-tv": Tv,
  crunchyroll: Play,
  "dazn": Play,
  "movistar-plus": Tv,
  playstation: Gamepad2,
  "xbox-game-pass": Gamepad2,
  nintendo: Gamepad2,
  "chatgpt-plus": Brain,
  "claude-pro": Brain,
  perplexity: Brain,
  midjourney: Sparkles,
  canva: Sparkles,
  "google-one": Cloud,
  "microsoft-365": FileText,
  dropbox: Cloud,
  notion: FileText,
  audible: Book,
  kindle: BookOpen,
  "nytimes": Newspaper,
  gym: Dumbbell,
  duolingo: Globe,
};

// Recurring expenses (by slug)
export const RECURRING_ICONS: Record<string, LucideIcon> = {
  alquiler: Home,
  hipoteca: Home,
  telefono: Smartphone,
  movil: Smartphone,
  "luz-gas": Zap,
  luz: Lightbulb,
  gas: Flame,
  agua: Droplets,
  internet: Wifi,
  gasolina: Car,
  transporte: Bus,
  gimnasio: Dumbbell,
  seguro: Shield,
  "seguro-coche": Car,
  "seguro-hogar": Home,
  "seguro-salud": HeartPulse,
  salud: HeartPulse,
  educacion: GraduationCap,
  comida: ShoppingBag,
};

// Fallback icons by category
export const CATEGORY_FALLBACK: Record<string, LucideIcon> = {
  vivienda: Home,
  servicios: Zap,
  transporte: Bus,
  seguros: Shield,
  educacion: GraduationCap,
  salud: HeartPulse,
  otros: Package,
};

export function getSubscriptionIcon(slug: string): LucideIcon {
  return SUBSCRIPTION_ICONS[slug] ?? CreditCard;
}

export function getRecurringIcon(slug: string, category?: string): LucideIcon {
  if (RECURRING_ICONS[slug]) return RECURRING_ICONS[slug];
  if (category && CATEGORY_FALLBACK[category]) return CATEGORY_FALLBACK[category];
  return Package;
}

export function getCategoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? Package;
}

export function getGoalIcon(id: string): LucideIcon {
  return GOAL_ICONS[id] ?? Target;
}

// Re-export commonly used icons for onboarding
export { CheckCircle2, FileText, Star, Pencil };
