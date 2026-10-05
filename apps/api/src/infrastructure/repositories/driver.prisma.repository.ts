import type { DriverDetail, DriverListItem, DriverRiskStatusChangeItem, ManagerRiskStatusReviewItem } from "@gopark/contracts";
import type { CreateDriverDto } from "../../modules/drivers/dto/create-driver.dto.js";
import type { UpdateDriverDto } from "../../modules/drivers/dto/update-driver.dto.js";
import type { DriverRepository } from "../../common/repositories/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedCars, seedDriverCreditBalances, seedDrivers, seedObligations } from "../../data/seed.js";
import { decimalToNumber, joinName } from "../prisma/prisma.utils.js";

const DRIVER_RISK_STATUSES = new Set(["normal", "medium", "risk"]);

function normalizeRiskStatus(value: string | null | undefined): "normal" | "medium" | "risk" {
  return DRIVER_RISK_STATUSES.has(value ?? "") ? (value as "normal" | "medium" | "risk") : "normal";
}

export class DriverPrismaRepository implements DriverRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<DriverListItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<DriverListItem[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<DriverListItem[]> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return seedDrivers.filter((item) => !companyName || (item.companyName ?? null) === companyName);
    }

    const drivers = await prisma.driver.findMany({
      where: companyName ? { companyName } : undefined,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        nearestRelativePhone: true,
        licenseNumber: true,
        passportNumber: true,
        companyName: true,
        weeklyDayOff: true,
        status: true,
        riskStatus: true,
        photoUrl: true,
        photoStatus: true,
        photoUploadedAt: true,
        photoReviewedAt: true,
        photoReviewNote: true,
        managerId: true,
        contracts: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, status: true },
        },
        creditBalance: {
          select: { amount: true },
        },
      },
    });

    return drivers.map((driver: any) => {
      const activeContract = driver.contracts.find((item: any) => item.status === "active") ?? null;
      const latestContract = driver.contracts[0] ?? null;
      const effectiveStatus = driver.status === "active" && !activeContract && latestContract?.status === "terminated"
        ? "terminated"
        : driver.status;
      return {
      id: driver.id,
      fullName: joinName(driver.firstName, driver.lastName),
      phone: driver.phone,
      nearestRelativePhone: driver.nearestRelativePhone,
      licenseNumber: driver.licenseNumber,
      passportNumber: driver.passportNumber,
      companyName: driver.companyName,
      weeklyDayOff: driver.weeklyDayOff,
      status: effectiveStatus,
      riskStatus: driver.riskStatus ?? "normal",
      managerId: driver.managerId,
      activeContractId: activeContract?.id ?? null,
      creditBalance: decimalToNumber(driver.creditBalance?.amount ?? 0),
      photoUrl: driver.photoUrl ?? null,
      photoStatus: driver.photoStatus ?? "missing",
      photoUploadedAt: driver.photoUploadedAt?.toISOString() ?? null,
      photoReviewedAt: driver.photoReviewedAt?.toISOString() ?? null,
      photoReviewNote: driver.photoReviewNote ?? null,
      };
    });
  }

  async getById(driverId: string): Promise<DriverDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          nearestRelativePhone: true,
          licenseNumber: true,
          passportNumber: true,
          companyName: true,
          weeklyDayOff: true,
          status: true,
          riskStatus: true,
          photoUrl: true,
          photoStatus: true,
          photoUploadedAt: true,
          photoReviewedAt: true,
          photoReviewNote: true,
          managerId: true,
          assignments: {
            where: { endedAt: null },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { carId: true },
          },
          contracts: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              status: true,
              obligations: {
                select: {
                  amount: true,
                  paidAmount: true,
                },
              },
            },
          },
          creditBalance: {
            select: { amount: true },
          },
        },
      });

      if (!driver) {
        return null;
      }

      const activeContract = driver.contracts.find((item: any) => item.status === "active") ?? null;
      const latestContract = driver.contracts[0] ?? null;
      const effectiveStatus = driver.status === "active" && !activeContract && latestContract?.status === "terminated"
        ? "terminated"
        : driver.status;
      const obligations = activeContract?.obligations ?? [];

      return {
        id: driver.id,
        fullName: joinName(driver.firstName, driver.lastName),
        phone: driver.phone,
        nearestRelativePhone: driver.nearestRelativePhone,
        licenseNumber: driver.licenseNumber,
        passportNumber: driver.passportNumber,
        companyName: driver.companyName,
        weeklyDayOff: driver.weeklyDayOff,
        status: effectiveStatus,
        riskStatus: driver.riskStatus ?? "normal",
        managerId: driver.managerId,
        activeContractId: activeContract?.id ?? null,
        creditBalance: decimalToNumber(driver.creditBalance?.amount ?? 0),
        photoUrl: driver.photoUrl ?? null,
        photoStatus: driver.photoStatus ?? "missing",
        photoUploadedAt: driver.photoUploadedAt?.toISOString() ?? null,
        photoReviewedAt: driver.photoReviewedAt?.toISOString() ?? null,
        photoReviewNote: driver.photoReviewNote ?? null,
        assignedCarId: driver.assignments[0]?.carId ?? null,
        currentDebt: obligations.reduce(
          (sum: number, item: any) => sum + (decimalToNumber(item.amount) - decimalToNumber(item.paidAmount)),
          0,
        ),
        totalObligations: obligations.reduce((sum: number, item: any) => sum + decimalToNumber(item.amount), 0),
        totalPaid: obligations.reduce((sum: number, item: any) => sum + decimalToNumber(item.paidAmount), 0),
      };
    }

    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    const assignedCar = seedCars.find((item) => item.assignedDriverId === driver.id);
    const obligations = seedObligations.filter((item) => item.driverId === driver.id);

    return {
      ...driver,
      assignedCarId: assignedCar?.id ?? null,
      currentDebt: obligations.reduce((sum, item) => sum + (item.amount - item.paidAmount), 0),
      totalObligations: obligations.reduce((sum, item) => sum + item.amount, 0),
      totalPaid: obligations.reduce((sum, item) => sum + item.paidAmount, 0),
    };
  }

  async create(input: CreateDriverDto): Promise<DriverListItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const driver = await prisma.driver.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          nearestRelativePhone: input.nearestRelativePhone?.trim() || null,
          licenseNumber: input.licenseNumber?.trim() || null,
          passportNumber: input.passportNumber?.trim() || null,
          companyName: input.companyName?.trim() || null,
          weeklyDayOff: input.weeklyDayOff?.trim() || null,
          managerId: input.managerId ?? null,
          status: "active",
          riskStatus: "normal",
        },
      });

      return {
        id: driver.id,
        fullName: joinName(driver.firstName, driver.lastName),
        phone: driver.phone,
        nearestRelativePhone: driver.nearestRelativePhone,
        licenseNumber: driver.licenseNumber,
        passportNumber: driver.passportNumber,
        companyName: driver.companyName,
        weeklyDayOff: driver.weeklyDayOff,
        status: driver.status,
        riskStatus: driver.riskStatus ?? "normal",
        managerId: driver.managerId,
        activeContractId: null,
        creditBalance: 0,
        photoUrl: null,
        photoStatus: "missing",
        photoUploadedAt: null,
        photoReviewedAt: null,
        photoReviewNote: null,
      };
    }

    return {
      id: crypto.randomUUID(),
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
      photoUrl: null,
      photoStatus: "missing",
      photoUploadedAt: null,
      photoReviewedAt: null,
      photoReviewNote: null,
    };
  }

  async update(driverId: string, input: UpdateDriverDto): Promise<DriverListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const current = await prisma.driver.findUnique({
        where: { id: driverId },
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          nearestRelativePhone: true,
          licenseNumber: true,
          passportNumber: true,
          companyName: true,
          weeklyDayOff: true,
          status: true,
          riskStatus: true,
          userId: true,
        },
      });

      if (!current) {
        return null;
      }

      const nextPhone = input.phone?.trim() || current.phone;
      const driver = await prisma.$transaction(async (tx: any) => {
        if (nextPhone !== current.phone) {
          const [existingDriver, existingUser] = await Promise.all([
            tx.driver.findFirst({
              where: { phone: nextPhone, id: { not: driverId } },
              select: { id: true },
            }),
            tx.user.findFirst({
              where: {
                phone: nextPhone,
                ...(current.userId ? { id: { not: current.userId } } : {}),
                status: { not: "blocked" },
              },
              select: { id: true },
            }),
          ]);
          if (existingDriver || existingUser) {
            throw new Error("DRIVER_PHONE_ALREADY_EXISTS");
          }
          if (current.userId) {
            await tx.user.update({
              where: { id: current.userId },
              data: { phone: nextPhone },
            });
          }
        }

        return tx.driver.update({
          where: { id: driverId },
          data: {
            firstName: input.firstName?.trim() || current.firstName,
            lastName: input.lastName?.trim() || current.lastName,
            phone: nextPhone,
            nearestRelativePhone: input.nearestRelativePhone !== undefined ? input.nearestRelativePhone?.trim() || null : current.nearestRelativePhone,
            licenseNumber: input.licenseNumber !== undefined ? input.licenseNumber?.trim() || null : current.licenseNumber,
            passportNumber: input.passportNumber !== undefined ? input.passportNumber?.trim() || null : current.passportNumber,
            companyName: input.companyName !== undefined ? input.companyName?.trim() || null : current.companyName,
            weeklyDayOff: input.weeklyDayOff !== undefined ? input.weeklyDayOff?.trim() || null : current.weeklyDayOff,
            status: input.status?.trim() || current.status,
            riskStatus: input.riskStatus ? normalizeRiskStatus(input.riskStatus) : current.riskStatus,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            nearestRelativePhone: true,
            licenseNumber: true,
            passportNumber: true,
            companyName: true,
            weeklyDayOff: true,
            status: true,
            riskStatus: true,
            photoUrl: true,
            photoStatus: true,
            photoUploadedAt: true,
            photoReviewedAt: true,
            photoReviewNote: true,
            managerId: true,
            contracts: {
              where: { status: "active" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true },
            },
            creditBalance: {
              select: { amount: true },
            },
          },
        });
      });

      return {
        id: driver.id,
        fullName: joinName(driver.firstName, driver.lastName),
        phone: driver.phone,
        nearestRelativePhone: driver.nearestRelativePhone,
        licenseNumber: driver.licenseNumber,
        passportNumber: driver.passportNumber,
        companyName: driver.companyName,
        weeklyDayOff: driver.weeklyDayOff,
        status: driver.status,
        riskStatus: driver.riskStatus ?? "normal",
        managerId: driver.managerId,
        activeContractId: driver.contracts[0]?.id ?? null,
        creditBalance: decimalToNumber(driver.creditBalance?.amount ?? 0),
        photoUrl: driver.photoUrl ?? null,
        photoStatus: driver.photoStatus ?? "missing",
        photoUploadedAt: driver.photoUploadedAt?.toISOString() ?? null,
        photoReviewedAt: driver.photoReviewedAt?.toISOString() ?? null,
        photoReviewNote: driver.photoReviewNote ?? null,
      };
    }

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
      driver.riskStatus = normalizeRiskStatus(input.riskStatus);
    }

    return {
      ...driver,
      creditBalance: seedDriverCreditBalances[driver.id] ?? driver.creditBalance ?? 0,
    };
  }

  async updateManager(driverId: string, managerId: string | null): Promise<DriverListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const driver = await prisma.driver.update({
        where: { id: driverId },
        data: {
          managerId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          nearestRelativePhone: true,
          licenseNumber: true,
          passportNumber: true,
          companyName: true,
          weeklyDayOff: true,
          status: true,
          riskStatus: true,
          managerId: true,
          contracts: {
            where: { status: "active" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true },
          },
          creditBalance: {
            select: { amount: true },
          },
        },
      });

      return {
        id: driver.id,
        fullName: joinName(driver.firstName, driver.lastName),
        phone: driver.phone,
        nearestRelativePhone: driver.nearestRelativePhone,
        licenseNumber: driver.licenseNumber,
        passportNumber: driver.passportNumber,
        companyName: driver.companyName,
        weeklyDayOff: driver.weeklyDayOff,
        status: driver.status,
        riskStatus: driver.riskStatus ?? "normal",
        managerId: driver.managerId,
        activeContractId: driver.contracts[0]?.id ?? null,
        creditBalance: decimalToNumber(driver.creditBalance?.amount ?? 0),
      };
    }

    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    driver.managerId = managerId;
    return driver;
  }

  async updateRiskStatus(
    driverId: string,
    riskStatus: string,
    changedByUserId?: string | null,
    note?: string | null,
  ): Promise<DriverListItem | null> {
    const nextRiskStatus = normalizeRiskStatus(riskStatus);
    const prisma = this.prisma.client;
    if (prisma) {
      const driver = await prisma.$transaction(async (tx: any) => {
        const current = await tx.driver.findUnique({
          where: { id: driverId },
          select: { riskStatus: true },
        });
        if (!current) {
          return null;
        }

        const updated = await tx.driver.update({
          where: { id: driverId },
          data: { riskStatus: nextRiskStatus },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            nearestRelativePhone: true,
            licenseNumber: true,
            passportNumber: true,
            companyName: true,
            weeklyDayOff: true,
            status: true,
            riskStatus: true,
            managerId: true,
            contracts: {
              where: { status: "active" },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true },
            },
            creditBalance: {
              select: { amount: true },
            },
          },
        });

        if (current.riskStatus !== nextRiskStatus) {
          await tx.driverRiskStatusChange.create({
            data: {
              driverId,
              previousStatus: current.riskStatus,
              nextStatus: nextRiskStatus,
              changedByUserId: changedByUserId || null,
              note: note?.trim() || null,
            },
          });
        }

        return updated;
      });

      if (!driver) {
        return null;
      }

      return {
        id: driver.id,
        fullName: joinName(driver.firstName, driver.lastName),
        phone: driver.phone,
        nearestRelativePhone: driver.nearestRelativePhone,
        licenseNumber: driver.licenseNumber,
        passportNumber: driver.passportNumber,
        companyName: driver.companyName,
        weeklyDayOff: driver.weeklyDayOff,
        status: driver.status,
        riskStatus: driver.riskStatus ?? "normal",
        managerId: driver.managerId,
        activeContractId: driver.contracts[0]?.id ?? null,
        creditBalance: decimalToNumber(driver.creditBalance?.amount ?? 0),
      };
    }

    const driver = seedDrivers.find((item) => item.id === driverId);
    if (!driver) {
      return null;
    }

    driver.riskStatus = nextRiskStatus;
    return {
      ...driver,
      creditBalance: seedDriverCreditBalances[driver.id] ?? driver.creditBalance ?? 0,
    };
  }

  async listRiskStatusChanges(limit = 100): Promise<DriverRiskStatusChangeItem[]> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return [];
    }

    const rows = await prisma.driverRiskStatusChange.findMany({
      orderBy: { changedAt: "desc" },
      take: Math.max(1, Math.min(limit, 500)),
      select: {
        id: true,
        driverId: true,
        previousStatus: true,
        nextStatus: true,
        changedByUserId: true,
        changedAt: true,
        note: true,
        driver: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return rows.map((item: any) => ({
      id: item.id,
      driverId: item.driverId,
      driverName: joinName(item.driver.firstName, item.driver.lastName),
      previousStatus: item.previousStatus ?? null,
      nextStatus: item.nextStatus,
      changedByUserId: item.changedByUserId ?? null,
      changedAt: item.changedAt.toISOString(),
      note: item.note ?? null,
    }));
  }

  async createRiskStatusReview(
    driverId: string,
    requestedByManagerId: string,
    requestedStatus: string,
    note?: string | null,
  ): Promise<ManagerRiskStatusReviewItem | null> {
    const nextRiskStatus = normalizeRiskStatus(requestedStatus);
    const prisma = this.prisma.client;
    if (!prisma) {
      const driver = seedDrivers.find((item) => item.id === driverId);
      if (!driver) {
        return null;
      }

      return {
        id: crypto.randomUUID(),
        driverId,
        driverName: driver.fullName,
        requestedByManagerId,
        requestedByManagerName: "Бригадир",
        previousStatus: driver.riskStatus ?? "normal",
        requestedStatus: nextRiskStatus,
        reviewStatus: "pending",
        note: note?.trim() || null,
        createdAt: new Date().toISOString(),
        reviewedAt: null,
      };
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { riskStatus: true },
    });
    if (!driver) {
      return null;
    }

    const row = await prisma.driverRiskStatusReview.create({
      data: {
        driverId,
        requestedByManagerId,
        previousStatus: driver.riskStatus ?? "normal",
        requestedStatus: nextRiskStatus,
        note: note?.trim() || null,
      },
      include: this.riskStatusReviewInclude(),
    });

    return this.mapRiskStatusReview(row);
  }

  async listRiskStatusReviews(managerIds: string[], limit = 100): Promise<ManagerRiskStatusReviewItem[]> {
    const prisma = this.prisma.client;
    if (!prisma || !managerIds.length) {
      return [];
    }

    const rows = await prisma.driverRiskStatusReview.findMany({
      where: { requestedByManagerId: { in: managerIds } },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(limit, 500)),
      include: this.riskStatusReviewInclude(),
    });

    return rows.map((item: any) => this.mapRiskStatusReview(item));
  }

  async reviewRiskStatusRequest(
    requestId: string,
    reviewedByManagerId: string,
    action: "approve" | "reject",
  ): Promise<ManagerRiskStatusReviewItem | null> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return null;
    }

    const row = await prisma.$transaction(async (tx: any) => {
      const current = await tx.driverRiskStatusReview.findUnique({
        where: { id: requestId },
        include: this.riskStatusReviewInclude(),
      });
      if (!current || current.reviewStatus !== "pending") {
        return current;
      }

      if (action === "approve") {
        await tx.driver.update({
          where: { id: current.driverId },
          data: { riskStatus: current.requestedStatus },
        });
        await tx.driverRiskStatusChange.create({
          data: {
            driverId: current.driverId,
            previousStatus: current.previousStatus,
            nextStatus: current.requestedStatus,
            changedByUserId: null,
            note: `Подтверждено старшим бригадиром ${reviewedByManagerId}`,
          },
        });
      }

      return tx.driverRiskStatusReview.update({
        where: { id: requestId },
        data: {
          reviewStatus: action === "approve" ? "approved" : "rejected",
          reviewedByManagerId,
          reviewedAt: new Date(),
        },
        include: this.riskStatusReviewInclude(),
      });
    });

    return row ? this.mapRiskStatusReview(row) : null;
  }

  private riskStatusReviewInclude() {
    return {
      driver: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      requestedByManager: {
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    };
  }

  private mapRiskStatusReview(item: any): ManagerRiskStatusReviewItem {
    return {
      id: item.id,
      driverId: item.driverId,
      driverName: joinName(item.driver.firstName, item.driver.lastName),
      requestedByManagerId: item.requestedByManagerId,
      requestedByManagerName: item.requestedByManager?.user
        ? joinName(item.requestedByManager.user.firstName, item.requestedByManager.user.lastName)
        : "Бригадир",
      previousStatus: item.previousStatus,
      requestedStatus: item.requestedStatus,
      reviewStatus: item.reviewStatus,
      note: item.note ?? null,
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
    };
  }
}
