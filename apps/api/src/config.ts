export interface AppConfig {
  appRuntime: "api" | "worker";
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  databaseUrl: string | null;
  redisUrl: string | null;
  authTokenSecret: string | null;
  authLoginRateLimitAttempts: number;
  authLoginRateLimitWindowSeconds: number;
  authLoginRateLimitBlockSeconds: number;
  authRefreshRateLimitAttempts: number;
  authRefreshRateLimitWindowSeconds: number;
  authRefreshRateLimitBlockSeconds: number;
  authLogoutRateLimitAttempts: number;
  authLogoutRateLimitWindowSeconds: number;
  authLogoutRateLimitBlockSeconds: number;
  allowInsecureBootstrapAuth: boolean;
  allowInMemoryProduction: boolean;
  httpRequestLogging: boolean;
}

function readString(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function readOptionalString(name: string): string | null {
  return process.env[name] ?? null;
}

function readBoolean(name: string, fallback: boolean): boolean {
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

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];

  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer environment variable: ${name}`);
  }

  return parsed;
}

function readAppRuntime(name: string, fallback: "api" | "worker"): "api" | "worker" {
  const value = process.env[name];

  if (value == null || value === "") {
    return fallback;
  }

  if (value === "api" || value === "worker") {
    return value;
  }

  throw new Error(`Invalid app runtime environment variable: ${name}`);
}

export function getConfig(): AppConfig {
  const nodeEnv = readString("NODE_ENV", "development");

  return {
    appRuntime: readAppRuntime("APP_RUNTIME", "api"),
    nodeEnv,
    port: Number(readString("PORT", "3000")),
    apiPrefix: readString("API_PREFIX", "api"),
    databaseUrl: readOptionalString("DATABASE_URL"),
    redisUrl: readOptionalString("REDIS_URL"),
    authTokenSecret: readOptionalString("AUTH_TOKEN_SECRET"),
    authLoginRateLimitAttempts: readPositiveInteger("AUTH_LOGIN_RATE_LIMIT_ATTEMPTS", 5),
    authLoginRateLimitWindowSeconds: readPositiveInteger("AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS", 900),
    authLoginRateLimitBlockSeconds: readPositiveInteger("AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS", 1800),
    authRefreshRateLimitAttempts: readPositiveInteger("AUTH_REFRESH_RATE_LIMIT_ATTEMPTS", 30),
    authRefreshRateLimitWindowSeconds: readPositiveInteger("AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS", 900),
    authRefreshRateLimitBlockSeconds: readPositiveInteger("AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS", 900),
    authLogoutRateLimitAttempts: readPositiveInteger("AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS", 30),
    authLogoutRateLimitWindowSeconds: readPositiveInteger("AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS", 900),
    authLogoutRateLimitBlockSeconds: readPositiveInteger("AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS", 900),
    allowInsecureBootstrapAuth: readBoolean("ALLOW_INSECURE_BOOTSTRAP_AUTH", nodeEnv !== "production"),
    allowInMemoryProduction: readBoolean("ALLOW_IN_MEMORY_PRODUCTION", false),
    httpRequestLogging: readBoolean("HTTP_REQUEST_LOGGING", true),
  };
}
