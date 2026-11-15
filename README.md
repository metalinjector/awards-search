# 🏆 Кинонаграды / Awards Search

Сервис собирает награды и номинации фильмов, персон и церемоний из Кинопоиска,
IMDb и TMDB, а затем показывает единый отчёт с поиском, сортировкой и экспортом.

Живой сайт: <https://awards.zonner.site>

Стек: Next.js 16 (App Router), React 19, PostgreSQL 16, Drizzle ORM,
Tailwind CSS 4, Docker Compose.

## Возможности

- Отчёты Кинопоиска по премии и году: категории, победители, номинанты и рейтинг
  фильмов.
- Поиск всех наград фильма по названию или точному `kpId`. Сервис показывает
  фактическое покрытие сканирования и отдельно сообщает об ошибках источника.
- IMDb: титулы, персоны, церемонии, полная пагинация номинаций и галерея изображений.
- Потоковый ZIP галереи с лимитами числа и размера файлов.
- TMDB как альтернативный путь поиска с последующим переходом к IMDb.
- XLSX, Markdown и автономный HTML для отчётов Кинопоиска и IMDb.
- Политика свежести: текущий год — 12 часов, предыдущий — 7 дней, архивные
  завершённые годы не перезапрашиваются. Устаревшая копия показывается сразу и
  обновляется в фоне.

## Быстрый старт

```bash
git clone https://github.com/metalinjector/awards-search.git
cd awards-search
cp .env.example .env
# Задайте уникальные POSTGRES_PASSWORD и ADMIN_TOKEN в .env
docker compose up -d --build
```

Приложение работает на порту 3000 внутри Docker-сети. В production оно рассчитано
на reverse proxy из внешней сети `web`. Подробности: [DOCKER.md](DOCKER.md).

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---:|---|
| `POSTGRES_PASSWORD` | да | Уникальный пароль БД; значения по умолчанию нет |
| `ADMIN_TOKEN` | production | Bearer-токен управления TMDB и чтения метрик |
| `POSTGRES_USER` | нет | Пользователь БД, по умолчанию `awards` |
| `POSTGRES_DB` | нет | База, по умолчанию `awards` |
| `NEXT_PUBLIC_APP_URL` | нет | Канонический origin для SEO |
| `TMDB_API_KEY` / `TMDB_ACCESS_TOKEN` | нет | Серверные реквизиты TMDB |
| `JINA_API_KEY` | нет | Повышенные лимиты Jina Reader |

`DATABASE_URL` compose формирует сам. При запуске без Docker его нужно задать
явно. Секреты не вводятся в публичном UI и не возвращаются API.

## Разработка и проверка

```bash
npm ci
npm run check      # ESLint + TypeScript + node:test
npm run build      # production-сборка webpack
```

CI выполняет те же проверки и отклоняет production-зависимости с уязвимостями
уровня high и выше.

## Архитектура

```text
reverse proxy
    │
    ▼
Next.js app ────── PostgreSQL
    │                  ▲
    ├─ очередь         │
    ├─ rate limits     │
    └─ внешние API     └─ ежедневный pg_dump
```

- `src/lib/parser.ts` — загрузка и классификация ошибок источника Кинопоиска.
- `src/lib/search-service.ts` — план сканирования, точное сопоставление `kpId`,
  покрытие и кэш.
- `src/lib/imdb*.ts` — IMDb GraphQL, повторы временных ошибок и пагинация.
- `src/lib/work-queue.ts` — ограничение параллелизма и single-flight запросов.
- `src/lib/api-security.ts` — лимиты запросов, размеры body и admin-аутентификация.
- `src/lib/metrics.ts`, `src/lib/logger.ts` — счётчики и структурированные JSON-логи.
- `migrations/` — неизменяемые версионированные SQL-миграции.

## Основные API

| Endpoint | Назначение |
|---|---|
| `GET /api/report?slug=oscar&year=2026` | Кэшированный отчёт по премии |
| `POST /api/report` | Создание или принудительное обновление отчёта |
| `GET /api/search/plan?year=2025` | План и состояние покрытия |
| `POST /api/search/scan` | Одна задача сканирования |
| `GET /api/search/results?q=…&year=…&kpId=…` | Результаты поиска фильма |
| `GET /api/imdb/awards?id=tt…` | Все номинации IMDb |
| `GET /api/imdb/images/zip?id=tt…` | Ограниченный потоковый ZIP |
| `GET /api/health` | Liveness/readiness с проверкой БД |
| `GET /api/metrics` | Снимок внутренних метрик, только admin |
| `POST/DELETE /api/tmdb/key` | Управление серверным ключом, только admin |

Admin-endpoint’ы принимают `Authorization: Bearer <ADMIN_TOKEN>`.
