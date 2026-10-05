import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "VehicleDetailPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsv")) {
  errors.push("VehicleDetailPage does not use downloadCsv");
}

if (!text.includes("gopark-vehicle-")) {
  errors.push("VehicleDetailPage is missing vehicle detail export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("VehicleDetailPage is missing CSV export CTA");
}

if (!text.includes('"financed_amount"') || !text.includes('"installment_amount"')) {
  errors.push("VehicleDetailPage export rows are incomplete");
}

if (errors.length > 0) {
  console.error("CRM vehicle detail export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM vehicle detail export check passed.");
