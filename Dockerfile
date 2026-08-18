# syntax=docker/dockerfile:1

# Imagen para self-hosting. Debian slim en vez de Alpine: las dependencias son
# JavaScript puro, pero glibc evita sorpresas con los binarios que Next trae
# precompilados.

# El lockfile del repo es bun.lock, así que instalamos y construimos con bun;
# el contenedor final sí corre sobre node, que es lo que espera el servidor
# standalone de Next.
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-debian AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Las NEXT_PUBLIC_* se incrustan en el bundle DURANTE el build: cambiarlas
# después en el entorno del contenedor no tiene ningún efecto. De aquí salen
# también la CSP, el flag Secure de la cookie y HSTS, que dependen de si
# NEXT_PUBLIC_APP_URL es http o https.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_OWNER_NAME
ARG NEXT_PUBLIC_OWNER_LOCATION
ARG NEXT_PUBLIC_OWNER_EMAIL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_OWNER_NAME=$NEXT_PUBLIC_OWNER_NAME \
    NEXT_PUBLIC_OWNER_LOCATION=$NEXT_PUBLIC_OWNER_LOCATION \
    NEXT_PUBLIC_OWNER_EMAIL=$NEXT_PUBLIC_OWNER_EMAIL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL

# Varios módulos (middleware, lib/auth, lib/db) lanzan al importarse si estas
# faltan, y el build los evalúa al prerenderizar. Son marcadores: no son
# NEXT_PUBLIC_*, así que no quedan en el bundle, y en ejecución los sustituye
# el entorno real del contenedor.
ENV JWT_SECRET=placeholder-solo-para-el-build \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    NEXT_TELEMETRY_DISABLED=1

RUN bun run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3010 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3010

CMD ["node", "server.js"]
