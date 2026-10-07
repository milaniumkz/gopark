import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryIncidentRepository } from "../application/in-memory.repositories.js";
import { IncidentPrismaRepository } from "../../infrastructure/repositories/incident.prisma.repository.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { seedManagerIncidents } from "../../data/seed.js";

for (const [name, repository] of [
  ["in-memory", new InMemoryIncidentRepository()],
  ["Prisma fallback", new IncidentPrismaRepository({ client: null } as PrismaService)],
] as const) {
  test(`${name}: preserves repeated incident transitions and their dates`, async () => {
    const incident = await repository.create({
      title: "History test", incidentType: "accident", status: "open",
      priority: "high", occurredAt: "2025-01-01T00:00:00Z",
      serviceStage: "awaiting_repair",
    });
    try {
      for (const serviceStage of ["in_repair", "awaiting_repair", "in_repair"]) {
        await repository.update(incident.id, { serviceStage });
      }
      await repository.update(incident.id, { repairNote: "No status change" });
      await repository.update(incident.id, { serviceStage: "in_repair" });
      await repository.update(incident.id, { status: "resolved", serviceStage: "completed" });
      const updated = await repository.update(incident.id, { status: "closed" });
      assert.deepEqual(updated?.statusHistory?.map(({ status, serviceStage }) => [status, serviceStage]), [
        ["open", "awaiting_repair"], ["open", "in_repair"],
        ["open", "awaiting_repair"], ["open", "in_repair"],
        ["closed", "completed"],
      ]);
      const times = updated!.statusHistory!.map(({ changedAt }) => Date.parse(changedAt));
      assert.ok(times.every(Number.isFinite));
      assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]!));
      assert.notEqual(updated!.statusHistory![0]!.changedAt, incident.occurredAt);
    } finally {
      seedManagerIncidents.splice(seedManagerIncidents.indexOf(incident), 1);
    }
  });
}

test("legacy incidents do not fabricate historical dates", async () => {
  const repository = new InMemoryIncidentRepository();
  const legacy = { id: "inc_history_legacy", title: "Legacy", status: "open", priority: "high", serviceStage: "awaiting_repair" };
  seedManagerIncidents.push(legacy);
  try {
    const unchanged = await repository.update(legacy.id, { repairNote: "Note" });
    assert.deepEqual(unchanged?.statusHistory, []);
    const updated = await repository.update(legacy.id, { serviceStage: "in_repair" });
    assert.equal(updated?.statusHistory?.length, 1);
    assert.equal(updated?.statusHistory?.[0]?.serviceStage, "in_repair");
  } finally {
    seedManagerIncidents.splice(seedManagerIncidents.indexOf(legacy), 1);
  }
});
