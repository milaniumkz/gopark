import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const seedPath = path.join(repoRoot, "apps", "api", "src", "data", "seed.ts");
const bootstrapPath = path.join(repoRoot, "apps", "api", "scripts", "bootstrap-prisma.mjs");

const seedSource = readFileSync(seedPath, "utf8");
const bootstrapSource = readFileSync(bootstrapPath, "utf8");

const errors = [];

const seedUsersMatch = seedSource.match(/export const seedUsers(?::[\s\S]*?)?= \[([\s\S]*?)\];/);
const seedUserEntries = seedUsersMatch
  ? seedUsersMatch[1]
      .split(/\n\s*},/)
      .map((entry) => `${entry.trim()}${entry.trim().endsWith("}") ? "" : "}"}`)
      .filter((entry) => entry.includes("role:"))
  : [];

for (const role of ["driver", "manager"]) {
  const matchingEntries = seedUserEntries.filter((entry) => entry.includes(`role: "${role}"`));
  if (matchingEntries.length === 0 || matchingEntries.some((entry) => !entry.includes("requestUserId:"))) {
    errors.push(`seedUsers is missing a ${role} user with requestUserId`);
  }
}

if (!bootstrapSource.includes('role: "manager"')) {
  errors.push("bootstrap-prisma.mjs is missing a manager user");
}

if (!bootstrapSource.includes('role: "driver"')) {
  errors.push("bootstrap-prisma.mjs is missing a driver user");
}

if (!bootstrapSource.includes("prisma.manager.upsert")) {
  errors.push("bootstrap-prisma.mjs is missing manager principal upsert");
}

if (!bootstrapSource.includes("prisma.driver.upsert")) {
  errors.push("bootstrap-prisma.mjs is missing driver principal upsert");
}

const scopedManagerIds = [...bootstrapSource.matchAll(/managerId: "([^"]+)"/g)].map((match) => match[1]);
if (scopedManagerIds.some((id) => id.startsWith("mgr_"))) {
  errors.push("bootstrap-prisma.mjs still uses in-memory manager ids like mgr_* instead of Prisma principal ids");
}

if (errors.length === 0) {
  console.log("Auth principal mapping check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
