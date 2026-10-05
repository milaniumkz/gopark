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

for (const relativePath of files) {
  const text = fs.readFileSync(path.join(root, relativePath), "utf8");

  if (!text.includes("ReadOnlyNotice")) {
    errors.push(`${relativePath} does not render ReadOnlyNotice`);
  }
}

const stylesText = fs.readFileSync(path.join(root, "apps", "crm-web", "src", "styles.css"), "utf8");
if (!stylesText.includes(".permission-note")) {
  errors.push("apps/crm-web/src/styles.css is missing .permission-note");
}

if (errors.length > 0) {
  console.error("CRM readonly notices check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM readonly notices check passed.");
