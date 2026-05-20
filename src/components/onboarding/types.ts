import type { BankInfo, CountryInfo } from "@/data/banks-by-country";

// Pasos "expenses" y "accounts" se eliminaron del onboarding y se trasladaron
// al panel post-onboarding "Completar primeros pasos" en el dashboard. Su
// configuracion detallada ralentizaba la activacion (drop-off > 30% medido
// en sesiones de testing). Los tipos se mantienen porque los componentes
// step-expenses.tsx y step-accounts.tsx siguen siendo reusados desde
// /setup/fixed-expenses y /setup/account respectivamente.
export type OnboardingStep = "welcome" | "language" | "identity" | "privacy" | "password" | "country" | "banks" | "goals" | "expenses" | "accounts" | "done";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome", "language", "identity", "privacy", "password", "country", "banks", "goals", "done",
];

// Apple Sign In flow: Apple already provided name + email and no password is
// needed. Skipping these steps is required by App Store Guideline 4.
// (Authentication Services framework already captured the identity.)
export const ONBOARDING_STEPS_APPLE: OnboardingStep[] = [
  "welcome", "language", "privacy", "country", "banks", "goals", "done",
];

export const STEP_SCORES: Record<OnboardingStep, number> = {
  welcome: 0,
  language: 5,
  identity: 12,
  privacy: 22,
  password: 32,
  country: 50,
  banks: 70,
  goals: 88,
  // Estos dos ya no aparecen en los flows pero quedan por si algun consumer
  // legacy (analytics, replay) los referencia.
  expenses: 95,
  accounts: 98,
  done: 100,
};

export interface ActiveSubscription {
  name: string;
  slug: string;
  amount: number;
  icon: string;
}

export interface ActiveRecurring {
  name: string;
  slug: string;
  amount: number;
  icon: string;
  category: string;
}

export type AccountSetupMode = "import" | "balance" | "imported" | "";

export interface AccountSetup {
  slug: string;
  name: string;
  color: string;
  mode: AccountSetupMode;
  balance: number;
  importedCount: number;
}

export interface OnboardingState {
  step: OnboardingStep;
  language: "es" | "en";
  userName: string;
  userEmail: string;
  userPassword: string;
  privacyAccepted: boolean;
  country: CountryInfo | null;
  selectedBanks: BankInfo[];
  goals: string[];
  subscriptions: ActiveSubscription[];
  recurringExpenses: ActiveRecurring[];
  accountSetups: AccountSetup[];
}

export interface OnboardingStepProps {
  state: OnboardingState;
  onNext: () => void;
  onBack?: () => void;
  onUpdate: (partial: Partial<OnboardingState>) => void;
  goTo?: (step: OnboardingStep) => void;
}
