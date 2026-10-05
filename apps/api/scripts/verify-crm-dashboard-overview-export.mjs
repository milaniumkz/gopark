import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const pagePath = path.join(root, "apps", "crm-web", "src", "pages", "DashboardPage.tsx");
const text = fs.readFileSync(pagePath, "utf8");

const errors = [];

if (!text.includes("downloadCsv")) {
  errors.push("DashboardPage does not use downloadCsv");
}

if (!text.includes("gopark-dashboard-")) {
  errors.push("DashboardPage is missing dashboard export filename");
}

if (!text.includes("Скачать CSV")) {
  errors.push("DashboardPage is missing CSV export CTA");
}

if (!text.includes('"planned_payment"') || !text.includes('"vehicles_sold"')) {
  errors.push("DashboardPage export rows are incomplete");
}

if (errors.length > 0) {
  console.error("CRM dashboard overview export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM dashboard overview export check passed.");
