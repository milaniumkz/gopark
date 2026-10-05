import type { QuickActionRepository } from "../../common/repositories/index.js";
import { seedManagerQuickActions, seedUsers } from "../../data/seed.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export class QuickActionPrismaRepository implements QuickActionRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async list() {
    const prisma = this._prisma.client;
    if (prisma) {
      return prisma.quickAction.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          target: true,
          managerId: true,
        },
      });
    }

    return seedManagerQuickActions;
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

      return prisma.quickAction.findMany({
        where: { managerId: { in: managerIds } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          target: true,
          managerId: true,
        },
      });
    }

    const managerIds = new Set(
      seedUsers
        .filter((item) => item.role === "manager" && (item.companyName ?? null) === companyName)
        .map((item) => item.requestUserId),
    );

    return seedManagerQuickActions.filter((item) => item.managerId && managerIds.has(item.managerId));
  }

  async listByManager(managerId: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      return prisma.quickAction.findMany({
        where: { managerId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          target: true,
          managerId: true,
        },
      });
    }

    return seedManagerQuickActions.filter((item) => item.managerId === managerId);
  }

  async getById(actionId: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      return prisma.quickAction.findUnique({
        where: { id: actionId },
        select: {
          id: true,
          label: true,
          target: true,
          managerId: true,
        },
      });
    }

    return seedManagerQuickActions.find((item) => item.id === actionId) ?? null;
  }
}
