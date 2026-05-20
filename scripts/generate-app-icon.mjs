// Genera el icono de iOS (1024x1024) desde el mismo diseño que src/app/icon.tsx.
// Sin bordes redondeados: iOS aplica la máscara de superelipse automáticamente.
// Uso: node scripts/generate-app-icon.mjs
//
// Dependencia: sharp (ya instalado, usado también por scripts/generate-og.mjs).

import sharp from "sharp";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  __dirname,
  "../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
);

const SIZE = 1024;
// Las medidas de icon.tsx son sobre canvas 512 (fontSize 380). Escalamos x2.
const FONT_SIZE = 760;
const LETTER_SPACING = -28;

// Coordenadas: texto centrado en el canvas con dominant-baseline=central.
const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" fill="#FAFAF7"/>
  <text
    x="50%"
    y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif"
    font-size="${FONT_SIZE}"
    font-weight="900"
    letter-spacing="${LETTER_SPACING}"
  ><tspan fill="#1A1A1A">f</tspan><tspan fill="#2D6A4F">t</tspan></text>
</svg>
`.trim();

async function main() {
  const buffer = Buffer.from(svg);
  await sharp(buffer).resize(SIZE, SIZE).png({ quality: 100 }).toFile(outputPath);
  const stats = statSync(outputPath);
  console.log(`AppIcon generated: ${outputPath}`);
  console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB (${SIZE}x${SIZE})`);
}

main().catch((err) => {
  console.error("Error generating AppIcon:", err);
  process.exit(1);
});
