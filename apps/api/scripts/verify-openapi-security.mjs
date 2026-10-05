import { readFileSync } from "node:fs";
import path from "node:path";
import { publicRouteAllowlist } from "./public-route-allowlist.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const openApiPath = path.join(repoRoot, "docs", "api", "openapi.yaml");
const text = readFileSync(openApiPath, "utf8");
const publicRoutes = new Set(publicRouteAllowlist.map((item) => item.openApiPath));

function extractPathBlocks(source) {
  const pathsIndex = source.indexOf("paths:\n");
  if (pathsIndex === -1) {
    return [];
  }

  const lines = source.slice(pathsIndex + "paths:\n".length).split("\n");
  const blocks = [];
  let currentPath = null;
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(/^  (\/api\/.+):$/);
    if (match) {
      if (currentPath) {
        blocks.push({ path: currentPath, block: currentLines.join("\n") });
      }
      currentPath = match[1];
      currentLines = [];
      continue;
    }

    if (currentPath) {
      currentLines.push(line);
    }
  }

  if (currentPath) {
    blocks.push({ path: currentPath, block: currentLines.join("\n") });
  }

  return blocks;
}

const errors = [];

if (!text.includes("components:\n  securitySchemes:\n")) {
  errors.push("OpenAPI is missing components.securitySchemes");
}

if (!text.includes("bearerAuth:")) {
  errors.push("OpenAPI is missing bearerAuth security scheme");
}

if (!text.includes("scheme: bearer")) {
  errors.push("OpenAPI is missing bearer token scheme");
}

if (!text.includes("security:\n  - bearerAuth: []\n")) {
  errors.push("OpenAPI is missing global bearer security requirement");
}

for (const { path: routePath, block } of extractPathBlocks(text)) {
  const hasPublicSecurityOverride = block.includes("security: []");
  if (publicRoutes.has(routePath) && !hasPublicSecurityOverride) {
    errors.push(`${routePath} should declare security: []`);
  }
  if (!publicRoutes.has(routePath) && hasPublicSecurityOverride) {
    errors.push(`${routePath} should not be public in OpenAPI security`);
  }
}

if (errors.length === 0) {
  console.log("OpenAPI security check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
