"use client";
import { apiFetch, clearAuthToken } from "@/lib/api";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sun, Moon, Monitor, Palette,
  Download, Trash2, Database, Info,
  ChevronRight, LogOut, User, Globe,
  Sparkles, Vibrate, Type,
} from "lucide-react";
import { haptic } from "@/lib/premium/haptics";
import { useT, useLocale, setStoredLocale } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadOrShare } from "@/lib/share-export";
import { CountryFlag } from "@/components/country-flag";

interface SessionUser {
  id: number;
  email: string;
  name: string;
  subscriptionTier?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const t = useT();
  const [activeTheme, setActiveTheme] = useState("system");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState("");
  const [reduceMotionOn, setReduceMotionOn] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [fontScale, setFontScale] = useState<"sm" | "md" | "lg" | "xl">("md");
  const currentLocale = useLocale();

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    setActiveTheme(stored ?? "system");

    apiFetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHapticsOn(haptic.isEnabled());
    const rm = localStorage.getItem("fintrk.premium.reduceMotion");
    setReduceMotionOn(rm === "1");
    const fs = localStorage.getItem("fintrk.fontScale");
    if (fs === "sm" || fs === "lg" || fs === "xl") setFontScale(fs);
    else setFontScale("md");
  }, []);

  function toggleReduceMotion() {
    const next = !reduceMotionOn;
    setReduceMotionOn(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("fintrk.premium.reduceMotion", next ? "1" : "0");
    }
    haptic.confirm();
  }

  function toggleHaptics() {
    const next = !hapticsOn;
    setHapticsOn(next);
    haptic.setEnabled(next);
    if (next) haptic.tap();
  }

  function applyFontScale(next: "sm" | "md" | "lg" | "xl") {
    setFontScale(next);
    if (typeof window === "undefined") return;
    const html = document.documentElement;
    if (next === "md") {
      html.removeAttribute("data-font-scale");
      localStorage.removeItem("fintrk.fontScale");
    } else {
      html.dataset.fontScale = next;
      localStorage.setItem("fintrk.fontScale", next);
    }
    haptic.tap();
  }

  function setTheme(opt: "system" | "light" | "dark") {
    if (opt === "system") {
      localStorage.removeItem("theme");
      const prefersDark = matchMedia("(prefers-color-scheme:dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    } else {
      localStorage.setItem("theme", opt);
      document.documentElement.classList.toggle("dark", opt === "dark");
    }
    setActiveTheme(opt);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch { /* ignore logout errors */ }
    clearAuthToken();
    router.push("/gate/e");
  }

  const themeOptions = [
    { value: "system" as const, label: t("auto"), icon: Monitor },
    { value: "light" as const, label: t("light"), icon: Sun },
    { value: "dark" as const, label: t("dark"), icon: Moon },
  ];

  return (
    <div className="animate-in space-y-6 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold">{t("settings")}</h1>

      {/* Account */}
      {user && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground tracking-wide">{t("accountSection")}</span>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
              </div>
              <button
                className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                <LogOut size={18} className="text-expense" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-expense">
                    {loggingOut ? t("loggingOut") : t("logout")}
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Theme */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground tracking-wide">{t("appearance")}</span>
        </div>
        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-3 gap-1">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTheme === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Experience */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground tracking-wide">Experiencia</span>
        </div>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            <button
              className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              role="switch"
              aria-checked={hapticsOn}
              aria-label="Vibraciones"
              onClick={toggleHaptics}
            >
              <Vibrate size={18} className="text-primary" />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">Vibraciones</div>
                <div className="text-xs text-muted-foreground">
                  Feedback táctil al interactuar
                </div>
              </div>
              <div className={`w-12 h-7 rounded-full transition-colors relative ${
                hapticsOn ? "bg-primary" : "bg-muted"
              }`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                  hapticsOn ? "translate-x-5" : "translate-x-0.5"
                }`} />
              </div>
            </button>
            <button
              className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              role="switch"
              aria-checked={reduceMotionOn}
              aria-label="Reducir movimiento"
              onClick={toggleReduceMotion}
            >
              <Sparkles size={18} className="text-primary" />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">Reducir movimiento</div>
                <div className="text-xs text-muted-foreground">
                  Minimiza animaciones y efectos
                </div>
              </div>
              <div className={`w-12 h-7 rounded-full transition-colors relative ${
                reduceMotionOn ? "bg-primary" : "bg-muted"
              }`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                  reduceMotionOn ? "translate-x-5" : "translate-x-0.5"
                }`} />
              </div>
            </button>

            {/* Text size */}
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3 mb-3">
                <Type size={18} className="text-primary" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium">{t("textSize")}</div>
                  <div className="text-xs text-muted-foreground">{t("textSizeDesc")}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("textSize")}>
                {([
                  { value: "sm", label: t("textSizeSmall"), px: "text-[11px]" },
                  { value: "md", label: t("textSizeNormal"), px: "text-[13px]" },
                  { value: "lg", label: t("textSizeLarge"), px: "text-[15px]" },
                  { value: "xl", label: t("textSizeXLarge"), px: "text-[17px]" },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={fontScale === opt.value}
                    onClick={() => applyFontScale(opt.value)}
                    className={`h-11 min-h-[44px] rounded-xl font-semibold transition-all ${opt.px} ${
                      fontScale === opt.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Language */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground tracking-wide">{t("languageLabel")}</span>
        </div>
        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-2 gap-1">
              {([["es", "Español", "ES"], ["en", "English", "GB"]] as const).map(([code, label, flag]) => (
                <button
                  key={code}
                  onClick={() => { setStoredLocale(code); window.location.reload(); }}
                  className={`min-h-[44px] flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    currentLocale === code
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <CountryFlag code={flag} size={20} />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Database size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground tracking-wide">{t("data")}</span>
        </div>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            <button
              type="button"
              onClick={async () => {
                haptic.tap();
                const today = new Date().toISOString().slice(0, 10);
                try {
                  await downloadOrShare(
                    "/api/export",
                    `fintrk-transactions-${today}.csv`,
                    t("exportData") as string,
                  );
                } catch {
                  const { toast } = await import("sonner");
                  toast.error(t("errorSaving") as string);
                }
              }}
              className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
            >
              <Download size={18} className="text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("exportData")}</div>
                <div className="text-xs text-muted-foreground">{t("downloadCSV")}</div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={async () => {
                haptic.tap();
                const today = new Date().toISOString().slice(0, 10);
                try {
                  await downloadOrShare(
                    "/api/account/export",
                    `fintrk-account-${today}.csv`,
                    t("exportAllData") as string,
                  );
                } catch {
                  const { toast } = await import("sonner");
                  toast.error(t("errorSaving") as string);
                }
              }}
              className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
            >
              <Download size={18} className="text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">{t("exportAllData")}</div>
                <div className="text-xs text-muted-foreground">{t("exportAllDataDesc")}</div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
            <button
              className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 size={18} className="text-expense" />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-expense">{t("deleteData")}</div>
                <div className="text-xs text-muted-foreground">{t("deleteAllTransactions")}</div>
              </div>
            </button>
            <button
              className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
              onClick={() => setShowDeleteAccount(true)}
            >
              <Trash2 size={18} className="text-expense" />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-expense">{t("deleteAccount")}</div>
                <div className="text-xs text-muted-foreground">{t("deleteAccountDesc")}</div>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* About */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground tracking-wide">{t("about")}</span>
        </div>
        <Card>
          <CardContent className="px-4 py-3.5">
            <div className="text-sm font-medium">
              <span className="text-foreground">fin</span>
              <span className="text-primary">trk</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              v1.0.0 — Tu dinero, claro.
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deletingData}
              onClick={async () => {
                setDeletingData(true);
                const res = await apiFetch("/api/restart", { method: "POST" });
                if (!res.ok) {
                  const { toast } = await import("sonner");
                  toast.error(t("error"));
                  setDeletingData(false);
                  setShowDeleteDialog(false);
                  return;
                }
                window.location.reload();
              }}
            >
              {deletingData ? t("deleting") : t("deleteAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteAccount} onOpenChange={(open) => { setShowDeleteAccount(open); if (!open) setDeleteAccountConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteAccountTitle")}</DialogTitle>
            <DialogDescription>{t("deleteAccountBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">{t("deleteAccountTypePrompt")}</p>
            <input
              type="text"
              value={deleteAccountConfirm}
              onChange={(e) => setDeleteAccountConfirm(e.target.value)}
              placeholder="BORRAR MI CUENTA"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive/30"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAccount(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deletingAccount || deleteAccountConfirm !== "BORRAR MI CUENTA"}
              onClick={async () => {
                setDeletingAccount(true);
                try {
                  const res = await apiFetch("/api/account/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirmation: deleteAccountConfirm }),
                  });
                  if (!res.ok) {
                    const { toast } = await import("sonner");
                    const data = await res.json().catch(() => ({}));
                    toast.error(data.error || t("error"));
                    setDeletingAccount(false);
                    return;
                  }
                  clearAuthToken();
                  window.location.href = "/welcome";
                } catch {
                  const { toast } = await import("sonner");
                  toast.error(t("error"));
                  setDeletingAccount(false);
                }
              }}
            >
              {deletingAccount ? t("deleting") : t("deleteAccountConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
