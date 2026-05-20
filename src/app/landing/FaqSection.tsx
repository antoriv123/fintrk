"use client";

import { useRef } from "react";
import type { Translations } from "@/i18n";
import { FadeIn } from "./animations";
import { FaqItem } from "./shared";
import { motion, useInView } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function FaqSection({ t }: { t: Translations }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-16 sm:py-24 lg:py-32 px-5 sm:px-8 border-t border-[#E9ECEF]">
      <div className="mx-auto max-w-2xl">
        <FadeIn>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1A1A] text-center mb-10">
            {t.faq.title}
          </h2>
        </FadeIn>
        <motion.div
          ref={ref}
          className="divide-y divide-[#E9ECEF] rounded-2xl bg-white border border-[#E9ECEF] overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <FaqItem question={t.faq.q1} answer={t.faq.a1} />
          <FaqItem question={t.faq.q2} answer={t.faq.a2} />
          <FaqItem question={t.faq.q3} answer={t.faq.a3} />
          <FaqItem question={t.faq.q4} answer={t.faq.a4} />
          <FaqItem question={t.faq.q5} answer={t.faq.a5} />
          <FaqItem question={t.faq.q6} answer={t.faq.a6} />
          <FaqItem question={t.faq.q7} answer={t.faq.a7} />
        </motion.div>
      </div>
    </section>
  );
}
