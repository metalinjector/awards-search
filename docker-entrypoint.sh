#!/bin/sh
set -e

echo "==> Ожидание готовности PostgreSQL..."
i=0
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 60 ]; then
    echo "PostgreSQL не отвечает после 60 попыток — выходим." >&2
    exit 1
  fi
  sleep 1
done
echo "==> PostgreSQL готов."

echo "==> Применение схемы БД (drizzle-kit push)..."
npx drizzle-kit push

echo "==> Запуск Next.js..."
exec npx next start -p "${PORT:-3000}"
