import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "ContractsPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("ContractsPage does not use downloadCsvTable");
}

if (!text.includes("gopark-contracts.csv")) {
  errors.push("ContractsPage is missing contracts export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("ContractsPage is missing CSV export CTA");
}

if (!text.includes('"contract_number"') || !text.includes('"installment_amount"')) {
  errors.push("ContractsPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM contracts export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM contracts export check passed.");
