import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { publicRouteAllowlist } from "./public-route-allowlist.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const modulesDir = path.join(repoRoot, "apps", "api", "src", "modules");
const publicControllerKeys = new Set(publicRouteAllowlist.map((item) => item.controllerKey));

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

function analyzeController(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const findings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const routeMatch = line.match(/^@(Get|Post|Patch|Delete)\("([^"]*)"\)/);
    if (!routeMatch) {
      continue;
    }

    const method = routeMatch[1].toUpperCase();
    const route = routeMatch[2];
    let hasRoles = false;

    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate) {
        continue;
      }
      if (candidate.startsWith("@Roles(")) {
        hasRoles = true;
        continue;
      }
      if (candidate.startsWith("@")) {
        continue;
      }
      if (candidate.includes("(") && candidate.endsWith("{")) {
        break;
      }
    }

    findings.push({
      key: `${path.basename(filePath)}#${method} ${route}`,
      hasRoles,
    });
  }

  return findings;
}

const controllerFiles = walk(modulesDir).filter((filePath) => filePath.endsWith(".controller.ts"));
const missingRoles = [];

for (const filePath of controllerFiles) {
  for (const finding of analyzeController(filePath)) {
    if (!finding.hasRoles && !publicControllerKeys.has(finding.key)) {
      missingRoles.push(finding.key);
    }
  }
}

if (missingRoles.length === 0) {
  console.log("Controller roles check passed.");
  process.exit(0);
}

console.error("Controller routes missing @Roles and not in public allowlist:");
for (const item of missingRoles) {
  console.error(`- ${item}`);
}
process.exit(1);
