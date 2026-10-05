import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const checks = [
  {
    contractFile: "packages/contracts/src/driver-app.ts",
    contractName: "DriverHomeSummary",
    dtoFile: "apps/driver-app/lib/api.dart",
    dtoName: "DriverHomeSummaryDto",
  },
  {
    contractFile: "packages/contracts/src/driver-app.ts",
    contractName: "DriverProfileSummary",
    dtoFile: "apps/driver-app/lib/api.dart",
    dtoName: "DriverProfileSummaryDto",
  },
  {
    contractFile: "packages/contracts/src/driver-app.ts",
    contractName: "DriverDebtSummary",
    dtoFile: "apps/driver-app/lib/api.dart",
    dtoName: "DriverDebtSummaryDto",
  },
  {
    contractFile: "packages/contracts/src/driver-app.ts",
    contractName: "DriverActiveContractSummary",
    dtoFile: "apps/driver-app/lib/api.dart",
    dtoName: "DriverActiveContractDto",
  },
  {
    contractFile: "packages/contracts/src/driver-app.ts",
    contractName: "DriverStatusRequestItem",
    dtoFile: "apps/driver-app/lib/api.dart",
    dtoName: "DriverStatusRequestDto",
  },
  {
    contractFile: "packages/contracts/src/driver-app.ts",
    contractName: "DriverPaymentScheduleItem",
    dtoFile: "apps/driver-app/lib/api.dart",
    dtoName: "DriverPaymentScheduleItemDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerDashboardSummary",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerSummaryDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerAssignedDriverItem",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerAssignedDriverDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerDriverDetail",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerDriverDetailDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerAlertItem",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerAlertDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerQuickActionItem",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerQuickActionDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerIncidentItem",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerIncidentDto",
  },
  {
    contractFile: "packages/contracts/src/manager-app.ts",
    contractName: "ManagerExecuteActionResult",
    dtoFile: "apps/manager-app/lib/api.dart",
    dtoName: "ManagerExecuteActionResultDto",
  },
];

function unique(list) {
  return [...new Set(list)];
}

function extractBlock(text, startPattern) {
  const start = text.indexOf(startPattern);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let started = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
      started = true;
    } else if (char === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractTsInterfaceFields(filePath, interfaceName) {
  const text = readFileSync(path.join(repoRoot, filePath), "utf8");
  const block = extractBlock(text, `export interface ${interfaceName}`);
  if (!block) {
    throw new Error(`Interface not found: ${interfaceName} in ${filePath}`);
  }

  const fields = [];
  let depth = 0;

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (depth === 1) {
      const match = trimmed.match(/^([A-Za-z0-9_]+)\??:/);
      if (match) {
        fields.push(match[1]);
      }
    }

    for (const char of line) {
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
    }
  }

  return unique(fields).sort();
}

function extractDartClassFields(filePath, className) {
  const text = readFileSync(path.join(repoRoot, filePath), "utf8");
  const block = extractBlock(text, `class ${className} `);
  if (!block) {
    throw new Error(`Class not found: ${className} in ${filePath}`);
  }

  return unique(
    [...block.matchAll(/^\s+final\s+[A-Za-z0-9_<>,? ]+\s+([A-Za-z0-9_]+);$/gm)].map(
      (match) => match[1],
    ),
  ).sort();
}

const errors = [];

for (const check of checks) {
  const contractFields = extractTsInterfaceFields(check.contractFile, check.contractName);
  const dtoFields = extractDartClassFields(check.dtoFile, check.dtoName);

  const missingInDto = contractFields.filter((field) => !dtoFields.includes(field));
  const extraInDto = dtoFields.filter((field) => !contractFields.includes(field));

  if (missingInDto.length > 0) {
    errors.push(
      `${check.dtoName} is missing fields from ${check.contractName}: ${missingInDto.join(", ")}`,
    );
  }

  if (extraInDto.length > 0) {
    errors.push(
      `${check.dtoName} has extra fields not present in ${check.contractName}: ${extraInDto.join(", ")}`,
    );
  }
}

if (errors.length === 0) {
  console.log("Mobile contract DTO check passed.");
  process.exit(0);
}

console.error(errors.join("\n"));
process.exit(1);
