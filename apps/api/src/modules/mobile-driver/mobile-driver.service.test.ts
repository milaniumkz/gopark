import test from "node:test";
import assert from "node:assert/strict";
import { seedDriverStatusRequests } from "../../data/seed.js";
import { MobileDriverService } from "./mobile-driver.service.js";
import { DriverMobileReadService } from "../mobile-read/driver-mobile-read.service.js";
import { MobileAccessService } from "../mobile-read/mobile-access.service.js";

function makeService() {
  return new MobileDriverService(
    new DriverMobileReadService(),
    {} as any,
    {
      assertCanAccessDriver: async () => undefined,
    } as any,
    {
      createDriverPaymentRegistered: async () => null,
      createDriverStatusRequestCreated: async () => null,
      createManagerStatusRequestCreated: async () => null,
    } as any,
  );
}

test("createStatusRequest rejects invalid period format", async () => {
  const service = makeService();

  await assert.rejects(
    () =>
      service.createStatusRequest(
        "drv_1",
        {
          type: "day_off",
          period: "20-05-2026",
        },
        { id: "drv_1", role: "driver" },
      ),
    (error) => {
      assert.match(String(error), /Status request period must be YYYY-MM-DD or YYYY-MM-DD .. YYYY-MM-DD/);
      return true;
    },
  );
});

test("createStatusRequest rejects overlap with pending or approved request", async () => {
  const service = makeService();
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedDriverStatusRequests.push({
    id: "req_overlap_pending",
    driverId: "drv_overlap",
    type: "vacation",
    status: "pending",
    period: "2026-05-20 .. 2026-05-22",
  });

  try {
    await assert.rejects(
      () =>
        service.createStatusRequest(
          "drv_overlap",
          {
            type: "day_off",
            period: "2026-05-21",
          },
          { id: "drv_overlap", role: "driver" },
        ),
      (error) => {
        assert.match(String(error), /overlaps an existing pending or approved request/);
        return true;
      },
    );
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});

test("createStatusRequest allows non-overlapping valid period", async () => {
  const service = makeService();
  const originalRequestsLength = seedDriverStatusRequests.length;

  seedDriverStatusRequests.push({
    id: "req_non_overlap_existing",
    driverId: "drv_non_overlap",
    type: "vacation",
    status: "approved",
    period: "2026-05-01 .. 2026-05-03",
  });

  try {
    const created = await service.createStatusRequest(
      "drv_non_overlap",
      {
        type: "day_off",
        period: "2026-05-05",
      },
      { id: "drv_non_overlap", role: "driver" },
    );

    assert.equal(created.driverId, "drv_non_overlap");
    assert.equal(created.status, "pending");
    assert.equal(created.period, "2026-05-05");
  } finally {
    seedDriverStatusRequests.length = originalRequestsLength;
  }
});
