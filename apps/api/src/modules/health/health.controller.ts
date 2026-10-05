import { Controller, Get } from "@nestjs/common";
import type { ApiHealthStatus } from "@gopark/contracts";
import { getRuntimeStatus } from "../../runtime-status.js";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): ApiHealthStatus {
    const runtime = getRuntimeStatus();

    return {
      status: "ok",
      service: "gopark-api",
      appRuntime: runtime.appRuntime,
      mode: runtime.mode,
      prismaEnabled: runtime.prismaEnabled,
      databaseUrlConfigured: runtime.databaseUrlConfigured,
      prismaClientAvailable: runtime.prismaClientAvailable,
      redisConfigured: runtime.redisConfigured,
      bullmqAvailable: runtime.bullmqAvailable,
      redisQueueReady: runtime.redisQueueReady,
      authTokenSecretConfigured: runtime.authTokenSecretConfigured,
      bearerAuthReady: runtime.bearerAuthReady,
      bootstrapAuthEnabled: runtime.bootstrapAuthEnabled,
      inMemoryProductionAllowed: runtime.inMemoryProductionAllowed,
      productionStartupSafe: runtime.productionStartupSafe,
    };
  }
}
