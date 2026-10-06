import assert from "node:assert/strict";
import test from "node:test";
import { ObligationPrismaRepository } from "./obligation.prisma.repository.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const date = "2026-10-06";

test("daily and period debt exclude separate insurance/GPS and closed contracts", async () => {
  const rows = Array.from({ length: 3 }, (_, index) => [
    { driverId: `driver-${index}`, type: "installment", amount: 2300, paidAmount: 0, contractStatus: "active" },
    { driverId: `driver-${index}`, type: "insurance", amount: 13000, paidAmount: 0, contractStatus: "active" },
    { driverId: `driver-${index}`, type: "gps", amount: 300, paidAmount: 0, contractStatus: "active" },
  ]).flat();
  rows.push({ driverId: "driver-0", type: "installment", amount: 2300, paidAmount: 0, contractStatus: "terminated" });
  const client = { obligation: { findMany: async ({ where }: { where: { type?: string; contract?: { status: string }; driverId?: string | { in: string[] } } }) => rows
    .filter((row) => (!where.type || row.type === where.type)
      && (!where.contract || row.contractStatus === where.contract.status)
      && (!where.driverId || (typeof where.driverId === "string" ? row.driverId === where.driverId : where.driverId.in.includes(row.driverId))))
    .map((row) => ({ ...row, metadata: null, dueDate: new Date(`${date}T00:00:00Z`) })) } };
  const repository = new ObligationPrismaRepository({ client } as unknown as PrismaService);
  const ids = ["driver-0", "driver-1", "driver-2"];
  assert.equal(await repository.getOpenDueByDriversInPeriod(ids, date, date), 6900);
  assert.equal(await repository.getOpenDueByCompanyInPeriod("test", date, date), 6900);
  assert.equal(await repository.getTotalDueByDriversInPeriod(ids, date, date), 6900);
  assert.equal(await repository.getTotalDueByCompanyInPeriod("test", date, date), 6900);
  assert.equal(await repository.getDueAmountByDriversOnDate(ids, date), 6900);
  assert.equal(await repository.getDueAmountByDriverOnDate(ids[0]!, date), 2300);
  const snapshots = await repository.getDebtSnapshotsByDrivers(ids, date);
  assert.equal(snapshots[ids[0]!]!.totalDebt, 2300);
  rows[0]!.paidAmount = 1000;
  assert.equal(await repository.getOpenDueByDriversInPeriod(ids, date, date), 5900);
  assert.equal(await repository.getTotalDueByDriversInPeriod(ids, date, date), 6900);
});
