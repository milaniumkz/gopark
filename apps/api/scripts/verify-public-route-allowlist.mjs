import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { publicRouteAllowlist } from "./public-route-allowlist.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const modulesDir = path.join(repoRoot, "apps", "api", "src", "modules");
const openApiPath = path.join(repoRoot, "docs", "api", "openapi.yaml");

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function extractControllerKeys(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const keys = [];

  for (const line of lines) {
    const routeMatch = line.trim().match(/^@(Get|Post|Patch|Delete)\((?:"([^"]*)")?\)/);
    if (!routeMatch) {
      continue;
    }
    keys.push(`${path.basename(filePath)}#${routeMatch[1].toUpperCase()} ${routeMatch[2] ?? ""}`);
  }

  return keys;
}

function extractOpenApiPaths(filePath) {
  const text = readFileSync(filePath, "utf8");
  return [...text.matchAll(/^  (\/api\/[^:]+):/gm)].map((match) => match[1]);
}

const controllerKeys = new Set(
  walk(modulesDir)
    .filter((filePath) => filePath.endsWith(".controller.ts"))
    .flatMap(extractControllerKeys),
);
const openApiPaths = new Set(extractOpenApiPaths(openApiPath));

const errors = [];

for (const item of publicRouteAllowlist) {
  if (!controllerKeys.has(item.controllerKey)) {
    errors.push(`Allowlist controller key not found: ${item.controllerKey}`);
  }
  if (!openApiPaths.has(item.openApiPath)) {
    errors.push(`Allowlist OpenAPI path not found: ${item.openApiPath}`);
  }
}

if (errors.length === 0) {
  console.log("Public route allowlist check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
