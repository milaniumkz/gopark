import { getConfig } from "./config.js";
import { bootstrapApi } from "./main.js";
import { bootstrapWorker } from "./worker-main.js";

const runtime = getConfig().appRuntime;

if (runtime === "worker") {
  void bootstrapWorker();
} else {
  void bootstrapApi();
}
