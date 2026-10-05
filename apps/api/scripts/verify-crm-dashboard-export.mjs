import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const dashboardPath = path.join(root, "apps", "crm-web", "src", "pages", "DashboardPage.tsx");
const text = fs.readFileSync(dashboardPath, "utf8");

const errors = [];

if (!text.includes('hasCrmAccess(session.requestUserRole, "reports")')) {
  errors.push("DashboardPage does not gate export through reports access");
}

if (!text.includes('to="/reports"')) {
  errors.push("DashboardPage does not route export CTA to /reports");
}

if (!text.includes("Экспорт и отчеты") && !text.includes("Экспорт и отчёты")) {
  errors.push("DashboardPage is missing export CTA label");
}

if (!text.includes("ReadOnlyNotice")) {
  errors.push("DashboardPage does not show a readonly export notice");
}

if (errors.length > 0) {
  console.error("CRM dashboard export check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM dashboard export check passed.");
