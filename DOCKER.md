# 🐳 Развёртывание «Кинонаграды» в Docker

Полная инструкция по запуску сервиса отчётов о кинонаградах (Кинопоиск + IMDb + TMDB)
на любой машине с Docker.

## Состав

| Файл | Назначение |
|---|---|
| `Dockerfile` | Многослойная сборка образа приложения (Node 22 Alpine) |
| `docker-compose.yml` | Оркестрация: PostgreSQL 16 + приложение |
| `docker-entrypoint.sh` | Стартовый скрипт: ждёт БД → применяет схему → запускает Next.js |
| `.dockerignore` | Исключения из контекста сборки |

## Требования

- Docker Engine 24+ и Docker Compose v2 (`docker compose version`)
- ~2 ГБ свободного места (образ + база)
- Доступ в интернет из контейнера (сервис обращается к kinopoisk.ru через
  Jina Reader, api.imdbapi.dev, themoviedb.org)

## Быстрый старт

```bash
# 1. Клонируйте / скопируйте проект и перейдите в его корень
cd <папка-проекта>

# 2. Соберите и запустите
docker compose up -d --build

# 3. Откройте в браузере
#    http://localhost:3000
```

При первом запуске:
1. Поднимается PostgreSQL с постоянным томом `pgdata`
2. Приложение дожидается готовности БД (healthcheck + собственное ожидание)
3. `drizzle-kit push` создаёт все таблицы (`reports`, `imdb_titles`, `scan_misses`)
4. Стартует production-сборка Next.js на порту 3000

## Переменные окружения

Задаются в `docker-compose.yml` (секция `app.environment`) или через `.env`-файл.

| Переменная | Обязательна | Описание |
|---|---|---|
| `DATABASE_URL` | да (уже задана) | Строка подключения к PostgreSQL. В compose указывает на сервис `db` |
| `TMDB_API_KEY` | нет | v3-ключ TMDB — включает поиск на странице `/tmdb`. Получить: themoviedb.org → Settings → API |
| `TMDB_ACCESS_TOKEN` | нет | Альтернатива: v4 Read Access Token TMDB (достаточно одного из двух) |
| `JINA_API_KEY` | нет | Ключ r.jina.ai — повышает лимиты загрузки страниц Кинопоиска |
| `PORT` | нет | Порт приложения внутри контейнера (по умолчанию 3000) |

Пример подключения ключей — раскомментируйте строки в `docker-compose.yml`:

```yaml
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/app_db
      TMDB_API_KEY: "abc123..."
```

## Полезные команды

```bash
docker compose up -d --build      # сборка + запуск в фоне
docker compose logs -f app        # логи приложения
docker compose logs -f db         # логи PostgreSQL
docker compose ps                 # статус контейнеров
docker compose restart app        # перезапуск приложения
docker compose down               # остановка (данные БД сохраняются)
docker compose down -v            # остановка + УДАЛЕНИЕ данных БД
```

### Доступ к базе данных

```bash
# psql внутри контейнера
docker compose exec db psql -U postgres -d app_db

# Примеры запросов
#   \dt                                 -- список таблиц
#   select award_slug, year from reports;
#   select imdb_id from imdb_titles;
```

Чтобы подключаться с хоста (DBeaver, pgAdmin), раскомментируйте `ports: - "5432:5432"`
у сервиса `db` и перезапустите compose.

## Обновление приложения

```bash
git pull                          # или скопируйте новую версию кода
docker compose up -d --build      # пересборка изменённых слоёв
```

Слой `npm ci` кэшируется — пересборка без изменения зависимостей занимает ~1 минуту.

## Резервное копирование БД

```bash
# Дамп
docker compose exec db pg_dump -U postgres app_db > backup.sql

# Восстановление
cat backup.sql | docker compose exec -T db psql -U postgres -d app_db
```

## Архитектура образа

```
┌─────────────── этап deps ───────────────┐
│ npm ci → полный node_modules            │
└──────────────────┬──────────────────────┘
                   ▼
┌────────────── этап builder ─────────────┐
│ next build → .next (production)         │
└──────────────────┬──────────────────────┘
                   ▼
┌────────────── этап runner ──────────────┐
│ node_modules + .next + public +         │
│ src/db (схема для drizzle-kit push)     │
│ ENTRYPOINT: docker-entrypoint.sh        │
└─────────────────────────────────────────┘
```

## Устранение неполадок

| Симптом | Решение |
|---|---|
| `PostgreSQL не отвечает после 60 попыток` | Проверьте `docker compose logs db`; убедитесь, что том не повреждён (`docker compose down -v` — сотрёт данные!) |
| Порт 3000 занят | Измените проброс в compose: `"8080:3000"` → http://localhost:8080 |
| Отчёты Кинопоиска не строятся | Из контейнера должен быть доступен `r.jina.ai`; проверьте: `docker compose exec app wget -qO- https://r.jina.ai` |
| `/tmdb` просит ключ | Добавьте `TMDB_API_KEY` в environment и `docker compose up -d` |
| Медленная первая сборка | Нормально: `npm ci` ставит ~500 пакетов. Дальше работает кэш |
