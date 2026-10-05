import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

function normalizeRoute(routePath) {
  const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
  const withPrefix = normalized.startsWith("/api/") ? normalized : `/api${normalized}`;
  return withPrefix
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\$([A-Za-z0-9_]+)/g, "{$1}");
}

function extractControllerRoutes(filePath) {
  const text = readFileSync(filePath, "utf8");
  const controllerMatch = text.match(/@Controller\("([^"]+)"\)/);
  if (!controllerMatch) {
    return [];
  }

  const basePath = controllerMatch[1];
  const routeRegex = /@(Get|Post)\((?:"([^"]*)")?\)/g;
  const routes = [];

  for (const match of text.matchAll(routeRegex)) {
    const method = match[1].toUpperCase();
    const route = match[2] ?? "";
    routes.push(`${method} ${normalizeRoute(`${basePath}/${route}`.replace(/\/+/g, "/").replace(/\/$/, ""))}`);
  }

  return routes;
}

function extractOpenApiMobileRoutes(filePath) {
  const text = readFileSync(filePath, "utf8");
  const pathRegex = /^  (\/api\/mobile\/[^:]+):\n((?:    .*\n)+)/gm;
  const methodRegex = /^    (get|post):/gm;
  const routes = [];

  for (const match of text.matchAll(pathRegex)) {
    const routePath = match[1];
    const block = match[2];
    for (const methodMatch of block.matchAll(methodRegex)) {
      routes.push(`${methodMatch[1].toUpperCase()} ${routePath}`);
    }
  }

  return routes;
}

function extractMobileDocRoutes(filePath) {
  const text = readFileSync(filePath, "utf8");
  return [...text.matchAll(/- `(GET|POST) (\/api\/mobile\/[^`]+)`/g)].map(
    (match) => `${match[1]} ${match[2].replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`,
  );
}

function extractFlutterRoutes(filePath) {
  const text = readFileSync(filePath, "utf8");
  return [...text.matchAll(/client\.(get|post)\(\s*Uri\.parse\('\$baseUrl([^']+)'\)/g)]
    .map((match) => `${match[1].toUpperCase()} ${normalizeRoute(match[2])}`)
    .filter((route) => route.includes("/api/mobile/"));
}

function diff(sourceName, sourceRoutes, targetName, targetRoutes) {
  const targetSet = new Set(targetRoutes);
  return sourceRoutes.filter((route) => !targetSet.has(route)).map((route) => `${sourceName} only: ${route} (missing in ${targetName})`);
}

const controllerRoutes = [
  ...extractControllerRoutes(path.join(repoRoot, "apps/api/src/modules/mobile-driver/mobile-driver.controller.ts")),
  ...extractControllerRoutes(path.join(repoRoot, "apps/api/src/modules/mobile-manager/mobile-manager.controller.ts")),
].sort();

const openApiRoutes = extractOpenApiMobileRoutes(
  path.join(repoRoot, "docs/api/openapi.yaml"),
).sort();

const mobileDocRoutes = extractMobileDocRoutes(
  path.join(repoRoot, "docs/mobile-api.md"),
).sort();

const flutterRoutes = [
  ...extractFlutterRoutes(path.join(repoRoot, "apps/driver-app/lib/api.dart")),
  ...extractFlutterRoutes(path.join(repoRoot, "apps/manager-app/lib/api.dart")),
].sort();

const errors = [
  ...diff("controllers", controllerRoutes, "openapi", openApiRoutes),
  ...diff("openapi", openApiRoutes, "controllers", controllerRoutes),
  ...diff("controllers", controllerRoutes, "mobile docs", mobileDocRoutes),
  ...diff("mobile docs", mobileDocRoutes, "controllers", controllerRoutes),
  ...diff("controllers", controllerRoutes, "flutter clients", flutterRoutes),
  ...diff("flutter clients", flutterRoutes, "controllers", controllerRoutes),
];

if (errors.length === 0) {
  console.log("Mobile API surface check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
