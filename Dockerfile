# ============================================================
# Кинонаграды — Dockerfile
# Next.js 16 (App Router, standalone) + PostgreSQL (Drizzle ORM)
# ============================================================

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Слой зависимостей (кэшируется отдельно) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Сборка ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL нужен только форматом — реального подключения при сборке нет
ENV DATABASE_URL="postgresql://postgres:postgres@db:5432/app_db"
# собрать самодостаточный сервер в .next/standalone
ENV NEXT_OUTPUT=standalone
RUN npm run build

# ---------- Рантайм ----------
# Только standalone-сервер Next.js (со своим минимальным node_modules),
# статика и SQL-миграции; dev-зависимостей и исходников в образе нет.
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

# При старте сервер сам дожидается БД и применяет миграции (src/instrumentation.ts)
CMD ["node", "server.js"]
