import "reflect-metadata";
import { pathToFileURL } from "node:url";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { getConfig } from "./config.js";
import { BasicValidationPipe } from "./common/pipes/basic-validation.pipe.js";
import { getRuntimeStatus } from "./runtime-status.js";
import { assertProductionRuntimeSafety } from "./runtime-guards.js";
import { registerRequestTracing } from "./request-tracing.js";

export async function bootstrapApi() {
  const config = getConfig();
  const runtime = getRuntimeStatus();
  assertProductionRuntimeSafety(config, runtime);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  app.useBodyParser("json", { limit: "6mb" });
  app.useBodyParser("urlencoded", { limit: "6mb", extended: true });
  app.setGlobalPrefix(config.apiPrefix);
  app.useGlobalPipes(new BasicValidationPipe());
  registerRequestTracing(app, config);

  await app.listen(config.port);
  console.log(
    `[gopark-api] listening on port ${config.port} with prefix /${config.apiPrefix} in ${runtime.mode} mode; bootstrapAuth=${runtime.bootstrapAuthEnabled ? "enabled" : "disabled"}`,
  );
}

const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void bootstrapApi();
}
