import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const contractsPath = path.join(repoRoot, "packages", "contracts", "src", "contracts.ts");
const seedPath = path.join(repoRoot, "apps", "api", "src", "data", "seed.ts");

function extractConstArray(source, constName) {
  const match = source.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractSettingsArray(source, propertyName) {
  const match = source.match(new RegExp(`${propertyName}: \\[([^\\]]*)\\]`));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const contractsSource = readFileSync(contractsPath, "utf8");
const seedSource = readFileSync(seedPath, "utf8");

const knownChannels = new Set(extractConstArray(contractsSource, "notificationChannels"));
const settingsChannels = extractSettingsArray(seedSource, "notificationChannels");

const errors = [];

for (const channel of settingsChannels) {
  if (!knownChannels.has(channel)) {
    errors.push(`Unknown notification channel in settings seed: ${channel}`);
  }
}

if (errors.length === 0) {
  console.log("Settings catalog check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
