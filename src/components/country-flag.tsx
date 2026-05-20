"use client";

import { flagSvg, hasFlag } from "@/lib/flags-svg";

interface Props {
  /** ISO 3166-1 alpha-2 country code (e.g. "ES", "MX", "US") */
  code: string;
  /** Width in px; height auto-adjusts to 3:2 flag aspect ratio */
  size?: number;
  className?: string;
  rounded?: boolean;
}

/**
 * Renders a country flag.
 *
 * Primary source is an inline SVG bundled in the JS — works offline, inside
 * the PWA and in native Capacitor without relying on the service worker
 * cache or /public/flags/*.png.
 *
 * If the code isn't in our inline set, falls back to /public/flags/{code}.png
 * (same-origin PNG served from static assets).
 */
export function CountryFlag({ code, size = 32, className = "", rounded = true }: Props) {
  const height = Math.round((size * 2) / 3);
  const roundedClass = rounded ? "rounded-[4px]" : "";
  const wrapperStyle: React.CSSProperties = {
    width: size,
    height,
    overflow: "hidden",
    display: "inline-block",
  };

  if (hasFlag(code)) {
    const svg = flagSvg(code, size)!;
    return (
      <span
        aria-label={`${code} flag`}
        role="img"
        className={`${roundedClass} shrink-0 ${className}`}
        style={wrapperStyle}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  // Fallback for codes we haven't inlined — keeps old behaviour.
  const lower = code.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${lower}.png`}
      alt={`${code} flag`}
      width={size}
      height={height}
      loading="eager"
      decoding="async"
      className={`${roundedClass} object-cover shrink-0 ${className}`}
      style={{ width: size, height }}
    />
  );
}
