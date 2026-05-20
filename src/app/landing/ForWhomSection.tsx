"use client";

import type { Translations } from "@/i18n";
import { FadeIn } from "./animations";
import { Check, X } from "lucide-react";

/**
 * Sección "Para quién es / Para quién NO es".
 * Diferenciación directa del bro-finance genérico. Texto duro, sin rodeos.
 */
export default function ForWhomSection({ t }: { t: Translations }) {
  return (
    <section className="border-t border-[#E9ECEF] py-16 sm:py-24 px-5 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1A1A] text-center mb-10 sm:mb-14">
            {t.features.forWhomTitle}
          </h2>
        </FadeIn>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
          <FadeIn delay={0.1}>
            <div className="rounded-2xl border border-[#2D6A4F]/25 bg-[#E8F5EE]/40 p-6 sm:p-7">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#2D6A4F] text-white mb-4">
                <Check size={18} strokeWidth={2.5} />
              </div>
              <p className="text-sm sm:text-base text-[#1A1A1A] leading-relaxed">
                {t.features.forWhom}
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="rounded-2xl border border-[#E9ECEF] bg-white p-6 sm:p-7">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#888888]/15 text-[#888888] mb-4">
                <X size={18} strokeWidth={2.5} />
              </div>
              <p className="text-sm sm:text-base text-[#888888] leading-relaxed">
                {t.features.notForWhom}
              </p>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
