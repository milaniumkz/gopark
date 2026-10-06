import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ContractPrismaRepository } from "./contract.prisma.repository.js";
import type { PrismaService } from "../prisma/prisma.service.js";

test("concurrent contract creation allocates consecutive numbers and failed saves do not consume them", {
  skip: process.env.CONTRACT_NUMBER_INTEGRATION !== "true",
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/gopark_contract_test");
  const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
  const client = new PrismaClient();
  const repository = new ContractPrismaRepository({ client } as unknown as PrismaService);
  try {
    const driver = await client.driver.create({ data: { firstName: "Test", lastName: "Seed", phone: "number-test-seed" } });
    const car = await client.car.create({ data: { vin: "NUMBER-TEST-SEED", plateNumber: "NUMBER-SEED", make: "Test", model: "Test" } });
    for (const contractNumber of ["GP-2025-0002", "1", "6", "55"]) {
      await client.contract.create({ data: { contractNumber, driverId: driver.id, carId: car.id, status: "terminated", principalAmount: 100, financedAmount: 100, installmentAmount: 100, installmentDay: 1, termMonths: 1, startDate: new Date("2026-10-06") } });
    }
    assert.equal(await repository.getNextNumber(), "56");
    const input = { driverId: driver.id, carId: car.id, principalAmount: 200, financedAmount: 200, installmentAmount: 100, termMonths: 1, startDate: "2026-10-06", endDate: "2026-10-07" };
    await assert.rejects(repository.create({ ...input, carId: "00000000-0000-0000-0000-000000000001" }));
    assert.equal(await repository.getNextNumber(), "56");
    const inputs = [];
    for (let i = 0; i < 8; i++) {
      const d = await client.driver.create({ data: { firstName: "Test", lastName: "Concurrent", phone: `number-test-${i}` } });
      const c = await client.car.create({ data: { vin: `NUMBER-TEST-${i}`, plateNumber: `NUMBER-${i}`, make: "Test", model: "Test" } });
      inputs.push({ ...input, driverId: d.id, carId: c.id, contractNumber: "9999" });
    }
    const contracts = await Promise.all(inputs.map((item) => repository.create(item)));
    assert.deepEqual(contracts.map((item) => Number(item.contractNumber)).sort((a, b) => a - b), [56,57,58,59,60,61,62,63]);
    assert.equal(await repository.getNextNumber(), "64");
    assert.equal(await client.contract.count({ where: { contractNumber: "9999" } }), 0);
  } finally {
    await client.$disconnect();
  }
});
