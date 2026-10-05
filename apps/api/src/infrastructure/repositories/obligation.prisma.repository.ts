import type { ObligationListItem } from "@gopark/contracts";
import type { ObligationRepository } from "../../common/repositories/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedDrivers, seedObligations } from "../../data/seed.js";
import { decimalToNumber, toDateOnly } from "../prisma/prisma.utils.js";

function readObligationBreakdown(metadata: unknown, fallbackAmount: number) {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};

  return {
    installmentAmount: typeof value.installmentAmount === "number" ? value.installmentAmount : fallbackAmount,
    gpsAmount: typeof value.gpsAmount === "number" ? value.gpsAmount : 0,
    insuranceAmount: typeof value.insuranceAmount === "number" ? value.insuranceAmount : 0,
  };
}

function getInstallmentAmount(metadata: unknown, fallbackAmount: number): number {
  return readObligationBreakdown(metadata, fallbackAmount).installmentAmount;
}

function getOpenInstallmentAmount(metadata: unknown, amount: number, paidAmount: number): number {
  const breakdown = readObligationBreakdown(metadata, amount);
  const paidTowardInstallment = Math.min(Math.max(0, paidAmount), breakdown.installmentAmount);
  return Math.max(0, breakdown.installmentAmount - paidTowardInstallment);
}

export class ObligationPrismaRepository implements ObligationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByDriver(driverId: string): Promise<ObligationListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: { driverId },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          type: true,
          amount: true,
          paidAmount: true,
          dueDate: true,
          deferredUntil: true,
          deferredByStatusRequestId: true,
          metadata: true,
        },
      });

      return obligations.map((item: any) => {
        const amount = decimalToNumber(item.amount);
        const breakdown = readObligationBreakdown(item.metadata, amount);
        return {
          id: item.id,
          driverId: item.driverId,
          contractId: item.contractId,
          type: item.type,
          amount,
          paidAmount: decimalToNumber(item.paidAmount),
          ...breakdown,
          dueDate: toDateOnly(item.dueDate),
          deferredUntil: item.deferredUntil ? toDateOnly(item.deferredUntil) : null,
          deferredByStatusRequestId: item.deferredByStatusRequestId ?? null,
        };
      });
    }

    return seedObligations.filter((item) => item.driverId === driverId);
  }

  async getDebtSnapshotsByDrivers(driverIds: string[], asOfDate?: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driverId: { in: driverIds },
          contract: { status: "active" },
        },
        orderBy: { dueDate: "asc" },
        select: {
          driverId: true,
          dueDate: true,
          amount: true,
          paidAmount: true,
          metadata: true,
        },
      });
      const timestamp = asOfDate
        ? new Date(`${asOfDate}T00:00:00.000Z`).getTime()
        : Date.now();
      const grouped = new Map<string, Array<{ dueDate: string; amount: number; paidAmount: number }>>();

      for (const driverId of driverIds) {
        grouped.set(driverId, []);
      }

      for (const item of obligations) {
        const amount = decimalToNumber(item.amount);
        const installmentAmount = getInstallmentAmount(item.metadata, amount);
        const openInstallmentAmount = getOpenInstallmentAmount(
          item.metadata,
          amount,
          decimalToNumber(item.paidAmount),
        );
        grouped.get(item.driverId)?.push({
          dueDate: toDateOnly(item.dueDate),
          amount: installmentAmount,
          paidAmount: Math.max(0, installmentAmount - openInstallmentAmount),
        });
      }

      return Object.fromEntries(
        driverIds.map((driverId) => {
          const driverObligations = grouped.get(driverId) ?? [];
          const next = driverObligations.find((item) => item.amount - item.paidAmount > 0) ?? null;
          const overdueObligations = driverObligations.filter(
            (item) => new Date(`${item.dueDate}T00:00:00.000Z`).getTime() < timestamp && item.amount - item.paidAmount > 0,
          );

          return [
            driverId,
            {
              totalDebt: driverObligations.reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
              overdueDebt: overdueObligations.reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0),
              overdueSinceDate: overdueObligations[0]?.dueDate ?? null,
              overdueUntilDate: overdueObligations[overdueObligations.length - 1]?.dueDate ?? null,
              nextPaymentAmount: next ? next.amount - next.paidAmount : 0,
              nextPaymentDate: next?.dueDate ?? null,
            },
          ];
        }),
      );
    }

    const ids = new Set(driverIds);
    const timestamp = asOfDate
      ? new Date(`${asOfDate}T00:00:00.000Z`).getTime()
      : Date.now();
    const grouped = new Map<string, ObligationListItem[]>();

    for (const driverId of driverIds) {
      grouped.set(driverId, []);
    }

    for (const item of seedObligations) {
      if (!ids.has(item.driverId)) {
        continue;
      }

      grouped.get(item.driverId)?.push(item);
    }

    return Object.fromEntries(
      driverIds.map((driverId) => {
        const obligations = (grouped.get(driverId) ?? []).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const next = obligations.find((item) => item.amount - item.paidAmount > 0) ?? null;
        const overdueObligations = obligations.filter(
          (item) => new Date(`${item.dueDate}T00:00:00.000Z`).getTime() < timestamp && item.amount - item.paidAmount > 0,
        );

        return [
          driverId,
          {
            totalDebt: obligations.reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
            overdueDebt: overdueObligations.reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0),
            overdueSinceDate: overdueObligations[0]?.dueDate ?? null,
            overdueUntilDate: overdueObligations[overdueObligations.length - 1]?.dueDate ?? null,
            nextPaymentAmount: next ? next.amount - next.paidAmount : 0,
            nextPaymentDate: next?.dueDate ?? null,
          },
        ];
      }),
    );
  }

  async getDebtSnapshotsByCompany(companyName: string, asOfDate?: string) {
    const prisma = this.prisma.client;
    if (prisma) {
      const drivers = await prisma.driver.findMany({
        where: { companyName },
        select: { id: true },
      });

      return this.getDebtSnapshotsByDrivers(
        drivers.map((item: { id: string }) => item.id),
        asOfDate,
      );
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getDebtSnapshotsByDrivers(driverIds, asOfDate);
  }

  async getTotalDueByDrivers(driverIds: string[]): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.obligation.aggregate({
        where: { driverId: { in: driverIds }, contract: { status: "active" } },
        _sum: { amount: true },
      });

      return decimalToNumber(aggregate._sum.amount);
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async getTotalDueByCompany(companyName: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.obligation.aggregate({
        where: {
          driver: { companyName },
          contract: { status: "active" },
        },
        _sum: { amount: true },
      });

      return decimalToNumber(aggregate._sum.amount);
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalDueByDrivers(driverIds);
  }

  async getTotalDueByDriversInPeriod(driverIds: string[], startDate: string, endDate: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driverId: { in: driverIds },
          contract: { status: "active" },
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        select: { amount: true, metadata: true },
      });

      return obligations.reduce(
        (sum: number, item: any) => sum + getInstallmentAmount(item.metadata, decimalToNumber(item.amount)),
        0,
      );
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate >= startDate && item.dueDate <= endDate)
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async getTotalDueByCompanyInPeriod(companyName: string, startDate: string, endDate: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driver: { companyName },
          contract: { status: "active" },
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        select: { amount: true, metadata: true },
      });

      return obligations.reduce(
        (sum: number, item: any) => sum + getInstallmentAmount(item.metadata, decimalToNumber(item.amount)),
        0,
      );
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalDueByDriversInPeriod(driverIds, startDate, endDate);
  }

  async getOpenDueByDriversInPeriod(driverIds: string[], startDate: string, endDate: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driverId: { in: driverIds },
          contract: { status: "active" },
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        select: { amount: true, paidAmount: true, metadata: true },
      });

      return obligations.reduce(
        (sum: number, item: any) =>
          sum + getOpenInstallmentAmount(item.metadata, decimalToNumber(item.amount), decimalToNumber(item.paidAmount)),
        0,
      );
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate >= startDate && item.dueDate <= endDate)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getOpenDueByCompanyInPeriod(companyName: string, startDate: string, endDate: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driver: { companyName },
          contract: { status: "active" },
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        select: { amount: true, paidAmount: true, metadata: true },
      });

      return obligations.reduce(
        (sum: number, item: any) =>
          sum + getOpenInstallmentAmount(item.metadata, decimalToNumber(item.amount), decimalToNumber(item.paidAmount)),
        0,
      );
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getOpenDueByDriversInPeriod(driverIds, startDate, endDate);
  }

  async getOpenDueByDriverInPeriod(driverId: string, startDate: string, endDate: string): Promise<number> {
    return this.getOpenDueByDriversInPeriod([driverId], startDate, endDate);
  }

  async getTotalPaidByDrivers(driverIds: string[]): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.obligation.aggregate({
        where: { driverId: { in: driverIds }, contract: { status: "active" } },
        _sum: { paidAmount: true },
      });

      return decimalToNumber(aggregate._sum.paidAmount);
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .reduce((sum, item) => sum + item.paidAmount, 0);
  }

  async getTotalPaidByCompany(companyName: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.obligation.aggregate({
        where: {
          driver: { companyName },
          contract: { status: "active" },
        },
        _sum: { paidAmount: true },
      });

      return decimalToNumber(aggregate._sum.paidAmount);
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalPaidByDrivers(driverIds);
  }

  async getTotalPaidByDriversInPeriod(driverIds: string[], startDate: string, endDate: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.obligation.aggregate({
        where: {
          driverId: { in: driverIds },
          contract: { status: "active" },
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        _sum: { paidAmount: true },
      });

      return decimalToNumber(aggregate._sum.paidAmount);
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate >= startDate && item.dueDate <= endDate)
      .reduce((sum, item) => sum + item.paidAmount, 0);
  }

  async getTotalPaidByCompanyInPeriod(companyName: string, startDate: string, endDate: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.obligation.aggregate({
        where: {
          driver: { companyName },
          contract: { status: "active" },
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        _sum: { paidAmount: true },
      });

      return decimalToNumber(aggregate._sum.paidAmount);
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalPaidByDriversInPeriod(driverIds, startDate, endDate);
  }

  async getTotalDebtByDrivers(driverIds: string[]): Promise<number> {
    const snapshots = await this.getDebtSnapshotsByDrivers(driverIds);
    return Object.values(snapshots).reduce((sum, item) => sum + item.totalDebt, 0);
  }

  async getTotalDebtByCompany(companyName: string): Promise<number> {
    const snapshots = await this.getDebtSnapshotsByCompany(companyName);
    return Object.values(snapshots).reduce((sum, item) => sum + item.totalDebt, 0);
  }

  async getOverdueAmountByDrivers(driverIds: string[], asOfDate?: string): Promise<number> {
    const snapshots = await this.getDebtSnapshotsByDrivers(driverIds, asOfDate);
    return Object.values(snapshots).reduce((sum, item) => sum + item.overdueDebt, 0);
  }

  async getOverdueAmountByCompany(companyName: string, asOfDate?: string): Promise<number> {
    const snapshots = await this.getDebtSnapshotsByCompany(companyName, asOfDate);
    return Object.values(snapshots).reduce((sum, item) => sum + item.overdueDebt, 0);
  }

  async countPaidByDrivers(driverIds: string[]): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: { driverId: { in: driverIds }, contract: { status: "active" } },
        select: {
          amount: true,
          paidAmount: true,
        },
      });

      return obligations.filter((item: any) => decimalToNumber(item.paidAmount) >= decimalToNumber(item.amount)).length;
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .filter((item) => item.amount <= item.paidAmount)
      .length;
  }

  async countPaidByCompany(companyName: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driver: { companyName },
          contract: { status: "active" },
        },
        select: {
          amount: true,
          paidAmount: true,
        },
      });

      return obligations.filter((item: any) => decimalToNumber(item.paidAmount) >= decimalToNumber(item.amount)).length;
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.countPaidByDrivers(driverIds);
  }

  async countUnpaidByDrivers(driverIds: string[]): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: { driverId: { in: driverIds }, contract: { status: "active" } },
        select: {
          amount: true,
          paidAmount: true,
        },
      });

      return obligations.filter((item: any) => decimalToNumber(item.paidAmount) < decimalToNumber(item.amount)).length;
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .filter((item) => item.amount > item.paidAmount)
      .length;
  }

  async countUnpaidByCompany(companyName: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driver: { companyName },
          contract: { status: "active" },
        },
        select: {
          amount: true,
          paidAmount: true,
        },
      });

      return obligations.filter((item: any) => decimalToNumber(item.paidAmount) < decimalToNumber(item.amount)).length;
    }

    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.countUnpaidByDrivers(driverIds);
  }

  async getOverdueAmountByDriver(driverId: string, asOfDate?: string): Promise<number> {
    const snapshots = await this.getDebtSnapshotsByDrivers([driverId], asOfDate);
    return snapshots[driverId]?.overdueDebt ?? 0;
  }

  async getDueAmountByDriverOnDate(driverId: string, date: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driverId,
          contract: { status: "active" },
          dueDate: new Date(`${date}T00:00:00.000Z`),
        },
        select: {
          amount: true,
          paidAmount: true,
          metadata: true,
        },
      });

      return obligations.reduce(
        (sum: number, item: any) =>
          sum + getOpenInstallmentAmount(item.metadata, decimalToNumber(item.amount), decimalToNumber(item.paidAmount)),
        0,
      );
    }

    return seedObligations
      .filter((item) => item.driverId === driverId && item.dueDate === date)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getDueAmountByDriversOnDate(driverIds: string[], date: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driverId: { in: driverIds },
          contract: { status: "active" },
          dueDate: new Date(`${date}T00:00:00.000Z`),
        },
        select: {
          amount: true,
          paidAmount: true,
          metadata: true,
        },
      });

      return obligations.reduce(
        (sum: number, item: any) =>
          sum + getOpenInstallmentAmount(item.metadata, decimalToNumber(item.amount), decimalToNumber(item.paidAmount)),
        0,
      );
    }

    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate === date)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getNextOpenByDriver(driverId: string): Promise<ObligationListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: { driverId, contract: { status: "active" } },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          type: true,
          amount: true,
          paidAmount: true,
          dueDate: true,
          deferredUntil: true,
          deferredByStatusRequestId: true,
        },
      });
      const next = obligations.find((item: any) => decimalToNumber(item.amount) - decimalToNumber(item.paidAmount) > 0);

      return next
        ? {
            id: next.id,
            driverId: next.driverId,
            contractId: next.contractId,
            type: next.type,
            amount: decimalToNumber(next.amount),
            paidAmount: decimalToNumber(next.paidAmount),
            dueDate: toDateOnly(next.dueDate),
            deferredUntil: next.deferredUntil ? toDateOnly(next.deferredUntil) : null,
            deferredByStatusRequestId: next.deferredByStatusRequestId ?? null,
          }
        : null;
    }

    return seedObligations
      .filter((item) => item.driverId === driverId)
      .filter((item) => item.amount - item.paidAmount > 0)
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  }

  async applyPayment(
    driverId: string,
    contractId: string,
    amount: number,
    paymentForDate?: string | null,
    obligationType?: "installment" | "insurance" | "gps",
  ): Promise<ObligationListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = (await prisma.obligation.findMany({
        where: { driverId, contractId, ...(obligationType ? { type: obligationType } : {}) },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          type: true,
          amount: true,
          paidAmount: true,
          dueDate: true,
          deferredUntil: true,
          deferredByStatusRequestId: true,
        },
      })).sort((left: any, right: any) =>
        this.comparePaymentApplicationOrder(
          toDateOnly(left.dueDate),
          toDateOnly(right.dueDate),
          paymentForDate,
        ),
      );
      let rest = amount;

      for (const obligation of obligations) {
        if (rest <= 0) {
          break;
        }

        const due = decimalToNumber(obligation.amount) - decimalToNumber(obligation.paidAmount);
        if (due <= 0) {
          continue;
        }

        const applied = Math.min(due, rest);
        await prisma.obligation.update({
          where: { id: obligation.id },
          data: {
            paidAmount: decimalToNumber(obligation.paidAmount) + applied,
          },
        });
        rest -= applied;
      }

      return this.listByDriver(driverId);
    }

    let rest = amount;
    const obligations = seedObligations
      .filter((item) => item.driverId === driverId && item.contractId === contractId)
      .filter((item) => !obligationType || item.type === obligationType)
      .sort((a, b) => this.comparePaymentApplicationOrder(a.dueDate, b.dueDate, paymentForDate));

    for (const obligation of obligations) {
      if (rest <= 0) {
        break;
      }

      const due = obligation.amount - obligation.paidAmount;
      if (due <= 0) {
        continue;
      }

      const applied = Math.min(due, rest);
      obligation.paidAmount += applied;
      rest -= applied;
    }

    return obligations;
  }

  private comparePaymentApplicationOrder(leftDueDate: string, rightDueDate: string, paymentForDate?: string | null): number {
    if (!paymentForDate) {
      return leftDueDate.localeCompare(rightDueDate);
    }

    const leftRank = this.paymentApplicationRank(leftDueDate, paymentForDate);
    const rightRank = this.paymentApplicationRank(rightDueDate, paymentForDate);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return leftDueDate.localeCompare(rightDueDate);
  }

  private paymentApplicationRank(dueDate: string, paymentForDate: string): number {
    if (dueDate === paymentForDate) {
      return 0;
    }
    if (dueDate < paymentForDate) {
      return 1;
    }
    return 2;
  }

  async deferByStatusRequest(
    requestId: string,
    driverId: string,
    startDate: string,
    endDate: string,
  ): Promise<ObligationListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: {
          driverId,
          dueDate: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lte: new Date(`${endDate}T00:00:00.000Z`),
          },
        },
        select: {
          id: true,
          amount: true,
          paidAmount: true,
        },
      });

      for (const obligation of obligations) {
        if (decimalToNumber(obligation.amount) - decimalToNumber(obligation.paidAmount) <= 0) {
          continue;
        }

        await prisma.obligation.update({
          where: { id: obligation.id },
          data: {
            deferredUntil: new Date(`${endDate}T00:00:00.000Z`),
            deferredByStatusRequestId: requestId,
          },
        });
      }

      return this.listByDriver(driverId);
    }

    const obligations = seedObligations
      .filter((item) => item.driverId === driverId)
      .filter((item) => item.dueDate >= startDate && item.dueDate <= endDate)
      .filter((item) => item.amount - item.paidAmount > 0);

    for (const obligation of obligations) {
      obligation.deferredUntil = endDate;
      obligation.deferredByStatusRequestId = requestId;
    }

    return obligations;
  }

  async clearDeferredByStatusRequest(requestId: string): Promise<ObligationListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const obligations = await prisma.obligation.findMany({
        where: { deferredByStatusRequestId: requestId },
        select: { driverId: true },
      });
      const driverIds = [...new Set(obligations.map((item: any) => String(item.driverId)))];

      await prisma.obligation.updateMany({
        where: { deferredByStatusRequestId: requestId },
        data: {
          deferredUntil: null,
          deferredByStatusRequestId: null,
        },
      });

      if (driverIds.length === 0) {
        return [];
      }

      const firstDriverId = String(driverIds[0]);
      return this.listByDriver(firstDriverId);
    }

    const obligations = seedObligations.filter((item) => item.deferredByStatusRequestId === requestId);

    for (const obligation of obligations) {
      obligation.deferredUntil = null;
      obligation.deferredByStatusRequestId = null;
    }

    return obligations;
  }
}
