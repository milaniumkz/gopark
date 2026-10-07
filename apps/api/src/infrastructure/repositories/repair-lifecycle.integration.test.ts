import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { IncidentPrismaRepository } from "./incident.prisma.repository.js";
import type { PrismaService } from "../prisma/prisma.service.js";

test("repair creation/completion is atomic, concurrent and idempotent, preserves other repairs and historic assignments", {
  skip: process.env.REPAIR_INTEGRATION !== "true",
}, async () => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/gopark_contract_test");
  const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
  const db = new PrismaClient();
  const repo = new IncidentPrismaRepository({ client: db } as unknown as PrismaService);
  const drivers: string[] = [], cars: string[] = [], incidents: string[] = [];
  try {
    // The isolated schema was created with db push; install the production history trigger.
    const sql = readFileSync(new URL("../../../prisma/migrations/20261006060000_incident_status_history/migration.sql", import.meta.url), "utf8");
    const func = sql.slice(sql.indexOf("CREATE FUNCTION"), sql.indexOf("CREATE TRIGGER"));
    await db.$executeRawUnsafe(func.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS incident_status_history ON incidents');
    await db.$executeRawUnsafe(sql.slice(sql.indexOf("CREATE TRIGGER"), sql.indexOf("-- Existing rows")));
    const driver = await db.driver.create({ data: { firstName: "Repair", lastName: "Test", phone: "isolated-repair-test", status: "accident" } }); drivers.push(driver.id);
    const car = await db.car.create({ data: { vin: "ISOLATED-REPAIR-TEST", plateNumber: "ISOLATED-REPAIR", make: "Test", model: "Test", status: "assigned" } }); cars.push(car.id);
    await db.carAssignment.create({ data: { carId: car.id, driverId: driver.id, startedAt: new Date("2026-10-01T00:00:00Z") } });
    const input = { title: "Repair test", incidentType: "repair", status: "open", priority: "high", serviceStage: "in_repair", carId: car.id, driverId: driver.id };
    const repair = await repo.create(input); incidents.push(repair.id);
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "maintenance");
    assert.equal(repair.statusHistory?.length, 1);
    const second = await repo.create(input); incidents.push(second.id);
    await Promise.all(Array.from({ length: 5 }, () => repo.update(repair.id, { serviceStage: "completed", status: "closed" })));
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "maintenance", "another open repair blocks release");
    assert.equal((await db.incident.findUnique({ where: { id: repair.id } })).statusHistory.length, 2, "repeat requests do not add transitions");
    // Failure AFTER updating the incident must roll back both records and history.
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION isolated_repair_fail() RETURNS trigger AS $$ BEGIN IF NEW.vin = 'ISOLATED-REPAIR-TEST' AND NEW.status = 'assigned' THEN RAISE EXCEPTION 'isolated car update failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe('CREATE TRIGGER isolated_repair_fail BEFORE UPDATE ON cars FOR EACH ROW EXECUTE FUNCTION isolated_repair_fail()');
    await assert.rejects(repo.update(second.id, { serviceStage: "completed", status: "closed" }), /isolated car update failure/);
    const rolledBack = await db.incident.findUnique({ where: { id: second.id } });
    assert.equal(rolledBack.status, "open"); assert.equal(rolledBack.statusHistory.length, 1);
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "maintenance");
    await db.$executeRawUnsafe('DROP TRIGGER isolated_repair_fail ON cars');
    await repo.update(second.id, { serviceStage: "completed", status: "closed" });
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "assigned");
    assert.equal((await db.driver.findUnique({ where: { id: driver.id } })).status, "active");
    await repo.update(repair.id, { status: "open", serviceStage: "in_repair" });
    await db.driver.update({ where: { id: driver.id }, data: { status: "terminated" } });
    await db.carAssignment.updateMany({ where: { carId: car.id }, data: { endedAt: new Date() } });
    const replacement = await db.car.create({ data: { vin: "ISOLATED-REPLACEMENT", plateNumber: "ISOLATED-REPLACEMENT", make: "Test", model: "Test", status: "maintenance" } }); cars.push(replacement.id);
    await db.carAssignment.create({ data: { carId: replacement.id, driverId: driver.id, startedAt: new Date() } });
    await repo.update(repair.id, { serviceStage: "completed", status: "closed" });
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "free");
    assert.equal((await db.car.findUnique({ where: { id: replacement.id } })).status, "maintenance", "never touch the driver's replacement car");
    assert.equal((await db.driver.findUnique({ where: { id: driver.id } })).status, "terminated");
    const legacy = await repo.create({ ...input, carId: null, occurredAt: "2026-10-05T12:00:00Z", status: "closed", serviceStage: "completed" }); incidents.push(legacy.id);
    assert.equal(legacy.carId, car.id, "legacy case uses its historic assignment, not the replacement car");
    assert.equal((await db.car.findUnique({ where: { id: replacement.id } })).status, "maintenance");
    const unknown = await repo.create({ ...input, carId: null, occurredAt: null, status: "closed", serviceStage: "completed" }); incidents.push(unknown.id);
    assert.equal(unknown.carId, undefined, "without a historical date the car must not be guessed");
    await db.car.update({ where: { id: car.id }, data: { status: "sold" } });
    await repo.update(repair.id, { serviceStage: "completed", status: "closed" });
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "sold");
    // Invalid car data forces the transaction to roll back the incident too.
    const before = await db.incident.count();
    await assert.rejects(repo.create({ ...input, carId: "invalid-uuid" }));
    assert.equal(await db.incident.count(), before);
    await db.car.update({ where: { id: car.id }, data: { status: "maintenance" } });
    await repo.update(repair.id, { serviceStage: "written_off", status: "closed" });
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "written_off");
    await repo.update(repair.id, { serviceStage: "completed", status: "closed" });
    assert.equal((await db.car.findUnique({ where: { id: car.id } })).status, "written_off");
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS isolated_repair_fail ON cars');
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS isolated_repair_fail()');
    await db.incident.deleteMany({ where: { id: { in: incidents } } });
    await db.carAssignment.deleteMany({ where: { carId: { in: cars } } });
    await db.driver.deleteMany({ where: { id: { in: drivers } } });
    await db.car.deleteMany({ where: { id: { in: cars } } });
    await db.$disconnect();
  }
});
