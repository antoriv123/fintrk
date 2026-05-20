/**
 * Inline SVG flags.
 *
 * We ship them inside the JS bundle so they render instantly, in PWA,
 * Capacitor, offline and without any cache warm-up — unlike the PNGs in
 * /public/flags/ that depend on the service worker precache.
 *
 * Only covers the 18 countries used by the onboarding + language picker.
 * Everything is drawn at 900×600 so aspect ratio is a clean 3:2.
 */

export type FlagCode =
  | "AR" | "AT" | "BE" | "CL" | "CO" | "DE" | "EC" | "ES" | "FR"
  | "GB" | "IE" | "IT" | "MX" | "NL" | "PE" | "PT" | "US" | "UY";

const VB = "0 0 900 600";

/** Horizontal stripes flag helper (top → bottom colours). */
function horizontalStripes(colors: string[]): string {
  const h = 600 / colors.length;
  return colors
    .map((c, i) => `<rect width="900" height="${h}" y="${i * h}" fill="${c}"/>`)
    .join("");
}

/** Vertical stripes flag helper (left → right colours). */
function verticalStripes(colors: string[]): string {
  const w = 900 / colors.length;
  return colors
    .map((c, i) => `<rect width="${w}" height="600" x="${i * w}" fill="${c}"/>`)
    .join("");
}

const flagsInner: Record<FlagCode, string> = {
  // España: 3 horizontal stripes (red 25% · yellow 50% · red 25%)
  ES: `
    <rect width="900" height="600" fill="#AA151B"/>
    <rect width="900" height="300" y="150" fill="#F1BF00"/>
  `,

  // Reino Unido: simplificada (cross of St Andrew + St George)
  GB: `
    <rect width="900" height="600" fill="#012169"/>
    <g>
      <path d="M0,0 L900,600 M900,0 L0,600" stroke="#FFFFFF" stroke-width="120"/>
      <path d="M0,0 L900,600 M900,0 L0,600" stroke="#C8102E" stroke-width="40"/>
    </g>
    <rect x="380" width="140" height="600" fill="#FFFFFF"/>
    <rect y="230" width="900" height="140" fill="#FFFFFF"/>
    <rect x="410" width="80" height="600" fill="#C8102E"/>
    <rect y="260" width="900" height="80" fill="#C8102E"/>
  `,

  // Estados Unidos: 13 stripes + canton (simplified)
  US: `
    ${horizontalStripes([
      "#B22234", "#FFFFFF", "#B22234", "#FFFFFF", "#B22234", "#FFFFFF",
      "#B22234", "#FFFFFF", "#B22234", "#FFFFFF", "#B22234", "#FFFFFF", "#B22234",
    ])}
    <rect width="360" height="324" fill="#3C3B6E"/>
  `,

  // Argentina: 3 horizontal stripes + sol (círculo simple)
  AR: `
    ${horizontalStripes(["#74ACDF", "#FFFFFF", "#74ACDF"])}
    <circle cx="450" cy="300" r="50" fill="#F6B40E" stroke="#85340A" stroke-width="4"/>
  `,

  // Austria
  AT: horizontalStripes(["#ED2939", "#FFFFFF", "#ED2939"]),

  // Bélgica: vertical
  BE: verticalStripes(["#000000", "#FDDA24", "#EF3340"]),

  // Chile: half bicolor + canton
  CL: `
    <rect width="900" height="300" fill="#FFFFFF"/>
    <rect width="900" height="300" y="300" fill="#D52B1E"/>
    <rect width="300" height="300" fill="#0039A6"/>
    <polygon points="150,70 168,118 220,118 178,148 192,195 150,170 108,195 122,148 80,118 132,118" fill="#FFFFFF"/>
  `,

  // Colombia: 4:2:2 horizontal yellow/blue/red
  CO: `
    <rect width="900" height="300" fill="#FCD116"/>
    <rect width="900" height="150" y="300" fill="#003893"/>
    <rect width="900" height="150" y="450" fill="#CE1126"/>
  `,

  // Alemania
  DE: horizontalStripes(["#000000", "#DD0000", "#FFCE00"]),

  // Ecuador: 4:2:2 horizontal yellow/blue/red
  EC: `
    <rect width="900" height="300" fill="#FFDD00"/>
    <rect width="900" height="150" y="300" fill="#0033A0"/>
    <rect width="900" height="150" y="450" fill="#EF3340"/>
  `,

  // Francia
  FR: verticalStripes(["#002395", "#FFFFFF", "#ED2939"]),

  // Irlanda
  IE: verticalStripes(["#169B62", "#FFFFFF", "#FF883E"]),

  // Italia
  IT: verticalStripes(["#009246", "#FFFFFF", "#CE2B37"]),

  // México: vertical green/white/red + un círculo ámbar en el centro como placeholder del escudo
  MX: `
    ${verticalStripes(["#006847", "#FFFFFF", "#CE1126"])}
    <circle cx="450" cy="300" r="55" fill="none" stroke="#8C6A3D" stroke-width="8"/>
    <circle cx="450" cy="300" r="32" fill="#A97142" opacity="0.85"/>
  `,

  // Países Bajos
  NL: horizontalStripes(["#AE1C28", "#FFFFFF", "#21468B"]),

  // Perú
  PE: verticalStripes(["#D91023", "#FFFFFF", "#D91023"]),

  // Portugal: verde/rojo 2:3 con esfera armilar simplificada
  PT: `
    <rect width="360" height="600" fill="#046A38"/>
    <rect x="360" width="540" height="600" fill="#DA291C"/>
    <circle cx="360" cy="300" r="90" fill="#FFE900" stroke="#000000" stroke-width="3"/>
    <circle cx="360" cy="300" r="55" fill="#FFFFFF" stroke="#DA291C" stroke-width="3"/>
  `,

  // Uruguay: aproximada — 9 rayas blancas y azules + sol
  UY: `
    <rect width="900" height="600" fill="#FFFFFF"/>
    ${[1, 3, 5, 7].map((i) => `<rect width="900" height="${600 / 9}" y="${i * (600 / 9)}" fill="#0038A8"/>`).join("")}
    <rect width="450" height="${(600 / 9) * 4}" fill="#FFFFFF"/>
    <circle cx="225" cy="${(600 / 9) * 2}" r="55" fill="#FCD116" stroke="#000000" stroke-width="3"/>
  `,
};

/**
 * Returns the inline SVG for a flag code, or null if unsupported.
 */
export function flagSvg(code: string, size: number): string | null {
  const upper = code.toUpperCase() as FlagCode;
  if (!(upper in flagsInner)) return null;
  const height = Math.round((size * 2) / 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" width="${size}" height="${height}" preserveAspectRatio="xMidYMid slice">${flagsInner[upper]}</svg>`;
}

export function hasFlag(code: string): boolean {
  return code.toUpperCase() in flagsInner;
}
