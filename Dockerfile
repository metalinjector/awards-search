# ============================================================
# Кинонаграды — Dockerfile
# Next.js 16 (App Router) + PostgreSQL (Drizzle ORM)
# ============================================================

FROM node:22-alpine AS base
WORKDIR /app

# ---------- Слой зависимостей (кэшируется отдельно) ----------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS prod-deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---------- Сборка ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL нужен только форматом — реального подключения при сборке нет
ENV DATABASE_URL="postgresql://postgres:postgres@db:5432/app_db"
RUN npm run build

# ---------- Рантайм ----------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

# Непривилегированный runtime и только production-зависимости.
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --chown=nextjs:nodejs package.json next.config.ts tsconfig.json ./
COPY --chown=nextjs:nodejs migrations ./migrations
COPY --chown=nextjs:nodejs scripts/migrate.mjs ./scripts/migrate.mjs
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
