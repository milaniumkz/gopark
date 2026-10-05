import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

const authTokenUtil = readFileSync(resolve(repoRoot, "apps/api/src/modules/auth/auth-token.util.ts"), "utf8");
const authService = readFileSync(resolve(repoRoot, "apps/api/src/modules/auth/auth.service.ts"), "utf8");
const authController = readFileSync(resolve(repoRoot, "apps/api/src/modules/auth/auth.controller.ts"), "utf8");
const allowlist = readFileSync(resolve(repoRoot, "apps/api/scripts/public-route-allowlist.mjs"), "utf8");
const openapi = readFileSync(resolve(repoRoot, "docs/api/openapi.yaml"), "utf8");
const crmAuth = readFileSync(resolve(repoRoot, "apps/crm-web/src/lib/auth.ts"), "utf8");
const driverApi = readFileSync(resolve(repoRoot, "apps/driver-app/lib/api.dart"), "utf8");
const managerApi = readFileSync(resolve(repoRoot, "apps/manager-app/lib/api.dart"), "utf8");

const errors = [];

if (!authTokenUtil.includes("sessionVersion")) {
  errors.push("auth-token.util.ts does not encode refresh sessionVersion");
}

if (!authService.includes("findByRequestPrincipal")) {
  errors.push("auth.service.ts does not resolve refresh tokens through request principal mapping");
}

if (!authService.includes("rotateRefreshSession")) {
  errors.push("auth.service.ts does not rotate refresh sessions");
}

if (!authService.includes("revokeRefreshSession")) {
  errors.push("auth.service.ts does not revoke refresh sessions");
}

if (!authController.includes('@Post("logout")')) {
  errors.push("auth.controller.ts does not expose POST /auth/logout");
}

if (!allowlist.includes('/api/auth/logout')) {
  errors.push("public-route-allowlist.mjs does not include /api/auth/logout");
}

if (!openapi.includes("/api/auth/logout:")) {
  errors.push("docs/api/openapi.yaml does not include /api/auth/logout");
}

if (!crmAuth.includes('buildUrl("auth/logout")')) {
  errors.push("apps/crm-web/src/lib/auth.ts does not call /api/auth/logout");
}

if (!driverApi.includes("Uri.parse('$baseUrl/auth/logout')")) {
  errors.push("apps/driver-app/lib/api.dart does not call /auth/logout");
}

if (!managerApi.includes("Uri.parse('$baseUrl/auth/logout')")) {
  errors.push("apps/manager-app/lib/api.dart does not call /auth/logout");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Auth session hardening check passed.");
