import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "VehiclesPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("VehiclesPage does not use downloadCsvTable");
}

if (!text.includes("gopark-vehicles.csv")) {
  errors.push("VehiclesPage is missing vehicles export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("VehiclesPage is missing CSV export CTA");
}

if (!text.includes('"plate_number"') || !text.includes('"assigned_driver_id"')) {
  errors.push("VehiclesPage export columns are incomplete");
}

if (!text.includes("rows.map")) {
  errors.push("VehiclesPage export is not based on the filtered rows");
}

if (errors.length > 0) {
  console.error("CRM vehicles export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM vehicles export check passed.");
