import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "PaymentsPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("PaymentsPage does not use downloadCsvTable");
}

if (!text.includes("gopark-payments.csv")) {
  errors.push("PaymentsPage is missing payments export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("PaymentsPage is missing CSV export CTA");
}

if (!text.includes('"provider"') || !text.includes('"created_at"')) {
  errors.push("PaymentsPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM payments export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM payments export check passed.");
