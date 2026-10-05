import { BadRequestException, Injectable } from "@nestjs/common";
import {
  type ClearPaymentCalendarDayOverrideDto,
  type ContractEarlyPayoffResult,
  type DriverCreditWriteoffResult,
  type PaymentCalendarDayOverrideItem,
  type PaymentListItem,
  type UpsertPaymentCalendarDayOverrideDto,
} from "@gopark/contracts";
import { makePaymentRepository } from "../../common/application/repository.factory.js";
import type { PaymentRepository } from "../../common/repositories/index.js";
import type { CreatePaymentDto } from "./dto/create-payment.dto.js";
import type { CreateContractEarlyPayoffDto } from "./dto/create-contract-early-payoff.dto.js";
import type { CreateDriverCreditWriteoffDto } from "./dto/create-driver-credit-writeoff.dto.js";
import { FinanceWorkflowService } from "../finance-workflow/finance-workflow.service.js";
import type { RequestUser } from "../rbac/request-user.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { toDateOnly, toIsoString } from "../../infrastructure/prisma/prisma.utils.js";

const inMemoryCalendarOverrides: PaymentCalendarDayOverrideItem[] = [];
const paymentCalendarOverrideStatuses: PaymentCalendarDayOverrideItem["status"][] = [
  "day_off",
  "asked_leave",
  "sick",
  "repair",
  "accident",
  "other",
];

@Injectable()
export class PaymentsService {
  private readonly repository: PaymentRepository = makePaymentRepository();
  private readonly prismaService = new PrismaService();

  constructor(private readonly financeWorkflowService: FinanceWorkflowService) {}

  async list(): Promise<PaymentListItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<PaymentListItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async create(input: CreatePaymentDto, currentUser?: RequestUser | null): Promise<PaymentListItem> {
    return this.financeWorkflowService.registerPayment(input, currentUser);
  }

  async listCalendarOverrides(month?: string, companyName?: string | null): Promise<PaymentCalendarDayOverrideItem[]> {
    const range = buildMonthRange(month);
    const prisma = this.prismaService.client as any;
    if (prisma) {
      const overrides = await prisma.paymentCalendarDayOverride.findMany({
        where: {
          date: {
            gte: range.start,
            lt: range.end,
          },
          ...(companyName ? { driver: { companyName } } : {}),
        },
        orderBy: [{ date: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          driverId: true,
          date: true,
          status: true,
          note: true,
          updatedByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return overrides.map(mapCalendarOverride);
    }

    return inMemoryCalendarOverrides.filter((item) => {
      const date = new Date(`${item.date}T00:00:00.000Z`);
      return date >= range.start && date < range.end;
    });
  }

  async upsertCalendarOverride(
    input: UpsertPaymentCalendarDayOverrideDto,
    currentUser?: RequestUser | null,
  ): Promise<PaymentCalendarDayOverrideItem> {
    const date = parseDateOnly(input.date);
    const status = normalizeCalendarOverrideStatus(input.status);
    const note = trimOrNull(input.note);
    const prisma = this.prismaService.client as any;

    if (prisma) {
      const override = await prisma.paymentCalendarDayOverride.upsert({
        where: {
          driverId_date: {
            driverId: input.driverId,
            date,
          },
        },
        create: {
          driverId: input.driverId,
          date,
          status,
          note,
          updatedByUserId: currentUser?.id ?? null,
        },
        update: {
          status,
          note,
          updatedByUserId: currentUser?.id ?? null,
        },
        select: {
          id: true,
          driverId: true,
          date: true,
          status: true,
          note: true,
          updatedByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return mapCalendarOverride(override);
    }

    const dateOnly = toDateOnly(date);
    const existingIndex = inMemoryCalendarOverrides.findIndex((item) => item.driverId === input.driverId && item.date === dateOnly);
    const now = new Date().toISOString();
    const next: PaymentCalendarDayOverrideItem = {
      id: existingIndex >= 0 ? inMemoryCalendarOverrides[existingIndex].id : crypto.randomUUID(),
      driverId: input.driverId,
      date: dateOnly,
      status,
      note,
      updatedByUserId: currentUser?.id ?? null,
      createdAt: existingIndex >= 0 ? inMemoryCalendarOverrides[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      inMemoryCalendarOverrides[existingIndex] = next;
    } else {
      inMemoryCalendarOverrides.push(next);
    }

    return next;
  }

  async clearCalendarOverride(input: ClearPaymentCalendarDayOverrideDto): Promise<void> {
    const date = parseDateOnly(input.date);
    const prisma = this.prismaService.client as any;
    if (prisma) {
      await prisma.paymentCalendarDayOverride.deleteMany({
        where: {
          driverId: input.driverId,
          date,
        },
      });
      return;
    }

    const dateOnly = toDateOnly(date);
    const index = inMemoryCalendarOverrides.findIndex((item) => item.driverId === input.driverId && item.date === dateOnly);
    if (index >= 0) {
      inMemoryCalendarOverrides.splice(index, 1);
    }
  }

  async writeOffCredit(input: CreateDriverCreditWriteoffDto, currentUser?: RequestUser | null): Promise<DriverCreditWriteoffResult> {
    return this.financeWorkflowService.writeOffDriverCredit(input, currentUser);
  }

  async payOffContractEarly(input: CreateContractEarlyPayoffDto, currentUser?: RequestUser | null): Promise<ContractEarlyPayoffResult> {
    return this.financeWorkflowService.payOffContractEarly(input, currentUser);
  }
}

function buildMonthRange(month?: string): { start: Date; end: Date } {
  const normalizedMonth = typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = normalizedMonth.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("Payment calendar date must be YYYY-MM-DD");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeCalendarOverrideStatus(value: string): PaymentCalendarDayOverrideItem["status"] {
  if (!paymentCalendarOverrideStatuses.includes(value as PaymentCalendarDayOverrideItem["status"])) {
    throw new BadRequestException("Unknown payment calendar day status");
  }

  return value as PaymentCalendarDayOverrideItem["status"];
}

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapCalendarOverride(item: {
  id: string;
  driverId: string;
  date: Date | string;
  status: string;
  note?: string | null;
  updatedByUserId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): PaymentCalendarDayOverrideItem {
  return {
    id: item.id,
    driverId: item.driverId,
    date: toDateOnly(item.date),
    status: normalizeCalendarOverrideStatus(item.status),
    note: item.note ?? null,
    updatedByUserId: item.updatedByUserId ?? null,
    createdAt: toIsoString(item.createdAt),
    updatedAt: toIsoString(item.updatedAt),
  };
}
