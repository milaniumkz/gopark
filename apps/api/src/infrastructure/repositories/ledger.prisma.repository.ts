import type { LedgerEntry } from "@gopark/contracts";
import type { LedgerRepository } from "../../common/repositories/index.js";
import type { CreateLedgerEntryDto } from "../../modules/ledger/dto/create-ledger-entry.dto.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedLedger } from "../../data/seed.js";
import { toIsoString } from "../prisma/prisma.utils.js";
import { seedDrivers } from "../../data/seed.js";

export class LedgerPrismaRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<LedgerEntry[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<LedgerEntry[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<LedgerEntry[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const entries = await prisma.ledgerEntry.findMany({
        ...(companyName
          ? {
              where: {
                driver: {
                  companyName,
                },
              },
            }
          : {}),
        orderBy: { postedAt: "desc" },
        select: {
          id: true,
          accountId: true,
          contractId: true,
          driverId: true,
          entryType: true,
          amount: true,
          postedAt: true,
          externalReference: true,
        },
      });

      return entries.map((entry: any) => ({
        id: entry.id,
        accountId: entry.accountId,
        contractId: entry.contractId ?? null,
        driverId: entry.driverId ?? null,
        type: entry.entryType,
        money: {
          amount: String(entry.amount),
          currency: "KGS",
        },
        postedAt: toIsoString(entry.postedAt),
        externalReference: entry.externalReference ?? undefined,
      }));
    }

    if (!companyName) {
      return seedLedger;
    }

    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedLedger.filter((item) => item.driverId && driverIds.has(item.driverId));
  }

  async create(input: CreateLedgerEntryDto): Promise<LedgerEntry> {
    const prisma = this.prisma.client;
    if (prisma) {
      const entry = await prisma.ledgerEntry.create({
        data: {
          accountId: input.accountId,
          contractId: input.contractId ?? null,
          driverId: input.driverId ?? null,
          entryType: input.type,
          amount: input.amount,
          direction: 1,
          postedAt: new Date(),
          externalReference: input.externalReference ?? null,
        },
      });

      return {
        id: entry.id,
        accountId: entry.accountId,
        contractId: entry.contractId ?? null,
        driverId: entry.driverId ?? null,
        type: entry.entryType,
        money: {
          amount: String(entry.amount),
          currency: "KGS",
        },
        postedAt: toIsoString(entry.postedAt),
        externalReference: entry.externalReference ?? undefined,
      };
    }

    return {
      id: crypto.randomUUID(),
      accountId: input.accountId,
      contractId: input.contractId ?? null,
      driverId: input.driverId ?? null,
      type: input.type,
      money: {
        amount: input.amount,
        currency: "KGS",
      },
      postedAt: new Date().toISOString(),
      externalReference: input.externalReference,
    };
  }
}
