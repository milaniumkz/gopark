# Cloud workflow

## GitHub

Репозиторий приватный. Основная ветка: `main`.

Рабочий порядок:
1. Создать ветку от `main`.
2. Внести изменения.
3. Открыть Pull Request.
4. Дождаться CI.
5. После merge в `main` GitHub Actions деплоит проверенный commit на сервер.

## Codex Cloud

Открыть репозиторий в Codex Cloud и использовать стандартную среду:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @gopark/api typecheck
corepack pnpm --filter @gopark/crm-web typecheck
corepack pnpm --filter @gopark/crm-web build
```

Для Flutter задач:

```bash
cd apps/driver-app && flutter pub get && flutter analyze
cd ../manager-app && flutter pub get && flutter analyze
```

## Production deploy

Production сервер: `185.138.185.36`.

GitHub Actions:
- `ci.yml` - проверки на PR/push.
- `deploy.yml` - автоматический deploy после успешного push в `main`, плюс ручной запуск.
- `server-ops.yml` - ручные операции: status, logs, restart, rollback.

Данные не входят в репозиторий:
- PostgreSQL volume: `gopark_postgres_data`
- Redis volume: `gopark_redis_data`
- production env: `/home/client/gopark/.env`
- Firebase service account: `/home/client/gopark/secrets/`
- backups: `/home/client/backups`

Перед деплоем workflow создаёт backup:
- `/home/client/backups/gopark-ci-<sha>.sql.gz`
- `/home/client/backups/gopark-env-<sha>.tgz`

## Rollback

Через GitHub Actions `server-ops.yml` выбрать:
- `operation=rollback`
- `rollback_sha=<короткий или полный SHA release-папки>`

Rollback переключает Docker Compose на сохранённую release-папку. База автоматически назад не откатывается.

## Локальная синхронизация

```bash
git checkout main
git pull --ff-only
corepack pnpm install --frozen-lockfile
```
