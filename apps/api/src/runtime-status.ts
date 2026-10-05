import { getConfig } from "./config.js";
import { createRequire } from "node:module";
import { isAuthTokenSecretConfigured } from "./modules/auth/auth-token.util.js";

const require = createRequire(import.meta.url);

export interface RuntimeStatus {
  appRuntime: "api" | "worker";
  databaseUrlConfigured: boolean;
  prismaClientAvailable: boolean;
  prismaEnabled: boolean;
  redisConfigured: boolean;
  bullmqAvailable: boolean;
  redisQueueReady: boolean;
  authTokenSecretConfigured: boolean;
  bearerAuthReady: boolean;
  bootstrapAuthEnabled: boolean;
  inMemoryProductionAllowed: boolean;
  productionStartupSafe: boolean;
  mode: "prisma" | "in-memory";
}

function hasPrismaClient(): boolean {
  try {
    require.resolve("@prisma/client");
    return true;
  } catch {
    return false;
  }
}

function hasBullmqPackages(): boolean {
  try {
    require.resolve("bullmq");
    require.resolve("ioredis");
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeStatus(): RuntimeStatus {
  const config = getConfig();
  const databaseUrlConfigured = Boolean(config.databaseUrl);
  const prismaClientAvailable = hasPrismaClient();
  const prismaEnabled = databaseUrlConfigured && prismaClientAvailable;
  const redisConfigured = Boolean(config.redisUrl);
  const bullmqAvailable = hasBullmqPackages();
  const redisQueueReady = redisConfigured && bullmqAvailable;
  const authTokenSecretConfigured = isAuthTokenSecretConfigured();
  const bearerAuthReady = config.nodeEnv !== "production" || authTokenSecretConfigured;
  const bootstrapAuthEnabled = config.allowInsecureBootstrapAuth;
  const inMemoryProductionAllowed = config.allowInMemoryProduction;
  const productionStartupSafe =
    config.nodeEnv !== "production"
    || (
      bearerAuthReady
      && !bootstrapAuthEnabled
      && (prismaEnabled || inMemoryProductionAllowed)
      && (config.appRuntime !== "worker" || redisQueueReady)
    );

  return {
    appRuntime: config.appRuntime,
    databaseUrlConfigured,
    prismaClientAvailable,
    prismaEnabled,
    redisConfigured,
    bullmqAvailable,
    redisQueueReady,
    authTokenSecretConfigured,
    bearerAuthReady,
    bootstrapAuthEnabled,
    inMemoryProductionAllowed,
    productionStartupSafe,
    mode: prismaEnabled ? "prisma" : "in-memory",
  };
}
