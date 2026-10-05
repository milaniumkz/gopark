import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..", "..");

const authPath = path.join(root, "apps", "crm-web", "src", "lib", "auth.ts");
const apiPath = path.join(root, "apps", "crm-web", "src", "lib", "api.ts");
const mainPath = path.join(root, "apps", "crm-web", "src", "main.tsx");
const layoutPath = path.join(root, "apps", "crm-web", "src", "ui", "AppLayout.tsx");
const payoutsPath = path.join(root, "apps", "crm-web", "src", "pages", "PayoutsPage.tsx");
const financialOpsPath = path.join(root, "apps", "crm-web", "src", "pages", "FinancialOpsPage.tsx");

const authText = fs.readFileSync(authPath, "utf8");
const apiText = fs.readFileSync(apiPath, "utf8");
const mainText = fs.readFileSync(mainPath, "utf8");
const layoutText = fs.readFileSync(layoutPath, "utf8");
const payoutsText = fs.readFileSync(payoutsPath, "utf8");
const financialOpsText = fs.readFileSync(financialOpsPath, "utf8");

const errors = [];

if (!authText.includes('buildUrl("auth/login")')) {
  errors.push("apps/crm-web/src/lib/auth.ts does not call /api/auth/login");
}

if (!authText.includes("requestUserRole")) {
  errors.push("apps/crm-web/src/lib/auth.ts does not inspect requestUserRole");
}

if (!authText.includes("saveCrmSession(session)") || !authText.includes("window.localStorage.setItem(sessionStorageKey")) {
  errors.push("apps/crm-web/src/lib/auth.ts does not persist CRM session");
}

if (!authText.includes("clearCrmSession")) {
  errors.push("apps/crm-web/src/lib/auth.ts does not expose clearCrmSession()");
}

if (!apiText.includes("accessToken")) {
  errors.push("apps/crm-web/src/lib/api.ts does not use accessToken from the CRM session");
}

if (!apiText.includes("authorization: `Bearer ${accessToken}`")) {
  errors.push("apps/crm-web/src/lib/api.ts does not send Authorization bearer token");
}

if (apiText.includes("x-user-id") || apiText.includes("x-role")) {
  errors.push("apps/crm-web/src/lib/api.ts still uses bootstrap auth headers");
}

if (!mainText.includes("<LoginPage")) {
  errors.push("apps/crm-web/src/main.tsx does not render LoginPage");
}

if (!mainText.includes("loadCrmSession") || !mainText.includes("loginCrm")) {
  errors.push("apps/crm-web/src/main.tsx does not wire CRM auth session flow");
}

if (!layoutText.includes("signOut")) {
  errors.push("apps/crm-web/src/ui/AppLayout.tsx does not expose sign-out");
}

if (includesApprovalPayloadActor(payoutsText)) {
  errors.push("apps/crm-web/src/pages/PayoutsPage.tsx still sends approvedByUserId");
}

if (includesApprovalPayloadActor(financialOpsText)) {
  errors.push("apps/crm-web/src/pages/FinancialOpsPage.tsx still sends approvedByUserId");
}

if (errors.length > 0) {
  console.error("CRM auth bootstrap check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("CRM auth bootstrap check passed.");

function includesApprovalPayloadActor(text) {
  return text.includes("approvedByUserId:") || text.includes('"approvedByUserId":');
}
