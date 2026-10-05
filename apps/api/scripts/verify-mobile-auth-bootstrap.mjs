import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const files = [
  path.join(repoRoot, "apps", "driver-app", "lib", "api.dart"),
  path.join(repoRoot, "apps", "manager-app", "lib", "api.dart"),
];

const errors = [];

for (const filePath of files) {
  const text = readFileSync(filePath, "utf8");
  const relative = path.relative(repoRoot, filePath);

  if (!text.includes("Uri.parse('\$baseUrl/auth/login')")) {
    errors.push(`${relative} does not call /auth/login`);
  }

  if (!text.includes("requestUserId") || !text.includes("requestUserRole")) {
    errors.push(`${relative} does not use requestUserId/requestUserRole from login response`);
  }

  if (!text.includes("authorization") || !text.includes("Bearer \${session.accessToken}")) {
    errors.push(`${relative} does not use Authorization bearer token from session.accessToken`);
  }

  if (text.includes("x-user-id") || text.includes("x-role")) {
    errors.push(`${relative} still uses bootstrap auth headers`);
  }

  if (!text.includes("clearSession()")) {
    errors.push(`${relative} is missing clearSession()`);
  }
}

if (errors.length === 0) {
  console.log("Mobile auth bootstrap check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
