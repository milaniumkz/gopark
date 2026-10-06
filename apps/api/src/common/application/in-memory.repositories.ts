import { nextIncidentStatusHistory } from "../repositories/incident-history.js";
import type {
  AuthRateLimitRepository,
  AuditRepository,
  CarRepository,
  ContractRepository,
  DriverRepository,
  DriverCreditBalanceRepository,
  IncidentRepository,
  LedgerRepository,
  ManagerAlertRepository,
  NotificationRepository,
  ObligationRepository,
  OutboxRepository,
  PaymentRepository,
  PayoutRepository,
  ApprovePayoutInput,
  QuickActionRepository,
  SettingsRepository,
  StatusRequestRepository,
  UserRepository,
  YandexBalanceRepository,
} from "../repositories/index.js";
import {
  seedContractDetails,
  seedAuditLogs,
  seedCars,
  seedContracts,
  seedDrivers,
  seedLedger,
  seedNotifications,
  seedObligations,
  seedOutboxEvents,
  seedPayments,
  seedPayouts,
  seedDriverStatusRequests,
  seedManagerAlerts,
  seedManagerIncidents,
  seedManagerQuickActions,
  seedSettingsOverview,
  seedUsers,
  seedDriverFinanceProfiles,
  seedDriverCreditBalances,
} from "../../data/seed.js";
import type {
  CreateAdminUserRequest,
  DriverCreateStatusRequest,
  UpdateAdminUserRequest,
  UpdateSettingsRequest,
  UserAdminListItem,
  UserRole,
} from "@gopark/contracts";
import type { CreateDriverDto } from "../../modules/drivers/dto/create-driver.dto.js";
import type { UpdateDriverDto } from "../../modules/drivers/dto/update-driver.dto.js";
import type { CreateCarDto } from "../../modules/cars/dto/create-car.dto.js";
import type { UpdateCarDto } from "../../modules/cars/dto/update-car.dto.js";
import type { CreateContractDto } from "../../modules/contracts/dto/create-contract.dto.js";
import type { UpdateContractDto } from "../../modules/contracts/dto/update-contract.dto.js";
import type { CreatePaymentDto } from "../../modules/payments/dto/create-payment.dto.js";
import type { CreatePayoutDto } from "../../modules/payouts/dto/create-payout.dto.js";
import type { CreateLedgerEntryDto } from "../../modules/ledger/dto/create-ledger-entry.dto.js";
import { hashPassword } from "../../modules/auth/password.util.js";

type InMemoryAuthRateLimitRecord = {
  attempts: number;
  blockedUntilMs: number | null;
  windowStartedAtMs: number;
};

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

  return dueDates.map((dueDate) => ({ dueDate, amount: 2300 }));
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

export class InMemoryDriverRepository implements DriverRepository {
  private readonly riskStatusChanges: Array<{
    id: string;
    driverId: string;
    driverName: string;
    previousStatus: string | null;
    nextStatus: string;
    changedByUserId: string | null;
    changedAt: string;
    note: string | null;
  }> = [];
  private readonly riskStatusReviews: Array<{
    id: string;
    driverId: string;
    driverName: string;
    requestedByManagerId: string;
    requestedByManagerName: string;
    previousStatus: string;
    requestedStatus: string;
    reviewStatus: string;
    note: string | null;
    createdAt: string;
    reviewedAt: string | null;
  }> = [];

  async list() {
    return seedDrivers.map((item) => ({
      ...item,
      creditBalance: seedDriverCreditBalances[item.id] ?? item.creditBalance ?? 0,
    }));
  }

  async listByCompany(companyName: string) {
    const rows = await this.list();
    return rows.filter((item) => (item.companyName ?? null) === companyName);
  }

  async getById(driverId: string) {
    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    const assignedCar = seedCars.find((item) => item.assignedDriverId === driver.id);
    const obligations = seedObligations.filter((item) => item.contractId === driver.activeContractId);

    return {
      ...driver,
      creditBalance: seedDriverCreditBalances[driver.id] ?? driver.creditBalance ?? 0,
      assignedCarId: assignedCar?.id ?? null,
      currentDebt: obligations.reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
      totalObligations: obligations.reduce((sum, item) => sum + item.amount, 0),
      totalPaid: obligations.reduce((sum, item) => sum + item.paidAmount, 0),
    };
  }

  async create(input: CreateDriverDto) {
    const item = {
      id: `drv_${seedDrivers.length + 1}`,
      fullName: `${input.firstName} ${input.lastName}`,
      phone: input.phone,
      nearestRelativePhone: input.nearestRelativePhone?.trim() || null,
      licenseNumber: input.licenseNumber?.trim() || null,
      passportNumber: input.passportNumber?.trim() || null,
      companyName: input.companyName?.trim() || null,
      weeklyDayOff: input.weeklyDayOff?.trim() || null,
      status: "active",
      riskStatus: "normal",
      managerId: input.managerId ?? null,
      activeContractId: null,
      creditBalance: 0,
    };

    seedDrivers.push(item);
    return item;
  }

  async update(driverId: string, input: UpdateDriverDto) {
    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    const [firstName = "", ...lastNameParts] = driver.fullName.split(" ");
    const nextFirstName = input.firstName?.trim() || firstName;
    const nextLastName = input.lastName?.trim() || lastNameParts.join(" ");
    driver.fullName = `${nextFirstName} ${nextLastName}`.trim();
    driver.phone = input.phone?.trim() || driver.phone;
    driver.nearestRelativePhone = input.nearestRelativePhone?.trim() || null;
    driver.licenseNumber = input.licenseNumber?.trim() || null;
    driver.passportNumber = input.passportNumber?.trim() || null;
    if (input.companyName !== undefined) {
      driver.companyName = input.companyName?.trim() || null;
    }
    if (input.weeklyDayOff !== undefined) {
      driver.weeklyDayOff = input.weeklyDayOff?.trim() || null;
    }
    if (input.status?.trim()) {
      driver.status = input.status.trim();
    }
    if (input.riskStatus?.trim()) {
      driver.riskStatus = input.riskStatus.trim();
    }

    return {
      ...driver,
      creditBalance: seedDriverCreditBalances[driver.id] ?? driver.creditBalance ?? 0,
    };
  }

  async updateManager(driverId: string, managerId: string | null) {
    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    driver.managerId = managerId;
    return {
      ...driver,
      creditBalance: seedDriverCreditBalances[driver.id] ?? driver.creditBalance ?? 0,
    };
  }

  async updateRiskStatus(driverId: string, riskStatus: string, changedByUserId?: string | null, note?: string | null) {
    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    const nextRiskStatus = ["normal", "medium", "risk"].includes(riskStatus) ? riskStatus : "normal";
    const previousStatus = driver.riskStatus ?? "normal";
    driver.riskStatus = nextRiskStatus;
    if (previousStatus !== nextRiskStatus) {
      this.riskStatusChanges.unshift({
        id: crypto.randomUUID(),
        driverId,
        driverName: driver.fullName,
        previousStatus,
        nextStatus: nextRiskStatus,
        changedByUserId: changedByUserId ?? null,
        changedAt: new Date().toISOString(),
        note: note?.trim() || null,
      });
    }

    return {
      ...driver,
      creditBalance: seedDriverCreditBalances[driver.id] ?? driver.creditBalance ?? 0,
    };
  }

  async listRiskStatusChanges(limit = 100) {
    return this.riskStatusChanges.slice(0, Math.max(1, Math.min(limit, 500)));
  }

  async createRiskStatusReview(driverId: string, requestedByManagerId: string, requestedStatus: string) {
    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    const review = {
      id: crypto.randomUUID(),
      driverId,
      driverName: driver.fullName,
      requestedByManagerId,
      requestedByManagerName: "Бригадир",
      previousStatus: driver.riskStatus ?? "normal",
      requestedStatus,
      reviewStatus: "pending",
      note: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    };
    this.riskStatusReviews.unshift(review);
    return review;
  }

  async listRiskStatusReviews(managerIds: string[], limit = 100) {
    const managerIdSet = new Set(managerIds);
    return this.riskStatusReviews
      .filter((item) => managerIdSet.has(item.requestedByManagerId))
      .slice(0, Math.max(1, Math.min(limit, 500)));
  }

  async reviewRiskStatusRequest(requestId: string, reviewedByManagerId: string, action: "approve" | "reject") {
    const review = this.riskStatusReviews.find((item) => item.id === requestId);
    if (!review) {
      return null;
    }

    review.reviewStatus = action === "approve" ? "approved" : "rejected";
    review.reviewedAt = new Date().toISOString();
    if (action === "approve") {
      await this.updateRiskStatus(review.driverId, review.requestedStatus, reviewedByManagerId);
    }

    return review;
  }
}

export class InMemoryDriverCreditBalanceRepository implements DriverCreditBalanceRepository {
  async getByDriver(driverId: string) {
    return seedDriverCreditBalances[driverId] ?? 0;
  }

  async getByDrivers(driverIds: string[]) {
    return Object.fromEntries(driverIds.map((driverId) => [driverId, seedDriverCreditBalances[driverId] ?? 0]));
  }

  async addCredit(driverId: string, amount: number) {
    seedDriverCreditBalances[driverId] = (seedDriverCreditBalances[driverId] ?? 0) + amount;
    return seedDriverCreditBalances[driverId];
  }
}

export class InMemoryCarRepository implements CarRepository {
  async list() {
    return seedCars.map((car) => {
      const contract = seedContracts.find((item) => item.carId === car.id && item.status === "active") ?? null;
      const openObligations = seedObligations
        .filter((item) => item.contractId === contract?.id)
        .map((item) => ({
          remainingAmount: item.amount - item.paidAmount,
          dueDate: item.deferredUntil
            ? new Date(new Date(`${item.deferredUntil}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
            : item.dueDate,
          hasDeferredPayment: !!item.deferredUntil,
        }))
        .filter((item) => item.remainingAmount > 0)
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
      const nextOpen = openObligations[0] ?? null;

      return {
        ...car,
        activeContractId: contract?.id ?? null,
        currentDebt: openObligations.reduce((sum, item) => sum + item.remainingAmount, 0),
        nextDueAmount: nextOpen?.remainingAmount ?? 0,
        nextDueDate: nextOpen?.dueDate ?? null,
        hasDeferredPayment: openObligations.some((item) => item.hasDeferredPayment),
      };
    });
  }

  async listByCompany(companyName: string) {
    const rows = await this.list();
    return rows.filter((item) => (item.companyName ?? null) === companyName);
  }

  async getById(carId: string) {
    const car = seedCars.find((item) => item.id === carId);
    if (!car) {
      return null;
    }

    const contract = seedContracts.find((item) => item.carId === car.id && item.status === "active");

    return {
      ...car,
      activeContractId: contract?.id ?? null,
      financedAmount: contract?.financedAmount ?? null,
      installmentAmount: contract?.installmentAmount ?? null,
    };
  }

  async getAssignedByDriver(driverId: string) {
    const car = seedCars.find((item) => item.assignedDriverId === driverId) ?? null;
    return car ? this.getById(car.id) : null;
  }

  async create(input: CreateCarDto) {
    const item = {
      id: `car_${seedCars.length + 1}`,
      plateNumber: input.plateNumber,
      vin: input.vin,
      make: input.make,
      model: input.model,
      companyName: input.companyName?.trim() || null,
      productionYear: input.productionYear ?? null,
      mileage: input.mileage ?? null,
      color: input.color?.trim() || null,
      status: "free",
      assignedDriverId: null,
      purchasePrice: input.purchasePrice ?? null,
      customsCost: input.customsCost ?? null,
      deliveryCost: input.deliveryCost ?? null,
      repairCost: input.repairCost ?? null,
      targetSalePrice: input.targetSalePrice ?? null,
      totalAcquisitionCost: (input.purchasePrice ?? 0) + (input.customsCost ?? 0) + (input.deliveryCost ?? 0) + (input.repairCost ?? 0),
    };

    seedCars.push(item);
    return item;
  }

  async update(carId: string, input: UpdateCarDto) {
    const car = seedCars.find((item) => item.id === carId);
    if (!car) {
      return null;
    }

    car.plateNumber = input.plateNumber?.trim() || car.plateNumber;
    car.vin = input.vin?.trim() || car.vin;
    car.make = input.make?.trim() || car.make;
    car.model = input.model?.trim() || car.model;
    if (input.companyName !== undefined) {
      car.companyName = input.companyName?.trim() || null;
    }
    car.productionYear = input.productionYear ?? car.productionYear ?? null;
    car.mileage = input.mileage ?? car.mileage ?? null;
    car.color = input.color?.trim() || null;
    car.status = input.status?.trim() || car.status;
    car.purchasePrice = input.purchasePrice ?? car.purchasePrice ?? null;
    car.customsCost = input.customsCost ?? car.customsCost ?? null;
    car.deliveryCost = input.deliveryCost ?? car.deliveryCost ?? null;
    car.repairCost = input.repairCost ?? car.repairCost ?? null;
    car.targetSalePrice = input.targetSalePrice ?? car.targetSalePrice ?? null;
    car.totalAcquisitionCost =
      (car.purchasePrice ?? 0) + (car.customsCost ?? 0) + (car.deliveryCost ?? 0) + (car.repairCost ?? 0);

    const updated = await this.getById(carId);
    return updated
      ? {
          ...updated,
          financedAmount: undefined,
          installmentAmount: undefined,
        }
      : null;
  }
}

export class InMemoryContractRepository implements ContractRepository {
  async list() {
    return seedContracts.map((item) => {
      const openObligations = seedObligations
        .filter((obligation) => obligation.contractId === item.id)
        .map((obligation) => ({
          remainingAmount: obligation.amount - obligation.paidAmount,
          dueDate: obligation.deferredUntil
            ? new Date(new Date(`${obligation.deferredUntil}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
            : obligation.dueDate,
          hasDeferredPayment: !!obligation.deferredUntil,
        }))
        .filter((obligation) => obligation.remainingAmount > 0)
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
      const nextOpen = openObligations[0];
      const isActive = item.status === "active";
      const today = new Date().toISOString().slice(0, 10);
      const overdueObligations = openObligations.filter((obligation) => obligation.dueDate < today);

      return {
        ...item,
        currentDebt: isActive ? openObligations.reduce((sum, obligation) => sum + obligation.remainingAmount, 0) : 0,
        overdueDebt: overdueObligations.reduce((sum, obligation) => sum + obligation.remainingAmount, 0),
        overdueSinceDate: overdueObligations[0]?.dueDate ?? null,
        overdueUntilDate: overdueObligations.at(-1)?.dueDate ?? null,
        nextDueDate: isActive ? (nextOpen?.dueDate ?? null) : null,
        nextDueAmount: isActive ? (nextOpen?.remainingAmount ?? 0) : 0,
        hasDeferredPayment: isActive ? openObligations.some((obligation) => obligation.hasDeferredPayment) : false,
      };
    });
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    const rows = await this.list();
    return rows.filter((item) => driverIds.has(item.driverId));
  }

  async getById(contractId: string) {
    const detail = seedContractDetails.find((item) => item.id === contractId);
    if (!detail) {
      return null;
    }

    const openObligations = seedObligations
      .filter((item) => item.contractId === contractId)
      .map((item) => ({
        remainingAmount: item.amount - item.paidAmount,
        dueDate: item.deferredUntil
          ? new Date(new Date(`${item.deferredUntil}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10)
          : item.dueDate,
        hasDeferredPayment: !!item.deferredUntil,
      }))
      .filter((item) => item.remainingAmount > 0)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    const nextOpen = openObligations[0];
    const isActive = detail.status === "active";
    const today = new Date().toISOString().slice(0, 10);
    const overdueObligations = openObligations.filter((item) => item.dueDate < today);

    return {
      ...detail,
      currentDebt: isActive ? openObligations.reduce((sum, item) => sum + item.remainingAmount, 0) : 0,
      overdueDebt: overdueObligations.reduce((sum, item) => sum + item.remainingAmount, 0),
      overdueSinceDate: overdueObligations[0]?.dueDate ?? null,
      overdueUntilDate: overdueObligations.at(-1)?.dueDate ?? null,
      nextDueDate: isActive ? (nextOpen?.dueDate ?? null) : null,
      nextDueAmount: isActive ? (nextOpen?.remainingAmount ?? 0) : 0,
      hasDeferredPayment: isActive ? openObligations.some((item) => item.hasDeferredPayment) : false,
      schedule: seedObligations
        .filter((item) => item.contractId === contractId)
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    };
  }

  async getActiveByDriver(driverId: string) {
    const contract = seedContracts.find((item) => item.driverId === driverId && item.status === "active");
    return contract ? this.getById(contract.id) : null;
  }

  async getMaxIssuedAmountByCar(carId: string) {
    return seedContracts
      .filter((item) => item.carId === carId)
      .reduce((max, item) => Math.max(max, item.financedAmount), 0);
  }

  async create(input: CreateContractDto) {
    const installmentDay = input.installmentDay ?? (new Date(`${input.endDate}T00:00:00.000Z`).getUTCDate() || 15);
    const termMonths = calculateTermMonthsFromDates(input.startDate, input.endDate);
    const driver = seedDrivers.find((entry) => entry.id === input.driverId);
    const dueDates = buildDailyInstallmentDueDates(input.startDate, input.endDate, driver?.weeklyDayOff);
    const schedule = buildInstallmentSchedule(dueDates, input.financedAmount, input.installmentAmount);
    const insuranceSchedule = buildRecurringChargeSchedule("insurance", input.monthlyInsuranceAmount, input.insuranceBillingMode, input.startDate, input.endDate, dueDates);
    const gpsSchedule = buildRecurringChargeSchedule("gps", input.monthlyGpsAmount, input.gpsBillingMode, input.startDate, input.endDate, dueDates);
    const monthlyInsuranceAmount = resolveMonthlyStoredAmount(input.monthlyInsuranceAmount, input.insuranceBillingMode);
    const monthlyGpsAmount = resolveMonthlyStoredAmount(input.monthlyGpsAmount, input.gpsBillingMode);
    const dailyInsuranceAmount = resolveDailyChargeAmount(input.monthlyInsuranceAmount, input.insuranceBillingMode);
    const dailyGpsAmount = resolveDailyChargeAmount(input.monthlyGpsAmount, input.gpsBillingMode);
    const scheduleWithDailyCharges = schedule.map((entry) => ({
      ...entry,
      amount: entry.amount + dailyInsuranceAmount + dailyGpsAmount,
      metadata: buildInstallmentObligationMetadata(entry.amount, dailyGpsAmount, dailyInsuranceAmount),
    }));
    const equalInstallmentAmount = schedule[0]?.amount ?? input.installmentAmount;

    const item = {
      id: `ctr_${seedContracts.length + 1}`,
      driverId: input.driverId,
      carId: input.carId,
      status: "active" as const,
      contractNumber: input.contractNumber,
      financedAmount: input.financedAmount,
      installmentAmount: equalInstallmentAmount,
      monthlyInsuranceAmount,
      monthlyGpsAmount,
      termMonths,
      startDate: input.startDate,
      endDate: input.endDate,
      currentDebt: scheduleWithDailyCharges.reduce((sum, entry) => sum + entry.amount, 0) + insuranceSchedule.reduce((sum, entry) => sum + entry.amount, 0) + gpsSchedule.reduce((sum, entry) => sum + entry.amount, 0),
      nextDueDate: scheduleWithDailyCharges[0]?.dueDate ?? null,
      nextDueAmount: scheduleWithDailyCharges[0]?.amount ?? 0,
      hasDeferredPayment: false,
    };

    seedContracts.push(item);
    for (const existingContract of seedContracts) {
      if (existingContract.driverId === input.driverId && existingContract.id !== item.id && existingContract.status === "active") {
        existingContract.status = "closed";
      }
    }
    seedContractDetails.push({
      ...item,
      principalAmount: input.principalAmount,
      installmentDay,
      monthlyInsuranceAmount,
      monthlyGpsAmount,
      termMonths,
      startDate: input.startDate,
      endDate: input.endDate,
      schedule: [
        ...scheduleWithDailyCharges.map(({ dueDate, amount, metadata }, index) => ({
          id: `obl_${seedObligations.length + index + 1}`,
          driverId: input.driverId,
          contractId: item.id,
          type: "installment",
          amount,
          paidAmount: 0,
          dueDate,
          metadata,
        })),
        ...insuranceSchedule.map(({ dueDate, amount, type }, index) => ({
          id: `obl_${seedObligations.length + schedule.length + index + 1}`,
          driverId: input.driverId,
          contractId: item.id,
          type,
          amount,
          paidAmount: 0,
          dueDate,
          metadata: null,
        })),
        ...gpsSchedule.map(({ dueDate, amount, type }, index) => ({
          id: `obl_${seedObligations.length + schedule.length + insuranceSchedule.length + index + 1}`,
          driverId: input.driverId,
          contractId: item.id,
          type,
          amount,
          paidAmount: 0,
          dueDate,
          metadata: null,
        })),
      ],
    });
    for (const existingContractDetail of seedContractDetails) {
      if (existingContractDetail.driverId === input.driverId && existingContractDetail.id !== item.id && existingContractDetail.status === "active") {
        existingContractDetail.status = "closed";
      }
    }
    seedObligations.push(
      ...scheduleWithDailyCharges.map(({ dueDate, amount, metadata }, index) => ({
        id: `obl_${seedObligations.length + index + 1}`,
        driverId: input.driverId,
        contractId: item.id,
        type: "installment" as const,
        amount,
        paidAmount: 0,
        dueDate,
        metadata,
      })),
      ...insuranceSchedule.map(({ dueDate, amount, type }, index) => ({
        id: `obl_${seedObligations.length + schedule.length + index + 1}`,
        driverId: input.driverId,
        contractId: item.id,
        type,
        amount,
        paidAmount: 0,
        dueDate,
        metadata: null,
      })),
      ...gpsSchedule.map(({ dueDate, amount, type }, index) => ({
        id: `obl_${seedObligations.length + schedule.length + insuranceSchedule.length + index + 1}`,
        driverId: input.driverId,
        contractId: item.id,
        type,
        amount,
        paidAmount: 0,
        dueDate,
        metadata: null,
      })),
    );
    if (driver) {
      driver.activeContractId = item.id;
      driver.status = "active";
    }
    const previousCar = seedCars.find((entry) => entry.assignedDriverId === input.driverId && entry.id !== input.carId);
    if (previousCar) {
      previousCar.assignedDriverId = null;
      previousCar.status = "free";
    }
    const car = seedCars.find((entry) => entry.id === input.carId);
    if (car) {
      car.assignedDriverId = input.driverId;
      car.status = "assigned";
    }
    return item;
  }

  async update(contractId: string, input: UpdateContractDto) {
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
    const driver = seedDrivers.find((entry) => entry.id === detailItem.driverId);
    const recalculatedDueDates = buildDailyInstallmentDueDates(nextStartDate, nextEndDate, driver?.weeklyDayOff);
    const recalculatedSchedule = buildInstallmentSchedule(recalculatedDueDates, nextFinancedAmount, nextInstallmentAmount);
    const storedInstallmentAmount = recalculatedSchedule[0]?.amount ?? nextInstallmentAmount;
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
    listItem.installmentAmount = storedInstallmentAmount;
    listItem.monthlyInsuranceAmount = input.monthlyInsuranceAmount ?? listItem.monthlyInsuranceAmount ?? null;
    listItem.monthlyGpsAmount = input.monthlyGpsAmount ?? listItem.monthlyGpsAmount ?? null;

    detailItem.status = input.status ?? detailItem.status;
    detailItem.contractNumber = input.contractNumber?.trim() || detailItem.contractNumber;
    detailItem.principalAmount = input.principalAmount ?? detailItem.principalAmount;
    detailItem.financedAmount = nextFinancedAmount;
    detailItem.installmentAmount = storedInstallmentAmount;
    detailItem.monthlyInsuranceAmount = input.monthlyInsuranceAmount ?? detailItem.monthlyInsuranceAmount ?? null;
    detailItem.monthlyGpsAmount = input.monthlyGpsAmount ?? detailItem.monthlyGpsAmount ?? null;
    detailItem.installmentDay = nextInstallmentDay;
    detailItem.termMonths = nextTermMonths;
    detailItem.startDate = nextStartDate;
    detailItem.endDate = nextEndDate;

    if (detailItem.status === "active") {
      const driver = seedDrivers.find((entry) => entry.id === detailItem.driverId);
      if (driver) {
        driver.activeContractId = detailItem.id;
        driver.status = "active";
      }
      for (const car of seedCars) {
        if (car.assignedDriverId === detailItem.driverId && car.id !== detailItem.carId) {
          car.assignedDriverId = null;
          car.status = "office";
        }
      }
      const car = seedCars.find((entry) => entry.id === detailItem.carId);
      if (car) {
        car.assignedDriverId = detailItem.driverId;
        car.status = "assigned";
      }
    }

    if (detailItem.status === "terminated") {
      const driver = seedDrivers.find((entry) => entry.id === detailItem.driverId);
      if (driver?.activeContractId === detailItem.id) {
        driver.activeContractId = null;
      }
      const car = seedCars.find((entry) => entry.id === detailItem.carId);
      if (car?.assignedDriverId === detailItem.driverId) {
        car.assignedDriverId = null;
        car.status = "office";
      }
    }

    if (scheduleChanged) {
      detailItem.schedule = recalculatedSchedule.map(({ dueDate, amount }) => ({
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

  async updateStatus(contractId: string, status: (typeof seedContracts)[number]["status"]) {
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

export class InMemoryPaymentRepository implements PaymentRepository {
  async list() {
    return seedPayments;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedPayments.filter((item) => driverIds.has(item.driverId));
  }

  async listByDriver(driverId: string) {
    return seedPayments.filter((item) => item.driverId === driverId);
  }

  async getLatestSuccessfulByDriver(driverId: string) {
    return seedPayments
      .filter((item) => item.driverId === driverId && item.status === "succeeded")
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async getLatestSuccessfulByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    const latestByDriver = new Map<string, (typeof seedPayments)[number] | null>();

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

  async create(input: CreatePaymentDto & { appliedAmount: number; unappliedAmount: number }) {
    const item = {
      id: `pay_${seedPayments.length + 1}`,
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

    seedPayments.push(item);
    return item;
  }
}

export class InMemoryPayoutRepository implements PayoutRepository {
  async list() {
    return seedPayouts;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedPayouts.filter((item) => driverIds.has(item.driverId));
  }

  async listByDriver(driverId: string) {
    return seedPayouts.filter((item) => item.driverId === driverId);
  }

  async getById(payoutId: string) {
    return seedPayouts.find((item) => item.id === payoutId) ?? null;
  }

  async countRequested() {
    return seedPayouts.filter((item) => item.status === "requested").length;
  }

  async getRequestedAmountByDriver(driverId: string) {
    return seedPayouts
      .filter((item) => item.driverId === driverId && item.status === "requested")
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async getRequestedAmountByDrivers(driverIds: string[]) {
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

  async create(input: CreatePayoutDto) {
    const item = {
      id: `po_${seedPayouts.length + 1}`,
      driverId: input.driverId,
      amount: input.amount,
      status: "requested",
      createdAt: new Date().toISOString(),
      payoutDestination: input.payoutDestination?.trim() || null,
    };

    seedPayouts.push(item);
    return item;
  }

  async approve(payoutId: string, input: ApprovePayoutInput) {
    const payout = seedPayouts.find((item) => item.id === payoutId);
    if (!payout) {
      return null;
    }

    payout.status = "approved";
    payout.approvedByUserId = input.approvedByUserId;
    return payout;
  }

  async reject(payoutId: string, input: ApprovePayoutInput) {
    const payout = seedPayouts.find((item) => item.id === payoutId);
    if (!payout) {
      return null;
    }

    payout.status = "rejected";
    payout.approvedByUserId = input.approvedByUserId;
    return payout;
  }
}

export class InMemoryObligationRepository implements ObligationRepository {
  async listByDriver(driverId: string) {
    return seedObligations.filter((item) => item.driverId === driverId);
  }

  async getDebtSnapshotsByCompany(companyName: string, asOfDate?: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getDebtSnapshotsByDrivers(driverIds, asOfDate);
  }

  async getDebtSnapshotsByDrivers(driverIds: string[], asOfDate?: string) {
    const ids = new Set(driverIds);
    const timestamp = asOfDate
      ? new Date(`${asOfDate}T00:00:00.000Z`).getTime()
      : Date.now();
    const grouped = new Map<string, (typeof seedObligations)>();

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

  async getTotalDueByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async getTotalDueByCompany(companyName: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalDueByDrivers(driverIds);
  }

  async getTotalDueByDriversInPeriod(driverIds: string[], startDate: string, endDate: string) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate >= startDate && item.dueDate <= endDate)
      .reduce((sum, item) => sum + item.amount, 0);
  }

  async getTotalDueByCompanyInPeriod(companyName: string, startDate: string, endDate: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalDueByDriversInPeriod(driverIds, startDate, endDate);
  }

  async getOpenDueByDriversInPeriod(driverIds: string[], startDate: string, endDate: string) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate >= startDate && item.dueDate <= endDate)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getOpenDueByCompanyInPeriod(companyName: string, startDate: string, endDate: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getOpenDueByDriversInPeriod(driverIds, startDate, endDate);
  }

  async getOpenDueByDriverInPeriod(driverId: string, startDate: string, endDate: string) {
    return this.getOpenDueByDriversInPeriod([driverId], startDate, endDate);
  }

  async getTotalPaidByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .reduce((sum, item) => sum + item.paidAmount, 0);
  }

  async getTotalPaidByCompany(companyName: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalPaidByDrivers(driverIds);
  }

  async getTotalPaidByDriversInPeriod(driverIds: string[], startDate: string, endDate: string) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate >= startDate && item.dueDate <= endDate)
      .reduce((sum, item) => sum + item.paidAmount, 0);
  }

  async getTotalPaidByCompanyInPeriod(companyName: string, startDate: string, endDate: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalPaidByDriversInPeriod(driverIds, startDate, endDate);
  }

  async getTotalDebtByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .reduce((sum, item) => sum + (item.amount - item.paidAmount), 0);
  }

  async getTotalDebtByCompany(companyName: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getTotalDebtByDrivers(driverIds);
  }

  async getOverdueAmountByDrivers(driverIds: string[], asOfDate?: string) {
    const ids = new Set(driverIds);
    const timestamp = asOfDate
      ? new Date(`${asOfDate}T00:00:00.000Z`).getTime()
      : Date.now();

    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .filter((item) => new Date(`${item.dueDate}T00:00:00.000Z`).getTime() < timestamp)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getOverdueAmountByCompany(companyName: string, asOfDate?: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.getOverdueAmountByDrivers(driverIds, asOfDate);
  }

  async countPaidByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .filter((item) => item.amount <= item.paidAmount)
      .length;
  }

  async countPaidByCompany(companyName: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.countPaidByDrivers(driverIds);
  }

  async countUnpaidByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId))
      .filter((item) => item.amount > item.paidAmount)
      .length;
  }

  async countUnpaidByCompany(companyName: string) {
    const driverIds = seedDrivers
      .filter((item) => (item.companyName ?? null) === companyName)
      .map((item) => item.id);

    return this.countUnpaidByDrivers(driverIds);
  }

  async getOverdueAmountByDriver(driverId: string, asOfDate?: string) {
    const timestamp = asOfDate
      ? new Date(`${asOfDate}T00:00:00.000Z`).getTime()
      : Date.now();

    return seedObligations
      .filter((item) => item.driverId === driverId)
      .filter((item) => new Date(`${item.dueDate}T00:00:00.000Z`).getTime() < timestamp)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getDueAmountByDriverOnDate(driverId: string, date: string) {
    return seedObligations
      .filter((item) => item.driverId === driverId && item.dueDate === date)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getDueAmountByDriversOnDate(driverIds: string[], date: string) {
    const ids = new Set(driverIds);
    return seedObligations
      .filter((item) => ids.has(item.driverId) && item.dueDate === date)
      .reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  async getNextOpenByDriver(driverId: string) {
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
  ) {
    let rest = amount;
    const obligations = seedObligations
      .filter((item) => item.driverId === driverId && item.contractId === contractId)
      .filter((item) => !obligationType || item.type === obligationType)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

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

  async deferByStatusRequest(requestId: string, driverId: string, startDate: string, endDate: string) {
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

  async clearDeferredByStatusRequest(requestId: string) {
    const obligations = seedObligations
      .filter((item) => item.deferredByStatusRequestId === requestId);

    for (const obligation of obligations) {
      obligation.deferredUntil = null;
      obligation.deferredByStatusRequestId = null;
    }

    return obligations;
  }
}

export class InMemoryLedgerRepository implements LedgerRepository {
  async list() {
    return seedLedger;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedLedger.filter((item) => item.driverId && driverIds.has(item.driverId));
  }

  async create(input: CreateLedgerEntryDto) {
    const item = {
      id: `led_${seedLedger.length + 1}`,
      accountId: input.accountId,
      contractId: input.contractId ?? null,
      driverId: input.driverId ?? null,
      type: input.type,
      money: { amount: input.amount, currency: "KGS" as const },
      postedAt: new Date().toISOString(),
      externalReference: input.externalReference,
    };

    seedLedger.push(item);
    return item;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  async list() {
    return seedAuditLogs;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );
    const carIds = new Set(
      seedCars
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );
    const contractIds = new Set(
      seedContracts
        .filter((item) => driverIds.has(item.driverId) || carIds.has(item.carId))
        .map((item) => item.id),
    );
    const paymentIds = new Set(
      seedPayments
        .filter((item) => driverIds.has(item.driverId))
        .map((item) => item.id),
    );
    const payoutIds = new Set(
      seedPayouts
        .filter((item) => driverIds.has(item.driverId))
        .map((item) => item.id),
    );
    const userIds = new Set(
      seedUsers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedAuditLogs.filter((item) => {
      if (!item.entityId) {
        return false;
      }

      if (item.entityType === "driver") {
        return driverIds.has(item.entityId);
      }
      if (item.entityType === "car") {
        return carIds.has(item.entityId);
      }
      if (item.entityType === "contract") {
        return contractIds.has(item.entityId);
      }
      if (item.entityType === "payment") {
        return paymentIds.has(item.entityId);
      }
      if (item.entityType === "payout") {
        return payoutIds.has(item.entityId);
      }
      if (item.entityType === "user") {
        return userIds.has(item.entityId);
      }

      return false;
    });
  }

  async create(action: string, entityType: string, entityId: string | null, input: {
    actorUserId?: string | null;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
  } = {}) {
    const item = {
      id: `aud_${seedAuditLogs.length + 1}`,
      action,
      entityType,
      entityId,
      actorUserId: input.actorUserId ?? null,
      beforeData: input.beforeData ?? null,
      afterData: input.afterData ?? null,
      correlationId: `corr_${seedAuditLogs.length + 1}`,
      createdAt: new Date().toISOString(),
    };

    seedAuditLogs.push(item);
    return item;
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  async list() {
    return seedNotifications;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedNotifications.filter((item) => item.driverId && driverIds.has(item.driverId));
  }

  async getById(notificationId: string) {
    return seedNotifications.find((item) => item.id === notificationId) ?? null;
  }

  async updateStatus(notificationId: string, status: (typeof seedNotifications)[number]["status"]) {
    const item = seedNotifications.find((entry) => entry.id === notificationId);
    if (!item) {
      return null;
    }

    item.status = status;
    return item;
  }

  async countPendingByDriverOrUser(driverId: string, userId: string | null) {
    return seedNotifications.filter(
      (item) =>
        item.status === "pending" &&
        (item.driverId === driverId || (userId !== null && item.userId === userId)),
    ).length;
  }

  async create(input: Omit<(typeof seedNotifications)[number], "id" | "status">) {
    const item = {
      id: `ntf_${seedNotifications.length + 1}`,
      ...input,
      status: "pending",
      createdAt: "createdAt" in input && input.createdAt ? input.createdAt : new Date().toISOString(),
    };

    seedNotifications.push(item);
    return item;
  }
}

export class InMemoryAuthRateLimitRepository implements AuthRateLimitRepository {
  private readonly records = new Map<string, InMemoryAuthRateLimitRecord>();

  async getRetryAfterSeconds(action: string, keyHash: string, now: Date) {
    const record = this.records.get(this.composeKey(action, keyHash));
    if (!record || record.blockedUntilMs == null || record.blockedUntilMs <= now.getTime()) {
      return null;
    }

    return toRetryAfterSeconds(record.blockedUntilMs, now.getTime());
  }

  async registerAttempt(input: {
    action: string;
    keyHash: string;
    now: Date;
    maxAttempts: number;
    windowMs: number;
    blockMs: number;
  }) {
    const nowMs = input.now.getTime();
    const retryAfterSeconds = await this.getRetryAfterSeconds(input.action, input.keyHash, input.now);
    if (retryAfterSeconds != null) {
      return {
        blocked: true,
        retryAfterSeconds,
      };
    }

    const key = this.composeKey(input.action, input.keyHash);
    const windowStartedAtMs = Math.floor(nowMs / input.windowMs) * input.windowMs;
    const record = this.records.get(key);
    const nextRecord: InMemoryAuthRateLimitRecord =
      !record || record.windowStartedAtMs !== windowStartedAtMs
        ? {
          attempts: 1,
          blockedUntilMs: null,
          windowStartedAtMs,
        }
        : {
          attempts: record.attempts + 1,
          blockedUntilMs: null,
          windowStartedAtMs,
        };

    if (nextRecord.attempts > input.maxAttempts) {
      nextRecord.blockedUntilMs = nowMs + input.blockMs;
    }

    this.records.set(key, nextRecord);

    return {
      blocked: nextRecord.blockedUntilMs != null && nextRecord.blockedUntilMs > nowMs,
      retryAfterSeconds:
        nextRecord.blockedUntilMs == null ? 0 : toRetryAfterSeconds(nextRecord.blockedUntilMs, nowMs),
    };
  }

  private composeKey(action: string, keyHash: string): string {
    return `${action}:${keyHash}`;
  }
}

export class InMemoryOutboxRepository implements OutboxRepository {
  async list() {
    return seedOutboxEvents;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );
    const carIds = new Set(
      seedCars
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );
    const contractIds = new Set(
      seedContracts
        .filter((item) => driverIds.has(item.driverId) || carIds.has(item.carId))
        .map((item) => item.id),
    );
    const paymentIds = new Set(
      seedPayments
        .filter((item) => driverIds.has(item.driverId))
        .map((item) => item.id),
    );
    const payoutIds = new Set(
      seedPayouts
        .filter((item) => driverIds.has(item.driverId))
        .map((item) => item.id),
    );

    return seedOutboxEvents.filter((item) => {
      if (item.aggregateType === "driver") {
        return driverIds.has(item.aggregateId);
      }
      if (item.aggregateType === "car") {
        return carIds.has(item.aggregateId);
      }
      if (item.aggregateType === "contract") {
        return contractIds.has(item.aggregateId);
      }
      if (item.aggregateType === "payment") {
        return paymentIds.has(item.aggregateId);
      }
      if (item.aggregateType === "payout") {
        return payoutIds.has(item.aggregateId);
      }

      return false;
    });
  }

  async listPending(limit = 100) {
    return seedOutboxEvents
      .filter((item) => item.status === "pending")
      .slice(0, limit);
  }

  async countPending() {
    return seedOutboxEvents.filter((item) => item.status === "pending" || item.status === "queued").length;
  }

  async getById(eventId: string) {
    return seedOutboxEvents.find((item) => item.id === eventId) ?? null;
  }

  async create(input: Omit<(typeof seedOutboxEvents)[number], "id" | "status" | "createdAt">) {
    const item = {
      id: `evt_${seedOutboxEvents.length + 1}`,
      ...input,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };

    seedOutboxEvents.push(item);
    return item;
  }

  async markPending(eventId: string) {
    const event = seedOutboxEvents.find((item) => item.id === eventId);
    if (!event) {
      return null;
    }

    event.status = "pending";
    return event;
  }

  async markPublished(eventId: string) {
    const event = seedOutboxEvents.find((item) => item.id === eventId);
    if (!event) {
      return null;
    }

    event.status = "published";
    return event;
  }

  async markFailed(eventId: string) {
    const event = seedOutboxEvents.find((item) => item.id === eventId);
    if (!event) {
      return null;
    }

    event.status = "failed";
    return event;
  }
}

function toRetryAfterSeconds(blockedUntilMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((blockedUntilMs - nowMs) / 1000));
}

export class InMemoryStatusRequestRepository implements StatusRequestRepository {
  async listByDriver(driverId: string) {
    return seedDriverStatusRequests.filter((item) => item.driverId === driverId);
  }

  async listByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedDriverStatusRequests.filter((item) => item.driverId && ids.has(item.driverId));
  }

  async listRecentByDriver(driverId: string, limit: number) {
    return seedDriverStatusRequests
      .filter((item) => item.driverId === driverId)
      .slice(0, limit);
  }

  async countPendingByDriver(driverId: string) {
    return seedDriverStatusRequests
      .filter((item) => item.driverId === driverId && item.status === "pending")
      .length;
  }

  async countPendingByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedDriverStatusRequests
      .filter((item) => item.driverId && ids.has(item.driverId) && item.status === "pending")
      .length;
  }

  async getById(requestId: string) {
    return seedDriverStatusRequests.find((item) => item.id === requestId) ?? null;
  }

  async create(driverId: string, input: DriverCreateStatusRequest) {
    const item = {
      id: `req_${seedDriverStatusRequests.length + 1}`,
      driverId,
      type: input.type,
      status: "pending",
      period: input.period,
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };

    seedDriverStatusRequests.push(item);
    return item;
  }

  async updateStatus(requestId: string, status: string) {
    const item = seedDriverStatusRequests.find((request) => request.id === requestId);
    if (!item) {
      return null;
    }

    item.status = status;
    return item;
  }
}

export class InMemoryYandexBalanceRepository implements YandexBalanceRepository {
  async getLatestByDriver(driverId: string) {
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

  async getLatestByDrivers(driverIds: string[]) {
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

export class InMemoryIncidentRepository implements IncidentRepository {
  async list() {
    return seedManagerIncidents;
  }

  async listByCompany(companyName: string) {
    const driverIds = new Set(
      seedDrivers
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );
    const carIds = new Set(
      seedCars
        .filter((item) => (item.companyName ?? null) === companyName)
        .map((item) => item.id),
    );

    return seedManagerIncidents.filter((item) => (
      (item.driverId && driverIds.has(item.driverId))
      || (item.carId && carIds.has(item.carId))
    ));
  }

  async countOpen() {
    return seedManagerIncidents.filter((item) => item.status === "open").length;
  }

  async countOpenByDrivers(driverIds: string[]) {
    const ids = new Set(driverIds);
    return seedManagerIncidents
      .filter((item) => item.status === "open" && item.driverId && ids.has(item.driverId))
      .length;
  }

  async listOpenByDriver(driverId: string) {
    return seedManagerIncidents.filter((item) => item.driverId === driverId && item.status === "open");
  }

  async create(input: import("../repositories/incident.repository.js").CreateIncidentRecord) {
    const incident = {
      id: `inc_${seedManagerIncidents.length + 1}`,
      title: input.title,
      incidentType: input.incidentType,
      status: input.status,
      priority: input.priority,
      driverId: input.driverId ?? undefined,
      carId: input.carId ?? undefined,
      occurredAt: input.occurredAt ?? null,
      periodLabel: input.periodLabel ?? null,
      referenceNumber: input.referenceNumber ?? null,
      amount: input.amount ?? null,
      insuranceCompensationAmount: input.insuranceCompensationAmount ?? null,
      writeoffAmount: input.writeoffAmount ?? null,
      description: input.description ?? null,
      insuranceNote: input.insuranceNote ?? null,
      repairNote: input.repairNote ?? null,
      locationNote: input.locationNote ?? null,
      managerLabel: input.managerLabel ?? null,
      statusHistory: [{ status: input.status, serviceStage: input.serviceStage ?? null, changedAt: new Date().toISOString() }],
      serviceStage: input.serviceStage ?? null,
      serviceCaseType: input.serviceCaseType ?? null,
      servicePaymentStatus: input.servicePaymentStatus ?? null,
      servicePayer: input.servicePayer ?? null,
    };

    seedManagerIncidents.unshift(incident);
    return incident;
  }

  async update(incidentId: string, input: import("../repositories/incident.repository.js").UpdateIncidentRecord) {
    const incident = seedManagerIncidents.find((item) => item.id === incidentId);
    if (!incident) {
      return null;
    }

    Object.assign(incident, {
      statusHistory: nextIncidentStatusHistory(incident, input),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.incidentType !== undefined ? { incidentType: input.incidentType } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.driverId !== undefined ? { driverId: input.driverId ?? undefined } : {}),
      ...(input.carId !== undefined ? { carId: input.carId ?? undefined } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt ?? null } : {}),
      ...(input.periodLabel !== undefined ? { periodLabel: input.periodLabel ?? null } : {}),
      ...(input.referenceNumber !== undefined ? { referenceNumber: input.referenceNumber ?? null } : {}),
      ...(input.amount !== undefined ? { amount: input.amount ?? null } : {}),
      ...(input.insuranceCompensationAmount !== undefined ? { insuranceCompensationAmount: input.insuranceCompensationAmount ?? null } : {}),
      ...(input.writeoffAmount !== undefined ? { writeoffAmount: input.writeoffAmount ?? null } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.insuranceNote !== undefined ? { insuranceNote: input.insuranceNote ?? null } : {}),
      ...(input.repairNote !== undefined ? { repairNote: input.repairNote ?? null } : {}),
      ...(input.locationNote !== undefined ? { locationNote: input.locationNote ?? null } : {}),
      ...(input.managerLabel !== undefined ? { managerLabel: input.managerLabel ?? null } : {}),
      ...(input.serviceStage !== undefined ? { serviceStage: input.serviceStage ?? null } : {}),
      ...(input.serviceCaseType !== undefined ? { serviceCaseType: input.serviceCaseType ?? null } : {}),
      ...(input.servicePaymentStatus !== undefined ? { servicePaymentStatus: input.servicePaymentStatus ?? null } : {}),
      ...(input.servicePayer !== undefined ? { servicePayer: input.servicePayer ?? null } : {}),
    });

    return incident;
  }
}

export class InMemoryManagerAlertRepository implements ManagerAlertRepository {
  async list() {
    return seedManagerAlerts;
  }

  async listByCompany(companyName: string) {
    const managerIds = new Set(
      seedUsers
        .filter((item) => item.role === "manager" && (item.companyName ?? null) === companyName)
        .map((item) => item.requestUserId),
    );

    return seedManagerAlerts.filter((item) => item.managerId && managerIds.has(item.managerId));
  }

  async listByManager(managerId: string) {
    return seedManagerAlerts.filter((item) => item.managerId === managerId);
  }

  async create(input: Omit<(typeof seedManagerAlerts)[number], "id">) {
    const item = {
      id: `alert_${seedManagerAlerts.length + 1}`,
      ...input,
    };
    seedManagerAlerts.unshift(item);
    return item;
  }
}

export class InMemoryQuickActionRepository implements QuickActionRepository {
  async list() {
    return seedManagerQuickActions;
  }

  async listByCompany(companyName: string) {
    const managerIds = new Set(
      seedUsers
        .filter((item) => item.role === "manager" && (item.companyName ?? null) === companyName)
        .map((item) => item.requestUserId),
    );

    return seedManagerQuickActions.filter((item) => item.managerId && managerIds.has(item.managerId));
  }

  async listByManager(managerId: string) {
    return seedManagerQuickActions.filter((item) => item.managerId === managerId);
  }

  async getById(actionId: string) {
    return seedManagerQuickActions.find((item) => item.id === actionId) ?? null;
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  async getOverview() {
    return seedSettingsOverview;
  }

  async updateOverview(input: UpdateSettingsRequest) {
    seedSettingsOverview.payoutApprovalThreshold = input.payoutApprovalThreshold;
    seedSettingsOverview.defaultInstallmentDay = input.defaultInstallmentDay;
    seedSettingsOverview.yandexSyncIntervalMinutes = input.yandexSyncIntervalMinutes;
    seedSettingsOverview.bakaiWebhookEnabled = input.bakaiWebhookEnabled;
    seedSettingsOverview.allowedStatusRequestTypes = [...input.allowedStatusRequestTypes] as any;
    seedSettingsOverview.notificationChannels = [...input.notificationChannels] as any;
    seedSettingsOverview.companies = [...input.companies];
    seedSettingsOverview.customCrmRoles = [...(input.customCrmRoles ?? [])] as any;
    seedSettingsOverview.crmRoleAccess = input.crmRoleAccess ?? {};
    return seedSettingsOverview;
  }
}

export class InMemoryUserRepository implements UserRepository {
  async listAdmin(): Promise<UserAdminListItem[]> {
    return seedUsers.map((item) => ({
      id: item.id,
      login: item.login,
      role: item.role,
      status: item.status,
      mfaEnabled: item.mfaEnabled,
      displayName: item.displayName,
      companyName: item.companyName ?? null,
      managerProfileId: item.role === "manager" ? (item.requestUserId ?? item.id) : null,
      managerLevel: item.role === "manager" ? item.managerLevel ?? ("regular" as const) : null,
      seniorManagerProfileId: item.role === "manager" ? item.seniorManagerId ?? null : null,
    }));
  }

  async listAdminByCompany(companyName: string) {
    const rows = await this.listAdmin();
    return rows.filter((item) => (item.companyName ?? null) === companyName);
  }

  async createAdmin(input: CreateAdminUserRequest) {
    const nextId = `usr_${seedUsers.length + 1}`;
    const displayName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.phone;
    const user = {
      id: nextId,
      login: input.phone,
      password: "",
      passwordHash: hashPassword(input.password),
      mustChangePassword: false,
      requestUserId: nextId,
      refreshTokenVersion: 0,
      role: input.role,
      status: "active",
      mfaEnabled: false,
      displayName,
      companyName: input.companyName ?? null,
      managerLevel: input.role === "manager" ? input.managerLevel ?? "regular" : null,
      seniorManagerId: input.role === "manager" ? input.seniorManagerId ?? null : null,
    };

    seedUsers.push(user);

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      managerProfileId: user.role === "manager" ? (user.requestUserId ?? user.id) : null,
      managerLevel: user.role === "manager" ? input.managerLevel ?? "regular" : null,
      seniorManagerProfileId: user.role === "manager" ? input.seniorManagerId ?? null : null,
    };
  }

  async updateAdmin(userId: string, input: UpdateAdminUserRequest) {
    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    if (input.role) {
      user.role = input.role;
    }
    if (input.status) {
      user.status = input.status;
    }
    if (typeof input.mfaEnabled === "boolean") {
      user.mfaEnabled = input.mfaEnabled;
    }
    if (input.companyName !== undefined) {
      user.companyName = input.companyName;
    }
    if (user.role === "manager") {
      user.managerLevel = input.managerLevel ?? user.managerLevel ?? "regular";
      user.seniorManagerId = user.managerLevel === "senior" ? null : input.seniorManagerId ?? user.seniorManagerId ?? null;
    } else {
      user.managerLevel = null;
      user.seniorManagerId = null;
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      managerProfileId: user.role === "manager" ? (user.requestUserId ?? user.id) : null,
      managerLevel: user.role === "manager" ? user.managerLevel ?? "regular" : null,
      seniorManagerProfileId: user.role === "manager" ? user.seniorManagerId ?? null : null,
    };
  }

  async getManagerProfile(requestUserId: string, companyName?: string | null) {
    const users = companyName ? await this.listAdminByCompany(companyName) : await this.listAdmin();
    return users.find((item) => (
      item.role === "manager"
      && (item.id === requestUserId || item.managerProfileId === requestUserId)
    )) ?? null;
  }

  async getManagerScopeIds(requestUserId: string, companyName?: string | null) {
    const users = companyName ? await this.listAdminByCompany(companyName) : await this.listAdmin();
    const manager = users.find((item) => (
      item.role === "manager"
      && (item.id === requestUserId || item.managerProfileId === requestUserId)
    ));
    const ids = new Set<string>([requestUserId]);
    if (!manager) {
      return ids;
    }

    ids.add(manager.id);
    if (manager.managerProfileId) {
      ids.add(manager.managerProfileId);
    }

    if (manager.managerLevel === "senior") {
      users
        .filter((item) => item.role === "manager" && item.managerLevel !== "senior")
        .forEach((item) => {
          ids.add(item.id);
          if (item.managerProfileId) {
            ids.add(item.managerProfileId);
          }
        });
    }

    return ids;
  }

  async createDriverAccount(input: import("../repositories/user.repository.js").CreateDriverAccountInput) {
    if (seedUsers.some((item) => item.login === input.phone) || seedDrivers.some((item) => item.phone === input.phone)) {
      throw new Error("DRIVER_PHONE_ALREADY_EXISTS");
    }

    const nextUserId = `usr_${seedUsers.length + 1}`;
    const nextDriverId = `drv_${seedDrivers.length + 1}`;
    const displayName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.phone;
    const passwordHash = hashPassword(input.password);

    seedUsers.push({
      id: nextUserId,
      login: input.phone,
      password: "",
      passwordHash,
      mustChangePassword: input.mustChangePassword ?? false,
      requestUserId: nextDriverId,
      refreshTokenVersion: 0,
      role: "driver",
      status: "active",
      mfaEnabled: false,
      displayName,
      companyName: input.companyName ?? null,
    });

    seedDrivers.push({
      id: nextDriverId,
      fullName: displayName,
      phone: input.phone,
      nearestRelativePhone: input.nearestRelativePhone?.trim() || null,
      licenseNumber: input.licenseNumber?.trim() || null,
      passportNumber: input.passportNumber?.trim() || null,
      companyName: input.companyName ?? null,
      weeklyDayOff: input.weeklyDayOff?.trim() || null,
      status: "active",
      riskStatus: "normal",
      managerId: input.managerId?.trim() || null,
      activeContractId: null,
      creditBalance: 0,
    });

    return {
      id: nextUserId,
      login: input.phone,
      role: "driver" as const,
      status: "active",
      mfaEnabled: false,
      displayName,
      companyName: input.companyName ?? null,
      passwordHash,
      mustChangePassword: input.mustChangePassword ?? false,
      requestUserId: nextDriverId,
      refreshTokenVersion: 0,
    };
  }

  async changePassword(userId: string, password: string) {
    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    user.password = "";
    user.passwordHash = hashPassword(password);
    user.mustChangePassword = false;
    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash ?? null,
      legacyPassword: user.password,
      mustChangePassword: user.mustChangePassword ?? false,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async resetDriverPassword(driverId: string, password: string) {
    const user = seedUsers.find((item) => item.role === "driver" && item.requestUserId === driverId);
    if (!user) {
      return null;
    }

    user.password = "";
    user.passwordHash = hashPassword(password);
    user.mustChangePassword = true;
    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash ?? null,
      legacyPassword: user.password,
      mustChangePassword: user.mustChangePassword ?? false,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async findByLogin(login: string) {
    const user = seedUsers.find((item) => item.login === login) ?? null;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash ?? null,
      legacyPassword: user.password,
      mustChangePassword: user.mustChangePassword ?? false,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async findByRequestPrincipal(requestUserId: string, role: UserRole) {
    const user = seedUsers.find((item) => item.requestUserId === requestUserId && item.role === role) ?? null;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash ?? null,
      legacyPassword: user.password,
      mustChangePassword: user.mustChangePassword ?? false,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async issueRefreshSession(userId: string) {
    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;
    return user.refreshTokenVersion;
  }

  async rotateRefreshSession(userId: string) {
    return this.issueRefreshSession(userId);
  }

  async revokeRefreshSession(userId: string) {
    return this.issueRefreshSession(userId);
  }
}
