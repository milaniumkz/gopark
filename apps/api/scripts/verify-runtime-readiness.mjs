import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const configEnvKeys = [
  "NODE_ENV",
  "APP_RUNTIME",
  "PORT",
  "API_PREFIX",
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_TOKEN_SECRET",
  "AUTH_LOGIN_RATE_LIMIT_ATTEMPTS",
  "AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS",
  "AUTH_REFRESH_RATE_LIMIT_ATTEMPTS",
  "AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS",
  "AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS",
  "AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS",
  "ALLOW_INSECURE_BOOTSTRAP_AUTH",
  "ALLOW_IN_MEMORY_PRODUCTION",
  "HTTP_REQUEST_LOGGING",
];

function hasPackage(name) {
  try {
    require.resolve(name, { paths: [root] });
    return true;
  } catch {
    return false;
  }
}

function listSqlMigrations() {
  const migrationsDir = resolve(root, "database/migrations");
  if (!existsSync(migrationsDir)) {
    return [];
  }

  return readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();
}

function parseEnvExampleKeys(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0]?.trim())
    .filter(Boolean);
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

const checks = {
  databaseUrl: Boolean(process.env.DATABASE_URL),
  redisUrl: Boolean(process.env.REDIS_URL),
  authTokenSecret: Boolean(process.env.AUTH_TOKEN_SECRET),
  prismaClient: hasPackage("@prisma/client"),
  prismaCli: hasPackage("prisma"),
  bullmq: hasPackage("bullmq"),
  ioredis: hasPackage("ioredis"),
  tsNode: hasPackage("ts-node"),
  typescript: hasPackage("typescript"),
  schema: existsSync(resolve(root, "prisma/schema.prisma")),
  seedScript: existsSync(resolve(root, "scripts/bootstrap-prisma.mjs")),
  testScript: existsSync(resolve(root, "src/modules/mobile-read/driver-mobile-read.service.test.ts")),
  envExample: existsSync(resolve(root, ".env.example")),
};

const nodeEnv = process.env.NODE_ENV ?? "development";
const bootstrapAuthEnabled = readBooleanEnv("ALLOW_INSECURE_BOOTSTRAP_AUTH", nodeEnv !== "production");
const inMemoryProductionAllowed = readBooleanEnv("ALLOW_IN_MEMORY_PRODUCTION", false);
const httpRequestLogging = readBooleanEnv("HTTP_REQUEST_LOGGING", true);
const envExampleKeys = parseEnvExampleKeys(resolve(root, ".env.example"));
const missingEnvExampleKeys = configEnvKeys.filter((key) => !envExampleKeys.includes(key));

const migrations = listSqlMigrations();
const readyForBaseApiStartup =
  checks.schema;
const readyForPrismaRuntime =
  checks.databaseUrl &&
  checks.prismaClient &&
  checks.prismaCli &&
  checks.schema;
const readyForTypecheckAndTests =
  checks.tsNode &&
  checks.typescript;
const productionStartupSafe =
  nodeEnv !== "production" ||
  (!bootstrapAuthEnabled && (readyForPrismaRuntime || inMemoryProductionAllowed));

console.log(JSON.stringify({
  checks,
  runtime: {
    nodeEnv,
    bootstrapAuthEnabled,
    inMemoryProductionAllowed,
    httpRequestLogging,
    productionStartupSafe,
  },
  envExampleKeys,
  missingEnvExampleKeys,
  migrations,
  readyForBaseApiStartup,
  readyForPrismaRuntime,
  readyForTypecheckAndTests,
  nextSteps: [
    !checks.envExample ? "Add apps/api/.env.example for runtime onboarding" : null,
    missingEnvExampleKeys.length > 0
      ? `Add missing variables to apps/api/.env.example: ${missingEnvExampleKeys.join(", ")}`
      : null,
    !checks.databaseUrl ? "Set DATABASE_URL to enable Prisma-backed runtime" : null,
    !checks.redisUrl ? "Set REDIS_URL to enable BullMQ-backed worker runtime" : null,
    !checks.authTokenSecret ? "Set AUTH_TOKEN_SECRET to enable stable bearer auth outside local fallback mode" : null,
    !checks.prismaClient ? "Install @prisma/client" : null,
    !checks.prismaCli ? "Install prisma" : null,
    !checks.bullmq ? "Install bullmq" : null,
    !checks.ioredis ? "Install ioredis" : null,
    !checks.tsNode ? "Install ts-node" : null,
    !checks.typescript ? "Install typescript" : null,
    nodeEnv === "production" && bootstrapAuthEnabled
      ? "Disable ALLOW_INSECURE_BOOTSTRAP_AUTH for production startup safety"
      : null,
    nodeEnv === "production" && !readyForPrismaRuntime && !inMemoryProductionAllowed
      ? "Production runtime requires Prisma-backed mode unless ALLOW_IN_MEMORY_PRODUCTION is explicitly enabled"
      : null,
    readyForBaseApiStartup ? "Base API can start in in-memory mode" : null,
    readyForPrismaRuntime ? "Run: pnpm --filter @gopark/api db:generate" : null,
    readyForPrismaRuntime ? "Apply SQL migrations from apps/api/database/migrations" : null,
    readyForPrismaRuntime ? "Run: pnpm --filter @gopark/api db:seed" : null,
    readyForTypecheckAndTests ? "Run: pnpm --filter @gopark/api typecheck" : null,
    readyForTypecheckAndTests ? "Run: pnpm --filter @gopark/api test" : null,
  ].filter(Boolean),
}, null, 2));
