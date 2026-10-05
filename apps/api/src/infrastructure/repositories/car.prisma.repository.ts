import type { VehicleDetail, VehicleListItem } from "@gopark/contracts";
import type { CreateCarDto } from "../../modules/cars/dto/create-car.dto.js";
import type { UpdateCarDto } from "../../modules/cars/dto/update-car.dto.js";
import type { CarRepository } from "../../common/repositories/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { seedCars, seedContracts } from "../../data/seed.js";
import { decimalToNumber, joinName } from "../prisma/prisma.utils.js";

function getTotalAcquisitionCost(car: {
  purchasePrice?: number | null;
  customsCost?: number | null;
  deliveryCost?: number | null;
  repairCost?: number | null;
}): number {
  return (car.purchasePrice ?? 0) + (car.customsCost ?? 0) + (car.deliveryCost ?? 0) + (car.repairCost ?? 0);
}

function toDateOnly(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString().slice(0, 10);
}

function toOptionalDate(value?: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function readInstallmentAmount(metadata: unknown, fallbackAmount: number): number {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};

  return typeof value.installmentAmount === "number" ? value.installmentAmount : fallbackAmount;
}

function getOpenObligationAmount(type: string, metadata: unknown, amount: number, paidAmount: number): number {
  if (type !== "installment") {
    return Math.max(0, amount - paidAmount);
  }

  const installmentAmount = readInstallmentAmount(metadata, amount);
  const paidTowardInstallment = Math.min(Math.max(0, paidAmount), installmentAmount);
  return Math.max(0, installmentAmount - paidTowardInstallment);
}

function mapVehicleDocumentFields(car: {
  osagoStartDate?: Date | string | null;
  osagoEndDate?: Date | string | null;
  cascoStartDate?: Date | string | null;
  cascoEndDate?: Date | string | null;
  technicalInspectionStartDate?: Date | string | null;
  technicalInspectionEndDate?: Date | string | null;
  engineOilReplacementKm?: number | null;
  gearboxOilReplacementKm?: number | null;
}) {
  return {
    osagoStartDate: toDateOnly(car.osagoStartDate),
    osagoEndDate: toDateOnly(car.osagoEndDate),
    cascoStartDate: toDateOnly(car.cascoStartDate),
    cascoEndDate: toDateOnly(car.cascoEndDate),
    technicalInspectionStartDate: toDateOnly(car.technicalInspectionStartDate),
    technicalInspectionEndDate: toDateOnly(car.technicalInspectionEndDate),
    engineOilReplacementKm: car.engineOilReplacementKm ?? null,
    gearboxOilReplacementKm: car.gearboxOilReplacementKm ?? null,
  };
}

function mapCarManager(car: {
  managerId?: string | null;
  manager?: { user?: { firstName: string; lastName: string } | null } | null;
}) {
  return {
    managerId: car.managerId ?? null,
    managerName: car.manager?.user ? joinName(car.manager.user.firstName, car.manager.user.lastName) : null,
  };
}

export class CarPrismaRepository implements CarRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<VehicleListItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<VehicleListItem[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<VehicleListItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const cars = await prisma.car.findMany({
        where: companyName ? { companyName } : undefined,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          plateNumber: true,
          vin: true,
          make: true,
          model: true,
          companyName: true,
          productionYear: true,
          mileage: true,
          osagoStartDate: true,
          osagoEndDate: true,
          cascoStartDate: true,
          cascoEndDate: true,
          technicalInspectionStartDate: true,
          technicalInspectionEndDate: true,
          engineOilReplacementKm: true,
          gearboxOilReplacementKm: true,
          color: true,
          purchasePrice: true,
          customsCost: true,
          deliveryCost: true,
          repairCost: true,
          targetSalePrice: true,
          managerId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          assignments: {
            orderBy: { startedAt: "desc" },
            select: { driverId: true, startedAt: true, endedAt: true },
          },
          manager: {
            select: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          contracts: {
            where: { status: "active" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
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
          },
        },
      });

      return cars.map((car: any) => {
        const contract = car.contracts[0] ?? null;
        const openObligations = (contract?.obligations ?? [])
          .map((obligation: any) => {
            const amount = decimalToNumber(obligation.amount);
            const paidAmount = decimalToNumber(obligation.paidAmount);
            const dueDateSource = obligation.deferredUntil ?? obligation.dueDate;
            const dueDate = dueDateSource ? new Date(dueDateSource).toISOString().slice(0, 10) : null;

            return {
              remainingAmount: getOpenObligationAmount(obligation.type, obligation.metadata, amount, paidAmount),
              dueDate,
              hasDeferredPayment: !!obligation.deferredUntil,
            };
          })
          .filter((obligation: { remainingAmount: number; dueDate: string | null }) => obligation.remainingAmount > 0 && obligation.dueDate)
          .sort((left: { dueDate: string | null }, right: { dueDate: string | null }) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""));
        const nextOpen = openObligations[0] ?? null;

        return {
          id: car.id,
          plateNumber: car.plateNumber,
          vin: car.vin,
          make: car.make,
          model: car.model,
          companyName: car.companyName ?? null,
          productionYear: car.productionYear ?? null,
          mileage: car.mileage ?? null,
          ...mapVehicleDocumentFields(car),
          color: car.color ?? null,
          status: car.status,
          ...mapCarManager(car),
          assignedDriverId: car.assignments.find((item: any) => !item.endedAt)?.driverId ?? null,
          lastAssignedDriverId: car.assignments[0]?.driverId ?? null,
          purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
          customsCost: decimalToNumber(car.customsCost ?? 0) || null,
          deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
          repairCost: decimalToNumber(car.repairCost ?? 0) || null,
          targetSalePrice: decimalToNumber(car.targetSalePrice ?? 0) || null,
          totalAcquisitionCost: getTotalAcquisitionCost({
            purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
            customsCost: decimalToNumber(car.customsCost ?? 0) || null,
            deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
            repairCost: decimalToNumber(car.repairCost ?? 0) || null,
          }),
          activeContractId: contract?.id ?? null,
          currentDebt: openObligations.reduce((sum: number, obligation: { remainingAmount: number }) => sum + obligation.remainingAmount, 0),
          nextDueAmount: nextOpen?.remainingAmount ?? 0,
          nextDueDate: nextOpen?.dueDate ?? null,
          hasDeferredPayment: openObligations.some((obligation: { hasDeferredPayment: boolean }) => obligation.hasDeferredPayment),
          statusSinceDate: (car.assignments.find((item: any) => !item.endedAt)?.startedAt ?? car.assignments[0]?.endedAt ?? car.updatedAt ?? car.createdAt).toISOString(),
        };
      });
    }

    return seedCars.filter((item) => !companyName || (item.companyName ?? null) === companyName);
  }

  async getById(carId: string): Promise<VehicleDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const car = await prisma.car.findUnique({
        where: { id: carId },
        select: {
          id: true,
          plateNumber: true,
          vin: true,
          make: true,
          model: true,
          companyName: true,
          productionYear: true,
          mileage: true,
          osagoStartDate: true,
          osagoEndDate: true,
          cascoStartDate: true,
          cascoEndDate: true,
          technicalInspectionStartDate: true,
          technicalInspectionEndDate: true,
          engineOilReplacementKm: true,
          gearboxOilReplacementKm: true,
          color: true,
          purchasePrice: true,
          customsCost: true,
          deliveryCost: true,
          repairCost: true,
          targetSalePrice: true,
          managerId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          assignments: {
            orderBy: { startedAt: "desc" },
            select: {
              id: true,
              driverId: true,
              startedAt: true,
              endedAt: true,
              driver: { select: { firstName: true, lastName: true } },
            },
          },
          manager: {
            select: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          contracts: {
            where: { status: "active" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              financedAmount: true,
              installmentAmount: true,
            },
          },
        },
      });

      if (!car) {
        return null;
      }

      const contract = car.contracts[0] ?? null;
      return {
        id: car.id,
        plateNumber: car.plateNumber,
        vin: car.vin,
        make: car.make,
        model: car.model,
        companyName: car.companyName ?? null,
        productionYear: car.productionYear ?? null,
        mileage: car.mileage ?? null,
        ...mapVehicleDocumentFields(car),
        color: car.color ?? null,
        status: car.status,
        ...mapCarManager(car),
        assignedDriverId: car.assignments.find((item: any) => !item.endedAt)?.driverId ?? null,
        purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
        customsCost: decimalToNumber(car.customsCost ?? 0) || null,
        deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
        repairCost: decimalToNumber(car.repairCost ?? 0) || null,
        targetSalePrice: decimalToNumber(car.targetSalePrice ?? 0) || null,
        totalAcquisitionCost: getTotalAcquisitionCost({
          purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
          customsCost: decimalToNumber(car.customsCost ?? 0) || null,
          deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
          repairCost: decimalToNumber(car.repairCost ?? 0) || null,
        }),
        activeContractId: contract?.id ?? null,
        financedAmount: contract ? decimalToNumber(contract.financedAmount) : null,
        installmentAmount: contract ? decimalToNumber(contract.installmentAmount) : null,
        statusSinceDate: (
          car.assignments.find((item: any) => !item.endedAt)?.startedAt ??
          car.updatedAt ??
          car.createdAt
        ).toISOString(),
        assignmentHistory: car.assignments.map((item: any) => ({
          id: item.id,
          driverId: item.driverId,
          driverName: joinName(item.driver.firstName, item.driver.lastName),
          startedAt: item.startedAt.toISOString(),
          endedAt: item.endedAt?.toISOString() ?? null,
        })),
      };
    }

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

  async getAssignedByDriver(driverId: string): Promise<VehicleDetail | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const assignment = await prisma.carAssignment.findFirst({
        where: {
          driverId,
          endedAt: null,
        },
        orderBy: { startedAt: "desc" },
        select: { carId: true },
      });

      return assignment ? this.getById(assignment.carId) : null;
    }

    const car = seedCars.find((item) => item.assignedDriverId === driverId) ?? null;
    return car ? this.getById(car.id) : null;
  }

  async create(input: CreateCarDto): Promise<VehicleListItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const car = await prisma.car.create({
        data: {
          vin: input.vin,
          plateNumber: input.plateNumber,
          make: input.make,
          model: input.model,
          companyName: input.companyName?.trim() || null,
          productionYear: input.productionYear ?? null,
          mileage: input.mileage ?? null,
          osagoStartDate: toOptionalDate(input.osagoStartDate),
          osagoEndDate: toOptionalDate(input.osagoEndDate),
          cascoStartDate: toOptionalDate(input.cascoStartDate),
          cascoEndDate: toOptionalDate(input.cascoEndDate),
          technicalInspectionStartDate: toOptionalDate(input.technicalInspectionStartDate),
          technicalInspectionEndDate: toOptionalDate(input.technicalInspectionEndDate),
          engineOilReplacementKm: input.engineOilReplacementKm ?? null,
          gearboxOilReplacementKm: input.gearboxOilReplacementKm ?? null,
          color: input.color?.trim() || null,
          purchasePrice: input.purchasePrice ?? null,
          customsCost: input.customsCost ?? null,
          deliveryCost: input.deliveryCost ?? null,
          repairCost: input.repairCost ?? null,
          targetSalePrice: input.targetSalePrice ?? null,
          status: "free",
        },
      });

      return {
        id: car.id,
        plateNumber: car.plateNumber,
        vin: car.vin,
        make: car.make,
        model: car.model,
        companyName: car.companyName ?? null,
        productionYear: car.productionYear ?? null,
        mileage: car.mileage ?? null,
        ...mapVehicleDocumentFields(car),
        color: car.color ?? null,
        status: car.status,
        managerId: null,
        managerName: null,
        assignedDriverId: null,
        purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
        customsCost: decimalToNumber(car.customsCost ?? 0) || null,
        deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
        repairCost: decimalToNumber(car.repairCost ?? 0) || null,
        targetSalePrice: decimalToNumber(car.targetSalePrice ?? 0) || null,
        totalAcquisitionCost: getTotalAcquisitionCost({
          purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
          customsCost: decimalToNumber(car.customsCost ?? 0) || null,
          deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
          repairCost: decimalToNumber(car.repairCost ?? 0) || null,
        }),
      };
    }

    return {
      id: crypto.randomUUID(),
      plateNumber: input.plateNumber,
      vin: input.vin,
      make: input.make,
      model: input.model,
      companyName: input.companyName?.trim() || null,
      productionYear: input.productionYear ?? null,
      mileage: input.mileage ?? null,
      osagoStartDate: input.osagoStartDate ?? null,
      osagoEndDate: input.osagoEndDate ?? null,
      cascoStartDate: input.cascoStartDate ?? null,
      cascoEndDate: input.cascoEndDate ?? null,
      technicalInspectionStartDate: input.technicalInspectionStartDate ?? null,
      technicalInspectionEndDate: input.technicalInspectionEndDate ?? null,
      engineOilReplacementKm: input.engineOilReplacementKm ?? null,
      gearboxOilReplacementKm: input.gearboxOilReplacementKm ?? null,
      color: input.color?.trim() || null,
      status: "free",
      managerId: null,
      managerName: null,
      assignedDriverId: null,
      purchasePrice: input.purchasePrice ?? null,
      customsCost: input.customsCost ?? null,
      deliveryCost: input.deliveryCost ?? null,
      repairCost: input.repairCost ?? null,
      targetSalePrice: input.targetSalePrice ?? null,
      totalAcquisitionCost: getTotalAcquisitionCost({
        purchasePrice: input.purchasePrice ?? null,
        customsCost: input.customsCost ?? null,
        deliveryCost: input.deliveryCost ?? null,
        repairCost: input.repairCost ?? null,
      }),
    };
  }

  async update(carId: string, input: UpdateCarDto): Promise<VehicleListItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const current = await prisma.car.findUnique({
        where: { id: carId },
        select: {
          plateNumber: true,
          vin: true,
          make: true,
          model: true,
          companyName: true,
          productionYear: true,
          mileage: true,
          osagoStartDate: true,
          osagoEndDate: true,
          cascoStartDate: true,
          cascoEndDate: true,
          technicalInspectionStartDate: true,
          technicalInspectionEndDate: true,
          engineOilReplacementKm: true,
          gearboxOilReplacementKm: true,
          color: true,
          status: true,
          purchasePrice: true,
          customsCost: true,
          deliveryCost: true,
          repairCost: true,
          targetSalePrice: true,
          managerId: true,
        },
      });

      if (!current) {
        return null;
      }

      const car = await prisma.car.update({
        where: { id: carId },
        data: {
          plateNumber: input.plateNumber?.trim() || current.plateNumber,
          vin: input.vin?.trim() || current.vin,
          make: input.make?.trim() || current.make,
          model: input.model?.trim() || current.model,
          companyName: input.companyName !== undefined ? input.companyName?.trim() || null : current.companyName,
          productionYear: input.productionYear ?? current.productionYear ?? null,
          mileage: input.mileage ?? current.mileage ?? null,
          osagoStartDate: input.osagoStartDate !== undefined ? toOptionalDate(input.osagoStartDate) : current.osagoStartDate ?? null,
          osagoEndDate: input.osagoEndDate !== undefined ? toOptionalDate(input.osagoEndDate) : current.osagoEndDate ?? null,
          cascoStartDate: input.cascoStartDate !== undefined ? toOptionalDate(input.cascoStartDate) : current.cascoStartDate ?? null,
          cascoEndDate: input.cascoEndDate !== undefined ? toOptionalDate(input.cascoEndDate) : current.cascoEndDate ?? null,
          technicalInspectionStartDate: input.technicalInspectionStartDate !== undefined ? toOptionalDate(input.technicalInspectionStartDate) : current.technicalInspectionStartDate ?? null,
          technicalInspectionEndDate: input.technicalInspectionEndDate !== undefined ? toOptionalDate(input.technicalInspectionEndDate) : current.technicalInspectionEndDate ?? null,
          engineOilReplacementKm: input.engineOilReplacementKm !== undefined ? input.engineOilReplacementKm : current.engineOilReplacementKm ?? null,
          gearboxOilReplacementKm: input.gearboxOilReplacementKm !== undefined ? input.gearboxOilReplacementKm : current.gearboxOilReplacementKm ?? null,
          color: input.color?.trim() || null,
          status: input.status?.trim() || current.status,
          purchasePrice: input.purchasePrice ?? current.purchasePrice ?? null,
          customsCost: input.customsCost ?? current.customsCost ?? null,
          deliveryCost: input.deliveryCost ?? current.deliveryCost ?? null,
          repairCost: input.repairCost ?? current.repairCost ?? null,
          targetSalePrice: input.targetSalePrice ?? current.targetSalePrice ?? null,
        },
        select: {
          id: true,
          plateNumber: true,
          vin: true,
          make: true,
          model: true,
          companyName: true,
          productionYear: true,
          mileage: true,
          osagoStartDate: true,
          osagoEndDate: true,
          cascoStartDate: true,
          cascoEndDate: true,
          technicalInspectionStartDate: true,
          technicalInspectionEndDate: true,
          engineOilReplacementKm: true,
          gearboxOilReplacementKm: true,
          color: true,
          purchasePrice: true,
          customsCost: true,
          deliveryCost: true,
          repairCost: true,
          targetSalePrice: true,
          managerId: true,
          status: true,
          manager: {
            select: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          assignments: {
            where: { endedAt: null },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { driverId: true },
          },
          contracts: {
            where: { status: "active" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
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
          },
        },
      });

      const contract = car.contracts[0] ?? null;
      const openObligations = (contract?.obligations ?? [])
        .map((obligation: any) => {
          const amount = decimalToNumber(obligation.amount);
          const paidAmount = decimalToNumber(obligation.paidAmount);
          const dueDateSource = obligation.deferredUntil ?? obligation.dueDate;
          const dueDate = dueDateSource ? new Date(dueDateSource).toISOString().slice(0, 10) : null;

          return {
            remainingAmount: getOpenObligationAmount(obligation.type, obligation.metadata, amount, paidAmount),
            dueDate,
            hasDeferredPayment: !!obligation.deferredUntil,
          };
        })
        .filter((obligation: { remainingAmount: number; dueDate: string | null }) => obligation.remainingAmount > 0 && obligation.dueDate)
        .sort((left: { dueDate: string | null }, right: { dueDate: string | null }) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""));
      const nextOpen = openObligations[0] ?? null;

      return {
        id: car.id,
        plateNumber: car.plateNumber,
        vin: car.vin,
        make: car.make,
        model: car.model,
        companyName: car.companyName ?? null,
        productionYear: car.productionYear ?? null,
        mileage: car.mileage ?? null,
        ...mapVehicleDocumentFields(car),
        color: car.color ?? null,
        status: car.status,
        ...mapCarManager(car),
        assignedDriverId: car.assignments[0]?.driverId ?? null,
        purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
        customsCost: decimalToNumber(car.customsCost ?? 0) || null,
        deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
        repairCost: decimalToNumber(car.repairCost ?? 0) || null,
        targetSalePrice: decimalToNumber(car.targetSalePrice ?? 0) || null,
        totalAcquisitionCost: getTotalAcquisitionCost({
          purchasePrice: decimalToNumber(car.purchasePrice ?? 0) || null,
          customsCost: decimalToNumber(car.customsCost ?? 0) || null,
          deliveryCost: decimalToNumber(car.deliveryCost ?? 0) || null,
          repairCost: decimalToNumber(car.repairCost ?? 0) || null,
        }),
        activeContractId: contract?.id ?? null,
        currentDebt: openObligations.reduce((sum: number, obligation: { remainingAmount: number }) => sum + obligation.remainingAmount, 0),
        nextDueAmount: nextOpen?.remainingAmount ?? 0,
        nextDueDate: nextOpen?.dueDate ?? null,
        hasDeferredPayment: openObligations.some((obligation: { hasDeferredPayment: boolean }) => obligation.hasDeferredPayment),
      };
    }

    const car = seedCars.find((item) => item.id === carId);
    if (!car) {
      return null;
    }

    car.plateNumber = input.plateNumber?.trim() || car.plateNumber;
    car.vin = input.vin?.trim() || car.vin;
    car.make = input.make?.trim() || car.make;
    car.model = input.model?.trim() || car.model;
    car.productionYear = input.productionYear ?? car.productionYear ?? null;
    car.mileage = input.mileage ?? car.mileage ?? null;
    car.color = input.color?.trim() || null;
    car.status = input.status?.trim() || car.status;
    car.purchasePrice = input.purchasePrice ?? car.purchasePrice ?? null;
    car.customsCost = input.customsCost ?? car.customsCost ?? null;
    car.deliveryCost = input.deliveryCost ?? car.deliveryCost ?? null;
    car.repairCost = input.repairCost ?? car.repairCost ?? null;
    car.targetSalePrice = input.targetSalePrice ?? car.targetSalePrice ?? null;
    car.totalAcquisitionCost = getTotalAcquisitionCost(car);

    const updated = await this.getById(carId);
    if (!updated) {
      return null;
    }

    const { financedAmount: _financedAmount, installmentAmount: _installmentAmount, ...row } = updated;
    return row;
  }
}
