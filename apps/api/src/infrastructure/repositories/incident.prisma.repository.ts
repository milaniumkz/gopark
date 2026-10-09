import { nextIncidentStatusHistory } from "../../common/repositories/incident-history.js";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { ManagerIncidentItem } from "@gopark/contracts";
import type { CreateIncidentRecord, IncidentRepository, UpdateIncidentRecord } from "../../common/repositories/index.js";
import { seedCars, seedDrivers, seedManagerIncidents } from "../../data/seed.js";
import { PrismaService } from "../prisma/prisma.service.js";

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapIncidentRecord(incident: any): ManagerIncidentItem {
  return {
    id: incident.id,
    title: incident.title,
    incidentType: incident.incidentType,
    status: incident.status,
    priority: incident.priority,
    driverId: incident.driverId ?? undefined,
    driverName: incident.driverName ?? null,
    carId: incident.carId ?? undefined,
    occurredAt: incident.occurredAt?.toISOString() ?? null,
    periodLabel: incident.periodLabel ?? null,
    referenceNumber: incident.referenceNumber ?? null,
    amount: decimalToNumber(incident.amount),
    insuranceCompensationAmount: decimalToNumber(incident.insuranceCompensationAmount),
    writeoffAmount: decimalToNumber(incident.writeoffAmount),
    description: incident.description ?? null,
    accidentPhotoUrl: incident.accidentPhotoUrl ?? null,
    insuranceNote: incident.insuranceNote ?? null,
    repairNote: incident.repairNote ?? null,
    locationNote: incident.locationNote ?? null,
    managerLabel: incident.managerLabel ?? null,
    statusHistory: incident.statusHistory ?? [],
    serviceStage: incident.serviceStage ?? null,
    serviceCaseType: incident.serviceCaseType ?? null,
    servicePaymentStatus: incident.servicePaymentStatus ?? null,
    servicePayer: incident.servicePayer ?? null,
  };
}

const incidentSelect = {
  id: true,
  title: true,
  incidentType: true,
  status: true,
  priority: true,
  driverId: true,
  carId: true,
  occurredAt: true,
  periodLabel: true,
  referenceNumber: true,
  amount: true,
  insuranceCompensationAmount: true,
  writeoffAmount: true,
  description: true,
  accidentPhotoUrl: true,
  insuranceNote: true,
  repairNote: true,
  locationNote: true,
  managerLabel: true,
  statusHistory: true,
  serviceStage: true,
  serviceCaseType: true,
  servicePaymentStatus: true,
  servicePayer: true,
} as const;

export class IncidentPrismaRepository implements IncidentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ManagerIncidentItem[]> {
    return this.listInternal();
  }

  async listByCompany(companyName: string): Promise<ManagerIncidentItem[]> {
    return this.listInternal(companyName);
  }

  private async listInternal(companyName?: string): Promise<ManagerIncidentItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const where = companyName
        ? {
            OR: [
              {
                driverId: {
                  in: (await prisma.driver.findMany({
                    where: { companyName },
                    select: { id: true },
                  })).map((item: { id: string }) => item.id),
                },
              },
              {
                carId: {
                  in: (await prisma.car.findMany({
                    where: { companyName },
                    select: { id: true },
                  })).map((item: { id: string }) => item.id),
                },
              },
            ],
          }
        : undefined;

      const incidents = await prisma.incident.findMany({
        ...(where ? { where } : {}),
        orderBy: { createdAt: "desc" },
        select: incidentSelect,
      });

      return incidents.map(mapIncidentRecord);
    }

    if (!companyName) {
      return seedManagerIncidents;
    }

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

  async countOpen(): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.incident.count({
        where: { status: "open" },
      });
    }

    return seedManagerIncidents.filter((item) => item.status === "open").length;
  }

  async countOpenByDrivers(driverIds: string[]): Promise<number> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.incident.count({
        where: {
          status: "open",
          driverId: { in: driverIds },
        },
      });
    }

    const ids = new Set(driverIds);
    return seedManagerIncidents
      .filter((item) => item.status === "open" && item.driverId && ids.has(item.driverId))
      .length;
  }

  async listOpenByDriver(driverId: string): Promise<ManagerIncidentItem[]> {
    const prisma = this.prisma.client;
    if (prisma) {
      const incidents = await prisma.incident.findMany({
        where: {
          driverId,
          status: "open",
        },
        orderBy: { createdAt: "desc" },
        select: incidentSelect,
      });

      return incidents.map(mapIncidentRecord);
    }

    return seedManagerIncidents.filter((item) => item.driverId === driverId && item.status === "open");
  }

  async completeUntrackedRepair(carId: string): Promise<ManagerIncidentItem | null> {
    const data = { title: "Завершение ремонта автомобиля без открытого кейса СТО", incidentType: "repair", status: "closed", priority: "low", serviceStage: "completed", description: "Возврат автомобиля из ремонта подтверждён в журнале СТО. Дата начала ремонта и расходы не указаны." };
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2036548158)`;
        const car = await tx.car.findUnique({ where: { id: carId } });
        if (!car) throw new NotFoundException("Автомобиль не найден");
        if (["assigned", "free"].includes(car.status)) return null;
        if (car.status !== "maintenance") throw new ConflictException("Автомобиль уже не находится в ремонте. Обновите журнал.");
        const blocking = await tx.incident.count({ where: { carId, OR: [{ status: "open" }, { serviceStage: "written_off" }] } });
        if (blocking) throw new ConflictException("У автомобиля есть открытый инцидент или списание. Сначала завершите связанный кейс.");
        const assignment = await tx.carAssignment.findFirst({ where: { carId, endedAt: null }, orderBy: { startedAt: "desc" } });
        const incident = await tx.incident.create({ data: { ...data, carId, driverId: assignment?.driverId ?? null } });
        await syncRepairCar(tx, incident);
        return mapIncidentRecord(incident);
      });
    }
    const car = seedCars.find((item) => item.id === carId);
    if (!car) throw new NotFoundException("Автомобиль не найден");
    if (["assigned", "free"].includes(car.status)) return null;
    if (car.status !== "maintenance" || seedManagerIncidents.some((item) => item.carId === carId && (item.status === "open" || item.serviceStage === "written_off"))) throw new ConflictException("Сначала завершите связанный кейс автомобиля.");
    return this.create({ ...data, carId, driverId: car.assignedDriverId });
  }

  async create(input: CreateIncidentRecord): Promise<ManagerIncidentItem> {
    input = { ...input, ...repairLifecycle(input) };
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2036548158)`;
        const incident = await tx.incident.create({
          data: {
            title: input.title,
            incidentType: input.incidentType,
            status: input.status,
            priority: input.priority,
            driverId: input.driverId ?? null,
            carId: input.carId ?? null,
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
            periodLabel: input.periodLabel ?? null,
            referenceNumber: input.referenceNumber ?? null,
            amount: input.amount ?? null,
            insuranceCompensationAmount: input.insuranceCompensationAmount ?? null,
            writeoffAmount: input.writeoffAmount ?? null,
            description: input.description ?? null,
            accidentPhotoUrl: input.accidentPhotoUrl ?? null,
            insuranceNote: input.insuranceNote ?? null,
            repairNote: input.repairNote ?? null,
            locationNote: input.locationNote ?? null,
            managerLabel: input.managerLabel ?? null,
            serviceStage: input.serviceStage ?? null,
            serviceCaseType: input.serviceCaseType ?? null,
            servicePaymentStatus: input.servicePaymentStatus ?? null,
            servicePayer: input.servicePayer ?? null,
          },
        });

        await syncRepairCar(tx, incident);
        return mapIncidentRecord(incident);
      });
    }

    const incident: ManagerIncidentItem = {
      id: `inc_${seedManagerIncidents.length + 1}`,
      title: input.title,
      incidentType: input.incidentType,
      status: input.status,
      priority: input.priority,
      driverId: input.driverId ?? undefined,
      driverName: input.driverId
        ? (seedDrivers.find((driver) => driver.id === input.driverId)?.fullName ?? null)
        : null,
      carId: input.carId ?? undefined,
      occurredAt: input.occurredAt ?? null,
      periodLabel: input.periodLabel ?? null,
      referenceNumber: input.referenceNumber ?? null,
      amount: input.amount ?? null,
      insuranceCompensationAmount: input.insuranceCompensationAmount ?? null,
      writeoffAmount: input.writeoffAmount ?? null,
      description: input.description ?? null,
      accidentPhotoUrl: input.accidentPhotoUrl ?? null,
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
    syncSeedRepairCar(incident);
    return incident;
  }

  async update(incidentId: string, input: UpdateIncidentRecord): Promise<ManagerIncidentItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      return prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2036548158)`;
        const existing = await tx.incident.findUnique({
          where: { id: incidentId },
          select: incidentSelect,
        });
        if (!existing) {
          return null;
        }

        input = { ...input, ...repairLifecycle({ ...existing, ...input }) };
        const incident = await tx.incident.update({
          where: { id: incidentId },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.incidentType !== undefined ? { incidentType: input.incidentType } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.priority !== undefined ? { priority: input.priority } : {}),
            ...(input.driverId !== undefined ? { driverId: input.driverId ?? null } : {}),
            ...(input.carId !== undefined ? { carId: input.carId ?? null } : {}),
            ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt ? new Date(input.occurredAt) : null } : {}),
            ...(input.periodLabel !== undefined ? { periodLabel: input.periodLabel ?? null } : {}),
            ...(input.referenceNumber !== undefined ? { referenceNumber: input.referenceNumber ?? null } : {}),
            ...(input.amount !== undefined ? { amount: input.amount ?? null } : {}),
            ...(input.insuranceCompensationAmount !== undefined ? { insuranceCompensationAmount: input.insuranceCompensationAmount ?? null } : {}),
            ...(input.writeoffAmount !== undefined ? { writeoffAmount: input.writeoffAmount ?? null } : {}),
            ...(input.description !== undefined ? { description: input.description ?? null } : {}),
            ...(input.accidentPhotoUrl !== undefined ? { accidentPhotoUrl: input.accidentPhotoUrl ?? null } : {}),
            ...(input.insuranceNote !== undefined ? { insuranceNote: input.insuranceNote ?? null } : {}),
            ...(input.repairNote !== undefined ? { repairNote: input.repairNote ?? null } : {}),
            ...(input.locationNote !== undefined ? { locationNote: input.locationNote ?? null } : {}),
            ...(input.managerLabel !== undefined ? { managerLabel: input.managerLabel ?? null } : {}),
            ...(input.serviceStage !== undefined ? { serviceStage: input.serviceStage ?? null } : {}),
            ...(input.serviceCaseType !== undefined ? { serviceCaseType: input.serviceCaseType ?? null } : {}),
            ...(input.servicePaymentStatus !== undefined ? { servicePaymentStatus: input.servicePaymentStatus ?? null } : {}),
            ...(input.servicePayer !== undefined ? { servicePayer: input.servicePayer ?? null } : {}),
          },
          select: incidentSelect,
        });

        await syncRepairCar(tx, incident);
        return mapIncidentRecord(incident);
      });
    }

    const incident = seedManagerIncidents.find((item) => item.id === incidentId);
    if (!incident) {
      return null;
    }

    input = { ...input, ...repairLifecycle({ ...incident, ...input }) };
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
      ...(input.accidentPhotoUrl !== undefined ? { accidentPhotoUrl: input.accidentPhotoUrl ?? null } : {}),
      ...(input.insuranceNote !== undefined ? { insuranceNote: input.insuranceNote ?? null } : {}),
      ...(input.repairNote !== undefined ? { repairNote: input.repairNote ?? null } : {}),
      ...(input.locationNote !== undefined ? { locationNote: input.locationNote ?? null } : {}),
      ...(input.managerLabel !== undefined ? { managerLabel: input.managerLabel ?? null } : {}),
      ...(input.serviceStage !== undefined ? { serviceStage: input.serviceStage ?? null } : {}),
      ...(input.serviceCaseType !== undefined ? { serviceCaseType: input.serviceCaseType ?? null } : {}),
      ...(input.servicePaymentStatus !== undefined ? { servicePaymentStatus: input.servicePaymentStatus ?? null } : {}),
      ...(input.servicePayer !== undefined ? { servicePayer: input.servicePayer ?? null } : {}),
    });

    syncSeedRepairCar(incident);
    return incident;
  }
}


async function syncRepairCar(tx: any, incident: any): Promise<void> {
  // Legacy cases may lack carId. Link only an unambiguous assignment at the
  // incident's recorded time; never substitute the driver's current vehicle.
  if (!incident.carId && incident.driverId && incident.occurredAt && incident.incidentType === "repair") {
    const matches = await tx.carAssignment.findMany({ where: {
      driverId: incident.driverId, startedAt: { lte: incident.occurredAt },
      OR: [{ endedAt: null }, { endedAt: { gt: incident.occurredAt } }],
    }, take: 2 });
    if (matches.length === 1) {
      incident.carId = matches[0].carId;
      await tx.incident.update({ where: { id: incident.id }, data: { carId: incident.carId } });
    }
  }
  if (!incident.carId || !(incident.incidentType === "repair" || ["awaiting_repair", "in_repair", "completed", "written_off"].includes(incident.serviceStage))) return;
  const car = await tx.car.findUnique({ where: { id: incident.carId } });
  if (!car || ["sold", "written_off"].includes(car.status)) return;
  const stage = incident.serviceStage;
  if (stage === "written_off") {
    await tx.car.update({ where: { id: car.id }, data: { status: "written_off" } });
    return;
  }
  if (["awaiting_repair", "in_repair"].includes(stage) && incident.status === "open") {
    if (["assigned", "free", "maintenance", "accident"].includes(car.status)) {
      await tx.car.update({ where: { id: car.id }, data: { status: "maintenance" } });
    }
    return;
  }
  if (stage !== "completed" || !["resolved", "closed", "archived"].includes(incident.status) || !["maintenance", "accident"].includes(car.status)) return;
  const blocking = await tx.incident.count({ where: {
    id: { not: incident.id }, carId: car.id,
    OR: [{ status: "open" }, { serviceStage: "written_off" }],
  } });
  if (blocking) return;
  const assignment = await tx.carAssignment.findFirst({
    where: { carId: car.id, endedAt: null }, include: { driver: true }, orderBy: { startedAt: "desc" },
  });
  const driver = assignment?.driver;
  await tx.car.update({ where: { id: car.id }, data: { status: driver && driver.status !== "terminated" ? "assigned" : "free" } });
  // Only clear the incident-related status for the same, still assigned driver.
  if (driver && driver.id === incident.driverId && driver.status === "accident") {
    const otherDriverIncident = await tx.incident.count({ where: { id: { not: incident.id }, driverId: driver.id, status: "open" } });
    if (!otherDriverIncident) await tx.driver.update({ where: { id: driver.id }, data: { status: "active" } });
  }
}


function repairLifecycle(incident: { incidentType?: string; serviceStage?: string | null; status?: string }): UpdateIncidentRecord {
  if (incident.incidentType !== "repair" && !["awaiting_repair", "in_repair", "completed", "written_off"].includes(incident.serviceStage ?? "")) return {};
  if (incident.serviceStage === "written_off") return { status: "closed", serviceStage: "written_off" };
  if (incident.serviceStage === "completed" || ["resolved", "closed", "archived"].includes(incident.status ?? "")) {
    return { serviceStage: "completed", status: incident.status === "archived" ? "archived" : "closed" };
  }
  return { status: "open", serviceStage: incident.serviceStage || "awaiting_repair" };
}

function syncSeedRepairCar(incident: ManagerIncidentItem): void {
  if (!incident.carId || !(incident.incidentType === "repair" || ["awaiting_repair", "in_repair", "completed", "written_off"].includes(incident.serviceStage ?? ""))) return;
  const car = seedCars.find((item) => item.id === incident.carId);
  if (!car || ["sold", "written_off"].includes(car.status)) return;
  if (incident.serviceStage === "written_off") { car.status = "written_off"; return; }
  if (["awaiting_repair", "in_repair"].includes(incident.serviceStage ?? "") && incident.status === "open") {
    if (["assigned", "free", "maintenance", "accident"].includes(car.status)) car.status = "maintenance";
    return;
  }
  if (incident.serviceStage !== "completed" || !["maintenance", "accident"].includes(car.status)) return;
  if (seedManagerIncidents.some((item) => item.id !== incident.id && item.carId === car.id && (item.status === "open" || item.serviceStage === "written_off"))) return;
  const driver = seedDrivers.find((item) => item.id === car.assignedDriverId);
  car.status = driver && driver.status !== "terminated" ? "assigned" : "free";
  if (driver && driver.id === incident.driverId && driver.status === "accident" && !seedManagerIncidents.some((item) => item.id !== incident.id && item.driverId === driver.id && item.status === "open")) driver.status = "active";
}
