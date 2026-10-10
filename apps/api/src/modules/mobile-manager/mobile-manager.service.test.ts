import test from "node:test";
import assert from "node:assert/strict";
import { MobileManagerService } from "./mobile-manager.service.js";

function fixture() {
  const user = { id: "user-subanov", role: "manager" as const, companyName: "GoPark" };
  const manager = { id: user.id, managerProfileId: "manager-subanov", role: "manager", displayName: "Субанов", companyName: "GoPark" };
  const driver = { id: "driver", managerId: manager.managerProfileId, fullName: "Водитель", companyName: "GoPark" };
  const cars = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `own-${i}`, managerId: manager.managerProfileId, companyName: "GoPark", status: "free", plateNumber: `OWN-${i}`, make: "Test", model: "Car" })),
    { id: "legacy", managerId: null, assignedDriverId: driver.id, companyName: "GoPark", status: "assigned", plateNumber: "LEGACY" },
    { id: "other", managerId: "other-manager", assignedDriverId: driver.id, companyName: "GoPark", status: "free", plateNumber: "OTHER" },
    { id: "other-company", managerId: manager.managerProfileId, companyName: "Other", status: "free", plateNumber: "OUTSIDE" },
  ];
  const service = new MobileManagerService({ getFinanceSnapshots: async () => ({}) } as never, {
    getScopedDrivers: async () => [driver], assertCanAccessDriver: async () => undefined,
  } as never, { createManagerDriverEvent: async () => undefined } as never);
  const created: any[] = [];
  const updated: any[] = [];
  let assignedCar: any = cars[5];
  Object.assign(service, {
    carRepository: {
      listByCompany: async (company: string) => cars.filter((car) => car.companyName === company),
      getById: async (id: string) => cars.find((car) => car.id === id),
      getAssignedByDriver: async () => assignedCar,
      update: async (id: string, patch: unknown) => { updated.push({ id, patch }); },
    },
    userRepository: {
      listAdminByCompany: async () => [manager],
      getManagerScopeIds: async () => new Set([user.id, manager.managerProfileId]),
      getManagerProfile: async () => manager,
    },
    driverRepository: { getById: async () => driver },
    incidentRepository: {
      listByCompany: async () => created,
      listOpenByDriver: async () => [],
      create: async (input: unknown) => { const incident = { id: `incident-${created.length}`, ...input as object }; created.push(incident); return incident; },
    },
  });
  return { service, user, created, updated, setAssignedCar: (car: unknown) => { assignedCar = car; } };
}

test("directly assigned vehicles appear without drivers, preserve manager identity and exclude other owners/companies", async () => {
  const { service, user } = fixture();
  const vehicles = await service.getVehicles(user);
  assert.deepEqual(vehicles.map((car) => car.id), ["own-0", "own-1", "own-2", "own-3", "own-4", "legacy"]);
  assert.ok(vehicles.every((car) => car.managerId === "manager-subanov" && car.managerName === "Субанов"));
  assert.equal((await service.getIdleVehicles(user)).length, 5);
  assert.equal((await service.getManagers(user))[0].carsTotal, 6);
  assert.equal((await service.getManagers(user))[0].idleCarsTotal, 5);
  assert.ok(await service.getVehicleDetail("own-0", user));
  assert.equal(await service.getVehicleDetail("other", user), null);
  assert.equal(await service.getVehicleDetail("other-company", user), null);
});

test("sending a driver's vehicle to repair creates the journal incident with vehicle, manager, date and note", async () => {
  const { service, user, created, updated } = fixture();
  const incident = await service.createDriverIncidentAction("driver", { action: "repair", note: "Замена тормозов" }, user);
  assert.equal(created.length, 1);
  assert.equal(incident.carId, "legacy");
  assert.equal(incident.driverId, "driver");
  assert.equal(incident.incidentType, "repair");
  assert.equal(incident.serviceStage, "sent_to_service");
  assert.equal(incident.serviceDetails!.reason,"Замена тормозов");
  assert.equal(incident.managerLabel, "Субанов");
  assert.equal(incident.repairNote, "Замена тормозов");
  assert.ok(incident.occurredAt);
  assert.ok(Number.isFinite(Date.parse(incident.occurredAt!)));
  assert.deepEqual(updated, [], "car changes must be part of the incident repository transaction, not a separate call");
});

test("repair without an assigned vehicle creates no journal entry or vehicle update", async () => {
  const { service, user, created, updated, setAssignedCar } = fixture();
  setAssignedCar(null);
  await assert.rejects(service.createDriverIncidentAction("driver", { action: "repair", note:"Причина" }, user), /нет назначенной машины/);
  assert.equal(created.length, 0);
  assert.equal(updated.length, 0);
});

test("selected debt period excludes today's/future installments from overdue, while due-period sums remain independent", async () => {
  const { service, user } = fixture();
  const driver = { id: "driver", fullName: "Test", phone: "Test", status: "active", activeContractId: "contract" };
  const amounts: Record<string, number> = { "2026-10-05": 500, "2026-10-06": 0, "2026-10-07": 2300, "2026-10-08": 2300 };
  Object.assign(service, {
    today: () => "2026-10-07",
    mobileAccessService: { getScopedDrivers: async () => [driver] },
    driverMobileReadService: { getDriverAssignmentSnapshots: async () => ({}), getFinanceSnapshots: async () => ({ driver: { overdueDebt: 9000 } }) },
    getHistoricalFinanceSnapshots: async () => new Map(),
    statusRequestPolicyService: {
      getEffectiveCurrentStatuses: async () => ({ driver: "active" }),
      listEffectiveOpenObligations: async (id: string, credit: number) => {
        assert.equal(id, "driver"); assert.equal(credit, 0);
        return Object.entries(amounts).map(([effectiveDueDate, remainingAmount]) => ({ effectiveDueDate, remainingAmount }));
      },
    },
    obligationRepository: { getOpenDueByDriverInPeriod: async (id: string, from: string, to: string) => {
      assert.equal(id, "driver");
      return Object.entries(amounts).reduce((sum, [date, amount]) => sum + (date >= from && date <= to ? amount : 0), 0);
    } },
  });
  const [item] = await service.getDrivers(user, "2026-10-05", "2026-10-08");
  assert.equal(item!.overduePeriodAmount, 500);
  assert.equal(item!.duePeriodAmount, 5100);
  assert.equal(item!.overdueDebt, 9000, "period selection does not change the total debt");
  assert.equal((await service.getDrivers(user))[0]!.overduePeriodAmount, null);
  assert.equal((await service.getDrivers(user, "2026-10-07", "2026-10-08"))[0]!.overduePeriodAmount, 0);
  await assert.rejects(service.getDrivers(user, "2026-10-08", "2026-10-05"), /корректный период/);
  await assert.rejects(service.getDrivers(user, "2026-02-30", "2026-03-01"), /корректный период/);
});

test("manager calendar is scoped and uses confirmed payments, real incident dates and day-off statuses", async()=>{
 const {service,user,created}=fixture();
 Object.assign(service,{
  prismaService:{client:null},
  driverRepository:{getById:async()=>({id:"driver",fullName:"Test",weeklyDayOff:"sunday"})},
  contractRepository:{getActiveByDriver:async()=>({contractNumber:"101",installmentAmount:2300,startDate:"2026-10-01",endDate:"2026-10-31"})},
  paymentRepository:{listByDriver:async()=>[
   {createdAt:"2026-10-01T10:00:00Z",status:"succeeded",amount:2300,appliedAmount:2300},
   {createdAt:"2026-10-02T10:00:00Z",status:"pending",amount:2300,appliedAmount:0},
   {createdAt:"2026-10-03T10:00:00Z",status:"succeeded",amount:400,appliedAmount:400},
  ]},
 });
 created.push({id:"old",driverId:"driver",incidentType:"repair",status:"closed",occurredAt:"2026-10-06T10:00:00Z"});
 const calendar=await service.getDriverCalendar("driver","2026-10",user);
 assert.equal(calendar.days.length,31);assert.equal(calendar.paid,2700);
 assert.equal(calendar.days[0]!.status,"paid");assert.equal(calendar.days[1]!.amount,0);assert.equal(calendar.days[2]!.status,"partial");assert.equal(calendar.days[3]!.status,"dayoff");
 assert.equal(calendar.days[5]!.status,"repair");assert.notEqual(calendar.days[6]!.status,"repair","historical unknown completion date must not extend repair to today");
 await assert.rejects(service.getDriverCalendar("driver","2026-13",user),/Месяц/);
});
