import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const ledgerPath = path.join(root, "apps", "crm-web", "src", "pages", "LedgerPage.tsx");
const utilsPath = path.join(root, "apps", "crm-web", "src", "lib", "utils.ts");

const ledgerText = fs.readFileSync(ledgerPath, "utf8");
const utilsText = fs.readFileSync(utilsPath, "utf8");

const errors = [];

if (!ledgerText.includes("downloadCsvTable")) {
  errors.push("LedgerPage does not use downloadCsvTable");
}

if (!ledgerText.includes("gopark-ledger-entries.csv")) {
  errors.push("LedgerPage is missing ledger export filename");
}

if (!ledgerText.includes("Скачать CSV")) {
  errors.push("LedgerPage is missing CSV export CTA");
}

if (!utilsText.includes("export function downloadCsvTable")) {
  errors.push("utils.ts is missing downloadCsvTable");
}

if (errors.length > 0) {
  console.error("CRM ledger export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM ledger export check passed.");
