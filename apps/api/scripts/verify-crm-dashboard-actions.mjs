import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const dashboardPath = path.join(root, "apps", "crm-web", "src", "pages", "DashboardPage.tsx");
const text = fs.readFileSync(dashboardPath, "utf8");

const errors = [];

for (const capability of [
  "create-payment",
  "approve-payout",
  "create-contract",
  "create-driver",
  "create-car",
  "process-outbox",
]) {
  if (!text.includes(`hasCrmCapability(session.requestUserRole, "${capability}")`)) {
    errors.push(`DashboardPage is missing quick action capability ${capability}`);
  }
}

if (!text.includes("Операционные действия")) {
  errors.push("DashboardPage is missing operations panel");
}

if (!text.includes("quickActions.length > 0")) {
  errors.push("DashboardPage does not handle empty quick actions state");
}

if (errors.length > 0) {
  console.error("CRM dashboard actions check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM dashboard actions check passed.");
