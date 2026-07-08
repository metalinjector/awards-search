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

# Копируем всё необходимое для `next start` + drizzle-kit push
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json next.config.ts tsconfig.json drizzle.config.json ./
COPY src/db ./src/db
COPY src/lib/types.ts ./src/lib/types.ts
COPY src/lib/imdb.ts ./src/lib/imdb.ts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
