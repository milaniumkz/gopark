import type {
  DriverCreateStatusRequest,
  DriverStatusRequestItem,
} from "@gopark/contracts";
import type { StatusRequestRepository } from "../../common/repositories/index.js";
import { seedDriverStatusRequests } from "../../data/seed.js";
import { toIsoString } from "../prisma/prisma.utils.js";
import { PrismaService } from "../prisma/prisma.service.js";

export class StatusRequestPrismaRepository implements StatusRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByDriver(driverId: string): Promise<DriverStatusRequestItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const items = await prisma.driverStatusRequest.findMany({
        where: { driverId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          driverId: true,
          type: true,
          status: true,
          period: true,
          note: true,
          createdAt: true,
        },
      });

      return items.map((item: any) => ({
        ...item,
        createdAt: toIsoString(item.createdAt),
      }));
    }

    return seedDriverStatusRequests.filter((item) => item.driverId === driverId);
  }

  async listByDrivers(driverIds: string[]): Promise<DriverStatusRequestItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const items = await prisma.driverStatusRequest.findMany({
        where: { driverId: { in: driverIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          driverId: true,
          type: true,
          status: true,
          period: true,
          note: true,
          createdAt: true,
        },
      });

      return items.map((item: any) => ({
        ...item,
        createdAt: toIsoString(item.createdAt),
      }));
    }

    const ids = new Set(driverIds);
    return seedDriverStatusRequests.filter((item) => item.driverId && ids.has(item.driverId));
  }

  async listRecentByDriver(driverId: string, limit: number): Promise<DriverStatusRequestItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const items = await prisma.driverStatusRequest.findMany({
        where: { driverId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          driverId: true,
          type: true,
          status: true,
          period: true,
          note: true,
          createdAt: true,
        },
      });

      return items.map((item: any) => ({
        ...item,
        createdAt: toIsoString(item.createdAt),
      }));
    }

    return seedDriverStatusRequests
      .filter((item) => item.driverId === driverId)
      .slice(0, limit);
  }

  async countPendingByDriver(driverId: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.driverStatusRequest.count({
        where: {
          driverId,
          status: "pending",
        },
      });
    }

    return seedDriverStatusRequests
      .filter((item) => item.driverId === driverId && item.status === "pending")
      .length;
  }

  async countPendingByDrivers(driverIds: string[]): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.driverStatusRequest.count({
        where: {
          driverId: { in: driverIds },
          status: "pending",
        },
      });
    }

    const ids = new Set(driverIds);
    return seedDriverStatusRequests
      .filter((item) => item.driverId && ids.has(item.driverId) && item.status === "pending")
      .length;
  }

  async getById(requestId: string): Promise<DriverStatusRequestItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const item = await prisma.driverStatusRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          driverId: true,
          type: true,
          status: true,
          period: true,
          note: true,
          createdAt: true,
        },
      });

      return item
        ? {
            ...item,
            createdAt: toIsoString(item.createdAt),
          }
        : null;
    }

    return seedDriverStatusRequests.find((item) => item.id === requestId) ?? null;
  }

  async create(driverId: string, input: DriverCreateStatusRequest): Promise<DriverStatusRequestItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const item = await prisma.driverStatusRequest.create({
        data: {
          driverId,
          type: input.type,
          status: "pending",
          period: input.period,
          note: input.note?.trim() || null,
        },
        select: {
          id: true,
          driverId: true,
          type: true,
          status: true,
          period: true,
          note: true,
          createdAt: true,
        },
      });

      return {
        ...item,
        createdAt: toIsoString(item.createdAt),
      };
    }

    return {
      id: crypto.randomUUID(),
      driverId,
      type: input.type,
      status: "pending",
      period: input.period,
      createdAt: new Date().toISOString(),
    };
  }

  async updateStatus(requestId: string, status: string): Promise<DriverStatusRequestItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const item = await prisma.driverStatusRequest.update({
        where: { id: requestId },
        data: { status },
        select: {
          id: true,
          driverId: true,
          type: true,
          status: true,
          period: true,
          note: true,
          createdAt: true,
        },
      }).catch(() => null);

      return item
        ? {
            ...item,
            createdAt: toIsoString(item.createdAt),
          }
        : null;
    }

    const item = seedDriverStatusRequests.find((request) => request.id === requestId);
    if (!item) {
      return null;
    }

    item.status = status;
    return item;
  }
}
