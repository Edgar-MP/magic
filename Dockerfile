# syntax=docker/dockerfile:1

# Imagen autocontenida: dentro van la web compilada, los marcos y tipografías, el
# índice de cartas y el servidor que lo sirve todo. Sin volúmenes que preparar a
# mano ni assets que bajar en el arranque.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Prisma necesita openssl para hablar con Postgres; Alpine no lo trae de serie.
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo


# --- Dependencias -------------------------------------------------------------
# Sólo los manifiestos, para que Docker reutilice esta capa mientras no cambien
# las dependencias (que es casi siempre).
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cards/package.json packages/cards/
COPY packages/renderer/package.json packages/renderer/
COPY packages/web/package.json packages/web/
COPY packages/api/package.json packages/api/
RUN pnpm install --frozen-lockfile


# --- Compilación --------------------------------------------------------------
FROM deps AS build
COPY . .

# El orden importa: los dos primeros generan lo que el tercero mete en `dist`.
#   assets      → packages/renderer/assets, que el plugin de Vite copia a dist/card-assets
#   cards:index → packages/web/public/card-index.json, que Vite copia a dist
# Los dos bajan de la red (GitHub y Scryfall), así que la compilación necesita
# salida a internet.
RUN pnpm assets \
 && pnpm cards:index \
 && pnpm build

# Deja en /out el paquete de la API con sólo sus dependencias de producción.
# `--legacy` porque el workspace no usa inject-workspace-packages.
RUN pnpm --filter @magic/api --prod --legacy deploy /out


# --- Ejecución ----------------------------------------------------------------
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/web \
    DATA_DIR=/data
WORKDIR /app

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/packages/api/dist ./dist
# El cliente de Prisma se genera dentro del paquete, y el esquema y las
# migraciones hacen falta para el `migrate deploy` del arranque.
COPY --from=build /repo/packages/api/generated ./generated
COPY --from=build /repo/packages/api/prisma ./prisma
COPY --from=build /repo/packages/api/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=build /repo/packages/web/dist ./web

# `node` es un usuario que ya trae la imagen oficial.
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000

# Comprobación propia para `docker run`; en Dokploy se configura aparte.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
