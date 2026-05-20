import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { Inter, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "fintrk — Tu dinero, claro",
  description: "Controla tus finanzas con IA. Importa extractos, escanea recibos y la IA categoriza todo.",
  metadataBase: new URL("https://fintrk.app"),
  openGraph: {
    title: "fintrk — Tu dinero, claro",
    description: "Controla tus finanzas con IA. Importa extractos y la IA categoriza todo automáticamente.",
    url: "https://fintrk.app",
    siteName: "fintrk",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "fintrk — Tu dinero, claro" }],
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "fintrk — Tu dinero, claro",
    description: "Controla tus finanzas con IA.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "fintrk",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Accesibilidad: permitimos pinch-zoom nativo de iOS. Antes estaba bloqueado
  // con maximumScale:1 + userScalable:false — eso puede ser motivo de rechazo
  // futuro y limita a usuarios con dificultades visuales.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A1A" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("font-sans", inter.variable, outfit.variable)} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Apple splash screens for common iPhone sizes */}
        <link rel="apple-touch-startup-image" href="/splash-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1179x2556.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1206x2622.png" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1242x2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var d=document.documentElement;
            var t=localStorage.getItem('theme');
            if(t==='dark'||((!t)&&matchMedia('(prefers-color-scheme:dark)').matches)){
              d.classList.add('dark');
            }
            var fs=localStorage.getItem('fintrk.fontScale');
            if(fs==='sm'||fs==='lg'||fs==='xl'){
              d.dataset.fontScale=fs;
            }
          })();
        `}} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster
            position="top-center"
            // NOTA: el prop offset de Sonner se evaluaba mal en Capacitor
            // WebView (env() devolvía 0 dentro de su portal), lo que dejaba
            // el toast sobre la Dynamic Island. La posición real se fija
            // ahora en globals.css con max(112px, safe-area + 56px).
            visibleToasts={3}
            duration={3500}
            gap={8}
          />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
