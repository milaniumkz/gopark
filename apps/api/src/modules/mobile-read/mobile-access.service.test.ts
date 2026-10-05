import test from "node:test";
import assert from "node:assert/strict";
import { seedDrivers, seedUsers } from "../../data/seed.js";
import { MobileAccessService } from "./mobile-access.service.js";

test("senior manager scope includes junior managers drivers", async () => {
  const originalUsersLength = seedUsers.length;
  const originalDriversLength = seedDrivers.length;

  seedUsers.push(
    {
      id: "usr_scope_senior",
      login: "senior-scope@gopark.local",
      password: "manager123",
      requestUserId: "mgr_scope_senior",
      refreshTokenVersion: 0,
      role: "manager",
      status: "active",
      mfaEnabled: false,
      displayName: "Senior Scope",
      managerLevel: "senior",
      seniorManagerId: null,
    },
    {
      id: "usr_scope_junior",
      login: "junior-scope@gopark.local",
      password: "manager123",
      requestUserId: "mgr_scope_junior",
      refreshTokenVersion: 0,
      role: "manager",
      status: "active",
      mfaEnabled: false,
      displayName: "Junior Scope",
      managerLevel: "regular",
      seniorManagerId: "mgr_scope_senior",
    },
  );

  seedDrivers.push(
    {
      id: "drv_scope_senior",
      fullName: "Senior Direct Driver",
      phone: "+996700000001",
      companyName: null,
      weeklyDayOff: null,
      status: "active",
      riskStatus: "normal",
      managerId: "mgr_scope_senior",
      activeContractId: null,
      creditBalance: 0,
    },
    {
      id: "drv_scope_junior",
      fullName: "Junior Driver",
      phone: "+996700000002",
      companyName: null,
      weeklyDayOff: null,
      status: "active",
      riskStatus: "normal",
      managerId: "mgr_scope_junior",
      activeContractId: null,
      creditBalance: 0,
    },
    {
      id: "drv_scope_other",
      fullName: "Other Driver",
      phone: "+996700000003",
      companyName: null,
      weeklyDayOff: null,
      status: "active",
      riskStatus: "normal",
      managerId: "mgr_scope_other",
      activeContractId: null,
      creditBalance: 0,
    },
  );

  try {
    const service = new MobileAccessService();
    const drivers = await service.getScopedDrivers({
      id: "mgr_scope_senior",
      role: "manager",
    });
    const driverIds = drivers.map((driver) => driver.id).sort();

    assert.deepEqual(driverIds, ["drv_scope_junior", "drv_scope_senior"]);
  } finally {
    seedUsers.length = originalUsersLength;
    seedDrivers.length = originalDriversLength;
  }
});
