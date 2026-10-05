import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const checks = [
  {
    file: "apps/crm-web/src/pages/VehiclesPage.tsx",
    patterns: ['hasCrmCapability(session.requestUserRole, "create-car")'],
  },
  {
    file: "apps/crm-web/src/pages/DriversPage.tsx",
    patterns: ['hasCrmCapability(session.requestUserRole, "create-driver")'],
  },
  {
    file: "apps/crm-web/src/pages/ContractsPage.tsx",
    patterns: ['hasCrmCapability(session.requestUserRole, "create-contract")'],
  },
  {
    file: "apps/crm-web/src/pages/FinancialOpsPage.tsx",
    patterns: [
      'hasCrmCapability(session.requestUserRole, "create-payment")',
      'hasCrmCapability(session.requestUserRole, "create-payout")',
      'hasCrmCapability(session.requestUserRole, "approve-payout")',
    ],
  },
  {
    file: "apps/crm-web/src/pages/PayoutsPage.tsx",
    patterns: [
      'hasCrmCapability(session.requestUserRole, "approve-payout")',
      'hasCrmAccess(session.requestUserRole, "financial-ops")',
    ],
  },
  {
    file: "apps/crm-web/src/pages/PaymentsPage.tsx",
    patterns: ['hasCrmAccess(session.requestUserRole, "financial-ops")'],
  },
  {
    file: "apps/crm-web/src/pages/OutboxPage.tsx",
    patterns: ['hasCrmCapability(session.requestUserRole, "process-outbox")'],
  },
];

const accessPath = path.join(root, "apps", "crm-web", "src", "lib", "crm-access.ts");
const accessText = fs.readFileSync(accessPath, "utf8");
const errors = [];

for (const capability of [
  "create-car",
  "create-driver",
  "create-contract",
  "create-payment",
  "create-payout",
  "approve-payout",
  "process-outbox",
]) {
  if (!accessText.includes(`"${capability}": [`)) {
    errors.push(`apps/crm-web/src/lib/crm-access.ts is missing capability ${capability}`);
  }
}

for (const check of checks) {
  const absolutePath = path.join(root, check.file);
  const text = fs.readFileSync(absolutePath, "utf8");

  for (const pattern of check.patterns) {
    if (!text.includes(pattern)) {
      errors.push(`${check.file} is missing action gate ${pattern}`);
    }
  }
}

if (errors.length > 0) {
  console.error("CRM action access check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM action access check passed.");
