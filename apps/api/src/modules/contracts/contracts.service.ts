import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import type { ContractDetail, ContractListItem } from "@gopark/contracts";
import {
  makeContractRepository,
  makeDriverRepository,
  makeSettingsRepository,
} from "../../common/application/repository.factory.js";
import type { ContractRepository, DriverRepository, SettingsRepository } from "../../common/repositories/index.js";
import type { CreateContractDto } from "./dto/create-contract.dto.js";
import type { UpdateContractDto } from "./dto/update-contract.dto.js";
import { FinanceWorkflowService } from "../finance-workflow/finance-workflow.service.js";
import { AuditLogService } from "../audit/audit-log.service.js";
import type { RequestUser } from "../rbac/request-user.js";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function assertReasonableContractDate(value: string | null | undefined, label: string): void {
  if (!value) {
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 2020) {
    throw new BadRequestException(`${label} должна быть в формате ГГГГ-ММ-ДД и не раньше 2020 года.`);
  }
}

@Injectable()
export class ContractsService {
  private readonly repository: ContractRepository = makeContractRepository();
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly settingsRepository: SettingsRepository = makeSettingsRepository();

  constructor(
    private readonly financeWorkflowService: FinanceWorkflowService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(): Promise<ContractListItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<ContractListItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async getById(contractId: string): Promise<ContractDetail | null> {
    if (!isUuid(contractId)) {
      return null;
    }

    return this.repository.getById(contractId);
  }

  async create(input: CreateContractDto, currentUser?: RequestUser | null): Promise<ContractListItem> {
    assertReasonableContractDate(input.startDate, "Дата начала договора");
    assertReasonableContractDate(input.endDate, "Дата окончания договора");
    await this.assertCarAmountLimit(input.carId, input.principalAmount);
    await this.assertDailyScheduleCoverage(input.driverId, input.startDate, input.endDate, input.financedAmount, input.installmentAmount);

    const contract = await this.repository.create({
      ...input,
      termMonths: this.calculateTermMonthsFromDates(input.startDate, input.endDate),
      installmentDay: await this.resolveInstallmentDay(input.installmentDay),
    });

    await this.financeWorkflowService.autoApplyDriverCreditToContract({
      driverId: contract.driverId,
      contractId: contract.id,
    });

    await this.auditLogService.write("contract.created", "contract", contract.id, {
      afterData: {
        actor: currentUser ? serializeAuditActor(currentUser) : null,
        contract,
      },
    });

    return contract;
  }

  async update(contractId: string, input: UpdateContractDto, currentUser?: RequestUser | null): Promise<ContractDetail | null> {
    if (!isUuid(contractId)) {
      return null;
    }

    const current = await this.repository.getById(contractId);
    if (!current) {
      return null;
    }

    const nextStartDate = input.startDate ?? current.startDate ?? "";
    const nextEndDate = input.endDate ?? current.endDate ?? current.startDate ?? "";
    assertReasonableContractDate(nextStartDate, "Дата начала договора");
    assertReasonableContractDate(nextEndDate, "Дата окончания договора");
    const nextFinancedAmount = input.financedAmount ?? current.financedAmount;
    const nextInstallmentAmount = input.installmentAmount ?? current.installmentAmount;

    const nextInstallmentDay =
      input.installmentDay !== undefined
        ? this.validateInstallmentDay(input.installmentDay, "installmentDay")
        : this.deriveInstallmentDayFromDate(nextEndDate, current.installmentDay);
    const nextTermMonths =
      input.termMonths !== undefined
        ? input.termMonths
        : this.calculateTermMonthsFromDates(nextStartDate, nextEndDate);

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
        nextFinancedAmount !== current.financedAmount
        || nextInstallmentAmount !== current.installmentAmount
        || (input.installmentDay !== undefined && nextInstallmentDay !== current.installmentDay)
        || nextTermMonths !== current.termMonths
        || nextStartDate !== (current.startDate ?? "")
        || nextEndDate !== (current.endDate ?? current.startDate ?? "")
      );

    if (
      scheduleChanged
      && current.schedule.some((item) => item.paidAmount > 0 || item.deferredUntil || item.deferredByStatusRequestId)
    ) {
      throw new BadRequestException(
        "Нельзя перестроить график договора после оплат или подтверждённых переносов.",
      );
    }

    if (scheduleChanged) {
      await this.assertDailyScheduleCoverage(
        current.driverId,
        nextStartDate,
        nextEndDate,
        nextFinancedAmount,
        nextInstallmentAmount,
      );
    }

    const updated = await this.repository.update(
      contractId,
      hasScheduleInput
        ? {
            ...input,
            installmentDay: nextInstallmentDay,
            termMonths: nextTermMonths,
          }
        : input,
    );

    if (updated) {
      await this.auditLogService.write(input.status ? `contract.status.${input.status}` : "contract.updated", "contract", contractId, {
        beforeData: { contract: current },
        afterData: {
          actor: currentUser ? serializeAuditActor(currentUser) : null,
          changes: input as Record<string, unknown>,
          contract: updated,
        },
      });
    }

    return updated;
  }

  private async assertCarAmountLimit(carId: string, principalAmount: number): Promise<void> {
    const maxIssuedAmount = await this.repository.getMaxIssuedAmountByCar(carId);

    if (maxIssuedAmount > 0 && principalAmount > maxIssuedAmount) {
      throw new BadRequestException(
        `Сумма по этому авто не может быть выше предыдущей выдачи: максимум ${maxIssuedAmount}.`,
      );
    }
  }

  private async resolveInstallmentDay(installmentDay?: number): Promise<number> {
    if (installmentDay !== undefined) {
      return this.validateInstallmentDay(installmentDay, "installmentDay");
    }

    const settings = await this.settingsRepository.getOverview();
    return this.validateInstallmentDay(settings.defaultInstallmentDay, "settings.defaultInstallmentDay");
  }

  private deriveInstallmentDayFromDate(endDate: string, fallback: number): number {
    const parsed = new Date(`${endDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return fallback;
    }

    return parsed.getUTCDate() || fallback;
  }

  private calculateTermMonthsFromDates(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const diffMs = end.getTime() - start.getTime();

    if (Number.isNaN(diffMs) || diffMs < 0) {
      throw new BadRequestException("Дата выплаты должна быть не раньше даты взятия авто.");
    }

    const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
    return Math.max(1, Math.ceil(diffDays / 30));
  }

  private resolveWeeklyDayOffIndex(weeklyDayOff?: string | null): number | null {
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

  private async assertDailyScheduleCoverage(
    driverId: string,
    startDate: string,
    endDate: string,
    financedAmount: number,
    installmentAmount: number,
  ): Promise<void> {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      throw new BadRequestException("Водитель для договора не найден.");
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
      throw new BadRequestException("Дата выплаты должна быть не раньше даты взятия авто.");
    }

    const weeklyDayOffIndex = this.resolveWeeklyDayOffIndex(driver.weeklyDayOff);
    let payableDays = 0;
    for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (weeklyDayOffIndex !== null && cursor.getUTCDay() === weeklyDayOffIndex) {
        continue;
      }
      payableDays += 1;
    }

    if (payableDays <= 0) {
      throw new BadRequestException("На выбранный период не остаётся ни одного рабочего дня для начислений.");
    }

  }

  private validateInstallmentDay(value: number, source: string): number {
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      if (source === "installmentDay") {
        throw new BadRequestException("installmentDay must be an integer between 1 and 31");
      }

      throw new InternalServerErrorException(`${source} must be an integer between 1 and 31`);
    }

    return value;
  }
}

function serializeAuditActor(currentUser: RequestUser): Record<string, unknown> {
  return {
    id: currentUser.id,
    role: currentUser.role,
    companyName: currentUser.companyName ?? null,
    managerLevel: currentUser.managerLevel ?? null,
    customRoleKey: currentUser.customRoleKey ?? null,
  };
}
