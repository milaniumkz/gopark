import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "OutboxPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("OutboxPage does not use downloadCsvTable");
}

if (!text.includes("gopark-outbox-events.csv")) {
  errors.push("OutboxPage is missing outbox export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("OutboxPage is missing CSV export CTA");
}

if (!text.includes('"aggregate_type"') || !text.includes('"created_at"')) {
  errors.push("OutboxPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM outbox export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM outbox export check passed.");
