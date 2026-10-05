# Production Transition Notes

Current backend state:

- modular controllers and services exist
- repository factory supports both `in-memory` and `prisma` runtime modes
- Prisma repositories exist for the main operational read/write paths
- Prisma schema and SQL migrations exist for the current backend surface
- shared mobile read facade is wired into driver and manager mobile modules

Next replacement path:

1. install dependencies and generate Prisma client in the target environment
2. apply migrations and bootstrap Prisma data
3. run typecheck and tests with real dependencies available
4. replace bootstrap header-based identity with JWT-based auth
5. expand transactional flows, async workers, and validation hardening
