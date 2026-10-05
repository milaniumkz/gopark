import type { ManagerAlertRepository } from "../../common/repositories/index.js";
import { seedManagerAlerts, seedUsers } from "../../data/seed.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export class ManagerAlertPrismaRepository implements ManagerAlertRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async list() {
    const prisma = this._prisma.client;
    if (prisma) {
      return prisma.managerAlert.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          details: true,
          managerId: true,
        },
      });
    }

    return seedManagerAlerts;
  }

  async listByCompany(companyName: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const managerUsers = await prisma.user.findMany({
        where: {
          role: "manager",
          companyName,
        },
        select: {
          managerProfileId: true,
          id: true,
        },
      });
      const managerIds = managerUsers
        .map((item: { managerProfileId: string | null; id: string }) => item.managerProfileId ?? item.id);

      if (managerIds.length === 0) {
        return [];
      }

      return prisma.managerAlert.findMany({
        where: { managerId: { in: managerIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          details: true,
          managerId: true,
        },
      });
    }

    const managerIds = new Set(
      seedUsers
        .filter((item) => item.role === "manager" && (item.companyName ?? null) === companyName)
        .map((item) => item.requestUserId),
    );

    return seedManagerAlerts.filter((item) => item.managerId && managerIds.has(item.managerId));
  }

  async listByManager(managerId: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      return prisma.managerAlert.findMany({
        where: { managerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          details: true,
          managerId: true,
        },
      });
    }

    return seedManagerAlerts.filter((item) => item.managerId === managerId);
  }

  async create(input: { title: string; details: string; managerId?: string | null }) {
    const prisma = this._prisma.client;
    if (prisma) {
      return prisma.managerAlert.create({
        data: {
          title: input.title,
          details: input.details,
          managerId: input.managerId ?? null,
        },
        select: {
          id: true,
          title: true,
          details: true,
          managerId: true,
        },
      });
    }

    const item = {
      id: `alert_${seedManagerAlerts.length + 1}`,
      title: input.title,
      details: input.details,
      managerId: input.managerId ?? null,
    };
    seedManagerAlerts.unshift(item);
    return item;
  }
}
