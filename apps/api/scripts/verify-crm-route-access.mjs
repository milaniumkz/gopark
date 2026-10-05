import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const accessPath = path.join(root, "apps", "crm-web", "src", "lib", "crm-access.ts");
const routerPath = path.join(root, "apps", "crm-web", "src", "router.tsx");
const layoutPath = path.join(root, "apps", "crm-web", "src", "ui", "AppLayout.tsx");

const accessText = fs.readFileSync(accessPath, "utf8");
const routerText = fs.readFileSync(routerPath, "utf8");
const layoutText = fs.readFileSync(layoutPath, "utf8");

const expectedKeys = [
  "dashboard",
  "vehicles",
  "vehicle-detail",
  "drivers",
  "driver-detail",
  "contracts",
  "contract-detail",
  "payments",
  "payouts",
  "ledger",
  "financial-ops",
  "incidents",
  "notifications",
  "reports",
  "audit",
  "outbox",
  "users",
  "settings",
];

const errors = [];

if (!layoutText.includes("crmNavigationItems.filter") || !layoutText.includes("hasCrmAccess")) {
  errors.push("apps/crm-web/src/ui/AppLayout.tsx does not filter navigation through crm-access");
}

if (!routerText.includes("withRoleGate")) {
  errors.push("apps/crm-web/src/router.tsx does not gate routes through RoleGate");
}

for (const key of expectedKeys) {
  if (!accessText.includes(`${key}: [`) && !accessText.includes(`"${key}": [`)) {
    errors.push(`apps/crm-web/src/lib/crm-access.ts is missing access matrix entry for ${key}`);
  }

  if (!routerText.includes(`withRoleGate("${key}"`)) {
    errors.push(`apps/crm-web/src/router.tsx is missing RoleGate for ${key}`);
  }
}

if (errors.length > 0) {
  console.error("CRM route access check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM route access check passed.");
