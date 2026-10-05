import type { AuditLogItem } from "@gopark/contracts";
import type { AuditRepository, CreateAuditLogInput } from "../../common/repositories/index.js";
import { seedAuditLogs } from "../../data/seed.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toIsoString } from "../prisma/prisma.utils.js";
import { seedCars, seedContracts, seedDrivers, seedPayments, seedPayouts, seedUsers } from "../../data/seed.js";

export class AuditPrismaRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AuditLogItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<AuditLogItem[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<AuditLogItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      let where = undefined;
      if (companyName) {
        const [drivers, cars, contracts, payments, payouts, users] = await Promise.all([
          prisma.driver.findMany({ where: { companyName }, select: { id: true } }),
          prisma.car.findMany({ where: { companyName }, select: { id: true } }),
          prisma.contract.findMany({
            where: { OR: [{ driver: { companyName } }, { car: { companyName } }] },
            select: { id: true },
          }),
          prisma.payment.findMany({ where: { driver: { companyName } }, select: { id: true } }),
          prisma.payout.findMany({ where: { driver: { companyName } }, select: { id: true } }),
          prisma.user.findMany({ where: { companyName }, select: { id: true } }),
        ]);

        const conditions = [
          drivers.length ? { entityType: "driver", entityId: { in: drivers.map((item: { id: string }) => item.id) } } : null,
          cars.length ? { entityType: "car", entityId: { in: cars.map((item: { id: string }) => item.id) } } : null,
          contracts.length ? { entityType: "contract", entityId: { in: contracts.map((item: { id: string }) => item.id) } } : null,
          payments.length ? { entityType: "payment", entityId: { in: payments.map((item: { id: string }) => item.id) } } : null,
          payouts.length ? { entityType: "payout", entityId: { in: payouts.map((item: { id: string }) => item.id) } } : null,
          users.length ? { entityType: "user", entityId: { in: users.map((item: { id: string }) => item.id) } } : null,
        ].filter(Boolean);

        where = conditions.length ? { OR: conditions as any[] } : { id: "__none__" };
      }

      const logs = await prisma.auditLog.findMany({
        ...(where ? { where } : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorUserId: true,
          beforeData: true,
          afterData: true,
          correlationId: true,
          createdAt: true,
        },
      });

      return logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ?? null,
        actorUserId: log.actorUserId ?? null,
        beforeData: normalizeAuditJson(log.beforeData),
        afterData: normalizeAuditJson(log.afterData),
        correlationId: log.correlationId,
        createdAt: toIsoString(log.createdAt),
      }));
    }

    if (!companyName) {
      return seedAuditLogs;
    }

    const driverIds = new Set(
      seedDrivers.filter((item) => (item.companyName ?? null) === companyName).map((item) => item.id),
    );
    const carIds = new Set(
      seedCars.filter((item) => (item.companyName ?? null) === companyName).map((item) => item.id),
    );
    const contractIds = new Set(
      seedContracts.filter((item) => driverIds.has(item.driverId) || carIds.has(item.carId)).map((item) => item.id),
    );
    const paymentIds = new Set(
      seedPayments.filter((item) => driverIds.has(item.driverId)).map((item) => item.id),
    );
    const payoutIds = new Set(
      seedPayouts.filter((item) => driverIds.has(item.driverId)).map((item) => item.id),
    );
    const userIds = new Set(
      seedUsers.filter((item) => (item.companyName ?? null) === companyName).map((item) => item.id),
    );

    return seedAuditLogs.filter((item) => {
      if (!item.entityId) {
        return false;
      }

      if (item.entityType === "driver") {
        return driverIds.has(item.entityId);
      }
      if (item.entityType === "car") {
        return carIds.has(item.entityId);
      }
      if (item.entityType === "contract") {
        return contractIds.has(item.entityId);
      }
      if (item.entityType === "payment") {
        return paymentIds.has(item.entityId);
      }
      if (item.entityType === "payout") {
        return payoutIds.has(item.entityId);
      }
      if (item.entityType === "user") {
        return userIds.has(item.entityId);
      }

      return false;
    });
  }

  async create(
    action: string,
    entityType: string,
    entityId: string | null,
    input: CreateAuditLogInput = {},
  ): Promise<AuditLogItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const log = await prisma.auditLog.create({
        data: {
          action,
          entityType,
          entityId,
          beforeData: input.beforeData ?? undefined,
          afterData: input.afterData ?? undefined,
          correlationId: crypto.randomUUID(),
        },
      });

      return {
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ?? null,
        actorUserId: log.actorUserId ?? null,
        beforeData: normalizeAuditJson(log.beforeData),
        afterData: normalizeAuditJson(log.afterData),
        correlationId: log.correlationId,
        createdAt: toIsoString(log.createdAt),
      };
    }

    return {
      id: crypto.randomUUID(),
      action,
      entityType,
      entityId,
      actorUserId: input.actorUserId ?? null,
      beforeData: input.beforeData ?? null,
      afterData: input.afterData ?? null,
      correlationId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
  }
}

function normalizeAuditJson(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
