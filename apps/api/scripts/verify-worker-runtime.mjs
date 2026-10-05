import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..", "..");

const config = readFileSync(resolve(root, "src/config.ts"), "utf8");
const runtimeStatus = readFileSync(resolve(root, "src/runtime-status.ts"), "utf8");
const runtimeEntry = readFileSync(resolve(root, "src/runtime-entry.ts"), "utf8");
const workerMain = readFileSync(resolve(root, "src/worker-main.ts"), "utf8");
const outboxService = readFileSync(resolve(root, "src/modules/outbox/outbox.service.ts"), "utf8");
const outboxWorkerService = readFileSync(resolve(root, "src/modules/workers/outbox-worker.service.ts"), "utf8");
const workerRuntimeService = readFileSync(resolve(root, "src/modules/workers/outbox-queue-runtime.service.ts"), "utf8");
const dockerfile = readFileSync(resolve(root, "Dockerfile"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");
const openapi = readFileSync(resolve(repoRoot, "docs/api/openapi.yaml"), "utf8");

const checks = [
  ["config exposes APP_RUNTIME", config.includes("APP_RUNTIME")],
  ["runtime status exposes redis queue readiness", runtimeStatus.includes("redisQueueReady")],
  ["runtime entry switches between api and worker", runtimeEntry.includes('runtime === "worker"')],
  ["worker main exists", workerMain.includes("gopark-outbox-worker")],
  ["outbox service enqueues after create", outboxService.includes("enqueueEvent(event.id)")],
  ["workers endpoint supports queued mode", outboxWorkerService.includes('mode: "queued"')],
  ["worker runtime creates BullMQ worker", workerRuntimeService.includes("createOutboxWorker")],
  ["docker runtime starts runtime-entry", dockerfile.includes("runtime-entry.js")],
  ["api package includes bullmq", packageJson.includes('"bullmq"')],
  ["openapi includes outbox process route", openapi.includes("/api/workers/outbox/process:")],
];

const failures = checks.filter(([, ok]) => !ok).map(([label]) => label);

if (failures.length > 0) {
  console.error(`Worker runtime check failed: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("Worker runtime check passed.");
