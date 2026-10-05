import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { DriverDayEventItem, DriverDetail, DriverListItem, DriverRiskStatusChangeItem } from "@gopark/contracts";
import { makeDriverRepository, makeUserRepository } from "../../common/application/repository.factory.js";
import type { DriverRepository, UserRepository } from "../../common/repositories/index.js";
import type { CreateDriverDto } from "./dto/create-driver.dto.js";
import type { UpdateDriverDto } from "./dto/update-driver.dto.js";
import type { UpdateDriverManagerDto } from "./dto/update-driver-manager.dto.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { decimalToNumber } from "../../infrastructure/prisma/prisma.utils.js";
import { AuditLogService } from "../audit/audit-log.service.js";
import type { RequestUser } from "../rbac/request-user.js";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class DriversService {
  private readonly repository: DriverRepository = makeDriverRepository();
  private readonly userRepository: UserRepository = makeUserRepository();
  private readonly prismaService = new PrismaService();

  constructor(private readonly auditLogService: AuditLogService) {}

  async list(): Promise<DriverListItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<DriverListItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async getById(driverId: string): Promise<DriverDetail | null> {
    if (!isUuid(driverId)) {
      return null;
    }

    return this.repository.getById(driverId);
  }

  async listRiskStatusChanges(): Promise<DriverRiskStatusChangeItem[]> {
    return this.repository.listRiskStatusChanges();
  }

  async create(input: CreateDriverDto, currentUser?: RequestUser | null): Promise<DriverListItem> {
    try {
      const user = await this.userRepository.createDriverAccount({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone.trim(),
        password: "123456",
        nearestRelativePhone: input.nearestRelativePhone?.trim() || null,
        companyName: input.companyName?.trim() || null,
        managerId: input.managerId?.trim() || null,
        licenseNumber: input.licenseNumber?.trim() || null,
        passportNumber: input.passportNumber?.trim() || null,
        weeklyDayOff: input.weeklyDayOff?.trim() || null,
        mustChangePassword: true,
      });

      const driver = await this.repository.getById(user.requestUserId);
      if (!driver) {
        throw new Error("DRIVER_ACCOUNT_CREATED_WITHOUT_DRIVER");
      }

      await this.auditLogService.write("driver.created", "driver", driver.id, {
        afterData: {
          actor: currentUser ? this.serializeActor(currentUser) : null,
          driver: this.pickDriverAuditData(driver),
        },
      });

      return driver;
    } catch (error) {
      if (error instanceof Error && error.message === "DRIVER_PHONE_ALREADY_EXISTS") {
        throw new ConflictException("Driver phone is already registered");
      }

      throw error;
    }
  }

  async update(driverId: string, input: UpdateDriverDto, currentUser?: RequestUser | null): Promise<DriverListItem | null> {
    if (!isUuid(driverId)) {
      return null;
    }

    const before = await this.repository.getById(driverId);
    let updated: DriverListItem | null;
    try {
      updated = await this.repository.update(driverId, input);
    } catch (error) {
      if (error instanceof Error && error.message === "DRIVER_PHONE_ALREADY_EXISTS") {
        throw new ConflictException("Driver phone is already registered");
      }
      throw error;
    }
    if (updated) {
      await this.auditLogService.write("driver.updated", "driver", driverId, {
        beforeData: { driver: before ? this.pickDriverAuditData(before) : null },
        afterData: {
          actor: currentUser ? this.serializeActor(currentUser) : null,
          changes: input as Record<string, unknown>,
          driver: this.pickDriverAuditData(updated),
        },
      });
    }

    return updated;
  }

  async updateManager(driverId: string, input: UpdateDriverManagerDto, currentUser?: RequestUser | null): Promise<DriverListItem | null> {
    if (!isUuid(driverId)) {
      return null;
    }

    const managerId = input.managerId?.trim() || null;
    if (managerId && !isUuid(managerId)) {
      return null;
    }

    const before = await this.repository.getById(driverId);
    const updated = await this.repository.updateManager(driverId, managerId);
    if (updated) {
      await this.auditLogService.write("driver.manager_changed", "driver", driverId, {
        beforeData: { managerId: before?.managerId ?? null },
        afterData: {
          actor: currentUser ? this.serializeActor(currentUser) : null,
          managerId: updated.managerId ?? null,
          driver: this.pickDriverAuditData(updated),
        },
      });
    }

    return updated;
  }

  async resetPassword(driverId: string, currentUser?: RequestUser | null): Promise<{ temporaryPassword: string } | null> {
    if (!isUuid(driverId)) {
      return null;
    }

    const temporaryPassword = "123456";
    const user = await this.userRepository.resetDriverPassword(driverId, temporaryPassword);
    if (user) {
      await this.auditLogService.write("driver.password.reset", "driver", driverId, {
        afterData: {
          actor: currentUser ? this.serializeActor(currentUser) : null,
          temporaryPasswordSet: true,
          mustChangePassword: true,
        },
      });
    }
    return user ? { temporaryPassword } : null;
  }

  async reviewPhoto(
    driverId: string,
    action: string | undefined,
    note: string | undefined,
    reviewedByUserId: string | null,
  ): Promise<DriverDetail | null> {
    if (!isUuid(driverId)) {
      return null;
    }
    const normalizedAction = action?.trim();
    if (normalizedAction !== "approve" && normalizedAction !== "reject") {
      throw new BadRequestException("Unsupported photo review action");
    }
    const prisma = this.prismaService.client;
    if (prisma) {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          photoStatus: normalizedAction === "approve" ? "approved" : "rejected",
          photoReviewedAt: new Date(),
          photoReviewedByUserId: reviewedByUserId,
          photoReviewNote: normalizedAction === "reject" ? note?.trim() || "Фото отклонено" : null,
        },
      });
    }
    await this.auditLogService.write(`driver.photo.${normalizedAction === "approve" ? "approved" : "rejected"}`, "driver", driverId, {
      afterData: {
        actorUserId: reviewedByUserId,
        action: normalizedAction,
        note: normalizedAction === "reject" ? note?.trim() || "Фото отклонено" : null,
      },
    });
    return this.getById(driverId);
  }

  async getDayEvents(driverId: string, date: string): Promise<DriverDayEventItem[]> {
    if (!isUuid(driverId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return [];
    }
    const prisma = this.prismaService.client;
    if (!prisma) {
      return [];
    }
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const inDay = { gte: start, lt: end };
    const [payments, obligations, incidents, riskChanges, contracts, assignments] = await Promise.all([
      prisma.payment.findMany({ where: { driverId, OR: [{ createdAt: inDay }, { paymentForDate: inDay }] }, orderBy: { createdAt: "asc" } }),
      prisma.obligation.findMany({
        where: { driverId, dueDate: inDay, contract: { status: "active" } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.incident.findMany({ where: { driverId, OR: [{ createdAt: inDay }, { occurredAt: inDay }] }, orderBy: { createdAt: "asc" } }),
      prisma.driverRiskStatusChange.findMany({ where: { driverId, changedAt: inDay }, orderBy: { changedAt: "asc" } }),
      prisma.contract.findMany({ where: { driverId, OR: [{ createdAt: inDay }, { startDate: inDay }, { endDate: inDay }] }, orderBy: { createdAt: "asc" } }),
      prisma.carAssignment.findMany({
        where: { driverId, OR: [{ startedAt: inDay }, { endedAt: inDay }] },
        orderBy: { startedAt: "asc" },
        include: { car: { select: { plateNumber: true, make: true, model: true } } },
      }),
    ]);

    const events: DriverDayEventItem[] = [];
    for (const item of payments) {
      events.push({ id: item.id, type: "payment", title: "Платёж", details: `${decimalToNumber(item.amount)} сом · ${item.status}`, createdAt: (item.paymentForDate ?? item.createdAt).toISOString() });
    }
    for (const item of obligations) {
      events.push({ id: item.id, type: "obligation", title: "Начисление", details: `${decimalToNumber(item.amount)} сом · оплачено ${decimalToNumber(item.paidAmount)} сом`, createdAt: item.dueDate.toISOString() });
    }
    for (const item of incidents) {
      events.push({ id: item.id, type: "incident", title: item.title, details: `${item.incidentType ?? "incident"} · ${item.status}${item.description ? ` · ${item.description}` : ""}`, createdAt: (item.occurredAt ?? item.createdAt).toISOString() });
    }
    for (const item of riskChanges) {
      events.push({ id: item.id, type: "risk_status", title: "Риск-статус", details: `${item.previousStatus ?? "не указан"} -> ${item.nextStatus}${item.note ? ` · ${item.note}` : ""}`, createdAt: item.changedAt.toISOString() });
    }
    for (const item of contracts) {
      events.push({ id: item.id, type: "contract", title: "Договор", details: `${item.contractNumber} · ${item.status} · ${decimalToNumber(item.financedAmount)} сом`, createdAt: item.createdAt.toISOString() });
    }
    for (const item of assignments) {
      events.push({ id: item.id, type: "car_assignment", title: item.endedAt ? "Возврат авто" : "Выдача авто", details: `${item.car.plateNumber} · ${[item.car.make, item.car.model].filter(Boolean).join(" ")}`, createdAt: (item.endedAt ?? item.startedAt).toISOString() });
    }
    return events.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private serializeActor(currentUser: RequestUser): Record<string, unknown> {
    return {
      id: currentUser.id,
      role: currentUser.role,
      companyName: currentUser.companyName ?? null,
      managerLevel: currentUser.managerLevel ?? null,
      customRoleKey: currentUser.customRoleKey ?? null,
    };
  }

  private pickDriverAuditData(driver: DriverListItem | DriverDetail): Record<string, unknown> {
    return {
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      status: driver.status,
      companyName: driver.companyName,
      managerId: driver.managerId,
    };
  }
}
