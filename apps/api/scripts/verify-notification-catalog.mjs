import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const contractsPath = path.join(repoRoot, "packages", "contracts", "src", "contracts.ts");
const seedPath = path.join(repoRoot, "apps", "api", "src", "data", "seed.ts");
const notificationsCreatePath = path.join(
  repoRoot,
  "apps",
  "api",
  "src",
  "modules",
  "notifications",
  "notifications-create.service.ts",
);

function extractConstArray(source, constName) {
  const match = source.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractAssignedStrings(source, propertyName) {
  const regex = new RegExp(`${propertyName}: "([^"]+)"`, "g");
  return [...source.matchAll(regex)].map((item) => item[1]);
}

function extractNotificationMethodStrings(source) {
  return [...source.matchAll(/createDriverNotification\(driverId, "([^"]+)"\)/g)].map((item) => item[1]);
}

const contractsSource = readFileSync(contractsPath, "utf8");
const seedSource = readFileSync(seedPath, "utf8");
const notificationsCreateSource = readFileSync(notificationsCreatePath, "utf8");

const knownChannels = new Set(extractConstArray(contractsSource, "notificationChannels"));
const knownTemplates = new Set(extractConstArray(contractsSource, "notificationTemplates"));

const seedChannels = new Set(extractAssignedStrings(seedSource, "channel"));
const seedTemplates = new Set(extractAssignedStrings(seedSource, "template"));
const notificationMethodTemplates = new Set(extractNotificationMethodStrings(notificationsCreateSource));

const errors = [];

for (const channel of seedChannels) {
  if (!knownChannels.has(channel)) {
    errors.push(`Unknown notification channel in seed data: ${channel}`);
  }
}

for (const template of seedTemplates) {
  if (!knownTemplates.has(template)) {
    errors.push(`Unknown notification template in seed data: ${template}`);
  }
}

for (const template of notificationMethodTemplates) {
  if (!knownTemplates.has(template)) {
    errors.push(`Unknown notification template in notifications-create service: ${template}`);
  }
}

if (errors.length === 0) {
  console.log("Notification catalog check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
