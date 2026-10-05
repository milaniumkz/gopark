import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "IncidentsPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("IncidentsPage does not use downloadCsvTable");
}

if (!text.includes("gopark-incidents.csv")) {
  errors.push("IncidentsPage is missing incidents export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("IncidentsPage is missing CSV export CTA");
}

if (!text.includes('"priority"') || !text.includes('"driver_id"') || !text.includes('"car_id"')) {
  errors.push("IncidentsPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM incidents export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM incidents export check passed.");
