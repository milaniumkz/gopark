import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "NotificationsPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("NotificationsPage does not use downloadCsvTable");
}

if (!text.includes("gopark-notifications.csv")) {
  errors.push("NotificationsPage is missing notifications export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("NotificationsPage is missing CSV export CTA");
}

if (!text.includes('"channel"') || !text.includes('"template"') || !text.includes('"status"')) {
  errors.push("NotificationsPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM notifications export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM notifications export check passed.");
