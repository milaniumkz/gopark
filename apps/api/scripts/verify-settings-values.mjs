import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const seedPath = path.join(root, "src", "data", "seed.ts");
const bootstrapPath = path.join(root, "scripts", "bootstrap-prisma.mjs");

function extractNumericProperty(source, propertyName) {
  const match = source.match(new RegExp(`${propertyName}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function assertIntegerInRange(errors, value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${label} must be an integer between ${min} and ${max}, got ${String(value)}`);
  }
}

function assertPositiveNumber(errors, value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${label} must be a positive number, got ${String(value)}`);
  }
}

const seedSource = readFileSync(seedPath, "utf8");
const bootstrapSource = readFileSync(bootstrapPath, "utf8");

const checks = [
  {
    label: "seedSettingsOverview.defaultInstallmentDay",
    value: extractNumericProperty(seedSource, "defaultInstallmentDay"),
    assert: (errors, value, label) => assertIntegerInRange(errors, value, label, 1, 31),
  },
  {
    label: "seedSettingsOverview.payoutApprovalThreshold",
    value: extractNumericProperty(seedSource, "payoutApprovalThreshold"),
    assert: assertPositiveNumber,
  },
  {
    label: "bootstrap.settings.defaultInstallmentDay",
    value: extractNumericProperty(bootstrapSource, "defaultInstallmentDay"),
    assert: (errors, value, label) => assertIntegerInRange(errors, value, label, 1, 31),
  },
  {
    label: "bootstrap.settings.payoutApprovalThreshold",
    value: extractNumericProperty(bootstrapSource, "payoutApprovalThreshold"),
    assert: assertPositiveNumber,
  },
];

const errors = [];

for (const check of checks) {
  if (check.value === null) {
    errors.push(`Missing numeric property: ${check.label}`);
    continue;
  }

  check.assert(errors, check.value, check.label);
}

if (errors.length === 0) {
  console.log("Settings values check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
