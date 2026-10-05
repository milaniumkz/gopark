import type { ContractDetail, ContractListItem } from "@gopark/contracts";
import type { CreateContractDto } from "../../modules/contracts/dto/create-contract.dto.js";
import type { UpdateContractDto } from "../../modules/contracts/dto/update-contract.dto.js";
import type { ContractRepository } from "../../common/repositories/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedCars, seedContractDetails, seedContracts, seedDrivers, seedObligations } from "../../data/seed.js";
import { decimalToNumber, toDateOnly } from "../prisma/prisma.utils.js";

const STANDARD_DAILY_INSTALLMENT_AMOUNT = 2300;

function toContractStartDate(value: string): Date {
  const normalized = value.includes("T") ? value.slice(0, 10) : value;
  return new Date(`${normalized}T00:00:00.000Z`);
}

function addDays(date: string, days: number): string {
  const source = new Date(`${date}T00:00:00.000Z`);
  source.setUTCDate(source.getUTCDate() + days);
  return source.toISOString().slice(0, 10);
}

function calculateTermMonthsFromDates(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return 0;
  }

  const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
  return Math.max(1, Math.ceil(diffDays / 30));
}

function resolveWeeklyDayOffIndex(weeklyDayOff?: string | null): number | null {
  switch (weeklyDayOff) {
    case "sunday":
      return 0;
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    default:
      return null;
  }
}

function buildDailyInstallmentDueDates(startDate: string, endDate: string, weeklyDayOff?: string | null): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dueDates: string[] = [];
  const weeklyDayOffIndex = resolveWeeklyDayOffIndex(weeklyDayOff);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return dueDates;
  }

  for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (weeklyDayOffIndex !== null && cursor.getUTCDay() === weeklyDayOffIndex) {
      continue;
    }

    dueDates.push(cursor.toISOString().slice(0, 10));
  }

  if (!dueDates.length) {
    dueDates.push(end.toISOString().slice(0, 10));
  }

  return dueDates;
}

function buildInstallmentSchedule(
  dueDates: string[],
  financedAmount: number,
  _installmentAmount: number,
): Array<{ dueDate: string; amount: number }> {
  if (!dueDates.length || financedAmount <= 0) {
    return [];
  }

  return dueDates.map((dueDate) => ({ dueDate, amount: STANDARD_DAILY_INSTALLMENT_AMOUNT }));
}

function addMonths(date: string, months: number): string {
  const source = new Date(`${date}T00:00:00.000Z`);
  source.setUTCMonth(source.getUTCMonth() + months);
  return source.toISOString().slice(0, 10);
}

function resolveMonthlyStoredAmount(amount: number | undefined, mode: "monthly" | "daily" | undefined): number | null {
  if (!Number.isFinite(amount) || !amount || amount <= 0) {
    return null;
  }

  return mode === "daily" ? amount * 30 : amount;
}

function resolveDailyChargeAmount(amount: number | undefined, mode: "monthly" | "daily" | undefined): number {
  if (!Number.isFinite(amount) || !amount || amount <= 0 || mode !== "daily") {
    return 0;
  }

  return amount;
}

function buildInstallmentObligationMetadata(installmentAmount: number, gpsAmount: number, insuranceAmount: number) {
  return {
    installmentAmount,
    gpsAmount,
    insuranceAmount,
  };
}

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

function getOpenObligationAmount(type: string, metadata: unknown, amount: number, paidAmount: number): number {
  if (type !== "installment") {
    return Math.max(0, amount - paidAmount);
  }

  const breakdown = readObligationBreakdown(metadata, amount);
  const paidTowardInstallment = Math.min(Math.max(0, paidAmount), breakdown.installmentAmount);
  return Math.max(0, breakdown.installmentAmount - paidTowardInstallment);
}

function getTodayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveEffectiveDueDate(item: { dueDate: string; deferredUntil: string | null }): string {
  return item.deferredUntil ? addDays(item.deferredUntil, 1) : item.dueDate;
}

function addOneYearDateOnly(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function toOptionalContractDate(value?: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function buildRecurringChargeSchedule(
  type: "insurance" | "gps",
  amount: number | undefined,
  mode: "monthly" | "daily" | undefined,
  startDate: string,
  endDate: string,
  dailyDueDates: string[],
): Array<{ type: "insurance" | "gps"; dueDate: string; amount: number }> {
  if (!Number.isFinite(amount) || !amount || amount <= 0) {
    return [];
  }

  if (mode === "daily") {
    return [];
  }

  const schedule: Array<{ type: "insurance" | "gps"; dueDate: string; amount: number }> = [];
  for (let dueDate = startDate; dueDate <= endDate; dueDate = addMonths(dueDate, 1)) {
    schedule.push({ type, dueDate, amount });
  }

  return schedule;
}

export class ContractPrismaRepository implements ContractRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ContractListItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<ContractListItem[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<ContractListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const contracts = await prisma.contract.findMany({
        where: companyName
          ? {
              OR: [
                { driver: { companyName } },
                { car: { companyName } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          driverId: true,
          carId: true,
          status: true,
          contractNumber: true,
          financedAmount: true,
          installmentAmount: true,
          monthlyInsuranceAmount: true,
          monthlyGpsAmount: true,
          termMonths: true,
          startDate: true,
          endDate: true,
          car: {
            select: {
              assignments: {
                select: {
                  driverId: true,
                  startedAt: true,
                  endedAt: true,
                },
              },
            },
          },
          obligations: {
            select: {
              type: true,
              amount: true,
              paidAmount: true,
              dueDate: true,
              deferredUntil: true,
              metadata: true,
            },
          },
        },
      });

      return contracts.map((contract: any) => {
        const contractStartDate = toDateOnly(contract.startDate);
        const assignmentEndDate = contract.car?.assignments
          ?.filter((assignment: { driverId: string; startedAt: Date; endedAt: Date | null }) =>
            assignment.driverId === contract.driverId
            && toDateOnly(assignment.startedAt) >= contractStartDate
            && assignment.endedAt,
          )
          .sort((left: { startedAt: Date }, right: { startedAt: Date }) => right.startedAt.getTime() - left.startedAt.getTime())[0]?.endedAt;
        const openObligations = contract.obligations
          .map((item: any) => ({
            remainingAmount: getOpenObligationAmount(
              item.type,
              item.metadata,
              decimalToNumber(item.amount),
              decimalToNumber(item.paidAmount),
            ),
            dueDate: toDateOnly(item.dueDate),
            deferredUntil: item.deferredUntil ? toDateOnly(item.deferredUntil) : null,
          }))
          .filter((item: { remainingAmount: number }) => item.remainingAmount > 0)
          .sort((left: { dueDate: string; deferredUntil: string | null }, right: { dueDate: string; deferredUntil: string | null }) => {
            const leftDate = left.deferredUntil ? addDays(left.deferredUntil, 1) : left.dueDate;
            const rightDate = right.deferredUntil ? addDays(right.deferredUntil, 1) : right.dueDate;
            return leftDate.localeCompare(rightDate);
          });
        const nextOpen = openObligations[0];
        const currentDebt = openObligations.reduce(
          (sum: number, item: { remainingAmount: number }) => sum + item.remainingAmount,
          0,
        );
        const overdueCutoff = contract.status === "active"
          ? getTodayDateOnly()
          : assignmentEndDate
            ? toDateOnly(assignmentEndDate)
            : getTodayDateOnly();
        const overdueObligations = openObligations.filter(
          (item: { remainingAmount: number; dueDate: string; deferredUntil: string | null }) =>
            resolveEffectiveDueDate(item) < overdueCutoff,
        );
        const overdueDebt = overdueObligations.reduce(
          (sum: number, item: { remainingAmount: number }) => sum + item.remainingAmount,
          0,
        );

        return {
          id: contract.id,
          driverId: contract.driverId,
          carId: contract.carId,
          status: contract.status,
          contractNumber: contract.contractNumber,
          financedAmount: decimalToNumber(contract.financedAmount),
        installmentAmount: decimalToNumber(contract.installmentAmount),
        monthlyInsuranceAmount: decimalToNumber(contract.monthlyInsuranceAmount ?? 0) || null,
        monthlyGpsAmount: decimalToNumber(contract.monthlyGpsAmount ?? 0) || null,
        termMonths: contract.termMonths,
        startDate: toDateOnly(contract.startDate),
        endDate: contract.endDate ? toDateOnly(contract.endDate) : null,
        endedAt: assignmentEndDate ? toDateOnly(assignmentEndDate) : null,
        currentDebt,
          overdueDebt,
          overdueSinceDate: overdueObligations[0] ? resolveEffectiveDueDate(overdueObligations[0]) : null,
          overdueUntilDate: overdueObligations.at(-1) ? resolveEffectiveDueDate(overdueObligations.at(-1)!) : null,
          nextDueDate: nextOpen ? resolveEffectiveDueDate(nextOpen) : null,
          nextDueAmount: nextOpen?.remainingAmount ?? 0,
          hasDeferredPayment: openObligations.some((item: { deferredUntil: string | null }) => !!item.deferredUntil),
        };
      });
    }

    if (!companyName) {
      return seedContracts;
    }

    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedContracts.filter((item) => driverIds.has(item.driverId));
  }

  async getById(contractId: string): Promise<ContractDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          driverId: true,
          carId: true,
          status: true,
          contractNumber: true,
          financedAmount: true,
          installmentAmount: true,
          monthlyInsuranceAmount: true,
          monthlyGpsAmount: true,
          principalAmount: true,
          installmentDay: true,
          termMonths: true,
          startDate: true,
          endDate: true,
          car: {
            select: {
              assignments: {
                select: {
                  driverId: true,
                  startedAt: true,
                  endedAt: true,
                },
              },
            },
          },
          obligations: {
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
          },
        },
      });

      if (!contract) {
        return null;
      }

      const openObligations = contract.obligations
        .map((item: any) => ({
          remainingAmount: getOpenObligationAmount(
            item.type,
            item.metadata,
            decimalToNumber(item.amount),
            decimalToNumber(item.paidAmount),
          ),
          dueDate: toDateOnly(item.dueDate),
          deferredUntil: item.deferredUntil ? toDateOnly(item.deferredUntil) : null,
        }))
        .filter((item: { remainingAmount: number }) => item.remainingAmount > 0)
        .sort((left: { dueDate: string; deferredUntil: string | null }, right: { dueDate: string; deferredUntil: string | null }) => {
          const leftDate = left.deferredUntil ? addDays(left.deferredUntil, 1) : left.dueDate;
          const rightDate = right.deferredUntil ? addDays(right.deferredUntil, 1) : right.dueDate;
          return leftDate.localeCompare(rightDate);
        });
      const nextOpen = openObligations[0];
      const currentDebt = openObligations.reduce((sum: number, item: { remainingAmount: number }) => sum + item.remainingAmount, 0);
      const contractStartDate = toDateOnly(contract.startDate);
      const assignmentEndDate = contract.car?.assignments
        ?.filter((assignment: { driverId: string; startedAt: Date; endedAt: Date | null }) =>
          assignment.driverId === contract.driverId
          && toDateOnly(assignment.startedAt) >= contractStartDate
          && assignment.endedAt,
        )
        .sort((left: { startedAt: Date }, right: { startedAt: Date }) => right.startedAt.getTime() - left.startedAt.getTime())[0]?.endedAt;
      const overdueCutoff = contract.status === "active"
        ? getTodayDateOnly()
        : assignmentEndDate
          ? toDateOnly(assignmentEndDate)
          : getTodayDateOnly();
      const overdueObligations = openObligations.filter(
        (item: { remainingAmount: number; dueDate: string; deferredUntil: string | null }) =>
          resolveEffectiveDueDate(item) < overdueCutoff,
      );
      const overdueDebt = overdueObligations.reduce(
        (sum: number, item: { remainingAmount: number }) => sum + item.remainingAmount,
        0,
      );

      return {
        id: contract.id,
        driverId: contract.driverId,
        carId: contract.carId,
        status: contract.status,
        contractNumber: contract.contractNumber,
        financedAmount: decimalToNumber(contract.financedAmount),
        installmentAmount: decimalToNumber(contract.installmentAmount),
        monthlyInsuranceAmount: decimalToNumber(contract.monthlyInsuranceAmount ?? 0) || null,
        monthlyGpsAmount: decimalToNumber(contract.monthlyGpsAmount ?? 0) || null,
        principalAmount: decimalToNumber(contract.principalAmount),
        installmentDay: contract.installmentDay,
        termMonths: contract.termMonths,
        startDate: toDateOnly(contract.startDate),
        endDate: contract.endDate ? toDateOnly(contract.endDate) : null,
        endedAt: assignmentEndDate ? toDateOnly(assignmentEndDate) : null,
        currentDebt,
        overdueDebt,
        overdueSinceDate: overdueObligations[0] ? resolveEffectiveDueDate(overdueObligations[0]) : null,
        overdueUntilDate: overdueObligations.at(-1) ? resolveEffectiveDueDate(overdueObligations.at(-1)!) : null,
        nextDueDate: nextOpen ? resolveEffectiveDueDate(nextOpen) : null,
        nextDueAmount: nextOpen?.remainingAmount ?? 0,
        hasDeferredPayment: openObligations.some((item: { deferredUntil: string | null }) => !!item.deferredUntil),
        schedule: contract.obligations.map((item: any) => {
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
        }),
      };
    }

    return seedContractDetails.find((item) => item.id === contractId) ?? null;
  }

  async getActiveByDriver(driverId: string): Promise<ContractDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const contract = await prisma.contract.findFirst({
        where: {
          driverId,
          status: "active",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      return contract ? this.getById(contract.id) : null;
    }

    const contract = seedContracts.find((item) => item.driverId === driverId && item.status === "active");
    return contract ? this.getById(contract.id) : null;
  }

  async getMaxIssuedAmountByCar(carId: string): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      const aggregate = await prisma.contract.aggregate({
        where: { carId },
        _max: { financedAmount: true },
      });

      return decimalToNumber(aggregate._max.financedAmount);
    }

    return seedContracts
      .filter((item) => item.carId === carId)
      .reduce((max, item) => Math.max(max, item.financedAmount), 0);
  }

  async create(input: CreateContractDto): Promise<ContractListItem> {
    const prisma = this.prisma.client;
    const installmentDay = input.installmentDay ?? (new Date(`${input.endDate}T00:00:00.000Z`).getUTCDate() || 15);
    if (prisma) {
      const driver = await prisma.driver.findUnique({
        where: { id: input.driverId },
        select: { weeklyDayOff: true, managerId: true },
      });
      const selectedCar = await prisma.car.findUnique({
        where: { id: input.carId },
        select: { managerId: true },
      });
      const effectiveCarManagerId = selectedCar?.managerId ?? driver?.managerId ?? null;
      const termMonths = calculateTermMonthsFromDates(input.startDate, input.endDate);
      const dueDates = buildDailyInstallmentDueDates(input.startDate, input.endDate, driver?.weeklyDayOff);
      const schedule = buildInstallmentSchedule(dueDates, input.financedAmount, input.installmentAmount);
      const insuranceSchedule = buildRecurringChargeSchedule(
        "insurance",
        input.monthlyInsuranceAmount,
        input.insuranceBillingMode,
        input.startDate,
        input.endDate,
        dueDates,
      );
      const gpsSchedule = buildRecurringChargeSchedule(
        "gps",
        input.monthlyGpsAmount,
        input.gpsBillingMode,
        input.startDate,
        input.endDate,
        dueDates,
      );
      const monthlyInsuranceAmount = resolveMonthlyStoredAmount(input.monthlyInsuranceAmount, input.insuranceBillingMode);
      const monthlyGpsAmount = resolveMonthlyStoredAmount(input.monthlyGpsAmount, input.gpsBillingMode);
      const dailyInsuranceAmount = resolveDailyChargeAmount(input.monthlyInsuranceAmount, input.insuranceBillingMode);
      const dailyGpsAmount = resolveDailyChargeAmount(input.monthlyGpsAmount, input.gpsBillingMode);
      const equalInstallmentAmount = schedule[0]?.amount ?? input.installmentAmount;
      const osagoEndDate = addOneYearDateOnly(input.osagoStartDate);
      const cascoEndDate = addOneYearDateOnly(input.cascoStartDate);
      const contract = await prisma.$transaction(async (tx: any) => {
        const previousDriverAssignments = await tx.carAssignment.findMany({
          where: {
            driverId: input.driverId,
            endedAt: null,
          },
          select: {
            carId: true,
          },
        });
        const previousDriverCarIds = previousDriverAssignments
          .map((assignment: { carId: string }) => assignment.carId)
          .filter((carId: string) => carId !== input.carId);

        const createdContract = await tx.contract.create({
          data: {
            driverId: input.driverId,
            carId: input.carId,
            status: "active",
            contractNumber: input.contractNumber,
            principalAmount: input.principalAmount,
            financedAmount: input.financedAmount,
            installmentAmount: equalInstallmentAmount,
            monthlyInsuranceAmount,
            monthlyGpsAmount,
            installmentDay,
            termMonths,
            startDate: toContractStartDate(input.startDate),
            endDate: toContractStartDate(input.endDate),
            currency: "KGS",
          },
        });

        await tx.contract.updateMany({
          where: {
            driverId: input.driverId,
            status: "active",
            id: { not: createdContract.id },
          },
          data: {
            status: "closed",
          },
        });

        await tx.carAssignment.updateMany({
          where: {
            OR: [
              { carId: input.carId, endedAt: null },
              { driverId: input.driverId, endedAt: null },
            ],
          },
          data: {
            endedAt: toContractStartDate(input.startDate),
          },
        });

        if (previousDriverCarIds.length > 0) {
          await tx.car.updateMany({
            where: {
              id: {
                in: previousDriverCarIds,
              },
            },
            data: {
              status: "office",
            },
          });
        }

        await tx.carAssignment.create({
          data: {
            carId: input.carId,
            driverId: input.driverId,
            startedAt: toContractStartDate(input.startDate),
          },
        });

        await tx.car.update({
          where: { id: input.carId },
          data: {
            status: "assigned",
            managerId: effectiveCarManagerId ?? undefined,
            mileage: input.handoverMileage ?? undefined,
            osagoStartDate: input.hasOsago ? toOptionalContractDate(input.osagoStartDate) : undefined,
            osagoEndDate: input.hasOsago ? toOptionalContractDate(osagoEndDate) : undefined,
            cascoStartDate: input.hasCasco ? toOptionalContractDate(input.cascoStartDate) : undefined,
            cascoEndDate: input.hasCasco ? toOptionalContractDate(cascoEndDate) : undefined,
          },
        });

        await tx.driver.update({
          where: { id: input.driverId },
          data: {
            status: "active",
            terminatedAt: null,
            managerId: effectiveCarManagerId ?? undefined,
          },
        });

        if (schedule.length) {
          await tx.obligation.createMany({
            data: [
              ...schedule.map(({ dueDate, amount }, index) => ({
              contractId: createdContract.id,
              driverId: input.driverId,
              type: "installment",
              dueDate: new Date(`${dueDate}T00:00:00.000Z`),
              amount: amount + dailyInsuranceAmount + dailyGpsAmount,
              metadata: buildInstallmentObligationMetadata(amount, dailyGpsAmount, dailyInsuranceAmount),
              externalReference: `${createdContract.contractNumber}:${index + 1}`,
              })),
              ...insuranceSchedule.map(({ dueDate, amount }, index) => ({
                contractId: createdContract.id,
                driverId: input.driverId,
                type: "insurance",
                dueDate: new Date(`${dueDate}T00:00:00.000Z`),
                amount,
                externalReference: `${createdContract.contractNumber}:insurance:${index + 1}`,
              })),
              ...gpsSchedule.map(({ dueDate, amount }, index) => ({
                contractId: createdContract.id,
                driverId: input.driverId,
                type: "gps",
                dueDate: new Date(`${dueDate}T00:00:00.000Z`),
                amount,
                externalReference: `${createdContract.contractNumber}:gps:${index + 1}`,
              })),
            ],
          });
        }

        return createdContract;
      });

    return {
      id: contract.id,
        driverId: contract.driverId,
        carId: contract.carId,
        status: contract.status,
        contractNumber: contract.contractNumber,
        financedAmount: decimalToNumber(contract.financedAmount),
        installmentAmount: decimalToNumber(contract.installmentAmount),
        monthlyInsuranceAmount,
        monthlyGpsAmount,
        currentDebt: schedule.reduce((sum, item) => sum + item.amount + dailyInsuranceAmount + dailyGpsAmount, 0) + insuranceSchedule.reduce((sum, item) => sum + item.amount, 0) + gpsSchedule.reduce((sum, item) => sum + item.amount, 0),
        termMonths,
        startDate: input.startDate,
        endDate: input.endDate,
        nextDueDate: schedule[0]?.dueDate ?? null,
        nextDueAmount: schedule[0]?.amount ?? 0,
        hasDeferredPayment: false,
        handoverMileage: input.handoverMileage ?? null,
        hasOsago: !!input.hasOsago,
        osagoStartDate: input.hasOsago ? input.osagoStartDate ?? null : null,
        osagoEndDate: input.hasOsago ? osagoEndDate : null,
        hasCasco: !!input.hasCasco,
        cascoStartDate: input.hasCasco ? input.cascoStartDate ?? null : null,
        cascoEndDate: input.hasCasco ? cascoEndDate : null,
      };
    }

    const driver = seedDrivers.find((item) => item.id === input.driverId);
    const termMonths = calculateTermMonthsFromDates(input.startDate, input.endDate);
    const dueDates = buildDailyInstallmentDueDates(input.startDate, input.endDate, driver?.weeklyDayOff);
    const schedule = buildInstallmentSchedule(dueDates, input.financedAmount, input.installmentAmount);
    const contractId = crypto.randomUUID();
    const contractStatus: ContractListItem["status"] = "active";
    return {
      id: contractId,
      driverId: input.driverId,
      carId: input.carId,
      status: contractStatus,
      contractNumber: input.contractNumber,
      financedAmount: input.financedAmount,
      installmentAmount: input.installmentAmount,
      monthlyInsuranceAmount: input.monthlyInsuranceAmount ?? null,
      monthlyGpsAmount: input.monthlyGpsAmount ?? null,
      termMonths,
      startDate: input.startDate,
      endDate: input.endDate,
      currentDebt: input.financedAmount,
      nextDueDate: schedule[0]?.dueDate ?? null,
      nextDueAmount: schedule[0]?.amount ?? 0,
      hasDeferredPayment: false,
    };
  }

  async update(contractId: string, input: UpdateContractDto): Promise<ContractDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const current = await prisma.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          driverId: true,
          carId: true,
          status: true,
          contractNumber: true,
          principalAmount: true,
          financedAmount: true,
          installmentAmount: true,
          monthlyInsuranceAmount: true,
          monthlyGpsAmount: true,
          installmentDay: true,
          termMonths: true,
          startDate: true,
          endDate: true,
        },
      });

      if (!current) {
        return null;
      }

      const nextContractNumber = input.contractNumber?.trim() || current.contractNumber;
      const nextPrincipalAmount = input.principalAmount ?? decimalToNumber(current.principalAmount);
      const nextFinancedAmount = input.financedAmount ?? decimalToNumber(current.financedAmount);
      const nextInstallmentAmount = STANDARD_DAILY_INSTALLMENT_AMOUNT;
      const nextMonthlyInsuranceAmount = input.monthlyInsuranceAmount ?? (decimalToNumber(current.monthlyInsuranceAmount ?? 0) || null);
      const nextMonthlyGpsAmount = input.monthlyGpsAmount ?? (decimalToNumber(current.monthlyGpsAmount ?? 0) || null);
      const nextStartDate: string = input.startDate ?? toDateOnly(current.startDate);
      const nextEndDate: string = input.endDate ?? (current.endDate ? toDateOnly(current.endDate) : nextStartDate);
      const nextInstallmentDay = input.installmentDay ?? (new Date(`${nextEndDate}T00:00:00.000Z`).getUTCDate() || current.installmentDay);
      const nextTermMonths = input.termMonths ?? calculateTermMonthsFromDates(nextStartDate, nextEndDate);
      const nextStatus = input.status ?? current.status;
      const terminatingActiveContract = current.status === "active" && nextStatus === "terminated";
      const hasScheduleInput =
        input.financedAmount !== undefined
        || input.installmentAmount !== undefined
        || input.installmentDay !== undefined
        || input.termMonths !== undefined
        || input.startDate !== undefined
        || input.endDate !== undefined;
      const scheduleChanged =
        hasScheduleInput
        && (
          nextFinancedAmount !== decimalToNumber(current.financedAmount)
          || nextInstallmentAmount !== decimalToNumber(current.installmentAmount)
          || nextInstallmentDay !== current.installmentDay
          || nextTermMonths !== current.termMonths
          || nextStartDate !== toDateOnly(current.startDate)
          || nextEndDate !== (current.endDate ? toDateOnly(current.endDate) : nextStartDate)
        );

      const driver = await prisma.driver.findUnique({
        where: { id: current.driverId },
        select: { weeklyDayOff: true, managerId: true },
      });
      const currentCar = await prisma.car.findUnique({
        where: { id: current.carId },
        select: { managerId: true },
      });
      const effectiveCarManagerId = currentCar?.managerId ?? driver?.managerId ?? null;
      const recalculatedDueDates = buildDailyInstallmentDueDates(nextStartDate, nextEndDate, driver?.weeklyDayOff);
      const recalculatedSchedule = buildInstallmentSchedule(recalculatedDueDates, nextFinancedAmount, nextInstallmentAmount);
      const storedInstallmentAmount = recalculatedSchedule[0]?.amount ?? nextInstallmentAmount;

      await prisma.$transaction(async (tx: any) => {
        await tx.contract.update({
          where: { id: contractId },
          data: {
            status: nextStatus,
            contractNumber: nextContractNumber,
            principalAmount: nextPrincipalAmount,
            financedAmount: nextFinancedAmount,
            installmentAmount: storedInstallmentAmount,
            monthlyInsuranceAmount: nextMonthlyInsuranceAmount,
            monthlyGpsAmount: nextMonthlyGpsAmount,
            installmentDay: nextInstallmentDay,
            termMonths: nextTermMonths,
            startDate: toContractStartDate(nextStartDate),
            endDate: toContractStartDate(nextEndDate),
          },
        });

        if (terminatingActiveContract) {
          await tx.carAssignment.updateMany({
            where: {
              carId: current.carId,
              driverId: current.driverId,
              endedAt: null,
            },
            data: { endedAt: new Date() },
          });
          await tx.car.update({
            where: { id: current.carId },
            data: { status: "office" },
          });
          await tx.driver.update({
            where: { id: current.driverId },
            data: {
              status: "terminated",
              terminatedAt: new Date(),
            },
          });
        }

        if (nextStatus === "active") {
          const activeAssignment = await tx.carAssignment.findFirst({
            where: {
              carId: current.carId,
              driverId: current.driverId,
              endedAt: null,
            },
            select: { id: true },
          });
          const staleAssignmentWhere = {
            OR: [
              { carId: current.carId, endedAt: null },
              { driverId: current.driverId, endedAt: null },
            ],
            ...(activeAssignment ? { NOT: { id: activeAssignment.id } } : {}),
          };

          await tx.carAssignment.updateMany({
            where: staleAssignmentWhere,
            data: { endedAt: toContractStartDate(nextStartDate) },
          });

          if (!activeAssignment) {
            await tx.carAssignment.create({
              data: {
                carId: current.carId,
                driverId: current.driverId,
                startedAt: toContractStartDate(nextStartDate),
              },
            });
          }

          await tx.car.update({
            where: { id: current.carId },
            data: { status: "assigned", managerId: effectiveCarManagerId ?? undefined },
          });
          await tx.driver.update({
            where: { id: current.driverId },
            data: {
              status: "active",
              terminatedAt: null,
              managerId: effectiveCarManagerId ?? undefined,
            },
          });
        }

        if (scheduleChanged) {
          await tx.obligation.deleteMany({
            where: { contractId },
          });
          if (recalculatedSchedule.length) {
            const dailyInsuranceAmount = 0;
            const dailyGpsAmount = 0;
            await tx.obligation.createMany({
              data: recalculatedSchedule.map(({ dueDate, amount }, index) => ({
                contractId,
                driverId: current.driverId,
                type: "installment",
                dueDate: new Date(`${dueDate}T00:00:00.000Z`),
                amount: amount + dailyInsuranceAmount + dailyGpsAmount,
                metadata: buildInstallmentObligationMetadata(amount, 0, 0),
                externalReference: `${nextContractNumber}:${index + 1}`,
              })),
            });
          }
        }
      });

      return this.getById(contractId);
    }

    const listItem = seedContracts.find((item) => item.id === contractId);
    const detailItem = seedContractDetails.find((item) => item.id === contractId);
    if (!listItem || !detailItem) {
      return null;
    }

    const currentInstallmentDay = detailItem.installmentDay;
    const currentTermMonths = detailItem.termMonths ?? 1;
    const currentStartDate = detailItem.startDate ?? new Date().toISOString().slice(0, 10);
    const currentEndDate = detailItem.endDate ?? currentStartDate;
    const currentFinancedAmount = detailItem.financedAmount;
    const currentInstallmentAmount = detailItem.installmentAmount;

    const nextStartDate: string = input.startDate ?? currentStartDate;
    const nextEndDate: string = input.endDate ?? currentEndDate;
    const nextInstallmentDay = input.installmentDay ?? (new Date(`${nextEndDate}T00:00:00.000Z`).getUTCDate() || currentInstallmentDay);
    const nextTermMonths: number = input.termMonths ?? calculateTermMonthsFromDates(nextStartDate, nextEndDate);
    const nextFinancedAmount = input.financedAmount ?? currentFinancedAmount;
    const nextInstallmentAmount = input.installmentAmount ?? currentInstallmentAmount;
    const scheduleChanged =
      nextInstallmentDay !== currentInstallmentDay
      || nextTermMonths !== currentTermMonths
      || nextStartDate !== currentStartDate
      || nextEndDate !== currentEndDate
      || nextFinancedAmount !== currentFinancedAmount
      || nextInstallmentAmount !== currentInstallmentAmount;

    listItem.status = input.status ?? listItem.status;
    listItem.contractNumber = input.contractNumber?.trim() || listItem.contractNumber;
    listItem.financedAmount = nextFinancedAmount;
    listItem.installmentAmount = nextInstallmentAmount;
    listItem.monthlyInsuranceAmount = input.monthlyInsuranceAmount ?? listItem.monthlyInsuranceAmount ?? null;
    listItem.monthlyGpsAmount = input.monthlyGpsAmount ?? listItem.monthlyGpsAmount ?? null;

    detailItem.status = input.status ?? detailItem.status;
    detailItem.contractNumber = input.contractNumber?.trim() || detailItem.contractNumber;
    detailItem.principalAmount = input.principalAmount ?? detailItem.principalAmount;
    detailItem.financedAmount = nextFinancedAmount;
    detailItem.installmentAmount = nextInstallmentAmount;
    detailItem.monthlyInsuranceAmount = input.monthlyInsuranceAmount ?? detailItem.monthlyInsuranceAmount ?? null;
    detailItem.monthlyGpsAmount = input.monthlyGpsAmount ?? detailItem.monthlyGpsAmount ?? null;
    detailItem.installmentDay = nextInstallmentDay;
    detailItem.termMonths = nextTermMonths;
    detailItem.startDate = nextStartDate;
    detailItem.endDate = nextEndDate;

    if (scheduleChanged) {
      const driver = seedDrivers.find((item) => item.id === detailItem.driverId);
      const dueDates = buildDailyInstallmentDueDates(nextStartDate, nextEndDate, driver?.weeklyDayOff);
      const schedule = buildInstallmentSchedule(dueDates, nextFinancedAmount, nextInstallmentAmount);
      detailItem.schedule = schedule.map(({ dueDate, amount }) => ({
        id: crypto.randomUUID(),
        driverId: detailItem.driverId,
        contractId: detailItem.id,
        type: "installment" as const,
        amount,
        paidAmount: 0,
        dueDate,
        deferredUntil: null,
        deferredByStatusRequestId: null,
      }));
      const nextOpen = detailItem.schedule[0] ?? null;
      listItem.currentDebt = nextFinancedAmount;
      listItem.nextDueDate = nextOpen?.dueDate ?? null;
      listItem.nextDueAmount = nextOpen?.amount ?? 0;
      listItem.hasDeferredPayment = false;
      detailItem.currentDebt = nextFinancedAmount;
      detailItem.nextDueDate = nextOpen?.dueDate ?? null;
      detailItem.nextDueAmount = nextOpen?.amount ?? 0;
      detailItem.hasDeferredPayment = false;
    }

    return detailItem;
  }

  async updateStatus(contractId: string, status: ContractListItem["status"]): Promise<ContractDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      await prisma.contract.update({
        where: { id: contractId },
        data: { status },
      });

      return this.getById(contractId);
    }

    const listItem = seedContracts.find((item) => item.id === contractId);
    if (listItem) {
      listItem.status = status;
    }

    const detailItem = seedContractDetails.find((item) => item.id === contractId);
    if (detailItem) {
      detailItem.status = status;
    }

    return this.getById(contractId);
  }
}
