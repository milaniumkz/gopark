import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PartsService } from "./parts.service.js";

test(
  "parts requester, complete dated statistics and concurrent stock protection on isolated PostgreSQL",
  { skip: process.env.PARTS_INTEGRATION !== "true" },
  async () => {
    assert.equal(
      new URL(process.env.DATABASE_URL!).pathname,
      "/gopark_contract_test",
    );
    const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
    const db = new PrismaClient();
    const service = new PartsService();
    (service as any).prisma = { client: db };
    const scope = `isolated-parts-${Date.now()}`;
    try {
      await assert.rejects(
        service.receive(
          {
            name: "Test part",
            quantity: 1,
            requesterCompany: "Not a CRM company",
          },
          scope,
        ),
        /справочника/,
      );
      await service.receive(
        {
          name: "Test part",
          quantity: 2,
          unitPrice: 20,
          requesterCompany: "СТО",
          supplier: "Legacy supplier",
        },
        scope,
      );
      const part = await db.part.findFirstOrThrow({
        where: { companyName: scope },
      });
      await service.receive(
        { partId: part.id, quantity: 1, requesterCompany: "СТО" },
        scope,
      );
      await db.$transaction(async (tx: any) => {
        await tx.part.update({
          where: { id: part.id },
          data: { quantity: { increment: 100 } },
        });
        await tx.partMovement.createMany({
          data: Array.from({ length: 100 }, (_, i) => ({
            partId: part.id,
            type: "receive",
            quantity: 1,
            unitPrice: 20,
            requesterCompany: i === 0 ? null : "СТО",
            createdAt: new Date(i === 0 ? "2020-01-01T12:00:00Z" : Date.now()),
          })),
        });
      });
      const all = await service.overview(scope);
      assert.equal(
        all.movements.length,
        102,
        "statistics must not silently truncate at 100",
      );
      assert.ok(all.movements.some((m) => m.requesterCompany === null));
      const old = await service.overview(scope, "2020-01-01", "2020-01-01");
      assert.equal(old.movements.length, 1);
      assert.equal(
        old.parts[0]!.quantity,
        103,
        "period must not change current stock",
      );
      assert.equal(
        all.parts[0]!.supplier,
        "Legacy supplier",
        "requester must not replace supplier",
      );
      assert.ok(
        all.movements.every((m) => m.unitPrice === 20),
        "new receipts inherit the saved unit price when omitted",
      );
      const results = await Promise.allSettled([
        service.writeoff(
          { partId: part.id, quantity: 103, requesterCompany: "СТО" },
          scope,
        ),
        service.writeoff(
          { partId: part.id, quantity: 103, requesterCompany: "СТО" },
          scope,
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (await db.part.findUniqueOrThrow({ where: { id: part.id } })).quantity,
        0,
      );
      assert.equal(
        await db.partMovement.count({
          where: { partId: part.id, type: "writeoff" },
        }),
        1,
      );
      await assert.rejects(service.overview(scope, "2026-02-30"), /корректные/);
    } finally {
      await db.partMovement.deleteMany({
        where: { part: { companyName: scope } },
      });
      await db.part.deleteMany({ where: { companyName: scope } });
      await db.$disconnect();
    }
  },
);
