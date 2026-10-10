import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { IncidentPrismaRepository } from "./incident.prisma.repository.js";
import { IntegrationEventsService } from "../../modules/integrations/integration-events.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

test(
  "STO stages, durable 24h reminders, arrival cancellation, notification replay and payments on isolated PostgreSQL",
  { skip: process.env.REPAIR_INTEGRATION !== "true" },
  async () => {
    assert.equal(
      new URL(process.env.DATABASE_URL!).pathname,
      "/gopark_contract_test",
    );
    const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
    const db = new PrismaClient();
    const prisma = { client: db } as unknown as PrismaService;
    const repo = new IncidentPrismaRepository(prisma);
    const ids: string[] = [];
    let user: any, manager: any, driver: any, car: any;
    const push: any[] = [];
    const integration = new IntegrationEventsService(
      {
        sendToManager: async (...args: any[]) => {
          push.push(args);
        },
      } as any,
      prisma,
    );
    try {
      user = await db.user.create({
        data: {
          role: "manager",
          passwordHash: "isolated-no-login",
          firstName: "Test",
          lastName: "Test",
        },
      });
      manager = await db.manager.create({
        data: { userId: user.id, title: "Test" },
      });
      driver = await db.driver.create({
        data: {
          firstName: "Test",
          lastName: "Test",
          phone: "isolated-service-workflow",
          managerId: manager.id,
          status: "active",
        },
      });
      car = await db.car.create({
        data: {
          vin: "ISOLATED-SERVICE-WORKFLOW",
          plateNumber: "ISOLATED-STO",
          make: "Test",
          model: "Test",
          status: "assigned",
          managerId: manager.id,
        },
      });
      await db.carAssignment.create({
        data: { driverId: driver.id, carId: car.id, startedAt: new Date() },
      });
      const sent = await repo.create({
        title: "STO test",
        incidentType: "repair",
        status: "open",
        priority: "high",
        carId: car.id,
        driverId: driver.id,
        serviceStage: "sent_to_service",
        serviceDetails: { reason: "Диагностика" },
      });
      ids.push(sent.id);
      assert.equal(
        (await db.car.findUnique({ where: { id: car.id } })).status,
        "maintenance",
      );
      await assert.rejects(
        repo.create({
          title: "duplicate",
          incidentType: "repair",
          status: "open",
          priority: "high",
          carId: car.id,
          serviceStage: "sent_to_service",
          serviceDetails: { reason: "Диагностика" },
        }),
        /уже есть/,
      );
      const events = await db.outboxEvent.findMany({
        where: { aggregateId: sent.id },
      });
      assert.equal(events.length, 2);
      const reminder = events.find(
        (e: any) => e.topic === "service.arrival_overdue",
      );
      assert.ok(reminder);
      assert.equal(
        reminder.createdAt.getTime() - Date.parse(sent.serviceDetails!.sentAt!),
        86400000,
      );
      const event = events.find((e: any) => e.topic === "service.changed");
      await integration.handle(event.topic, {
        ...event.payload,
        eventId: event.id,
      });
      await integration.handle(event.topic, {
        ...event.payload,
        eventId: event.id,
      });
      assert.equal(
        await db.managerAlert.count({ where: { managerId: manager.id } }),
        1,
        "replayed event doesn't duplicate inbox notification",
      );
      await repo.update(sent.id, { serviceStage: "awaiting_repair" });
      await integration.handle(reminder.topic, {
        ...reminder.payload,
        eventId: reminder.id,
      });
      assert.equal(
        await db.managerAlert.count({ where: { managerId: manager.id } }),
        1,
        "confirmed arrival cancels overdue alert",
      );
      await repo.update(sent.id, { serviceStage: "in_repair" });
      await assert.rejects(
        repo.update(sent.id, { serviceStage: "completed" }),
        /заказ-наряда/,
      );
      const finished = await repo.update(sent.id, {
        serviceStage: "completed",
        serviceDetails: {
          reason: "Диагностика",
          orderNumber: "TEST-1",
          works: ["Диагностика"],
          serviceCost: 10000,
          costDate: "2026-10-10",
          payments: [
            {
              id: "TEST-PAY",
              amount: 4000,
              paidAt: "2026-10-10",
              payer: "company",
            },
          ],
        },
      });
      assert.equal(finished!.status, "closed");
      assert.equal(finished!.servicePaymentStatus, "partial");
      assert.ok(finished!.serviceDetails!.completedAt);
      assert.equal(
        (await db.car.findUnique({ where: { id: car.id } })).status,
        "assigned",
      );
      assert.equal(finished!.serviceDetails!.serviceCost! * 0.3, 3000);
      assert.equal(
        await db.outboxEvent.count({
          where: { aggregateId: sent.id, topic: "service.changed" },
        }),
        4,
      );
      const waiting = await repo.create({
        title: "STO test overdue",
        incidentType: "repair",
        status: "open",
        priority: "high",
        carId: car.id,
        driverId: driver.id,
        serviceStage: "sent_to_service",
        serviceDetails: { reason: "Диагностика" },
      });
      ids.push(waiting.id);
      await db.incident.update({
        where: { id: waiting.id },
        data: {
          serviceDetails: {
            ...waiting.serviceDetails,
            sentAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          },
        },
      });
      const overdue = await db.outboxEvent.findFirst({
        where: { aggregateId: waiting.id, topic: "service.arrival_overdue" },
      });
      await integration.handle(overdue.topic, {
        ...overdue.payload,
        eventId: overdue.id,
      });
      await integration.handle(overdue.topic, {
        ...overdue.payload,
        eventId: overdue.id,
      });
      assert.equal(
        await db.managerAlert.count({ where: { managerId: manager.id } }),
        2,
      );
      assert.equal(
        push.length,
        4,
        "push attempted for changes and overdue; inbox remains idempotent",
      );
    } finally {
      await db.managerAlert.deleteMany({
        where: { managerId: manager?.id ?? "none" },
      });
      await db.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
      await db.incident.deleteMany({ where: { id: { in: ids } } });
      if (car) await db.carAssignment.deleteMany({ where: { carId: car.id } });
      if (car) await db.car.delete({ where: { id: car.id } });
      if (driver) await db.driver.delete({ where: { id: driver.id } });
      if (manager) await db.manager.delete({ where: { id: manager.id } });
      if (user) await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    }
  },
);
