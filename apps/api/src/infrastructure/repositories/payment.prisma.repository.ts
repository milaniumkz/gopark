import type { PaymentListItem } from "@gopark/contracts";
import type { PaymentRepository } from "../../common/repositories/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedDrivers, seedPayments } from "../../data/seed.js";
import { decimalToNumber, toIsoString } from "../prisma/prisma.utils.js";
import type { CreatePaymentRecordInput } from "../../common/repositories/payment.repository.js";

export class PaymentPrismaRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PaymentListItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<PaymentListItem[]> {
    return this.listInternal(companyName);
  }

  async listByDriver(driverId: string): Promise<PaymentListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payments = await prisma.payment.findMany({
        where: { driverId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          amount: true,
          appliedAmount: true,
          unappliedAmount: true,
          status: true,
          provider: true,
          paymentForDate: true,
          createdAt: true,
        },
      });

      return payments.map((payment: any) => ({
        id: payment.id,
        driverId: payment.driverId,
        contractId: payment.contractId,
        amount: decimalToNumber(payment.amount),
        appliedAmount: decimalToNumber(payment.appliedAmount),
        unappliedAmount: decimalToNumber(payment.unappliedAmount),
        status: payment.status,
        provider: payment.provider,
        paymentForDate: toIsoString(payment.paymentForDate),
        createdAt: toIsoString(payment.createdAt),
      }));
    }

    return seedPayments.filter((item) => item.driverId === driverId);
  }

  private async listInternal(companyName?: string): Promise<PaymentListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payments = await prisma.payment.findMany({
        where: companyName ? { driver: { companyName } } : undefined,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          amount: true,
          appliedAmount: true,
          unappliedAmount: true,
          status: true,
          provider: true,
          paymentForDate: true,
          createdAt: true,
        },
      });

      return payments.map((payment: any) => ({
        id: payment.id,
        driverId: payment.driverId,
        contractId: payment.contractId,
        amount: decimalToNumber(payment.amount),
        appliedAmount: decimalToNumber(payment.appliedAmount),
        unappliedAmount: decimalToNumber(payment.unappliedAmount),
        status: payment.status,
        provider: payment.provider,
        paymentForDate: toIsoString(payment.paymentForDate),
        createdAt: toIsoString(payment.createdAt),
      }));
    }

    if (!companyName) {
      return seedPayments;
    }

    return seedPayments.filter((item) => {
      const driver = seedDrivers.find((driverItem) => driverItem.id === item.driverId);
      return (driver?.companyName ?? null) === companyName;
    });
  }

  async getLatestSuccessfulByDriver(driverId: string): Promise<PaymentListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payment = await prisma.payment.findFirst({
        where: {
          driverId,
          status: "succeeded",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          amount: true,
          appliedAmount: true,
          unappliedAmount: true,
          status: true,
          provider: true,
          paymentForDate: true,
          createdAt: true,
        },
      });

      return payment
        ? {
            id: payment.id,
            driverId: payment.driverId,
            contractId: payment.contractId,
            amount: decimalToNumber(payment.amount),
            appliedAmount: decimalToNumber(payment.appliedAmount),
            unappliedAmount: decimalToNumber(payment.unappliedAmount),
            status: payment.status,
            provider: payment.provider,
            paymentForDate: toIsoString(payment.paymentForDate),
            createdAt: toIsoString(payment.createdAt),
          }
        : null;
    }

    return seedPayments
      .filter((item) => item.driverId === driverId && item.status === "succeeded")
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async getLatestSuccessfulByDrivers(driverIds: string[]): Promise<Record<string, PaymentListItem | null>> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payments = await prisma.payment.findMany({
        where: {
          driverId: { in: driverIds },
          status: "succeeded",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          driverId: true,
          contractId: true,
          amount: true,
          appliedAmount: true,
          unappliedAmount: true,
          status: true,
          provider: true,
          paymentForDate: true,
          createdAt: true,
        },
      });
      const latestByDriver = new Map<string, PaymentListItem>();

      for (const payment of payments) {
        if (latestByDriver.has(payment.driverId)) {
          continue;
        }

        latestByDriver.set(payment.driverId, {
          id: payment.id,
          driverId: payment.driverId,
          contractId: payment.contractId,
          amount: decimalToNumber(payment.amount),
          appliedAmount: decimalToNumber(payment.appliedAmount),
          unappliedAmount: decimalToNumber(payment.unappliedAmount),
          status: payment.status,
          provider: payment.provider,
          paymentForDate: toIsoString(payment.paymentForDate),
          createdAt: toIsoString(payment.createdAt),
        });
      }

      return Object.fromEntries(driverIds.map((driverId) => [driverId, latestByDriver.get(driverId) ?? null]));
    }

    const ids = new Set(driverIds);
    const latestByDriver = new Map<string, PaymentListItem | null>();

    for (const item of seedPayments) {
      if (!ids.has(item.driverId) || item.status !== "succeeded") {
        continue;
      }

      const current = latestByDriver.get(item.driverId);
      if (!current || item.createdAt > current.createdAt) {
        latestByDriver.set(item.driverId, item);
      }
    }

    return Object.fromEntries(driverIds.map((driverId) => [driverId, latestByDriver.get(driverId) ?? null]));
  }

  async create(input: CreatePaymentRecordInput): Promise<PaymentListItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const payment = await prisma.payment.create({
        data: {
          driverId: input.driverId,
          contractId: input.contractId,
          amount: input.amount,
          appliedAmount: input.appliedAmount,
          unappliedAmount: input.unappliedAmount,
          provider: input.provider,
          paymentForDate: input.paymentForDate ? new Date(input.paymentForDate) : null,
          status: "succeeded",
          currency: "KGS",
          idempotencyKey: crypto.randomUUID(),
        },
      });

      return {
        id: payment.id,
        driverId: payment.driverId,
        contractId: payment.contractId,
        amount: decimalToNumber(payment.amount),
        appliedAmount: decimalToNumber(payment.appliedAmount),
        unappliedAmount: decimalToNumber(payment.unappliedAmount),
        status: payment.status,
        provider: payment.provider,
        paymentForDate: toIsoString(payment.paymentForDate),
        createdAt: toIsoString(payment.createdAt),
      };
    }

    return {
      id: crypto.randomUUID(),
      driverId: input.driverId,
      contractId: input.contractId,
      amount: input.amount,
      appliedAmount: input.appliedAmount,
      unappliedAmount: input.unappliedAmount,
      status: "succeeded",
      provider: input.provider,
      paymentForDate: input.paymentForDate ?? null,
      createdAt: new Date().toISOString(),
    };
  }
}
