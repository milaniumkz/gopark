import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "ContractDetailPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsv")) {
  errors.push("ContractDetailPage does not use downloadCsv");
}

if (!text.includes("gopark-contract-")) {
  errors.push("ContractDetailPage is missing contract detail export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("ContractDetailPage is missing CSV export CTA");
}

if (!text.includes('"principal_amount"') || !text.includes('"current_debt"')) {
  errors.push("ContractDetailPage export rows are incomplete");
}

if (errors.length > 0) {
  console.error("CRM contract detail export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM contract detail export check passed.");
