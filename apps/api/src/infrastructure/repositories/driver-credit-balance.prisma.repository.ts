import type { DriverCreditBalanceRepository } from "../../common/repositories/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { decimalToNumber } from "../prisma/prisma.utils.js";

export class DriverCreditBalancePrismaRepository implements DriverCreditBalanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getByDriver(driverId: string): Promise<number> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return 0;
    }

    const balance = await prisma.driverCreditBalance.findUnique({
      where: { driverId },
      select: { amount: true },
    });

    return decimalToNumber(balance?.amount);
  }

  async getByDrivers(driverIds: string[]): Promise<Record<string, number>> {
    const prisma = this.prisma.client;
    if (!prisma) {
      const emptyBalances: Record<string, number> = {};
      for (const driverId of driverIds) {
        emptyBalances[driverId] = 0;
      }
      return emptyBalances;
    }

    const balances = await prisma.driverCreditBalance.findMany({
      where: { driverId: { in: driverIds } },
      select: {
        driverId: true,
        amount: true,
      },
    });
    const balanceByDriverId = new Map<string, number>(
      balances.map((item: any) => [item.driverId, decimalToNumber(item.amount)]),
    );

    const balancesByDriverId: Record<string, number> = {};
    for (const driverId of driverIds) {
      balancesByDriverId[driverId] = balanceByDriverId.get(driverId) ?? 0;
    }

    return balancesByDriverId;
  }

  async addCredit(driverId: string, amount: number): Promise<number> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return Math.max(0, amount);
    }

    const balance = await prisma.driverCreditBalance.upsert({
      where: { driverId },
      update: {
        amount: {
          increment: amount,
        },
      },
      create: {
        driverId,
        amount,
      },
      select: { amount: true },
    });

    return decimalToNumber(balance.amount);
  }
}
