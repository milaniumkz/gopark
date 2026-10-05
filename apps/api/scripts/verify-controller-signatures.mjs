import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const modulesDir = path.join(repoRoot, "apps", "api", "src", "modules");

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

function extractDecoratedMethods(text) {
  const lines = text.split("\n");
  const methods = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!/^@(Get|Post|Patch|Delete)\b/.test(line)) {
      continue;
    }

    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || candidate.startsWith("@")) {
        continue;
      }
      if (candidate.startsWith("constructor(")) {
        break;
      }
      if (candidate.includes("(") && candidate.endsWith("{")) {
        methods.push(candidate);
        break;
      }
    }
  }

  return methods;
}

function hasExplicitReturnType(signature) {
  const beforeBody = signature.slice(0, -1).trimEnd();
  const closeParenIndex = beforeBody.lastIndexOf(")");
  if (closeParenIndex === -1) {
    return false;
  }
  return beforeBody.slice(closeParenIndex + 1).trimStart().startsWith(":");
}

const controllerFiles = walk(modulesDir).filter((filePath) => filePath.endsWith(".controller.ts"));
const errors = [];

for (const filePath of controllerFiles) {
  const text = readFileSync(filePath, "utf8");
  const methods = extractDecoratedMethods(text);
  for (const method of methods) {
    if (!hasExplicitReturnType(method)) {
      errors.push(`${path.relative(repoRoot, filePath)}: ${method}`);
    }
  }
}

if (errors.length === 0) {
  console.log("Controller signature check passed.");
  process.exit(0);
}

console.error("Controller methods missing explicit return types:");
for (const error of errors) {
  console.error(`- ${error}`);
}
process.exit(1);
