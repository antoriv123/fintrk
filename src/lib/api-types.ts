/**
 * Shared API response types.
 *
 * Lives outside src/app/api/ so client components keep compiling when
 * the API directory is moved aside during the native static export
 * (scripts/build-native.sh apartas src/app/api/ y se restaura tras
 * `next build`). API route handlers re-importan estos tipos para que
 * el contrato cliente↔servidor siga siendo único.
 */

export interface QuickStats {
  dailyAverage: number;
  zeroSpendDays: number;
  maxExpense: number;
  maxExpenseDescription: string;
  savingsRate: number;
}

export interface AccountBalance {
  slug: string;
  name: string;
  emoji: string;
  balance: number;
  color: string;
}

export interface BalancesResponse {
  accounts: AccountBalance[];
  total: number;
  unassigned: number;
}
