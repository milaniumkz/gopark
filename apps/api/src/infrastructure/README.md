# Infrastructure Layer

This layer is prepared for production database integration.

Current status:

- `PrismaService` exists as an integration seam
- Prisma repository adapters are declared
- application services can switch between in-memory and Prisma repositories

What is still required:

- install `prisma` and `@prisma/client`
- generate the Prisma client
- apply SQL migrations from `database/migrations/`
- run `pnpm --filter @gopark/api db:seed` to bootstrap `settings`, `manager_alerts`, `quick_actions`, and hashed users
- wire transactions for financial write flows
