import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const files = [
  "apps/crm-web/src/pages/VehicleDetailPage.tsx",
  "apps/crm-web/src/pages/DriverDetailPage.tsx",
  "apps/crm-web/src/pages/ContractDetailPage.tsx",
  "apps/crm-web/src/pages/DashboardPage.tsx",
  "apps/crm-web/src/pages/LedgerPage.tsx",
  "apps/crm-web/src/pages/UsersPage.tsx",
];

const errors = [];

for (const relativePath of files) {
  const text = fs.readFileSync(path.join(root, relativePath), "utf8");

  if (!text.includes("EmptyStatePanel")) {
    errors.push(`${relativePath} does not use EmptyStatePanel`);
  }

  if (!text.includes("emptyContent={")) {
    errors.push(`${relativePath} does not provide contextual emptyContent`);
  }
}

if (errors.length > 0) {
  console.error("CRM detail empty states check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM detail empty states check passed.");
