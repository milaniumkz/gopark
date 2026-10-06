import assert from "node:assert/strict";
import test from "node:test";
import { DashboardService } from "./dashboard.service.js";

for (const paid of [2300, 6900]) {
  test(`dashboard keeps charged amount separate from unpaid amount after payment of ${paid}`, async () => {
    const service = new DashboardService();
    Object.assign(service, {
      driverRepository: { list: async () => [{ id: "driver", status: "active" }] },
      carRepository: { list: async () => [] },
      incidentRepository: { list: async () => [] },
      statusRequestPolicyService: { getEffectiveCurrentStatuses: async () => ({ driver: "active" }) },
      obligationRepository: {
        getOpenDueByDriversInPeriod: async () => 6900 - paid,
        getTotalDueByDriversInPeriod: async () => 6900,
        countPaidByDrivers: async () => 1,
        countUnpaidByDrivers: async () => 0,
      },
      paymentRepository: { list: async () => [{ driverId: "driver", status: "succeeded", paymentForDate: "2026-10-06", appliedAmount: paid }] },
    });
    const overview = await service.getOverview("today", null, "2026-10-06", "2026-10-06");
    assert.equal(overview.plannedPayment, 6900);
    assert.equal(overview.debt, 6900 - paid);
    assert.equal(overview.actualPayment, paid);
    assert.equal(overview.overpayment, 0);
  });
}
