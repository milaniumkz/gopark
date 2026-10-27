import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { IncidentPrismaRepository } from "./incident.prisma.repository.js";
import type { PrismaService } from "../prisma/prisma.service.js";

test(
  "manual STO cases are scoped, numbering is serialized and insurance confirmations are counted without double payment",
  { skip: process.env.REPAIR_INTEGRATION !== "true" },
  async () => {
    assert.equal(
      new URL(process.env.DATABASE_URL!).pathname,
      "/gopark_contract_test",
    );
    const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
    const db = new PrismaClient();
    const repo = new IncidentPrismaRepository({
      client: db,
    } as unknown as PrismaService);
    const ids: string[] = [];
    const company = `STO-test-${Date.now()}`;
    try {
      const legacy = await db.incident.create({
        data: {
          title: "Legacy paid repair",
          incidentType: "repair",
          status: "closed",
          priority: "low",
          serviceStage: "completed",
          serviceDetails: {
            reason: "Test",
            orderNumber: "OLD-900000",
            serviceCost: 1000,
            costDate: "2026-10-01",
            insurance: { insurer: "nsk", paid: true, paidAt: "2026-10-01" },
            manualVehicle: {
              plateNumber: `OLD-${Date.now()}`,
              make: "Test",
              model: "Test",
              companyName: company,
            },
          },
        },
      });
      ids.push(legacy.id);
      const make = (plate: string) =>
        repo.create({
          title: plate,
          incidentType: "repair",
          status: "open",
          priority: "high",
          serviceStage: "sent_to_service",
          serviceDetails: {
            reason: "Test reason",
            orderNumber: "client-spoof-99999999",
            repairCategory: "repair",
            manualVehicle: {
              plateNumber: plate,
              make: "Test",
              model: "Model",
              companyName: company,
            },
          },
        });
      const first = await Promise.all([
        make(`ONE-${Date.now()}`),
        make(`TWO-${Date.now()}`),
      ]);
      ids.push(...first.map((i) => i.id));
      const numbers = first.map((i) => Number(i.serviceDetails!.orderNumber));
      assert.ok(numbers.every((n) => n > 900000 && n < 99999999));
      assert.equal(new Set(numbers).size, 2);
      const scoped = await repo.listByCompany(company);
      assert.equal(scoped.filter((i) => ids.includes(i.id)).length, 3);
      assert.equal(
        (await repo.listByCompany(company + "-other")).filter((i) =>
          ids.includes(i.id),
        ).length,
        0,
      );
      const projected = scoped.find((i) => i.id === legacy.id)!;
      assert.equal(projected.servicePaymentStatus, "paid");
      assert.equal(
        projected.serviceDetails!.payments!.reduce((s, p) => s + p.amount, 0),
        1000,
      );
      assert.equal(
        (await db.incident.findUniqueOrThrow({ where: { id: legacy.id } }))
          .serviceDetails.payments,
        undefined,
        "read projection must not mutate stored records",
      );
      const increase = await repo.update(legacy.id, {
        serviceDetails: { ...projected.serviceDetails!, serviceCost: 1500 },
      });
      assert.equal(increase!.servicePaymentStatus, "partial");
      assert.equal(
        increase!.serviceDetails!.payments!.reduce((s, p) => s + p.amount, 0),
        1000,
      );
      const updated = await repo.update(first[0]!.id, {
        serviceDetails: {
          ...first[0]!.serviceDetails!,
          orderNumber: "must-not-change",
          orderItems: [
            {
              id: "paint",
              description: "Painting",
              category: "painting",
              amount: 2000,
            },
            {
              id: "repair",
              description: "Repair",
              category: "repair",
              amount: 1000,
            },
          ],
          serviceCost: 999,
        },
      });
      assert.equal(
        updated!.serviceDetails!.orderNumber,
        first[0]!.serviceDetails!.orderNumber,
      );
      assert.equal(updated!.serviceDetails!.serviceCost, 3000);
      assert.equal(updated!.serviceDetails!.paintingCost, 2000);
      await assert.rejects(
        () => make(first[0]!.serviceDetails!.manualVehicle!.plateNumber),
        /открытый ремонт/,
      );
    } finally {
      if (ids.length) {
        for (const id of ids)
          await db.outboxEvent.deleteMany({
            where: { payload: { path: ["incidentId"], equals: id } },
          });
        await db.incident.deleteMany({ where: { id: { in: ids } } });
      }
      await db.$disconnect();
    }
  },
);

test(
  "GoPark part expenses atomically create receipt/writeoff or stock writeoff once, and stock failures preserve the document",
  { skip: process.env.REPAIR_INTEGRATION !== "true" },
  async () => {
    assert.equal(
      new URL(process.env.DATABASE_URL!).pathname,
      "/gopark_contract_test",
    );
    const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
    const db = new PrismaClient();
    const repo = new IncidentPrismaRepository({
      client: db,
    } as unknown as PrismaService);
    const scope = `stock-order-${Date.now()}`;
    const partIds: string[] = [];
    let incidentId: string | undefined;
    try {
      const stock = await db.part.create({
        data: {
          name: "Existing test part",
          companyName: scope,
          quantity: 2,
          unitPrice: 40,
        },
      });
      partIds.push(stock.id);
      const details = {
        reason: "Test work",
        workshop: "main" as const,
        manualVehicle: {
          plateNumber: scope.toUpperCase(),
          make: "Test",
          model: "Test",
          companyName: scope,
        },
        orderItems: [
          {
            id: "work",
            description: "Test work",
            category: "repair" as const,
            serviceAmount: 100,
            laborAmount: 50,
          },
        ],
        expenses: [
          {
            id: "new",
            description: "New part",
            amount: 30,
            purchaser: "company" as const,
            inventoryMode: "purchase" as const,
          },
          {
            id: "stock",
            description: "Existing test part",
            amount: 40,
            purchaser: "company" as const,
            inventoryMode: "stock" as const,
            partId: stock.id,
          },
          {
            id: "sto",
            description: "STO consumables",
            amount: 20,
            purchaser: "sto" as const,
          },
          {
            id: "driver",
            description: "Driver part",
            amount: 100,
            purchaser: "driver" as const,
          },
        ],
      };
      const first = await repo.create({
        inventoryCompanyScope: scope,
        title: "Inventory repair",
        incidentType: "repair",
        status: "open",
        priority: "high",
        serviceStage: "sent_to_service",
        serviceDetails: details,
      });
      incidentId = first.id;
      const purchased = first.serviceDetails!.expenses!.find(
        (e) => e.id === "new",
      )!;
      assert.ok(purchased.inventoryApplied);
      assert.ok(purchased.partId);
      partIds.push(purchased.partId!);
      assert.equal(
        (await db.part.findUniqueOrThrow({ where: { id: stock.id } })).quantity,
        1,
      );
      assert.equal(
        (await db.part.findUniqueOrThrow({ where: { id: purchased.partId } }))
          .quantity,
        0,
      );
      assert.equal(
        await db.partMovement.count({ where: { incidentId: first.id } }),
        3,
      );
      assert.equal(first.serviceDetails!.serviceCost, 170);
      assert.equal(first.serviceDetails!.serviceBaseCost, 150);
      const replay = await repo.update(first.id, {
        inventoryCompanyScope: scope,
        serviceDetails: details,
      });
      assert.equal(
        await db.partMovement.count({ where: { incidentId: first.id } }),
        3,
      );
      assert.equal(
        (await db.part.findUniqueOrThrow({ where: { id: stock.id } })).quantity,
        1,
      );
      const reopened = (await repo.listByCompany(scope)).find(
        (i) => i.id === first.id,
      )!;
      assert.deepEqual(
        reopened.serviceDetails!.orderItems,
        replay!.serviceDetails!.orderItems,
      );
      assert.equal(
        reopened.serviceDetails!.orderNumber,
        first.serviceDetails!.orderNumber,
      );
      assert.equal(reopened.serviceDetails!.expenses!.length, 4);
      const beforeEvents = await db.outboxEvent.count({
        where: { aggregateId: first.id },
      });
      await repo.update(first.id, {
        inventoryCompanyScope: scope,
        serviceDetails: reopened.serviceDetails!,
      });
      assert.equal(
        await db.outboxEvent.count({ where: { aggregateId: first.id } }),
        beforeEvents,
        "saving an unchanged document must not repeat its notifications",
      );
      await assert.rejects(
        () =>
          repo.update(first.id, {
            inventoryCompanyScope: scope,
            serviceDetails: {
              ...reopened.serviceDetails!,
              expenses: [
                ...reopened.serviceDetails!.expenses!,
                {
                  id: "bad1",
                  description: "One",
                  amount: 40,
                  purchaser: "company",
                  inventoryMode: "stock",
                  partId: stock.id,
                },
                {
                  id: "bad2",
                  description: "Two",
                  amount: 40,
                  purchaser: "company",
                  inventoryMode: "stock",
                  partId: stock.id,
                },
              ],
            },
          }),
        /Недостаточно/,
      );
      assert.equal(
        (await db.part.findUniqueOrThrow({ where: { id: stock.id } })).quantity,
        1,
      );
      assert.equal(
        (await db.incident.findUniqueOrThrow({ where: { id: first.id } }))
          .serviceDetails.expenses.length,
        4,
      );
      assert.equal(
        await db.partMovement.count({ where: { incidentId: first.id } }),
        3,
      );
      await assert.rejects(
        () =>
          repo.update(first.id, {
            inventoryCompanyScope: scope,
            serviceDetails: {
              ...reopened.serviceDetails!,
              expenses: reopened.serviceDetails!.expenses!.filter(
                (e) => e.id !== "new",
              ),
            },
          }),
        /нельзя удалять/,
      );
    } finally {
      if (incidentId) {
        await db.outboxEvent.deleteMany({ where: { aggregateId: incidentId } });
        await db.partMovement.deleteMany({ where: { incidentId } });
        await db.incident.deleteMany({ where: { id: incidentId } });
      }
      if (partIds.length) {
        await db.partMovement.deleteMany({
          where: { partId: { in: partIds } },
        });
        await db.part.deleteMany({ where: { id: { in: partIds } } });
      }
      await db.$disconnect();
    }
  },
);
