import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { AppConfig } from "./config.js";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  originalUrl?: string;
  url?: string;
};

type ResponseLike = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  on(event: "finish", listener: () => void): void;
};

export function registerRequestTracing(app: INestApplication, config: AppConfig): void {
  app.use((request: RequestLike, response: ResponseLike, next: () => void) => {
    const incomingHeader = request.headers["x-request-id"];
    const requestId = typeof incomingHeader === "string" && incomingHeader.trim().length > 0
      ? incomingHeader.trim()
      : randomUUID();
    const startedAt = Date.now();

    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      if (!config.httpRequestLogging) {
        return;
      }

      const url = request.originalUrl ?? request.url ?? "";
      const durationMs = Date.now() - startedAt;
      console.log(
        `[gopark-api] ${requestId} ${request.method} ${url} -> ${response.statusCode} ${durationMs}ms`,
      );
    });

    next();
  });
}
