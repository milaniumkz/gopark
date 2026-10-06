import { nextIncidentStatusHistory } from "../../common/repositories/incident-history.js";
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

  async create(input: CreateIncidentRecord): Promise<ManagerIncidentItem> {
    const prisma = this.prisma.client;
    if (prisma) {
      const incident = await prisma.incident.create({
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

      return mapIncidentRecord(incident);
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
    return incident;
  }

  async update(incidentId: string, input: UpdateIncidentRecord): Promise<ManagerIncidentItem | null> {
    const prisma = this.prisma.client;
    if (prisma) {
      const existing = await prisma.incident.findUnique({
        where: { id: incidentId },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }

      const incident = await prisma.incident.update({
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

      return mapIncidentRecord(incident);
    }

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

    return incident;
  }
}
