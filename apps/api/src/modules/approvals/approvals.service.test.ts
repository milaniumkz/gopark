import test from "node:test";
import assert from "node:assert/strict";
import { seedDriverStatusRequests, seedObligations } from "../../data/seed.js";
import { ApprovalsService } from "./approvals.service.js";

function makeService() {
  return new ApprovalsService(
    {
      write: async () => undefined,
    } as any,
    {
      createDriverPayoutApproved: async () => undefined,
      createDriverPayoutRejected: async () => undefined,
      createDriverStatusRequestApproved: async () => undefined,
      createDriverStatusRequestRejected: async () => undefined,
    } as any,
    {
      create: async () => undefined,
    } as any,
  );
}

test("approveStatusRequest approves pending request", async () => {
  const service = makeService();
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedDriverStatusRequests.push({
    id: "req_approve_pending",
    driverId: "drv_1",
    type: "day_off",
    status: "pending",
    period: "2026-05-20",
  });

  try {
    const updated = await service.approveStatusRequest("req_approve_pending", {
      id: "usr_admin",
      role: "admin",
    });

    assert.equal(updated.status, "approved");
    assert.equal(seedDriverStatusRequests.find((item) => item.id === "req_approve_pending")?.status, "approved");
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("approveStatusRequest marks covered open obligations as deferred", async () => {
  const service = makeService();
  const originalRequestsLength = seedDriverStatusRequests.length;
  const originalObligationsLength = seedObligations.length;

  seedDriverStatusRequests.push({
    id: "req_approve_defer",
    driverId: "drv_defer_policy",
    type: "vacation",
    status: "pending",
    period: "2026-05-20 .. 2026-05-22",
  });
  seedObligations.push(
    {
      id: "obl_defer_covered",
      driverId: "drv_defer_policy",
      contractId: "ctr_defer_policy",
      type: "installment",
      amount: 5000,
      paidAmount: 0,
      dueDate: "2026-05-21",
    },
    {
      id: "obl_defer_paid",
      driverId: "drv_defer_policy",
      contractId: "ctr_defer_policy",
      type: "installment",
      amount: 3000,
      paidAmount: 3000,
      dueDate: "2026-05-21",
    },
  );

  try {
    await service.approveStatusRequest("req_approve_defer", {
      id: "usr_admin",
      role: "admin",
    });

    assert.equal(seedObligations.find((item) => item.id === "obl_defer_covered")?.deferredUntil, "2026-05-22");
    assert.equal(seedObligations.find((item) => item.id === "obl_defer_covered")?.deferredByStatusRequestId, "req_approve_defer");
    assert.equal(seedObligations.find((item) => item.id === "obl_defer_paid")?.deferredUntil, undefined);
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
    seedObligations.length = originalObligationsLength;
  }
});

test("rejectStatusRequest rejects pending request", async () => {
  const service = makeService();
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedDriverStatusRequests.push({
    id: "req_reject_pending",
    driverId: "drv_1",
    type: "day_off",
    status: "pending",
    period: "2026-05-21",
  });

  try {
    const updated = await service.rejectStatusRequest("req_reject_pending", {
      id: "usr_admin",
      role: "admin",
    });

    assert.equal(updated.status, "rejected");
    assert.equal(seedDriverStatusRequests.find((item) => item.id === "req_reject_pending")?.status, "rejected");
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("approveStatusRequest rejects overlap with already approved request", async () => {
  const service = makeService();
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedDriverStatusRequests.push(
    {
      id: "req_approved_existing",
      driverId: "drv_1",
      type: "vacation",
      status: "approved",
      period: "2026-05-20 .. 2026-05-22",
    },
    {
      id: "req_pending_overlap",
      driverId: "drv_1",
      type: "day_off",
      status: "pending",
      period: "2026-05-21",
    },
  );

  try {
    await assert.rejects(
      () => service.approveStatusRequest("req_pending_overlap", { id: "usr_admin", role: "admin" }),
      (error) => {
        assert.match(String(error), /overlaps an already approved period/);
        return true;
      },
    );
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});
