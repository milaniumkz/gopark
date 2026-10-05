import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "DriverDetailPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsv")) {
  errors.push("DriverDetailPage does not use downloadCsv");
}

if (!text.includes("gopark-driver-")) {
  errors.push("DriverDetailPage is missing driver detail export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("DriverDetailPage is missing CSV export CTA");
}

if (!text.includes('"current_debt"') || !text.includes('"total_paid"')) {
  errors.push("DriverDetailPage export rows are incomplete");
}

if (errors.length > 0) {
  console.error("CRM driver detail export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM driver detail export check passed.");
