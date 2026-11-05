import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { ContractPrismaRepository } from "./contract.prisma.repository.js";
import { DriverPrismaRepository } from "./driver.prisma.repository.js";
import type { PrismaService } from "../prisma/prisma.service.js";

function endDateForPayments(count: number): string {
  const date = new Date("2026-11-05T00:00:00Z");
  while (true) {
    if (date.getUTCDay() !== 0 && --count === 0) return date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 1);
  }
}

test("contract principal matches its schedule, respects Sundays, preserves extras on daily payment changes", {
  skip: process.env.CONTRACT_NUMBER_INTEGRATION !== "true",
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/gopark_contract_test");
  const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
  const client = new PrismaClient();
  const prisma = { client } as unknown as PrismaService;
  const contracts = new ContractPrismaRepository(prisma);
  const drivers = new DriverPrismaRepository(prisma);
  let driverId: string | undefined;
  let carId: string | undefined;
  try {
    const driver = await client.driver.create({ data: { firstName: "Schedule", lastName: "Test", phone: "isolated-schedule-test", weeklyDayOff: "sunday" } });
    driverId = driver.id;
    const car = await client.car.create({ data: { vin: "ISOLATED-SCHEDULE-TEST", plateNumber: "SCHEDULE-TEST", make: "Test", model: "Test" } });
    carId = car.id;
    const input = { driverId: driver.id, carId: car.id, principalAmount: 2484000, financedAmount: 2484000, installmentAmount: 2300, termMonths: 42, startDate: "2026-11-05", endDate: endDateForPayments(1080), monthlyInsuranceAmount: 3000, monthlyGpsAmount: 300 };
    await assert.rejects(contracts.create({ ...input, endDate: "2029-10-19" }), /не покрывает/);
    assert.equal(await client.contract.count({ where: { driverId } }), 0);
    const created = await contracts.create(input);
    assert.equal(created.currentDebt, input.financedAmount);
    assert.equal(input.endDate, "2030-04-17");
    const check = async (daily: number) => {
      const detail = await contracts.getById(created.id);
      assert.ok(detail);
      assert.equal(detail.installmentAmount, daily);
      assert.equal(detail.currentDebt, input.financedAmount);
      const rows = await client.obligation.findMany({ where: { contractId: created.id, type: "installment" }, orderBy: { dueDate: "asc" } });
      assert.equal(rows.reduce((n: number, r: any) => n + Number(r.metadata.installmentAmount), 0), input.financedAmount);
      assert.ok(rows.every((r: any) => r.dueDate.getUTCDay() !== 0));
      assert.equal(rows.length, Math.ceil(input.financedAmount / daily));
      const extras = await client.obligation.findMany({ where: { contractId: created.id, type: { in: ["insurance", "gps"] } } });
      assert.ok(extras.length > 2);
      assert.ok(extras.some((r: any) => r.type === "insurance" && Number(r.amount) === 3000));
      assert.ok(extras.some((r: any) => r.type === "gps" && Number(r.amount) === 300));
      assert.equal((await drivers.getById(driver.id))?.currentDebt, input.financedAmount);
    };
    await check(2300);
    await contracts.update(created.id, { installmentAmount: 2200, endDate: endDateForPayments(Math.ceil(input.financedAmount / 2200)) });
    await check(2200);
    const row = await client.obligation.findFirstOrThrow({ where: { contractId: created.id, type: "installment" } });
    await client.obligation.update({ where: { id: row.id }, data: { paidAmount: 100 } });
    await assert.rejects(contracts.update(created.id, { installmentAmount: 2400 }), /после оплат/);
    assert.equal(Number((await client.obligation.findUniqueOrThrow({ where: { id: row.id } })).paidAmount), 100);
    assert.equal(Number((await client.contract.findUniqueOrThrow({ where: { id: created.id } })).installmentAmount), 2200);
  } finally {
    if (driverId) {
      await client.obligation.deleteMany({ where: { driverId } });
      await client.carAssignment.deleteMany({ where: { driverId } });
      await client.contract.deleteMany({ where: { driverId } });
      await client.driver.delete({ where: { id: driverId } });
    }
    if (carId) await client.car.delete({ where: { id: carId } });
    await client.$disconnect();
  }
});
