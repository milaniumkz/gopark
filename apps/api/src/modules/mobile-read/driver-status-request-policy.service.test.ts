import test from "node:test";
import assert from "node:assert/strict";
import { seedDriverStatusRequests, seedObligations } from "../../data/seed.js";
import { DriverStatusRequestPolicyService } from "./driver-status-request-policy.service.js";

test("approved status request suppresses due today and overdue debt for covered dates", async () => {
  const service = new DriverStatusRequestPolicyService();
  const originalObligationsLength = seedObligations.length;
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedObligations.push(
    {
      id: "obl_policy_covered",
      driverId: "drv_policy",
      contractId: "ctr_policy",
      type: "installment",
      amount: 6000,
      paidAmount: 0,
      dueDate: "2099-04-03",
    },
    {
      id: "obl_policy_open",
      driverId: "drv_policy",
      contractId: "ctr_policy",
      type: "installment",
      amount: 9000,
      paidAmount: 0,
      dueDate: "2099-04-10",
    },
  );
  seedDriverStatusRequests.push({
    id: "req_policy_approved",
    driverId: "drv_policy",
    type: "vacation",
    status: "approved",
    period: "2099-04-01 .. 2099-04-07",
  });

  try {
    const dueTodayAmount = await service.getEffectiveDueAmountOnDate("drv_policy", "2099-04-03");
    const dueOnDeferredDate = await service.getEffectiveDueAmountOnDate("drv_policy", "2099-04-08");
    const policyOnVacation = await service.getEffectiveDebtPolicy("drv_policy", "2099-04-02");
    const policyAfterVacation = await service.getEffectiveDebtPolicy("drv_policy", "2099-04-20");

    assert.equal(dueTodayAmount, 0);
    assert.equal(dueOnDeferredDate, 6000);
    assert.equal(policyOnVacation.nextPaymentAmount, 6000);
    assert.equal(policyOnVacation.nextPaymentDate, "2099-04-08");
    assert.equal(policyAfterVacation.overdueDebt, 15000);
  } finally {
    seedObligations.length = originalObligationsLength;
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("approved status request overrides current status on covered date", async () => {
  const service = new DriverStatusRequestPolicyService();
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedDriverStatusRequests.push(
    {
      id: "req_status_dayoff",
      driverId: "drv_status_policy",
      type: "day_off",
      status: "approved",
      period: "2026-03-20",
    },
    {
      id: "req_status_force",
      driverId: "drv_status_policy_force",
      type: "force_majeure",
      status: "approved",
      period: "2026-03-20",
    },
  );

  try {
    const dayOffStatus = await service.getEffectiveCurrentStatus("drv_status_policy", "active", "2026-03-20");
    const forceStatus = await service.getEffectiveCurrentStatus("drv_status_policy_force", "active", "2026-03-20");
    const normalStatus = await service.getEffectiveCurrentStatus("drv_status_policy", "active", "2026-03-21");

    assert.equal(dayOffStatus, "day_off");
    assert.equal(forceStatus, "force_majeure");
    assert.equal(normalStatus, "active");
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("stored obligation deferral suppresses debt policy even without approved request row", async () => {
  const service = new DriverStatusRequestPolicyService();
  const originalObligationsLength = seedObligations.length;

  seedObligations.push({
    id: "obl_policy_stored_deferred",
    driverId: "drv_policy_stored",
    contractId: "ctr_policy_stored",
    type: "installment",
    amount: 7000,
    paidAmount: 0,
    dueDate: "2099-04-03",
    deferredUntil: "2099-04-07",
    deferredByStatusRequestId: "req_policy_stored",
  });

  try {
    const dueTodayAmount = await service.getEffectiveDueAmountOnDate("drv_policy_stored", "2099-04-03");
    const dueOnDeferredDate = await service.getEffectiveDueAmountOnDate("drv_policy_stored", "2099-04-08");
    const policyOnDeferredDate = await service.getEffectiveDebtPolicy("drv_policy_stored", "2099-04-04");
    const policyAfterDeferredDate = await service.getEffectiveDebtPolicy("drv_policy_stored", "2099-04-10");

    assert.equal(dueTodayAmount, 0);
    assert.equal(dueOnDeferredDate, 7000);
    assert.equal(policyOnDeferredDate.nextPaymentAmount, 7000);
    assert.equal(policyOnDeferredDate.nextPaymentDate, "2099-04-08");
    assert.equal(policyAfterDeferredDate.overdueDebt, 7000);
  } finally {
    seedObligations.length = originalObligationsLength;
  }
});
