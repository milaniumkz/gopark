import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "PayoutsPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("PayoutsPage does not use downloadCsvTable");
}

if (!text.includes("gopark-payouts.csv")) {
  errors.push("PayoutsPage is missing payouts export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("PayoutsPage is missing CSV export CTA");
}

if (!text.includes('"created_at"') || !text.includes('"approved_by_user_id"')) {
  errors.push("PayoutsPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM payouts export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM payouts export check passed.");
