import type { AppConfig } from "./config.js";
import type { RuntimeStatus } from "./runtime-status.js";

export function assertProductionRuntimeSafety(config: AppConfig, runtime: RuntimeStatus): void {
  if (config.nodeEnv !== "production") {
    return;
  }

  const errors: string[] = [];

  if (runtime.bootstrapAuthEnabled) {
    errors.push(
      "bootstrap header auth is still enabled; disable ALLOW_INSECURE_BOOTSTRAP_AUTH before production rollout",
    );
  }

  if (!runtime.bearerAuthReady) {
    errors.push(
      "bearer auth is not ready; configure AUTH_TOKEN_SECRET before production rollout",
    );
  }

  if (runtime.mode === "in-memory" && !runtime.inMemoryProductionAllowed) {
    errors.push(
      "in-memory runtime is not allowed in production; configure DATABASE_URL and Prisma runtime or explicitly set ALLOW_IN_MEMORY_PRODUCTION=true as a temporary override",
    );
  }

  if (config.appRuntime === "worker" && !runtime.redisQueueReady) {
    errors.push(
      "worker runtime requires REDIS_URL and BullMQ/ioredis runtime readiness before production rollout",
    );
  }

  if (errors.length === 0) {
    return;
  }

  throw new Error(`Unsafe production runtime configuration:\n- ${errors.join("\n- ")}`);
}
