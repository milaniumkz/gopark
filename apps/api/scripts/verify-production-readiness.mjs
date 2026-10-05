import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..", "..");

function hasPackage(name) {
  try {
    require.resolve(name, { paths: [root] });
    return true;
  } catch {
    return false;
  }
}

function readBooleanEnv(name, fallback) {
  const value = process.env[name];

  if (value == null || value === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${name}`);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const bootstrapAuthEnabled = readBooleanEnv("ALLOW_INSECURE_BOOTSTRAP_AUTH", nodeEnv !== "production");
const inMemoryProductionAllowed = readBooleanEnv("ALLOW_IN_MEMORY_PRODUCTION", false);
const prismaRuntimeReady =
  Boolean(process.env.DATABASE_URL) &&
  hasPackage("@prisma/client") &&
  hasPackage("prisma") &&
  existsSync(resolve(root, "prisma/schema.prisma"));
const redisWorkerRuntimeReady =
  Boolean(process.env.REDIS_URL) &&
  hasPackage("bullmq") &&
  hasPackage("ioredis") &&
  existsSync(resolve(root, "src/worker-main.ts"));

const checks = {
  productionEnv: nodeEnv === "production",
  prismaRuntimeReady,
  redisWorkerRuntimeReady,
  authTokenSecretConfigured: Boolean(process.env.AUTH_TOKEN_SECRET),
  bootstrapAuthDisabled: !bootstrapAuthEnabled,
  inMemoryProductionBlocked: !inMemoryProductionAllowed,
  requestTracingEnabled: existsSync(resolve(root, "src/request-tracing.ts")),
  productionPlanDoc: existsSync(resolve(repoRoot, "docs/production-plan.md")),
  secureTokenAuthImplemented:
    existsSync(resolve(root, "src/modules/auth/auth-token.util.ts")) &&
    readFileSync(resolve(root, "src/modules/rbac/request-user.guard.ts"), "utf8").includes("authorization") &&
    readFileSync(resolve(root, "src/modules/auth/auth.controller.ts"), "utf8").includes('@Post("refresh")'),
  refreshSessionHardeningImplemented:
    readFileSync(resolve(root, "src/modules/auth/auth-token.util.ts"), "utf8").includes("sessionVersion") &&
    readFileSync(resolve(root, "src/modules/auth/auth.controller.ts"), "utf8").includes('@Post("logout")') &&
    readFileSync(resolve(root, "src/modules/auth/auth.service.ts"), "utf8").includes("rotateRefreshSession") &&
    readFileSync(resolve(root, "src/modules/auth/auth.service.ts"), "utf8").includes("revokeRefreshSession"),
  authRateLimitingImplemented:
    existsSync(resolve(root, "src/modules/auth/auth-rate-limit.service.ts")) &&
    readFileSync(resolve(root, "src/modules/auth/auth.controller.ts"), "utf8").includes("consumeRefreshAttempt") &&
    readFileSync(resolve(root, "src/modules/auth/auth.controller.ts"), "utf8").includes("registerLoginFailure") &&
    readFileSync(resolve(root, "prisma/schema.prisma"), "utf8").includes("model AuthRateLimit"),
  workerRuntimeImplemented:
    readFileSync(resolve(root, "src/runtime-entry.ts"), "utf8").includes('runtime === "worker"') &&
    readFileSync(resolve(root, "src/modules/outbox/outbox.service.ts"), "utf8").includes("enqueueEvent(event.id)") &&
    readFileSync(resolve(root, "Dockerfile"), "utf8").includes("runtime-entry.js"),
};

const blockers = [
  !checks.productionEnv ? "NODE_ENV is not production" : null,
  !checks.prismaRuntimeReady ? "Prisma-backed production runtime is not ready" : null,
  !checks.redisWorkerRuntimeReady ? "Redis/BullMQ-backed worker runtime is not ready" : null,
  !checks.authTokenSecretConfigured ? "AUTH_TOKEN_SECRET is not configured" : null,
  !checks.bootstrapAuthDisabled ? "Bootstrap header auth is still enabled" : null,
  !checks.inMemoryProductionBlocked ? "ALLOW_IN_MEMORY_PRODUCTION override is enabled" : null,
  !checks.requestTracingEnabled ? "HTTP request tracing middleware is not wired" : null,
  !checks.productionPlanDoc ? "docs/production-plan.md is missing" : null,
  !checks.secureTokenAuthImplemented ? "Bearer access/refresh auth is not fully wired yet" : null,
  !checks.refreshSessionHardeningImplemented ? "Refresh rotation and logout revocation are not fully wired yet" : null,
  !checks.authRateLimitingImplemented ? "Auth endpoint rate limiting is not fully wired yet" : null,
  !checks.workerRuntimeImplemented ? "BullMQ worker runtime is not fully wired yet" : null,
].filter(Boolean);

const readyForProductionRuntime = blockers.length === 0;

console.log(JSON.stringify({
  checks,
  readyForProductionRuntime,
  blockers,
}, null, 2));

process.exit(readyForProductionRuntime ? 0 : 1);
