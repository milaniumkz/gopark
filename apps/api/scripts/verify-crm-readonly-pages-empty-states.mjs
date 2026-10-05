import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const files = [
  "apps/crm-web/src/pages/ReportsPage.tsx",
  "apps/crm-web/src/pages/IncidentsPage.tsx",
  "apps/crm-web/src/pages/NotificationsPage.tsx",
  "apps/crm-web/src/pages/AuditPage.tsx",
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
  console.error("CRM readonly pages empty states check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM readonly pages empty states check passed.");
