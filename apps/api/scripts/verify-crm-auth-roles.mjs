import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const authPath = path.join(root, "apps", "crm-web", "src", "lib", "auth.ts");
const text = fs.readFileSync(authPath, "utf8");

const expectedRoles = [
  "owner",
  "admin",
  "finance",
  "manager",
  "operator",
  "auditor",
];

const errors = [];

if (!text.includes("allowedCrmRoles")) {
  errors.push("apps/crm-web/src/lib/auth.ts does not define allowedCrmRoles");
}

for (const role of expectedRoles) {
  if (!text.includes(`"${role}"`)) {
    errors.push(`apps/crm-web/src/lib/auth.ts does not allow CRM role ${role}`);
  }
}

if (text.includes('"driver"') && !text.includes("CRM недоступна для роли")) {
  errors.push("apps/crm-web/src/lib/auth.ts references driver but does not reject unsupported roles");
}

if (!text.includes("isAllowedCrmRole")) {
  errors.push("apps/crm-web/src/lib/auth.ts does not validate CRM roles through isAllowedCrmRole()");
}

if (!text.includes("if (!isAllowedCrmRole(session.requestUserRole))")) {
  errors.push("apps/crm-web/src/lib/auth.ts does not reject unsupported login roles");
}

if (errors.length > 0) {
  console.error("CRM auth role check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM auth role check passed.");
