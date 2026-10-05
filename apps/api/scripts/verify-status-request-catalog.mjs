import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const contractsPath = path.join(repoRoot, "packages", "contracts", "src", "contracts.ts");
const seedPath = path.join(repoRoot, "apps", "api", "src", "data", "seed.ts");
const bootstrapPath = path.join(repoRoot, "apps", "api", "scripts", "bootstrap-prisma.mjs");
const driverAppPath = path.join(repoRoot, "apps", "driver-app", "lib", "main.dart");

function extractConstArray(source, constName) {
  const match = source.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractArrayValues(source, propertyName) {
  const match = source.match(new RegExp(`${propertyName}: \\[([^\\]]*)\\]`));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractAssignedStrings(source, propertyName) {
  const regex = new RegExp(`${propertyName}: "([^"]+)"`, "g");
  return [...source.matchAll(regex)].map((item) => item[1]);
}

function extractConstBlockStrings(source, constName, propertyName) {
  const match = source.match(new RegExp(`export const ${constName}[\\s\\S]*?= \\[([\\s\\S]*?)\\];`));
  if (!match) {
    return [];
  }

  const block = match[1];
  const regex = new RegExp(`${propertyName}: "([^"]+)"`, "g");
  return [...block.matchAll(regex)].map((item) => item[1]);
}

function extractDriverAppRequestTypes(source) {
  return [...source.matchAll(/requestStatus\(\s*driverId,\s*'([^']+)'/g)].map((item) => item[1]);
}

const contractsSource = readFileSync(contractsPath, "utf8");
const seedSource = readFileSync(seedPath, "utf8");
const bootstrapSource = readFileSync(bootstrapPath, "utf8");
const driverAppSource = readFileSync(driverAppPath, "utf8");

const knownTypes = new Set(extractConstArray(contractsSource, "statusRequestTypes"));
const settingsTypes = extractArrayValues(seedSource, "allowedStatusRequestTypes");
const seedRequestTypes = extractConstBlockStrings(seedSource, "seedStatusRequests", "type");
const bootstrapTypes = extractArrayValues(bootstrapSource, "allowedStatusRequestTypes");
const driverAppTypes = extractDriverAppRequestTypes(driverAppSource);

const errors = [];

for (const type of [...settingsTypes, ...bootstrapTypes, ...seedRequestTypes, ...driverAppTypes]) {
  if (!knownTypes.has(type)) {
    errors.push(`Unknown status request type: ${type}`);
  }
}

if (errors.length === 0) {
  console.log("Status request catalog check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
