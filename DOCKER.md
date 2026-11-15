# Развёртывание в Docker

## Требования

- Docker Engine 24+ и Docker Compose v2;
- внешняя Docker-сеть `web` для reverse proxy;
- доступ контейнера к Jina Reader, IMDb и TMDB.

## Первый запуск

```bash
docker network create web   # один раз, если сети ещё нет
cp .env.example .env
chmod 600 .env
```

Замените значения `POSTGRES_PASSWORD` и `ADMIN_TOKEN` на случайные, например
результат `openssl rand -hex 32`, затем запустите:

```bash
docker compose config       # проверить итоговую конфигурацию
docker compose up -d --build
docker compose ps
```

Пароль БД не имеет небезопасного значения по умолчанию. `.env` исключён из Git и
должен читаться только владельцем.

## Что происходит при старте

1. PostgreSQL проходит healthcheck.
2. Непривилегированный пользователь приложения ждёт доступности БД.
3. `scripts/migrate.mjs` применяет новые SQL из `migrations/` транзакционно и
   сохраняет SHA-256 в `app_migrations`. Изменённая после применения миграция
   останавливает запуск.
4. Next.js запускается, затем его `/api/health` проверяет Compose.
5. Сервис `backup` создаёт ежедневный custom-format `pg_dump` в `./backups` и
   удаляет копии старше срока хранения.

Приложение и backup работают с read-only root filesystem, без Linux capabilities
и с лимитами CPU, памяти и процессов. Приложение запускается не от root. База не
публикует порт и доступна лишь во внутренней Docker-сети.

## Настройки

Смотрите `.env.example`. Основные значения:

| Переменная | По умолчанию | Описание |
|---|---|---|
| `POSTGRES_USER` | `awards` | Роль приложения и backup |
| `POSTGRES_DB` | `awards` | Имя базы |
| `POSTGRES_PASSWORD` | — | Обязательный уникальный пароль |
| `ADMIN_TOKEN` | — | Bearer-токен admin API |
| `NEXT_PUBLIC_APP_URL` | production URL | Канонический origin |
| `BACKUP_INTERVAL_SECONDS` | `86400` | Интервал резервирования |
| `BACKUP_RETENTION_DAYS` | `14` | Срок хранения дампов |

Ключи TMDB и Jina опциональны. Без ключа страница `/tmdb` показывает, что интеграция
отключена. Если задан `ADMIN_TOKEN`, там же появляется форма: ключ сохраняется в БД
после проверки запросом к TMDB, для сохранения и удаления нужен токен администратора.

## Эксплуатация

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
docker compose logs -f backup
docker compose up -d --build       # обновление
docker compose restart app
```

Проверки:

```bash
curl -fsS https://awards.example/api/health
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://awards.example/api/metrics
```

Логи приложения — по одной JSON-записи на событие; токены, пароли и ключи
редактируются перед выводом.

## Резервные копии

Дампы лежат в `./backups/awards-<UTC timestamp>.dump`. Проверьте их наличие и
периодически тестируйте восстановление в отдельную базу.

Ручной дамп:

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" \
  --format=custom "$POSTGRES_DB" > awards-manual.dump
```

Восстановление выполняйте только в пустую тестовую базу до проверки содержимого:

```bash
docker compose exec -T db createdb -U "$POSTGRES_USER" awards_restore_test
docker compose exec -T db pg_restore -U "$POSTGRES_USER" \
  -d awards_restore_test --clean --if-exists /path/in/container.dump
```

`docker compose down -v` удаляет весь том PostgreSQL и не используется для
обычного обновления.

## Обновление существующего инстанса

- Сначала создайте проверенный дамп.
- Убедитесь, что роль из `.env` имеет `CONNECT`, `USAGE/CREATE` на схему, DML на
  существующие таблицы и права на последовательности.
- Запустите `docker compose up -d --build` и дождитесь `healthy`.
- Проверьте `/api/health`, главную, один сохранённый отчёт и логи миграций.

Для отката оставьте предыдущий image tag. SQL-миграции проектируются только
вперёд; откат данных выполняется из проверенного дампа.
