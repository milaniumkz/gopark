import test from "node:test";
import assert from "node:assert/strict";
import { IncidentsController } from "./incidents.controller.js";

test("ID-only repair transitions cannot update an incident outside the user's company", async () => {
  const updates: unknown[] = [];
  const controller = new IncidentsController({
    listByCompany: async (company: string) => { assert.equal(company, "Own company"); return [{ id: "own-case" }]; },
    update: async (id: string, patch: unknown) => { updates.push({ id, patch }); return { id }; },
  } as never);
  const user = { id: "manager", role: "manager" as const, companyName: "Own company" };
  await assert.rejects(controller.update("other-case", { status: "closed", serviceStage: "completed" }, user), /Incident not found/);
  assert.equal(updates.length, 0);
  await controller.update("own-case", { status: "closed", serviceStage: "completed" }, user);
  assert.equal(updates.length, 1);
});
