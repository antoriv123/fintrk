import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(jwtSecret);

const COOKIE_NAME = "ft_session";

// Allowed origins for CORS (native app + web).
// Forks: extend via env var ALLOWED_ORIGINS (comma-separated). The defaults
// always include the Capacitor / local-dev origins so the iOS WebView works
// out of the box.
const DEFAULT_ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "http://localhost:3000",
  "https://fintrk.app",
  "https://www.fintrk.app",
];
const ALLOWED_ORIGINS = [
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/", "/login", "/register", "/gate/e", "/gate/n", "/onboarding", "/offline", "/privacy", "/terms", "/welcome", "/screenshots"];
// Los /api/cron/* validan CRON_SECRET ellos mismos con timingSafeEqual —
// el middleware no puede intentar jwtVerify sobre el Bearer porque ese
// Bearer NO es un JWT, provocando 401 antes de llegar al handler. Esto
// dejo /api/cron/{reengagement,weekly-recap,scheduled-push} efectivamente
// rotos hasta hoy (SEC-NEW-002 auditoria 2026-04-23).
// /api/health es un smoke endpoint publico para uptime monitoring (UptimeRobot).
const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/apple/callback",
  "/api/waitlist",
  "/api/ingest/apple-pay",
  "/api/cron/streak-reminder",
  "/api/cron/reengagement",
  "/api/cron/weekly-recap",
  "/api/cron/scheduled-push",
  "/api/cron/purge-import-errors",
  "/api/health",
];

// Static assets and Next.js internals
const SKIP_PATHS = ["/_next", "/favicon.ico", "/sw.js", "/manifest.webmanifest", "/icons", "/icon-", "/apple-touch-icon", "/splash-", "/banks/", "/og-image", "/logo.svg"];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (origin && ALLOWED_ORIGINS.some((o) => origin === o || (o.endsWith("localhost") && origin.startsWith(o + ":")))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // Skip static assets
  if (SKIP_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Helper to add CORS headers to response
  function withCors(response: NextResponse): NextResponse {
    const cors = corsHeaders(origin);
    for (const [key, value] of Object.entries(cors)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // CSRF protection for state-changing API requests.
  //
  // Salta el check cuando:
  // - hay Authorization header (native app ya autenticada),
  // - O el Origin está explícitamente en ALLOWED_ORIGINS (capacitor://localhost,
  //   ionic://localhost, http://localhost, https://fintrk.app, etc.) — esto
  //   cubre el primer POST /api/auth/login desde la app nativa, que NO puede
  //   tener Authorization header todavía porque el token nace en la respuesta.
  //
  // Solo bloquea como CSRF cuando un origen externo no allowlisted intenta
  // POSTear sin token (clásico ataque cross-site).
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const hasAuthHeader = request.headers.has("authorization");
    const isAllowedOrigin = origin
      ? ALLOWED_ORIGINS.some((o) => origin === o || (o.endsWith("localhost") && origin.startsWith(o + ":")))
      : false;
    if (!hasAuthHeader && origin && !isAllowedOrigin) {
      const host = request.headers.get("host");
      if (host) {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return withCors(NextResponse.json({ error: "CSRF: origen no permitido" }, { status: 403 }));
        }
      }
    }
  }

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname) || PUBLIC_API_ROUTES.includes(pathname)) {
    if (pathname === "/") {
      // Check auth from cookie or Bearer token
      let token = request.cookies.get(COOKIE_NAME)?.value ?? null;
      if (!token) {
        const authHeader = request.headers.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice(7);
        }
      }

      if (token) {
        try {
          await jwtVerify(token, JWT_SECRET);
          return NextResponse.redirect(new URL("/dashboard", request.url));
        } catch {
          // Invalid token, continue
        }
      }

      // Native app (Capacitor) → show welcome screen instead of web landing
      const ua = request.headers.get("user-agent") ?? "";
      if (ua.includes("Fintrk") || ua.includes("Capacitor")) {
        return NextResponse.redirect(new URL("/welcome", request.url));
      }
    }
    const response = NextResponse.next();
    return withCors(response);
  }

  // Try to get token from cookie OR Authorization header
  let token = request.cookies.get(COOKIE_NAME)?.value ?? null;

  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return withCors(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    }
    return NextResponse.redirect(new URL("/gate/e", request.url));
  }

  // Verify JWT
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as number;

    if (!userId) {
      throw new Error("Invalid token payload");
    }

    const role = (payload.role as string) || "user";

    // Admin route protection
    if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return withCors(NextResponse.json({ error: "No encontrado" }, { status: 404 }));
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (pathname.startsWith("/admin")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", String(userId));
    requestHeaders.set("x-user-role", role);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    return withCors(response);
  } catch {
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Sesion expirada" }, { status: 401 });
      response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return withCors(response);
    }

    const response = NextResponse.redirect(new URL("/gate/e", request.url));
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|icon-|apple-touch-icon|splash-|sw.js|manifest.webmanifest).*)",
  ],
};
