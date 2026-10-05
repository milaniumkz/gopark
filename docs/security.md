# API Security Notes

## Current state

- request user is resolved primarily from `Authorization: Bearer <accessToken>`
- access and refresh tokens are issued by:
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
- auth endpoints are now rate-limited server-side:
  - `login` is blocked by both client IP and normalized login identifier after repeated failures
  - `refresh` is rate-limited by client IP
  - `logout` is rate-limited by client IP
  - auth rate-limit keys are stored hashed in persistence
- outbox delivery has moved away from inline-only processing:
  - API writes outbox rows and can enqueue them into BullMQ
  - a dedicated `APP_RUNTIME=worker` runtime consumes queue jobs
  - failed outbox deliveries can end in `failed` instead of silently staying `pending`
- refresh tokens are now stateful on the server side:
  - login issues a new refresh session version
  - refresh rotates that session version
  - logout revokes the active refresh session version
- bootstrap header auth remains only as a non-production fallback:
  - `x-user-id`
  - `x-role`
- bootstrap header auth is now explicitly environment-gated:
  - it defaults to enabled in non-production environments
  - it defaults to disabled in `production`
  - API startup fails fast if `production` is combined with insecure bootstrap auth
- production startup also fails fast if API would otherwise run in `in-memory` mode, unless an explicit temporary override is set
- protected routes accept bearer tokens first and only fall back to bootstrap headers when insecure bootstrap auth is enabled
- role checks are enforced through `@Roles(...)`
- approval actors are derived from the resolved request user, not trusted from request payload fields
- mobile self/scope checks use the resolved request user directly:
  - `driver` routes expect the resolved principal id to match the requested `driverId`
  - `manager` mobile scope expects the resolved principal id to match `driver.managerId`
- basic body validation rejects empty string and undefined fields
- login lookup is separated from password verification
- login now returns explicit principal mapping:
  - `requestUserId`
  - `requestUserRole`
- Flutter mobile clients use the returned `accessToken` for authenticated requests and keep
  `requestUserId` / `requestUserRole` only for local role binding and scoped route params.
- Flutter clients also enforce app-specific role binding on login:
  - driver app requires `requestUserRole=driver`
  - manager app requires `requestUserRole=manager`
- CRM web also uses `POST /api/auth/login`, stores the returned session in `localStorage`,
  and reuses `accessToken` for authenticated requests.
- CRM web accepts only web-facing roles on login:
  - `owner`
  - `admin`
  - `finance`
  - `manager`
  - `operator`
  - `auditor`
- CRM navigation and route rendering are also gated client-side against the current role,
  so the web shell does not offer sections that backend RBAC would reject anyway.
- CRM page-level mutations are gated separately from read access, so create/approve/process
  actions are hidden when the current role does not match backend mutation permissions.
- When CRM falls back to read-only behavior for a page, it now renders explicit role notices
  instead of leaving the user with silently missing actions.
- CRM list and workflow screens also provide contextual empty states so role-scoped users see
  what is missing and whether they can act on it from the current section.
- CRM detail and registry-read screens also avoid generic empty responses: missing entities and empty registries
  now explain what was not found and where the operator should navigate next.
- CRM dashboard and detail cards expose only role-safe contextual links, so lateral navigation between
  related entities follows the same client-side RBAC rules as the main route shell.
- CRM dashboard quick actions are also capability-bound, so the entry points shown on the first screen
  match the operations the current role can actually initiate.
- The dashboard export entry now follows the same role gating: only roles with access to reports see
  the reports/export CTA, while others get an explicit read-only notice instead of a dead button.
- Read-only CRM surfaces such as reports, incidents, notifications, and audit now also use
  contextual empty states, so operators are not left with generic placeholders on empty data sets.
- CRM copy for API-backed pages is also kept in sync with actual behavior, so operators are not shown
  future-tense placeholders on screens that already execute real backend flows.
- Reports export is client-side and bounded to the already loaded reports snapshot; it does not bypass
  backend role checks or fetch hidden data beyond what the current role can read from `reports/overview`.
- Ledger export follows the same model: the CSV is built only from the already loaded `ledger/entries`
  snapshot and does not bypass backend access control.
- Audit export follows the same rule set: the CSV is built only from the already loaded `audit/logs`
  snapshot and does not bypass backend access control.
- Notifications export follows the same rule set: the CSV is built only from the already loaded
  `notifications` snapshot and does not bypass backend access control.
- Incidents export follows the same rule set: the CSV is built only from the already loaded
  `incidents` snapshot and does not bypass backend access control.
- Users export follows the same rule set: the CSV is built only from the already loaded
  `users` snapshot and does not bypass backend access control.
- Payments export follows the same rule set: the CSV is built only from the already loaded
  `payments` snapshot and does not bypass backend access control.
- Payouts export follows the same rule set: the CSV is built only from the already loaded
  `payouts` snapshot and does not bypass backend access control.
- Contracts export follows the same rule set: the CSV is built only from the already loaded
  `contracts` snapshot and does not bypass backend access control.
- Drivers export follows the same rule set: the CSV is built only from the already loaded
  and already filtered `drivers` snapshot and does not bypass backend access control.
- Vehicles export follows the same rule set: the CSV is built only from the already loaded
  and already filtered `cars` snapshot and does not bypass backend access control.
- Driver detail export follows the same rule set: the CSV is built only from the already loaded
  `drivers/:id` snapshot and does not bypass backend access control.
- Vehicle detail export follows the same rule set: the CSV is built only from the already loaded
  `cars/:id` snapshot and does not bypass backend access control.
- Contract detail export follows the same rule set: the CSV is built only from the already loaded
  `contracts/:id` snapshot and does not bypass backend access control.
- Dashboard overview export follows the same rule set: the CSV is built only from the already loaded
  `dashboard/overview` snapshot for the selected period and does not bypass backend access control.
- Outbox export follows the same rule set: the CSV is built only from the already loaded
  `outbox` snapshot and does not bypass backend access control.
- Current Flutter clients do not persist auth between launches yet; session lives only in memory.
- password verification supports:
  - legacy seed plain-text passwords
  - plain string fallback in `passwordHash`
  - `scrypt$N$r$p$salt$hash` format for bootstrapped Prisma users

## Temporary behavior

Bearer auth is wired for access and refresh tokens. Bootstrap headers remain only as a temporary non-production fallback until all deployed environments run with `ALLOW_INSECURE_BOOTSTRAP_AUTH=false`.

## Next production step

1. enforce MFA on sensitive roles
2. add request DTO validation with class-validator or zod
3. remove legacy plain-text password compatibility after all users are migrated to hashed credentials
4. add dead-letter queue and provider-specific retry policies
