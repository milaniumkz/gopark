import type { OutboxRepository } from "../../common/repositories/index.js";
import { seedCars, seedContracts, seedDrivers, seedOutboxEvents, seedPayments, seedPayouts } from "../../data/seed.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toIsoString } from "../prisma/prisma.utils.js";

export class OutboxPrismaRepository implements OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.listInternal();
  }

  async listByCompany(companyName: string) {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      let where = undefined;
      if (companyName) {
        const [drivers, cars, contracts, payments, payouts] = await Promise.all([
          prisma.driver.findMany({ where: { companyName }, select: { id: true } }),
          prisma.car.findMany({ where: { companyName }, select: { id: true } }),
          prisma.contract.findMany({
            where: { OR: [{ driver: { companyName } }, { car: { companyName } }] },
            select: { id: true },
          }),
          prisma.payment.findMany({ where: { driver: { companyName } }, select: { id: true } }),
          prisma.payout.findMany({ where: { driver: { companyName } }, select: { id: true } }),
        ]);

        const conditions = [
          drivers.length ? { aggregateType: "driver", aggregateId: { in: drivers.map((item: { id: string }) => item.id) } } : null,
          cars.length ? { aggregateType: "car", aggregateId: { in: cars.map((item: { id: string }) => item.id) } } : null,
          contracts.length ? { aggregateType: "contract", aggregateId: { in: contracts.map((item: { id: string }) => item.id) } } : null,
          payments.length ? { aggregateType: "payment", aggregateId: { in: payments.map((item: { id: string }) => item.id) } } : null,
          payouts.length ? { aggregateType: "payout", aggregateId: { in: payouts.map((item: { id: string }) => item.id) } } : null,
        ].filter(Boolean);

        where = conditions.length ? { OR: conditions as any[] } : { id: "__none__" };
      }

      const events = await prisma.outboxEvent.findMany({
        ...(where ? { where } : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          topic: true,
          aggregateType: true,
          aggregateId: true,
          payload: true,
          status: true,
          createdAt: true,
        },
      });

      return events.map((event: any) => ({
        id: event.id,
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as Record<string, unknown>,
        status: event.status,
        createdAt: toIsoString(event.createdAt),
      }));
    }

    if (!companyName) {
      return seedOutboxEvents;
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

    return seedOutboxEvents.filter((item) => {
      if (item.aggregateType === "driver") {
        return driverIds.has(item.aggregateId);
      }
      if (item.aggregateType === "car") {
        return carIds.has(item.aggregateId);
      }
      if (item.aggregateType === "contract") {
        return contractIds.has(item.aggregateId);
      }
      if (item.aggregateType === "payment") {
        return paymentIds.has(item.aggregateId);
      }
      if (item.aggregateType === "payout") {
        return payoutIds.has(item.aggregateId);
      }

      return false;
    });
  }

  async listPending(limit = 100) {
    const prisma = this.prisma.client;
    if (prisma) {
      const events = await prisma.outboxEvent.findMany({
        where: {
          status: "pending",
          createdAt: { lte: new Date() },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: {
          id: true,
          topic: true,
          aggregateType: true,
          aggregateId: true,
          payload: true,
          status: true,
          createdAt: true,
        },
      });

      return events.map((event: any) => ({
        id: event.id,
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as Record<string, unknown>,
        status: event.status,
        createdAt: toIsoString(event.createdAt),
      }));
    }

    const now = new Date().toISOString();
    return seedOutboxEvents
      .filter((item) => item.status === "pending" && item.createdAt <= now)
      .slice(0, limit);
  }

  async countPending() {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.outboxEvent.count({
        where: { status: { in: ["pending", "queued"] } },
      });
    }

    return seedOutboxEvents.filter((item) => item.status === "pending" || item.status === "queued").length;
  }

  async getById(eventId: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      const event = await prisma.outboxEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          topic: true,
          aggregateType: true,
          aggregateId: true,
          payload: true,
          status: true,
          createdAt: true,
        },
      });

      return event
        ? {
          id: event.id,
          topic: event.topic,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload as Record<string, unknown>,
          status: event.status,
          createdAt: toIsoString(event.createdAt),
        }
        : null;
    }

    return seedOutboxEvents.find((item) => item.id === eventId) ?? null;
  }

  async create(input: Omit<(typeof seedOutboxEvents)[number], "id" | "status" | "createdAt"> & { createdAt?: string }) {
    const prisma = this.prisma.client;
    if (prisma) {
      const event = await prisma.outboxEvent.create({
        data: {
          topic: input.topic,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          payload: input.payload,
          status: "pending",
          createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
        },
      });

      return {
        id: event.id,
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as Record<string, unknown>,
        status: event.status,
        createdAt: toIsoString(event.createdAt),
      };
    }

    return {
      id: crypto.randomUUID(),
      ...input,
      status: "pending" as const,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }

  async markPending(eventId: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      const event = await prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: "pending",
        },
        select: {
          id: true,
          topic: true,
          aggregateType: true,
          aggregateId: true,
          payload: true,
          status: true,
          createdAt: true,
        },
      }).catch(() => null);

      return event
        ? {
          id: event.id,
          topic: event.topic,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload as Record<string, unknown>,
          status: event.status,
          createdAt: toIsoString(event.createdAt),
        }
        : null;
    }

    const item = seedOutboxEvents.find((event) => event.id === eventId);
    if (!item) {
      return null;
    }

    item.status = "pending";
    return item;
  }

  async markPublished(eventId: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      const event = await prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: "published",
          publishedAt: new Date(),
        },
        select: {
          id: true,
          topic: true,
          aggregateType: true,
          aggregateId: true,
          payload: true,
          status: true,
          createdAt: true,
        },
      }).catch(() => null);

      return event
        ? {
            id: event.id,
            topic: event.topic,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload as Record<string, unknown>,
            status: event.status,
            createdAt: toIsoString(event.createdAt),
          }
        : null;
    }

    const item = seedOutboxEvents.find((event) => event.id === eventId);
    if (!item) {
      return null;
    }

    item.status = "published";
    return item;
  }

  async markFailed(eventId: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      const event = await prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: "failed",
        },
        select: {
          id: true,
          topic: true,
          aggregateType: true,
          aggregateId: true,
          payload: true,
          status: true,
          createdAt: true,
        },
      }).catch(() => null);

      return event
        ? {
          id: event.id,
          topic: event.topic,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload as Record<string, unknown>,
          status: event.status,
          createdAt: toIsoString(event.createdAt),
        }
        : null;
    }

    const item = seedOutboxEvents.find((event) => event.id === eventId);
    if (!item) {
      return null;
    }

    item.status = "failed";
    return item;
  }
}
