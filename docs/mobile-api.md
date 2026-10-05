# Mobile API Surface

## Driver

- `GET /api/mobile/driver/:driverId/home-summary`
- `GET /api/mobile/driver/:driverId/profile-summary`
- `GET /api/mobile/driver/:driverId/debt-summary`
- `GET /api/mobile/driver/:driverId/contract`
- `GET /api/mobile/driver/:driverId/payouts`
- `POST /api/mobile/driver/:driverId/payouts`
- `GET /api/mobile/driver/:driverId/status-requests`
- `POST /api/mobile/driver/:driverId/status-requests`
- `GET /api/mobile/driver/:driverId/payment-schedule`

## Manager

- `GET /api/mobile/manager/summary`
- `GET /api/mobile/manager/drivers`
- `GET /api/mobile/manager/drivers/:driverId`
- `GET /api/mobile/manager/alerts`
- `GET /api/mobile/manager/quick-actions`
- `POST /api/mobile/manager/quick-actions/execute`
- `GET /api/mobile/manager/incidents`

## Purpose

These routes are the API seam for Flutter applications.
Later they should be backed by the same domain services and repositories as CRM,
with scope checks for manager and self-access checks for driver.

## Runtime Notes

- Mobile read routes are backed by a shared `DriverMobileReadService`.
- Flutter bootstrap clients now call `POST /api/auth/login` first and then reuse
  `requestUserId` / `requestUserRole` from the login response as mobile auth headers.
- Driver app accepts only login responses with `requestUserRole=driver`.
- Manager app accepts only login responses with `requestUserRole=manager`.
- Current Flutter apps keep the auth session only in memory:
  - login screen on startup
  - logout clears the in-memory session
  - app restart requires a new login
- Mobile route scope is enforced by `MobileAccessService`:
  - `driver` can access only `:driverId` equal to the bootstrap `x-user-id`
  - `manager` can access only drivers whose `managerId` matches the bootstrap `x-user-id`
  - `manager` alerts and quick actions are filtered by the same `managerId` scope
  - `owner`, `admin`, and `finance` keep cross-driver access
- In bootstrap mode, mobile self/scope checks therefore expect domain ids like `drv_*` and `mgr_*` in `x-user-id`, not auth user ids like `usr_*`.
- Backend can serve these routes in two modes:
  - `in-memory` mode without Prisma runtime
  - `prisma` mode when `DATABASE_URL` and `@prisma/client` are available
- Runtime mode is exposed by `GET /api/health`.
