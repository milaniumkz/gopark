import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const checks = [
  ["verify:runtime", ["node", "scripts/verify-runtime-readiness.mjs"]],
  ["verify:openapi", ["node", "scripts/verify-openapi-coverage.mjs"]],
  ["verify:openapi-security", ["node", "scripts/verify-openapi-security.mjs"]],
  ["verify:mobile-surface", ["node", "scripts/verify-mobile-surface.mjs"]],
  ["verify:mobile-contract-dtos", ["node", "scripts/verify-mobile-contract-dtos.mjs"]],
  ["verify:mobile-auth-bootstrap", ["node", "scripts/verify-mobile-auth-bootstrap.mjs"]],
  ["verify:mobile-auth-roles", ["node", "scripts/verify-mobile-auth-roles.mjs"]],
  ["verify:crm-auth-bootstrap", ["node", "scripts/verify-crm-auth-bootstrap.mjs"]],
  ["verify:crm-auth-roles", ["node", "scripts/verify-crm-auth-roles.mjs"]],
  ["verify:crm-route-access", ["node", "scripts/verify-crm-route-access.mjs"]],
  ["verify:crm-action-access", ["node", "scripts/verify-crm-action-access.mjs"]],
  ["verify:crm-readonly-notices", ["node", "scripts/verify-crm-readonly-notices.mjs"]],
  ["verify:crm-empty-states", ["node", "scripts/verify-crm-empty-states.mjs"]],
  ["verify:crm-detail-empty-states", ["node", "scripts/verify-crm-detail-empty-states.mjs"]],
  ["verify:crm-context-links", ["node", "scripts/verify-crm-context-links.mjs"]],
  ["verify:crm-dashboard-actions", ["node", "scripts/verify-crm-dashboard-actions.mjs"]],
  ["verify:crm-dashboard-export", ["node", "scripts/verify-crm-dashboard-export.mjs"]],
  ["verify:crm-readonly-pages-empty-states", ["node", "scripts/verify-crm-readonly-pages-empty-states.mjs"]],
  ["verify:crm-page-copy", ["node", "scripts/verify-crm-page-copy.mjs"]],
  ["verify:crm-reports-export", ["node", "scripts/verify-crm-reports-export.mjs"]],
  ["verify:crm-ledger-export", ["node", "scripts/verify-crm-ledger-export.mjs"]],
  ["verify:crm-audit-export", ["node", "scripts/verify-crm-audit-export.mjs"]],
  ["verify:crm-notifications-export", ["node", "scripts/verify-crm-notifications-export.mjs"]],
  ["verify:crm-incidents-export", ["node", "scripts/verify-crm-incidents-export.mjs"]],
  ["verify:crm-users-export", ["node", "scripts/verify-crm-users-export.mjs"]],
  ["verify:crm-payments-export", ["node", "scripts/verify-crm-payments-export.mjs"]],
  ["verify:crm-payouts-export", ["node", "scripts/verify-crm-payouts-export.mjs"]],
  ["verify:crm-contracts-export", ["node", "scripts/verify-crm-contracts-export.mjs"]],
  ["verify:crm-drivers-export", ["node", "scripts/verify-crm-drivers-export.mjs"]],
  ["verify:crm-vehicles-export", ["node", "scripts/verify-crm-vehicles-export.mjs"]],
  ["verify:crm-driver-detail-export", ["node", "scripts/verify-crm-driver-detail-export.mjs"]],
  ["verify:crm-vehicle-detail-export", ["node", "scripts/verify-crm-vehicle-detail-export.mjs"]],
  ["verify:crm-contract-detail-export", ["node", "scripts/verify-crm-contract-detail-export.mjs"]],
  ["verify:crm-dashboard-overview-export", ["node", "scripts/verify-crm-dashboard-overview-export.mjs"]],
  ["verify:crm-outbox-export", ["node", "scripts/verify-crm-outbox-export.mjs"]],
  ["verify:controller-signatures", ["node", "scripts/verify-controller-signatures.mjs"]],
  ["verify:controller-roles", ["node", "scripts/verify-controller-roles.mjs"]],
  ["verify:public-route-allowlist", ["node", "scripts/verify-public-route-allowlist.mjs"]],
  ["verify:notification-catalog", ["node", "scripts/verify-notification-catalog.mjs"]],
  ["verify:auth-principal-mapping", ["node", "scripts/verify-auth-principal-mapping.mjs"]],
  ["verify:auth-session-hardening", ["node", "scripts/verify-auth-session-hardening.mjs"]],
  ["verify:auth-rate-limiting", ["node", "scripts/verify-auth-rate-limiting.mjs"]],
  ["verify:worker-runtime", ["node", "scripts/verify-worker-runtime.mjs"]],
  ["verify:settings-catalog", ["node", "scripts/verify-settings-catalog.mjs"]],
  ["verify:settings-values", ["node", "scripts/verify-settings-values.mjs"]],
  ["verify:status-request-catalog", ["node", "scripts/verify-status-request-catalog.mjs"]],
];

const failures = [];

for (const [name, command] of checks) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }

  if (result.status !== 0) {
    failures.push(name);
  }
}

if (failures.length === 0) {
  console.log("\nOffline readiness check passed.");
  process.exit(0);
}

console.error(`\nOffline readiness check failed: ${failures.join(", ")}`);
process.exit(1);
