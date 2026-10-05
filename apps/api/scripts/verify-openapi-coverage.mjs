import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function normalizeRoute(...parts) {
  const joined = parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
  const route = joined.startsWith("/") ? joined : `/${joined}`;
  return route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function extractControllerRoutes(filePath) {
  const text = readFileSync(filePath, "utf8");
  const controllerMatch = text.match(/@Controller\("([^"]*)"\)/);
  if (!controllerMatch) {
    return [];
  }

  const controllerBase = controllerMatch[1];
  const routeRegex = /@(Get|Post|Patch|Delete)\((?:"([^"]*)")?\)/g;
  const routes = [];

  for (const match of text.matchAll(routeRegex)) {
    const method = match[1].toUpperCase();
    const route = match[2] ?? "";
    routes.push({
      method,
      path: normalizeRoute("api", controllerBase, route),
      filePath,
    });
  }

  return routes;
}

function extractOpenApiRoutes(filePath) {
  const text = readFileSync(filePath, "utf8");
  const pathRegex = /^  (\/api\/[^:]+):\n((?:    .*\n)+)/gm;
  const methodRegex = /^    (get|post|patch|delete):/gm;
  const routes = [];

  for (const match of text.matchAll(pathRegex)) {
    const routePath = match[1];
    const block = match[2];
    for (const methodMatch of block.matchAll(methodRegex)) {
      routes.push({
        method: methodMatch[1].toUpperCase(),
        path: routePath,
      });
    }
  }

  return routes;
}

const controllerRoutes = walk(modulesDir)
  .filter((filePath) => filePath.endsWith(".controller.ts"))
  .flatMap(extractControllerRoutes);
const openApiRoutes = extractOpenApiRoutes(openApiPath);

const controllerRouteKeys = new Set(
  controllerRoutes.map(({ method, path: routePath }) => `${method} ${routePath}`),
);
const openApiRouteKeys = new Set(
  openApiRoutes.map(({ method, path: routePath }) => `${method} ${routePath}`),
);

const missingInOpenApi = controllerRoutes.filter(
  ({ method, path: routePath }) => !openApiRouteKeys.has(`${method} ${routePath}`),
);
const extraInOpenApi = openApiRoutes.filter(
  ({ method, path: routePath }) => !controllerRouteKeys.has(`${method} ${routePath}`),
);

if (missingInOpenApi.length === 0 && extraInOpenApi.length === 0) {
  console.log("OpenAPI coverage check passed.");
  process.exit(0);
}

if (missingInOpenApi.length > 0) {
  console.error("Routes implemented in controllers but missing in OpenAPI:");
  for (const route of missingInOpenApi) {
    console.error(`- ${route.method} ${route.path} (${path.relative(repoRoot, route.filePath)})`);
  }
}

if (extraInOpenApi.length > 0) {
  console.error("Routes documented in OpenAPI but missing in controllers:");
  for (const route of extraInOpenApi) {
    console.error(`- ${route.method} ${route.path}`);
  }
}

process.exit(1);
