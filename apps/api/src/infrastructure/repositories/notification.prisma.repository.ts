import type { NotificationListItem } from "@gopark/contracts";
import type { NotificationRepository } from "../../common/repositories/index.js";
import { seedDrivers, seedNotifications } from "../../data/seed.js";
import { toIsoString } from "../prisma/prisma.utils.js";
import { PrismaService } from "../prisma/prisma.service.js";

export class NotificationPrismaRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<NotificationListItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<NotificationListItem[]> {
    return this.listInternal(companyName);
  }

  async getById(notificationId: string): Promise<NotificationListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const item = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          userId: true,
          driverId: true,
          channel: true,
          templateCode: true,
          status: true,
          createdAt: true,
        },
      });

      if (!item) {
        return null;
      }

      return {
        id: item.id,
        userId: item.userId ?? undefined,
        driverId: item.driverId ?? undefined,
        channel: item.channel,
        template: item.templateCode,
        status: item.status,
        createdAt: toIsoString(item.createdAt),
      };
    }

    return seedNotifications.find((item) => item.id === notificationId) ?? null;
  }

  async updateStatus(notificationId: string, status: NotificationListItem["status"]): Promise<NotificationListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const item = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status,
          deliveredAt: status === "published" ? new Date() : null,
        },
        select: {
          id: true,
          userId: true,
          driverId: true,
          channel: true,
          templateCode: true,
          status: true,
          createdAt: true,
        },
      }).catch(() => null);

      if (!item) {
        return null;
      }

      return {
        id: item.id,
        userId: item.userId ?? undefined,
        driverId: item.driverId ?? undefined,
        channel: item.channel,
        template: item.templateCode,
        status: item.status,
        createdAt: toIsoString(item.createdAt),
      };
    }

    const item = seedNotifications.find((entry) => entry.id === notificationId);
    if (!item) {
      return null;
    }

    item.status = status;
    return item;
  }

  private async listInternal(companyName?: string): Promise<NotificationListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const items = await prisma.notification.findMany({
        ...(companyName
          ? {
              where: {
                driver: {
                  companyName,
                },
              },
            }
          : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          driverId: true,
          channel: true,
          templateCode: true,
          status: true,
          createdAt: true,
        },
      });

      return items.map((item: any) => ({
        id: item.id,
        userId: item.userId ?? undefined,
        driverId: item.driverId ?? undefined,
        channel: item.channel,
        template: item.templateCode,
        status: item.status,
        createdAt: toIsoString(item.createdAt),
      }));
    }

    if (!companyName) {
      return seedNotifications;
    }

    return seedNotifications.filter((item) => {
      if (!item.driverId) {
        return false;
      }

      const driver = seedDrivers.find((entry) => entry.id === item.driverId);
      return (driver?.companyName ?? null) === companyName;
    });
  }

  async countPendingByDriverOrUser(driverId: string, userId: string | null): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.notification.count({
        where: {
          status: "pending",
          OR: userId === null
            ? [{ driverId }]
            : [
                { driverId },
                { userId },
              ],
        },
      });
    }

    return seedNotifications.filter(
      (item) =>
        item.status === "pending" &&
        (item.driverId === driverId || (userId !== null && item.userId === userId)),
    ).length;
  }

  async create(input: Omit<NotificationListItem, "id" | "status">): Promise<NotificationListItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const item = await prisma.notification.create({
        data: {
          userId: input.userId ?? null,
          driverId: input.driverId ?? null,
          channel: input.channel,
          templateCode: input.template,
          payload: {},
          status: "pending",
          createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
        },
        select: {
          id: true,
          userId: true,
          driverId: true,
          channel: true,
          templateCode: true,
          status: true,
          createdAt: true,
        },
      });

      return {
        id: item.id,
        userId: item.userId ?? undefined,
        driverId: item.driverId ?? undefined,
        channel: item.channel,
        template: item.templateCode,
        status: item.status,
        createdAt: toIsoString(item.createdAt),
      };
    }

    return {
      id: crypto.randomUUID(),
      ...input,
      status: "pending",
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }
}
