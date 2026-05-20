"use client";

// ─── Platform Detection (OSS/web-only edition — Capacitor removed) ───

export type Platform = "pwa" | "web";

export function getPlatform(): Platform {
  if (typeof window === "undefined") return "web";
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  ) return "pwa";
  return "web";
}

export function isNative(): boolean {
  return false;
}

export function isWeb(): boolean {
  return getPlatform() === "web";
}

export function isPWA(): boolean {
  return getPlatform() === "pwa";
}

// ─── Feature Flags ───
// Central place to control what's available on each platform.

export const features = {
  /** Show "Install app" option in navigation */
  showInstallPrompt: () => isWeb(),

  /** Biometric lock (Face ID / Touch ID) — disabled in OSS edition */
  biometrics: () => false,

  /** Haptic feedback on interactions — always enabled (navigator.vibrate) */
  haptics: () => true,

  /** Bearer token auth — disabled in OSS edition (cookie auth only) */
  useBearerAuth: () => false,

  /** Pull-to-refresh (works on both but native feels better) */
  pullToRefresh: () => true,

  /** Export to CSV — funciona en web (blob download) */
  csvExport: () => true,
} as const;
