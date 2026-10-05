import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const checks = [
  {
    file: "apps/crm-web/src/pages/VehicleDetailPage.tsx",
    patterns: ['hasCrmAccess(session.requestUserRole, "driver-detail")', 'hasCrmAccess(session.requestUserRole, "contract-detail")'],
  },
  {
    file: "apps/crm-web/src/pages/DriverDetailPage.tsx",
    patterns: ['hasCrmAccess(session.requestUserRole, "contract-detail")', 'hasCrmAccess(session.requestUserRole, "vehicle-detail")'],
  },
  {
    file: "apps/crm-web/src/pages/ContractDetailPage.tsx",
    patterns: ['hasCrmAccess(session.requestUserRole, "driver-detail")', 'hasCrmAccess(session.requestUserRole, "vehicle-detail")'],
  },
  {
    file: "apps/crm-web/src/pages/DashboardPage.tsx",
    patterns: ["crmNavigationItems", "quickLinks.map", "hasCrmAccess(session.requestUserRole, item.key)"],
  },
];

const errors = [];

for (const check of checks) {
  const text = fs.readFileSync(path.join(root, check.file), "utf8");
  for (const pattern of check.patterns) {
    if (!text.includes(pattern)) {
      errors.push(`${check.file} is missing contextual link pattern ${pattern}`);
    }
  }
}

if (errors.length > 0) {
  console.error("CRM context links check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM context links check passed.");
