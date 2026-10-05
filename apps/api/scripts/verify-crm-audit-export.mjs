import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const auditPath = path.join(root, "apps", "crm-web", "src", "pages", "AuditPage.tsx");
const text = fs.readFileSync(auditPath, "utf8");

const errors = [];

if (!text.includes("downloadCsvTable")) {
  errors.push("AuditPage does not use downloadCsvTable");
}

if (!text.includes("gopark-audit-log.csv")) {
  errors.push("AuditPage is missing audit export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("AuditPage is missing CSV export CTA");
}

if (!text.includes('"entity_type"') || !text.includes('"correlation_id"')) {
  errors.push("AuditPage export columns are incomplete");
}

if (errors.length > 0) {
  console.error("CRM audit export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM audit export check passed.");
