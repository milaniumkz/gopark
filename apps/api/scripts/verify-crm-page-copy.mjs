import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const checks = [
  {
    file: "apps/crm-web/src/pages/PayoutsPage.tsx",
    forbidden: ["Здесь будет очередь заявок на вывод"],
  },
  {
    file: "apps/crm-web/src/pages/OutboxPage.tsx",
    forbidden: ["Здесь будет очередь событий"],
  },
  {
    file: "apps/crm-web/src/pages/ReportsPage.tsx",
    forbidden: ["будет выделен отдельно", "намеренно читает"],
  },
  {
    file: "apps/crm-web/src/pages/ContractDetailPage.tsx",
    forbidden: ["На следующем шаге сюда должны лечь"],
  },
  {
    file: "apps/crm-web/src/pages/AuditPage.tsx",
    forbidden: ["предназначен для просмотра"],
  },
];

const errors = [];

for (const check of checks) {
  const text = fs.readFileSync(path.join(root, check.file), "utf8");
  for (const fragment of check.forbidden) {
    if (text.includes(fragment)) {
      errors.push(`${check.file} still contains outdated copy fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  console.error("CRM page copy check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM page copy check passed.");
