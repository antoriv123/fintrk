"use client";

import type { Translations } from "@/i18n";
import { FadeIn, TextReveal } from "./animations";
import { WaitlistForm } from "./shared";

export default function HeroSection({ t }: { t: Translations }) {
  return (
    <section className="relative overflow-hidden px-5 sm:px-8 pt-28 pb-14 sm:pt-36 sm:pb-20">

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <TextReveal>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[#1A1A1A] leading-[1.05]">
            {t.hero.headline}{" "}
            <span className="text-[#2D6A4F]">{t.hero.headlineAccent}</span>
          </h1>
        </TextReveal>

        <FadeIn delay={0.2}>
          <p className="mt-5 text-sm sm:text-base text-[#888888]">
            {t.hero.subtitle}
          </p>
        </FadeIn>

        <FadeIn delay={0.3}>
          <div className="mt-8">
            <WaitlistForm t={t} />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
