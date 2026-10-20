import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { MobileManagerService } from "../../modules/mobile-manager/mobile-manager.service.js";

const enabled = process.env.CALENDAR_INTEGRATION === "true";
test(
  "calendar comments survive a new service instance and leave financial overrides unchanged",
  { skip: !enabled },
  async () => {
    assert.match(
      new URL(process.env.DATABASE_URL!).pathname,
      /_test$/,
      "isolated test DB required",
    );
    const prisma = new PrismaService();
    const db = prisma.client!;
    const driverId = randomUUID(),
      userId = randomUUID(),
      managerId = randomUUID();
    const currentUser = {
      id: managerId,
      role: "manager",
      companyName: "calendar-test",
    } as const;
    const make = () => {
      const service = new MobileManagerService(
        {} as never,
        {
          assertCanAccessDriver: async (id: string) =>
            assert.equal(id, driverId),
        } as never,
        {} as never,
      );
      Object.assign(service, {
        prismaService: prisma,
        driverRepository: {
          getById: async () => ({ id: driverId, fullName: "Calendar test" }),
        },
        contractRepository: {
          getActiveByDriver: async () => ({
            installmentAmount: 2300,
            startDate: "2026-10-01",
          }),
        },
        paymentRepository: { listByDriver: async () => [] },
        incidentRepository: { listByCompany: async () => [] },
        carRepository: { getAssignedByDriver: async () => null },
      });
      return service;
    };
    try {
      await db.user.create({
        data: {
          id: userId,
          firstName: "Calendar",
          lastName: "Test",
          passwordHash: "test-only",
          role: "manager",
          status: "active",
          companyName: "calendar-test",
        },
      });
      await db.manager.create({
        data: { id: managerId, userId, title: "Test brigadier" },
      });
      await db.driver.create({
        data: {
          id: driverId,
          firstName: "Calendar",
          lastName: "Test",
          phone: `calendar-${driverId}`,
          companyName: "calendar-test",
        },
      });
      await db.paymentCalendarDayOverride.create({
        data: {
          driverId,
          date: new Date("2026-10-01"),
          status: "unpaid",
          note: "Financial override",
        },
      });
      await make().saveDriverCalendarComment(
        driverId,
        "2026-10-01",
        "Причина просрочки",
        currentUser,
      );
      assert.equal(
        (await make().getDriverCalendar(driverId, "2026-10", currentUser))
          .days[0]!.comment,
        "Причина просрочки",
      );
      await make().saveDriverCalendarComment(
        driverId,
        "2026-10-01",
        "Обновлено",
        currentUser,
      );
      assert.equal(
        await db.managerCalendarComment.count({ where: { driverId } }),
        1,
      );
      const saved = await db.managerCalendarComment.findFirst({
        where: { driverId },
      });
      assert.equal(saved.updatedByUserId, userId);
      assert.equal(
        (await db.paymentCalendarDayOverride.findFirst({ where: { driverId } }))
          .note,
        "Financial override",
      );
      await make().saveDriverCalendarComment(
        driverId,
        "2026-10-01",
        "",
        currentUser,
      );
      assert.equal(
        await db.managerCalendarComment.count({ where: { driverId } }),
        0,
      );
      assert.equal(
        (await db.paymentCalendarDayOverride.findFirst({ where: { driverId } }))
          .status,
        "unpaid",
      );
    } finally {
      await db.driver.deleteMany({ where: { id: driverId } });
      await db.manager.deleteMany({ where: { id: managerId } });
      await db.user.deleteMany({ where: { id: userId } });
      await prisma.onModuleDestroy();
    }
  },
);
