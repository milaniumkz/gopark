import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "UsersPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("UsersPage does not use downloadCsvTable");
}

if (!text.includes("gopark-users.csv")) {
  errors.push("UsersPage is missing users export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("UsersPage is missing CSV export CTA");
}

if (!text.includes('"display_name"') || !text.includes('"mfa_enabled"')) {
  errors.push("UsersPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM users export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM users export check passed.");
