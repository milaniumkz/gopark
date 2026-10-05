import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..", "..");

const authController = readFileSync(resolve(root, "src/modules/auth/auth.controller.ts"), "utf8");
const authRateLimitService = readFileSync(resolve(root, "src/modules/auth/auth-rate-limit.service.ts"), "utf8");
const authModule = readFileSync(resolve(root, "src/modules/auth/auth.module.ts"), "utf8");
const config = readFileSync(resolve(root, "src/config.ts"), "utf8");
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const openapi = readFileSync(resolve(repoRoot, "docs/api/openapi.yaml"), "utf8");
const securityDoc = readFileSync(resolve(repoRoot, "docs/security.md"), "utf8");

const checks = [
  ["auth controller uses rate limit service", authController.includes("AuthRateLimitService")],
  ["login flow registers failed attempts", authController.includes("registerLoginFailure")],
  ["refresh flow consumes rate-limited attempts", authController.includes("consumeRefreshAttempt")],
  ["logout flow consumes rate-limited attempts", authController.includes("consumeLogoutAttempt")],
  ["auth module provides auth rate limit service", authModule.includes("AuthRateLimitService")],
  ["auth rate limit service hashes rate-limit keys", authRateLimitService.includes("createHash")],
  ["auth rate limit service throws HTTP 429", authRateLimitService.includes("HttpStatus.TOO_MANY_REQUESTS")],
  ["config exposes auth login rate limit env", config.includes("AUTH_LOGIN_RATE_LIMIT_ATTEMPTS")],
  ["config exposes auth refresh rate limit env", config.includes("AUTH_REFRESH_RATE_LIMIT_ATTEMPTS")],
  ["config exposes auth logout rate limit env", config.includes("AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS")],
  ["prisma schema includes auth rate limit model", schema.includes("model AuthRateLimit")],
  ["openapi documents 429 for auth login", openapi.includes('/api/auth/login:') && openapi.includes('"429":')],
  ["security doc mentions auth endpoint rate limiting", securityDoc.includes("rate-limited")],
];

const failures = checks.filter(([, ok]) => !ok).map(([label]) => label);

if (failures.length > 0) {
  console.error(`Auth rate limiting check failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("Auth rate limiting check passed.");
