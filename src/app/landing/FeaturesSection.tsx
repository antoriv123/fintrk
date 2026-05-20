"use client";

import { useRef } from "react";
import type { Translations } from "@/i18n";
import { FadeIn } from "./animations";
import { PhoneMockup } from "./PhoneMockup";
import { Camera, FileUp, Sparkles } from "lucide-react";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useState, type ReactNode } from "react";

interface Feature {
  icon: ReactNode;
  screen: number;
}

const FEATURES: Feature[] = [
  { icon: <Camera size={18} />, screen: 0 },
  { icon: <FileUp size={18} />, screen: 1 },
  { icon: <Sparkles size={18} />, screen: 2 },
];

export default function FeaturesSection({ t }: { t: Translations }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const idx = Math.min(Math.floor(v * FEATURES.length), FEATURES.length - 1);
    setActiveIndex(idx);
  });

  const titles = [t.features.scan, t.features.import, t.features.insights];
  const descs = [t.features.scanDesc, t.features.importDesc, t.features.insightsDesc];

  return (
    <section className="border-t border-[#E9ECEF]">
      {/* Section title */}
      <div className="px-5 sm:px-8 pt-16 sm:pt-24 pb-4">
        <div className="mx-auto max-w-6xl">
          <FadeIn>
            <p className="text-[#2D6A4F] text-xs font-semibold tracking-[0.2em] uppercase">
              {t.features.title}
            </p>
          </FadeIn>
        </div>
      </div>

      {/* Sticky scroll container */}
      <div ref={containerRef} className="relative" style={{ height: "600vh" }}>
        <div className="sticky top-0 h-screen overflow-hidden">
          <div className="h-full flex flex-col justify-between pt-4 pb-24 sm:pb-0 sm:justify-center mx-auto max-w-6xl w-full px-5 sm:px-8">
            <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4 sm:gap-16 items-center flex-1 sm:flex-none">

              {/* Phone */}
              <div className="flex justify-center items-center flex-1 sm:flex-none sm:order-2">
                <PhoneMockup activeScreen={FEATURES[activeIndex].screen} />
              </div>

              {/* Text */}
              <div className="relative sm:order-1">
                {FEATURES.map((f, i) => {
                  const isFirst = i === 0;
                  const isActive = activeIndex === i;
                  return (
                    <motion.div
                      key={i}
                      className={isFirst ? "relative" : "absolute inset-x-0 top-0"}
                      initial={false}
                      animate={{
                        opacity: isActive ? 1 : 0,
                        y: isActive ? 0 : 10,
                      }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      aria-hidden={!isActive}
                      style={{ pointerEvents: isActive ? "auto" : "none" }}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#E8F5EE] text-[#2D6A4F]">
                          {f.icon}
                        </div>
                        <div>
                          <h3 className="text-base sm:text-2xl font-bold text-[#1A1A1A] mb-1 tracking-tight">
                            {titles[i]}
                          </h3>
                          <p className="text-[13px] sm:text-sm text-[#888888] leading-relaxed">
                            {descs[i]}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Progress dots */}
                <div className="flex gap-2 mt-3 sm:mt-5 ml-12 sm:ml-14">
                  {FEATURES.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        activeIndex === i
                          ? "w-8 bg-[#2D6A4F]"
                          : "w-1.5 bg-[#E9ECEF]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
