import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "DriversPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("DriversPage does not use downloadCsvTable");
}

if (!text.includes("gopark-drivers.csv")) {
  errors.push("DriversPage is missing drivers export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("DriversPage is missing CSV export CTA");
}

if (!text.includes('"full_name"') || !text.includes('"active_contract_id"')) {
  errors.push("DriversPage export columns are incomplete");
}

if (!text.includes("rows.map")) {
  errors.push("DriversPage export is not based on the filtered rows");
}

if (errors.length > 0) {
  console.error("CRM drivers export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM drivers export check passed.");
