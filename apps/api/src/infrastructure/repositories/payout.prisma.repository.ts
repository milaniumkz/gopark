import type { PayoutListItem } from "@gopark/contracts";
import type { ApprovePayoutInput, PayoutRepository } from "../../common/repositories/index.js";
import type { CreatePayoutDto } from "../../modules/payouts/dto/create-payout.dto.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedDrivers, seedPayouts } from "../../data/seed.js";
import { decimalToNumber, toIsoString } from "../prisma/prisma.utils.js";

export class PayoutPrismaRepository implements PayoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PayoutListItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<PayoutListItem[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<PayoutListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payouts = await prisma.payout.findMany({
        where: companyName ? { driver: { companyName } } : undefined,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          driverId: true,
          amount: true,
          status: true,
          createdAt: true,
          approvedByUserId: true,
          providerPayoutId: true,
        },
      });

      return payouts.map((payout: any) => ({
        id: payout.id,
        driverId: payout.driverId,
        amount: decimalToNumber(payout.amount),
        status: payout.status,
        createdAt: toIsoString(payout.createdAt),
        approvedByUserId: payout.approvedByUserId ?? undefined,
        payoutDestination: payout.providerPayoutId ?? null,
      }));
    }

    if (!companyName) {
      return seedPayouts;
    }

    return seedPayouts.filter((item) => {
      const driver = seedDrivers.find((driverItem) => driverItem.id === item.driverId);
      return (driver?.companyName ?? null) === companyName;
    });
  }

  async listByDriver(driverId: string): Promise<PayoutListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payouts = await prisma.payout.findMany({
        where: { driverId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          driverId: true,
          amount: true,
          status: true,
          createdAt: true,
          approvedByUserId: true,
          providerPayoutId: true,
        },
      });

      return payouts.map((payout: any) => ({
        id: payout.id,
        driverId: payout.driverId,
        amount: decimalToNumber(payout.amount),
        status: payout.status,
        createdAt: toIsoString(payout.createdAt),
        approvedByUserId: payout.approvedByUserId ?? undefined,
        payoutDestination: payout.providerPayoutId ?? null,
      }));
    }

    return seedPayouts.filter((item) => item.driverId === driverId);
  }

  async getById(payoutId: string): Promise<PayoutListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payout = await prisma.payout.findUnique({
        where: { id: payoutId },
        select: {
          id: true,
          driverId: true,
          amount: true,
          status: true,
          createdAt: true,
          approvedByUserId: true,
          providerPayoutId: true,
        },
      });

      return payout
        ? {
            id: payout.id,
            driverId: payout.driverId,
            amount: decimalToNumber(payout.amount),
            status: payout.status,
            createdAt: toIsoString(payout.createdAt),
            approvedByUserId: payout.approvedByUserId ?? undefined,
            payoutDestination: payout.providerPayoutId ?? null,
          }
        : null;
    }

    return seedPayouts.find((item) => item.id === payoutId) ?? null;
  }

  async countRequested(): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.payout.count({ where: { status: "requested" } });
    }

    return seedPayouts.filter((item) => item.status === "requested").length;
  }

  async getRequestedAmountByDriver(driverId: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.payout.aggregate({
        where: {
          driverId,
          status: "requested",
        },
        _sum: {
          amount: true,
        },
      });

      return decimalToNumber(aggregate._sum.amount);
    }

    return seedPayouts
      .filter((item) => item.driverId === driverId && item.status === "requested")
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async getRequestedAmountByDrivers(driverIds: string[]): Promise<Record<string, number>> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payouts = await prisma.payout.findMany({
        where: {
          driverId: { in: driverIds },
          status: "requested",
        },
        select: {
          driverId: true,
          amount: true,
        },
      });
      const totals = new Map<string, number>();

      for (const payout of payouts) {
        totals.set(payout.driverId, (totals.get(payout.driverId) ?? 0) + decimalToNumber(payout.amount));
      }

      return Object.fromEntries(driverIds.map((driverId) => [driverId, totals.get(driverId) ?? 0]));
    }

    const ids = new Set(driverIds);
    const totals = new Map<string, number>();

    for (const item of seedPayouts) {
      if (!ids.has(item.driverId) || item.status !== "requested") {
        continue;
      }

      totals.set(item.driverId, (totals.get(item.driverId) ?? 0) + item.amount);
    }

    return Object.fromEntries(driverIds.map((driverId) => [driverId, totals.get(driverId) ?? 0]));
  }

  async create(input: CreatePayoutDto): Promise<PayoutListItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payout = await prisma.payout.create({
        data: {
          driverId: input.driverId,
          amount: input.amount,
          status: "requested",
          currency: "KGS",
          provider: input.payoutDestination ? "bank_card" : null,
          providerPayoutId: input.payoutDestination?.trim() || null,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      return {
        id: payout.id,
        driverId: payout.driverId,
        amount: decimalToNumber(payout.amount),
        status: payout.status,
        createdAt: toIsoString(payout.createdAt),
        payoutDestination: payout.providerPayoutId ?? null,
      };
    }

    const item: PayoutListItem = {
      id: crypto.randomUUID(),
      driverId: input.driverId,
      amount: input.amount,
      status: "requested",
      createdAt: new Date().toISOString(),
      payoutDestination: input.payoutDestination?.trim() || null,
    };
    seedPayouts.push(item);
    return item;
  }

  async approve(payoutId: string, input: ApprovePayoutInput): Promise<PayoutListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payout = await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: "approved",
          approvedByUserId: input.approvedByUserId,
        },
        select: {
          id: true,
          driverId: true,
          amount: true,
          status: true,
          createdAt: true,
          approvedByUserId: true,
        },
      }).catch(() => null);

      return payout
        ? {
            id: payout.id,
            driverId: payout.driverId,
            amount: decimalToNumber(payout.amount),
            status: payout.status,
            createdAt: toIsoString(payout.createdAt),
            approvedByUserId: payout.approvedByUserId ?? undefined,
          }
        : null;
    }

    const payout = seedPayouts.find((item) => item.id === payoutId);
    if (!payout) {
      return null;
    }

    return {
      ...payout,
      status: "approved",
      approvedByUserId: input.approvedByUserId,
    };
  }

  async reject(payoutId: string, input: ApprovePayoutInput): Promise<PayoutListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payout = await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: "rejected",
          approvedByUserId: input.approvedByUserId,
        },
        select: {
          id: true,
          driverId: true,
          amount: true,
          status: true,
          createdAt: true,
          approvedByUserId: true,
        },
      }).catch(() => null);

      return payout
        ? {
            id: payout.id,
            driverId: payout.driverId,
            amount: decimalToNumber(payout.amount),
            status: payout.status,
            createdAt: toIsoString(payout.createdAt),
            approvedByUserId: payout.approvedByUserId ?? undefined,
          }
        : null;
    }

    const payout = seedPayouts.find((item) => item.id === payoutId);
    if (!payout) {
      return null;
    }

    payout.status = "rejected";
    payout.approvedByUserId = input.approvedByUserId;
    return payout;
  }
}
