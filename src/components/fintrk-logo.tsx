"use client";

interface FintrkLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "light" | "dark" | "auto";
  className?: string;
}

const SIZES = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-4xl",
};

export function FintrkLogo({ size = "md", variant = "auto", className = "" }: FintrkLogoProps) {
  const textSize = SIZES[size];

  const finColor = variant === "dark"
    ? "text-[#FAFAF7]"
    : variant === "light"
    ? "text-[#1A1A1A]"
    : "text-foreground";

  const trkColor = variant === "dark"
    ? "text-[#4ADE80]"
    : "text-primary";

  return (
    <span className={`font-[var(--font-display)] font-extrabold tracking-tight ${textSize} ${className}`}>
      <span className={finColor}>fin</span>
      <span className={trkColor}>trk</span>
    </span>
  );
}
