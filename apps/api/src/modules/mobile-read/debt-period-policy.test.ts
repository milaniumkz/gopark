import test from "node:test";
import assert from "node:assert/strict";
import { DriverMobileReadService } from "./driver-mobile-read.service.js";
import { DriverStatusRequestPolicyService } from "./driver-status-request-policy.service.js";

test("installment debt and date periods respect partial payment, credit, deferral and the active contract without insurance/GPS", async () => {
  const service = new DriverStatusRequestPolicyService();
  const rows = [
    { id: "partial", contractId: "active", type: "installment", dueDate: "2026-10-01", amount: 2300, installmentAmount: 2000, paidAmount: 500 },
    { id: "deferred", contractId: "active", type: "installment", dueDate: "2026-10-02", amount: 2000, paidAmount: 0, deferredUntil: "2026-10-10" },
    { id: "paid", contractId: "active", type: "installment", dueDate: "2026-10-03", amount: 2000, paidAmount: 2000 },
    { id: "old", contractId: "closed", type: "installment", dueDate: "2026-10-01", amount: 99999, paidAmount: 0 },
    { id: "insurance", contractId: "active", type: "insurance", dueDate: "2026-09-01", amount: 13000, paidAmount: 0 },
    { id: "gps", contractId: "active", type: "gps", dueDate: "2026-09-01", amount: 300, paidAmount: 0 },
  ];
  Object.assign(service, {
    driverRepository: { getById: async () => ({ id: "driver", activeContractId: "active" }) },
    obligationRepository: { listByDriver: async () => rows },
    statusRequestRepository: { listByDriver: async () => [] },
  });
  const obligations = await service.listEffectiveOpenObligations("driver", 1000);
  assert.deepEqual(obligations.map((item) => [item.id, item.effectiveDueDate, item.remainingAmount]), [["partial", "2026-10-01", 500], ["deferred", "2026-10-11", 2000]]);
  const debt = await service.getEffectiveDebtPolicy("driver", "2026-10-07", 1000);
  assert.equal(debt.currentDebt, 2500); assert.equal(debt.overdueDebt, 500);
  assert.equal(debt.overdueSinceDate, "2026-10-01"); assert.equal(debt.overdueUntilDate, "2026-10-01");
  assert.equal(rows[0]!.paidAmount, 500, "read-only credit allocation must not change stored payments");
});


test("mobile finance uses the same effective debt and dates as the period calendar, even when raw obligations are overdue", async () => {
  const service = new DriverMobileReadService();
  Object.assign(service, {
    obligationRepository: { getDebtSnapshotsByDrivers: async () => ({ driver: { totalDebt: 23000, overdueDebt: 18000, overdueSinceDate: "2026-09-01" } }) },
    driverCreditBalanceRepository: { getByDrivers: async () => ({ driver: 1000 }) },
    paymentRepository: { getLatestSuccessfulByDrivers: async () => ({}) },
    yandexBalanceRepository: { getLatestByDrivers: async () => ({}) },
    payoutRepository: { getRequestedAmountByDrivers: async () => ({}) },
    statusRequestPolicyService: { getEffectiveDebtPolicy: async () => ({ currentDebt: 2500, overdueDebt: 500, overdueSinceDate: "2026-10-01", overdueUntilDate: "2026-10-01", nextPaymentAmount: 500, nextPaymentDate: "2026-10-01" }) },
  });
  const item = (await service.getFinanceSnapshots(["driver"])).driver!;
  assert.equal(item.currentDebt, 2500); assert.equal(item.overdueDebt, 500);
  assert.equal(item.overdueSinceDate, "2026-10-01"); assert.equal(item.overdueUntilDate, "2026-10-01");
  assert.equal(item.nextPaymentAmount, 500);
});
