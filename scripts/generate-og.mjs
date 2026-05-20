import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../public/og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="phoneScreen">
      <rect x="740" y="115" width="260" height="430" rx="8"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#FAFAF7"/>

  <!-- Subtle grid dots pattern -->
  ${Array.from({ length: 20 }, (_, i) =>
    Array.from({ length: 10 }, (_, j) =>
      `<circle cx="${60 * i + 30}" cy="${63 * j + 30}" r="1" fill="#E0DED8" opacity="0.5"/>`
    ).join('')
  ).join('')}

  <!-- Left side content -->

  <!-- Logo: fin + trk -->
  <text x="80" y="240" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="72" font-weight="800" letter-spacing="-2">
    <tspan fill="#1A1A1A">fin</tspan><tspan fill="#2D6A4F">trk</tspan>
  </text>

  <!-- Tagline -->
  <text x="84" y="290" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" font-weight="400" fill="#1A1A1A" opacity="0.85">
    Tu dinero, claro.
  </text>

  <!-- Feature bullets -->
  <!-- Bullet 1 -->
  <circle cx="96" cy="360" r="6" fill="#2D6A4F"/>
  <text x="114" y="366" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" fill="#1A1A1A" opacity="0.7">
    Importa extractos
  </text>

  <!-- Bullet 2 -->
  <circle cx="96" cy="400" r="6" fill="#2D6A4F"/>
  <text x="114" y="406" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" fill="#1A1A1A" opacity="0.7">
    IA categoriza todo
  </text>

  <!-- Bullet 3 -->
  <circle cx="96" cy="440" r="6" fill="#2D6A4F"/>
  <text x="114" y="446" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" fill="#1A1A1A" opacity="0.7">
    Controla tus finanzas
  </text>

  <!-- Right side: Phone mockup -->
  <!-- Phone body -->
  <rect x="710" y="85" width="320" height="490" rx="36" fill="#1A1A1A"/>
  <!-- Phone screen -->
  <rect x="722" y="97" width="296" height="466" rx="28" fill="#FFFFFF"/>

  <!-- Screen content -->
  <g clip-path="url(#phoneScreen)">
    <!-- Status bar area -->
    <rect x="740" y="115" width="260" height="40" fill="#FAFAF7"/>
    <text x="760" y="142" font-family="system-ui, sans-serif" font-size="13" fill="#1A1A1A" font-weight="600">fintrk</text>
    <text x="960" y="142" font-family="system-ui, sans-serif" font-size="12" fill="#888" text-anchor="end">Abril 2026</text>

    <!-- Balance card -->
    <rect x="752" y="165" width="236" height="80" rx="12" fill="#2D6A4F"/>
    <text x="768" y="192" font-family="system-ui, sans-serif" font-size="12" fill="#FFFFFF" opacity="0.7">Balance total</text>
    <text x="768" y="225" font-family="system-ui, sans-serif" font-size="28" fill="#FFFFFF" font-weight="700">€3,842</text>

    <!-- Mini chart bars -->
    <rect x="752" y="260" width="236" height="100" rx="12" fill="#F5F5F0"/>
    <text x="768" y="282" font-family="system-ui, sans-serif" font-size="11" fill="#888">Gastos por categoria</text>
    <!-- Bar chart -->
    <rect x="768" y="295" width="80" height="12" rx="4" fill="#2D6A4F"/>
    <text x="854" y="305" font-family="system-ui, sans-serif" font-size="10" fill="#666">Comida</text>
    <rect x="768" y="313" width="55" height="12" rx="4" fill="#2D6A4F" opacity="0.7"/>
    <text x="829" y="323" font-family="system-ui, sans-serif" font-size="10" fill="#666">Alquiler</text>
    <rect x="768" y="331" width="35" height="12" rx="4" fill="#2D6A4F" opacity="0.5"/>
    <text x="809" y="341" font-family="system-ui, sans-serif" font-size="10" fill="#666">Ocio</text>

    <!-- Transaction list -->
    <rect x="752" y="374" width="236" height="170" rx="12" fill="#F5F5F0"/>
    <text x="768" y="396" font-family="system-ui, sans-serif" font-size="11" fill="#888">Recientes</text>

    <!-- Transaction items -->
    <circle cx="776" cy="420" r="8" fill="#2D6A4F" opacity="0.15"/>
    <text x="790" y="424" font-family="system-ui, sans-serif" font-size="12" fill="#1A1A1A">Supermercado</text>
    <text x="972" y="424" font-family="system-ui, sans-serif" font-size="12" fill="#CC3333" text-anchor="end">-€47</text>

    <line x1="768" y1="436" x2="972" y2="436" stroke="#E5E5E0" stroke-width="0.5"/>

    <circle cx="776" cy="454" r="8" fill="#2D6A4F" opacity="0.15"/>
    <text x="790" y="458" font-family="system-ui, sans-serif" font-size="12" fill="#1A1A1A">Transferencia</text>
    <text x="972" y="458" font-family="system-ui, sans-serif" font-size="12" fill="#2D6A4F" text-anchor="end">+€500</text>

    <line x1="768" y1="470" x2="972" y2="470" stroke="#E5E5E0" stroke-width="0.5"/>

    <circle cx="776" cy="488" r="8" fill="#2D6A4F" opacity="0.15"/>
    <text x="790" y="492" font-family="system-ui, sans-serif" font-size="12" fill="#1A1A1A">Netflix</text>
    <text x="972" y="492" font-family="system-ui, sans-serif" font-size="12" fill="#CC3333" text-anchor="end">-€13</text>

    <line x1="768" y1="504" x2="972" y2="504" stroke="#E5E5E0" stroke-width="0.5"/>

    <circle cx="776" cy="522" r="8" fill="#2D6A4F" opacity="0.15"/>
    <text x="790" y="526" font-family="system-ui, sans-serif" font-size="12" fill="#1A1A1A">Drippys</text>
    <text x="972" y="526" font-family="system-ui, sans-serif" font-size="12" fill="#2D6A4F" text-anchor="end">+€320</text>
  </g>

  <!-- Phone notch -->
  <rect x="830" y="97" width="80" height="22" rx="11" fill="#1A1A1A"/>

  <!-- Decorative accent elements -->
  <!-- Small green circle decoration top-left -->
  <circle cx="520" cy="140" r="40" fill="#2D6A4F" opacity="0.06"/>
  <circle cx="550" cy="520" r="60" fill="#2D6A4F" opacity="0.04"/>
</svg>
`;

async function main() {
  const buffer = Buffer.from(svg);
  await sharp(buffer)
    .resize(WIDTH, HEIGHT)
    .png({ quality: 90 })
    .toFile(outputPath);

  const stats = await import('fs').then(fs => fs.statSync(outputPath));
  console.log(`OG image generated: ${outputPath}`);
  console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`Dimensions: ${WIDTH}x${HEIGHT}`);
}

main().catch(err => {
  console.error('Error generating OG image:', err);
  process.exit(1);
});
