import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const reportsPath = path.join(root, "apps", "crm-web", "src", "pages", "ReportsPage.tsx");
const utilsPath = path.join(root, "apps", "crm-web", "src", "lib", "utils.ts");

const reportsText = fs.readFileSync(reportsPath, "utf8");
const utilsText = fs.readFileSync(utilsPath, "utf8");

const errors = [];

if (!reportsText.includes("downloadCsv")) {
  errors.push("ReportsPage does not use downloadCsv");
}

if (!reportsText.includes("Скачать CSV")) {
  errors.push("ReportsPage is missing CSV export CTA");
}

if (!reportsText.includes("gopark-reports-overview.csv")) {
  errors.push("ReportsPage is missing export filename");
}

if (!utilsText.includes("export function downloadCsv")) {
  errors.push("utils.ts is missing downloadCsv");
}

if (!utilsText.includes("escapeCsvCell")) {
  errors.push("utils.ts is missing CSV escaping helper");
}

if (errors.length > 0) {
  console.error("CRM reports export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM reports export check passed.");
