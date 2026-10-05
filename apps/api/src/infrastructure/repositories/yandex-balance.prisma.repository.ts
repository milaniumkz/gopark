import type { YandexBalanceRepository, YandexBalanceSnapshot } from "../../common/repositories/index.js";
import { seedDriverFinanceProfiles } from "../../data/seed.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { decimalToNumber, toIsoString } from "../prisma/prisma.utils.js";

export class YandexBalancePrismaRepository implements YandexBalanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestByDriver(driverId: string): Promise<YandexBalanceSnapshot | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const balance = await prisma.yandexBalance.findFirst({
        where: { driverId },
        orderBy: { syncedAt: "desc" },
        select: {
          driverId: true,
          amount: true,
          syncedAt: true,
        },
      });

      return balance
        ? {
            driverId: balance.driverId,
            amount: decimalToNumber(balance.amount),
            syncedAt: toIsoString(balance.syncedAt),
          }
        : null;
    }

    const profile = seedDriverFinanceProfiles[driverId];
    if (!profile) {
      return null;
    }

    return {
      driverId,
      amount: profile.yandexBalance,
      syncedAt: new Date().toISOString(),
    };
  }

  async getLatestByDrivers(driverIds: string[]): Promise<Record<string, YandexBalanceSnapshot | null>> {
    const prisma = this.prisma.client;
    if (prisma) {
      const balances = await prisma.yandexBalance.findMany({
        where: {
          driverId: { in: driverIds },
        },
        orderBy: { syncedAt: "desc" },
        select: {
          driverId: true,
          amount: true,
          syncedAt: true,
        },
      });
      const latestByDriver = new Map<string, YandexBalanceSnapshot>();

      for (const balance of balances) {
        if (latestByDriver.has(balance.driverId)) {
          continue;
        }

        latestByDriver.set(balance.driverId, {
          driverId: balance.driverId,
          amount: decimalToNumber(balance.amount),
          syncedAt: toIsoString(balance.syncedAt),
        });
      }

      return Object.fromEntries(driverIds.map((driverId) => [driverId, latestByDriver.get(driverId) ?? null]));
    }

    return Object.fromEntries(
      driverIds.map((driverId) => {
        const profile = seedDriverFinanceProfiles[driverId];

        return [
          driverId,
          profile
            ? {
                driverId,
                amount: profile.yandexBalance,
                syncedAt: new Date().toISOString(),
              }
            : null,
        ];
      }),
    );
  }
}
