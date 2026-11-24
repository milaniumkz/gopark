import test from "node:test";
import assert from "node:assert/strict";
import { UserPrismaRepository } from "./user.prisma.repository.js";
import type { PrismaService } from "../prisma/prisma.service.js";

for (const level of ["regular", "senior"] as const) {
  test(`${level} manager keeps the database role level on sign-in and session refresh`, async () => {
    const calls: any[] = [];
    const db = { user: { findFirst: async (query: unknown) => {
      calls.push(query);
      return { id: "user", phone: "test", role: "manager", manager: { id: "profile", level }, firstName: "Test", lastName: "Manager" };
    } } };
    const repository = new UserPrismaRepository({ client: db } as unknown as PrismaService);
    const login = await repository.findByLogin("test");
    const refreshed = await repository.findByRequestPrincipal("user", "manager");
    assert.equal(login?.managerLevel, level);
    assert.equal(refreshed?.managerLevel, level);
    assert.ok(calls.every((query) => query.select.manager.select.level === true));
  });
}
