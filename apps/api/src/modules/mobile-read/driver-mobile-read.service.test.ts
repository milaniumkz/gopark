import test from "node:test";
import assert from "node:assert/strict";
import { DriverMobileReadService } from "./driver-mobile-read.service.js";
import { seedDriverCreditBalances, seedDriverStatusRequests, seedObligations } from "../../data/seed.js";

test("getDriverAssignmentSnapshots returns vehicle and contract mappings", async () => {
  const service = new DriverMobileReadService();

  const snapshots = await service.getDriverAssignmentSnapshots([
    { driverId: "drv_1", activeContractId: "ctr_1" },
    { driverId: "drv_2", activeContractId: "ctr_2" },
  ]);

  assert.deepEqual(snapshots, {
    drv_1: {
      vehicle: "01 KG 1234",
      contractNumber: "GP-2025-0001",
    },
    drv_2: {
      vehicle: "01 KG 5678",
      contractNumber: "GP-2025-0002",
    },
  });
});

test("getFinanceSnapshots aggregates latest payment, balance and requested payouts", async () => {
  const service = new DriverMobileReadService();

  const snapshots = await service.getFinanceSnapshots(["drv_1", "drv_2"]);

  assert.equal(snapshots.drv_1.currentDebt, 5000);
  assert.equal(snapshots.drv_1.nextPaymentAmount, 5000);
  assert.equal(snapshots.drv_1.nextPaymentDate, "2026-03-15");
  assert.equal(snapshots.drv_1.lastPaymentDate, "2025-04-01T09:00:00.000Z");
  assert.equal(snapshots.drv_1.yandexBalance, 45680);
  assert.equal(snapshots.drv_1.reservedPayoutAmount, 8500);

  assert.equal(snapshots.drv_2.currentDebt, 13000);
  assert.equal(snapshots.drv_2.nextPaymentAmount, 13000);
  assert.equal(snapshots.drv_2.nextPaymentDate, "2026-03-15");
  assert.equal(snapshots.drv_2.lastPaymentDate, null);
  assert.equal(snapshots.drv_2.yandexBalance, 28750);
  assert.equal(snapshots.drv_2.reservedPayoutAmount, 0);
});

test("getManagerDriverDetailSnapshot combines assignment, finance, status requests and incidents", async () => {
  const service = new DriverMobileReadService();

  const snapshot = await service.getManagerDriverDetailSnapshot("drv_1", "ctr_1");

  assert.equal(snapshot.assignment.vehicle, "01 KG 1234");
  assert.equal(snapshot.assignment.contractNumber, "GP-2025-0001");
  assert.equal(snapshot.finance.currentDebt, 5000);
  assert.equal(snapshot.finance.lastPaymentDate, "2025-04-01T09:00:00.000Z");
  assert.equal(snapshot.nextPaymentAmount, 5000);
  assert.equal(snapshot.nextPaymentDate, "2026-03-15");
  assert.equal(snapshot.pendingStatusRequestsCount, 1);
  assert.equal(snapshot.recentStatusRequests.length, 2);
  assert.equal(snapshot.openIncidents.length, 0);
});

test("getFinanceSnapshots clears next payment date when approved status request covers the next obligation", async () => {
  const service = new DriverMobileReadService();
  const originalObligationsLength = seedObligations.length;
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedObligations.push({
    id: "obl_snapshot_policy",
    driverId: "drv_snapshot_policy",
    contractId: "ctr_snapshot_policy",
    type: "installment",
    amount: 4000,
    paidAmount: 0,
    dueDate: "2099-03-15",
  });
  seedDriverStatusRequests.push({
    id: "req_snapshot_policy",
    driverId: "drv_snapshot_policy",
    type: "vacation",
    status: "approved",
    period: "2099-03-01 .. 2099-03-20",
  });

  try {
    const snapshots = await service.getFinanceSnapshots(["drv_snapshot_policy"]);

    assert.equal(snapshots.drv_snapshot_policy.nextPaymentAmount, 4000);
    assert.equal(snapshots.drv_snapshot_policy.nextPaymentDate, "2099-03-21");
    assert.equal(snapshots.drv_snapshot_policy.overdueDebt, 0);
  } finally {
    seedObligations.length = originalObligationsLength;
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("getFinanceSnapshots applies driver credit before calculating debt and next payment", async () => {
  const service = new DriverMobileReadService();
  const originalObligationsLength = seedObligations.length;
  const originalCreditBalance = seedDriverCreditBalances.drv_credit_policy ?? 0;

  seedObligations.push(
    {
      id: "obl_credit_policy_1",
      driverId: "drv_credit_policy",
      contractId: "ctr_credit_policy",
      type: "installment",
      amount: 4000,
      paidAmount: 0,
      dueDate: "2099-05-10",
    },
    {
      id: "obl_credit_policy_2",
      driverId: "drv_credit_policy",
      contractId: "ctr_credit_policy",
      type: "installment",
      amount: 6000,
      paidAmount: 0,
      dueDate: "2099-05-20",
    },
  );
  seedDriverCreditBalances.drv_credit_policy = 5000;

  try {
    const snapshots = await service.getFinanceSnapshots(["drv_credit_policy"]);

    assert.equal(snapshots.drv_credit_policy.currentDebt, 5000);
    assert.equal(snapshots.drv_credit_policy.nextPaymentAmount, 5000);
    assert.equal(snapshots.drv_credit_policy.nextPaymentDate, "2099-05-20");
  } finally {
    seedObligations.length = originalObligationsLength;
    if (originalCreditBalance > 0) {
      seedDriverCreditBalances.drv_credit_policy = originalCreditBalance;
    } else {
      delete seedDriverCreditBalances.drv_credit_policy;
    }
  }
});

test("getPaymentSchedule marks covered unpaid obligations as deferred", async () => {
  const service = new DriverMobileReadService();
  const originalObligationsLength = seedObligations.length;
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedObligations.push(
    {
      id: "obl_schedule_deferred",
      driverId: "drv_schedule_policy",
      contractId: "ctr_schedule_policy",
      type: "installment",
      amount: 4000,
      paidAmount: 0,
      dueDate: "2099-04-03",
    },
    {
      id: "obl_schedule_planned",
      driverId: "drv_schedule_policy",
      contractId: "ctr_schedule_policy",
      type: "installment",
      amount: 5000,
      paidAmount: 0,
      dueDate: "2099-04-10",
    },
  );
  seedDriverStatusRequests.push({
    id: "req_schedule_deferred",
    driverId: "drv_schedule_policy",
    type: "vacation",
    status: "approved",
    period: "2099-04-01 .. 2099-04-07",
  });

  try {
    const schedule = await service.getPaymentSchedule("drv_schedule_policy");

    assert.equal(schedule[0]?.id, "obl_schedule_deferred");
    assert.equal(schedule[0]?.dueDate, "2099-04-08");
    assert.equal(schedule[0]?.status, "deferred");
    assert.equal(schedule[1]?.id, "obl_schedule_planned");
    assert.equal(schedule[1]?.status, "planned");
  } finally {
    seedObligations.length = originalObligationsLength;
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("getPaymentSchedule keeps deferred obligations deferred from stored lifecycle marker", async () => {
  const service = new DriverMobileReadService();
  const originalObligationsLength = seedObligations.length;

  seedObligations.push({
    id: "obl_schedule_model_deferred",
    driverId: "drv_schedule_model_policy",
    contractId: "ctr_schedule_model_policy",
    type: "installment",
    amount: 4500,
    paidAmount: 0,
    dueDate: "2099-04-03",
    deferredUntil: "2099-04-07",
    deferredByStatusRequestId: "req_schedule_model_deferred",
  });

  try {
    const schedule = await service.getPaymentSchedule("drv_schedule_model_policy");

    assert.equal(schedule[0]?.id, "obl_schedule_model_deferred");
    assert.equal(schedule[0]?.dueDate, "2099-04-08");
    assert.equal(schedule[0]?.status, "deferred");
  } finally {
    seedObligations.length = originalObligationsLength;
  }
});

test("getPaymentSchedule reflects virtual credit allocation in paidAmount and status", async () => {
  const service = new DriverMobileReadService();
  const originalObligationsLength = seedObligations.length;
  const originalCreditBalance = seedDriverCreditBalances.drv_schedule_credit_policy ?? 0;

  seedObligations.push(
    {
      id: "obl_schedule_credit_1",
      driverId: "drv_schedule_credit_policy",
      contractId: "ctr_schedule_credit_policy",
      type: "installment",
      amount: 4000,
      paidAmount: 0,
      dueDate: "2099-04-03",
    },
    {
      id: "obl_schedule_credit_2",
      driverId: "drv_schedule_credit_policy",
      contractId: "ctr_schedule_credit_policy",
      type: "installment",
      amount: 5000,
      paidAmount: 0,
      dueDate: "2099-04-10",
    },
  );
  seedDriverCreditBalances.drv_schedule_credit_policy = 4500;

  try {
    const schedule = await service.getPaymentSchedule("drv_schedule_credit_policy");

    assert.equal(schedule[0]?.id, "obl_schedule_credit_1");
    assert.equal(schedule[0]?.paidAmount, 4000);
    assert.equal(schedule[0]?.status, "paid");
    assert.equal(schedule[1]?.id, "obl_schedule_credit_2");
    assert.equal(schedule[1]?.paidAmount, 500);
    assert.equal(schedule[1]?.status, "partial");
  } finally {
    seedObligations.length = originalObligationsLength;
    if (originalCreditBalance > 0) {
      seedDriverCreditBalances.drv_schedule_credit_policy = originalCreditBalance;
    } else {
      delete seedDriverCreditBalances.drv_schedule_credit_policy;
    }
  }
});

test("getPaymentSchedule keeps fully paid future obligations visible", async () => {
  const service = new DriverMobileReadService();
  const originalObligationsLength = seedObligations.length;

  seedObligations.push({
    id: "obl_schedule_paid_ahead",
    driverId: "drv_1",
    contractId: "ctr_1",
    type: "installment",
    amount: 30000,
    paidAmount: 30000,
    dueDate: "2099-06-15",
  });

  try {
    const schedule = await service.getPaymentSchedule("drv_1");
    const paidAhead = schedule.find((item) => item.id === "obl_schedule_paid_ahead");

    assert.equal(paidAhead?.paidAmount, 30000);
    assert.equal(paidAhead?.status, "paid");
    assert.equal(paidAhead?.dueDate, "2099-06-15");
  } finally {
    seedObligations.length = originalObligationsLength;
  }
});
