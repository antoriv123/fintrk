import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
// Un despliegue self-hosted puede servirse legítimamente por http (localhost,
// LAN). Ahí `upgrade-insecure-requests` y HSTS reescriben cada petición a
// https y el navegador falla con ERR_SSL_PROTOCOL_ERROR, así que ambos siguen
// al protocolo real de la app en lugar de a NODE_ENV.
const isHttps = appOrigin.startsWith("https");

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  register: true,
  reloadOnOnline: true,
  disable: isDev,
});

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdnjs.cloudflare.com`,
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://cdnjs.cloudflare.com",
  "font-src 'self'",
  "manifest-src 'self'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

// HSTS solo tiene sentido (y solo es seguro) sirviendo por https: enviarlo
// por http deja el host clavado en https durante 2 años en el navegador.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Access-Control-Allow-Origin", value: appOrigin },
  { key: "Vary", value: "Origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isHttps
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["pdf-parse", "jsonwebtoken"],
  turbopack: {},
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
  // El formulario vive en /gate/e. Un redirect aquí emite un 307 real, a
  // diferencia de un redirect() dentro de la página, que se resuelve solo
  // después de hidratar en cliente.
  redirects: async () => [{ source: "/login", destination: "/gate/e", permanent: false }],
};

export default withSerwist(nextConfig);
