отвечай коротко и понятно

Всегда применяй навык `limit-efficient-quality`: максимально экономь лимиты токенов, инструментов, времени и контекста, но не снижай качество результата.

## Проект

GoPark - монорепозиторий:
- `apps/api` - NestJS API, Prisma, PostgreSQL, Redis/BullMQ worker.
- `apps/crm-web` - React/Vite CRM.
- `apps/driver-app` - Flutter приложение водителя.
- `apps/manager-app` - Flutter приложение бригадира.
- `packages/contracts` - общие TypeScript DTO/типы.

## Основные команды

- Установка: `corepack enable && corepack pnpm install --frozen-lockfile`
- API typecheck: `corepack pnpm --filter @gopark/api typecheck`
- CRM typecheck: `corepack pnpm --filter @gopark/crm-web typecheck`
- CRM build: `corepack pnpm --filter @gopark/crm-web build`
- Contracts build: `corepack pnpm --filter @gopark/contracts build`
- Flutter analyze: `flutter analyze` внутри `apps/driver-app` и `apps/manager-app`

## Правила

- Не коммитить `.env`, ключи, service account JSON, APK/IPA/AAB, build/dist/node_modules/Pods.
- Не чистить production базу без прямой команды пользователя.
- Перед production deploy делать backup БД и конфигурации.
- Production работает на сервере через Docker Compose `docker-compose.server.yml`.
- БД и пользовательские файлы живут на сервере в Docker volumes и `/home/client/gopark/secrets`; деплой кода их не удаляет.
- Миграции выполнять только совместимые; destructive миграции согласовывать отдельно.
