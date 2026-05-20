"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getTranslations, LOCALES, LOCALE_LABELS, LOCALE_FLAGS, type Locale } from "@/i18n";
import { CountryFlag } from "@/components/country-flag";
import { isNative } from "@/lib/platform";
import HeroSection from "./landing/HeroSection";

const SectionFallback = <div className="min-h-[100px]" />;

const FeaturesSection = dynamic(() => import("./landing/FeaturesSection"), {
  loading: () => SectionFallback,
});
const SecuritySection = dynamic(() => import("./landing/SecuritySection"), {
  loading: () => SectionFallback,
});
const FaqSection = dynamic(() => import("./landing/FaqSection"), {
  loading: () => SectionFallback,
});
const BanksSection = dynamic(() => import("./landing/BanksSection"), {
  loading: () => SectionFallback,
});
const FooterSection = dynamic(() => import("./landing/FooterSection"), {
  loading: () => SectionFallback,
});

export default function LandingPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("es");
  const [scrolled, setScrolled] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);

  const t = getTranslations(locale);

  // Inside the Capacitor WebView the marketing landing makes no sense — the
  // user already downloaded the app. Redirect straight to /welcome (which
  // checks session and forwards to /dashboard if logged in). Web visitors
  // continue to see the landing.
  useEffect(() => {
    if (isNative()) {
      setIsNativeApp(true);
      router.replace("/welcome");
    }
  }, [router]);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
      setShowMobileCta(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Splash blanco mientras router.replace("/welcome") corre dentro de la
  // WebView nativa: evita el flash de la landing antes de la redirección.
  if (isNativeApp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
        <span className="font-display font-extrabold text-2xl tracking-tight">
          <span className="text-[#1A1A1A]">fin</span>
          <span className="text-[#2D6A4F]">trk</span>
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#1A1A1A] selection:bg-[#2D6A4F]/20 selection:text-[#1A1A1A]">
      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-[#FAFAF7]/90 backdrop-blur-xl border-b border-[#E9ECEF] shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-center justify-between h-14 sm:h-16">
          <div className="flex items-center gap-1">
            <span className="font-display font-extrabold text-lg tracking-tight">
              <span className="text-[#1A1A1A]">fin</span><span className="text-[#2D6A4F]">trk</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex items-center bg-white rounded-full p-0.5 text-[11px] border border-[#E9ECEF]">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  aria-label={LOCALE_LABELS[l]}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-all duration-200 ${
                    locale === l
                      ? "bg-[#F7F7F5] text-[#1A1A1A]"
                      : "text-[#888888]"
                  }`}
                >
                  <CountryFlag code={LOCALE_FLAGS[l]} size={16} />
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
            {/* Login link hidden — users access via /login directly */}
            {/* Desktop CTA */}
            <a
              href="#waitlist"
              className="hidden sm:inline-flex items-center rounded-xl bg-[#2D6A4F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#245A42] active:scale-[0.97] transition-all"
            >
              {t.nav.waitlistCta}
            </a>
          </div>
        </div>
      </nav>

      {/* Sections */}
      <div id="waitlist">
        <HeroSection t={t} />
      </div>
      <Suspense fallback={SectionFallback}>
        <FeaturesSection t={t} />
      </Suspense>
      <Suspense fallback={SectionFallback}>
        <BanksSection t={t} />
      </Suspense>
      <Suspense fallback={SectionFallback}>
        <SecuritySection t={t} />
      </Suspense>
      <Suspense fallback={SectionFallback}>
        <FaqSection t={t} />
      </Suspense>
      <Suspense fallback={SectionFallback}>
        <FooterSection t={t} />
      </Suspense>

      {/* Mobile sticky CTA */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 p-4 bg-[#FAFAF7]/90 backdrop-blur-xl border-t border-[#E9ECEF] sm:hidden safe-bottom transition-all duration-300 ${
          showMobileCta
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        }`}
      >
        <a
          href="#waitlist"
          className="block w-full text-center rounded-xl bg-[#2D6A4F] px-5 py-3.5 text-sm font-semibold text-white active:scale-[0.98] transition-transform"
        >
          {t.nav.waitlistCta}
        </a>
      </div>
    </div>
  );
}
