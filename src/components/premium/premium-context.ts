import { createContext } from 'react';

export type HeroEvent =
  | { kind: 'streakActivated' }
  | { kind: 'aiTouchSaved' }
  | { kind: 'onboardingWelcome' }
  | { kind: 'importSuccess'; count: number }
  | { kind: 'firstExpenseEver' }
  | { kind: 'monthInsight' }
  | { kind: 'achievementUnlocked'; title: string; icon?: string }
  | { kind: 'streakMilestone'; days: number }
  | { kind: 'scanStarted' }
  | { kind: 'scanStopped' };

export interface PremiumAPI {
  streakActivated: () => void;
  aiTouchSaved: () => void;
  onboardingWelcome: () => void;
  importSuccess: (count: number) => void;
  firstExpenseEver: () => void;
  monthInsight: () => void;
  achievementUnlocked: (payload: { title: string; icon?: string }) => void;
  streakMilestone: (days: number) => void;
  scanStarted: () => void;
  scanStopped: () => void;
  tap: () => void;
  currentEvent: HeroEvent | null;
  dismiss: () => void;
}

export const PremiumCtx = createContext<PremiumAPI | null>(null);
