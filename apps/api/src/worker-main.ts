import "reflect-metadata";
import { createServer } from "node:http";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { getConfig } from "./config.js";
import { getRuntimeStatus } from "./runtime-status.js";
import { assertProductionRuntimeSafety } from "./runtime-guards.js";
import { OutboxQueueRuntimeService } from "./modules/workers/outbox-queue-runtime.service.js";

export async function bootstrapWorker(): Promise<void> {
  const config = getConfig();
  const runtime = getRuntimeStatus();
  assertProductionRuntimeSafety(config, runtime);

  const app = await NestFactory.createApplicationContext(AppModule);
  const outboxQueueRuntimeService = app.get(OutboxQueueRuntimeService);
  await outboxQueueRuntimeService.start();

  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        service: "gopark-outbox-worker",
        appRuntime: runtime.appRuntime,
        mode: runtime.mode,
        prismaEnabled: runtime.prismaEnabled,
        redisQueueReady: runtime.redisQueueReady,
      }));
      return;
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end("gopark-outbox-worker");
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, resolve);
  });

  const shutdown = async () => {
    await outboxQueueRuntimeService.stop();
    await app.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });

  console.log(
    `[gopark-outbox-worker] listening on port ${config.port} in ${runtime.mode} mode; redisQueueReady=${runtime.redisQueueReady ? "yes" : "no"}`,
  );
}
