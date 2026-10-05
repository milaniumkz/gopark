import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const files = [
  "apps/crm-web/src/pages/VehiclesPage.tsx",
  "apps/crm-web/src/pages/DriversPage.tsx",
  "apps/crm-web/src/pages/ContractsPage.tsx",
  "apps/crm-web/src/pages/FinancialOpsPage.tsx",
  "apps/crm-web/src/pages/PayoutsPage.tsx",
  "apps/crm-web/src/pages/PaymentsPage.tsx",
  "apps/crm-web/src/pages/OutboxPage.tsx",
];

const errors = [];

const asyncStateText = fs.readFileSync(path.join(root, "apps", "crm-web", "src", "ui", "AsyncState.tsx"), "utf8");
if (!asyncStateText.includes("emptyContent")) {
  errors.push("apps/crm-web/src/ui/AsyncState.tsx does not support emptyContent");
}

for (const relativePath of files) {
  const text = fs.readFileSync(path.join(root, relativePath), "utf8");

  if (!text.includes("EmptyStatePanel")) {
    errors.push(`${relativePath} does not use EmptyStatePanel`);
  }

  if (!text.includes("emptyContent={")) {
    errors.push(`${relativePath} does not provide custom emptyContent`);
  }
}

const stylesText = fs.readFileSync(path.join(root, "apps", "crm-web", "src", "styles.css"), "utf8");
if (!stylesText.includes(".empty-panel")) {
  errors.push("apps/crm-web/src/styles.css is missing .empty-panel");
}

if (errors.length > 0) {
  console.error("CRM empty states check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM empty states check passed.");
