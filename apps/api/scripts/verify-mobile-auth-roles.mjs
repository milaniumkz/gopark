import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const checks = [
  {
    file: path.join(repoRoot, "apps", "driver-app", "lib", "repository.dart"),
    expectedRole: "driver",
    label: "driver-app",
  },
  {
    file: path.join(repoRoot, "apps", "manager-app", "lib", "repository.dart"),
    expectedRole: "manager",
    label: "manager-app",
  },
];

const errors = [];

for (const check of checks) {
  const text = readFileSync(check.file, "utf8");
  const relative = path.relative(repoRoot, check.file);

  if (!text.includes("requestUserRole")) {
    errors.push(`${relative} does not inspect requestUserRole`);
    continue;
  }

  if (!text.includes(`requestUserRole != '${check.expectedRole}'`)) {
    errors.push(`${relative} does not enforce ${check.expectedRole} login role`);
  }

  if (!text.includes(`требуется роль ${check.expectedRole}`)) {
    errors.push(`${relative} is missing explicit ${check.expectedRole} role error message`);
  }
}

if (errors.length === 0) {
  console.log("Mobile auth role check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
