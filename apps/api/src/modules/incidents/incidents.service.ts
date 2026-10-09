import { BadRequestException, Injectable } from "@nestjs/common";
import type { ManagerIncidentItem } from "@gopark/contracts";
import { makeIncidentRepository } from "../../common/application/repository.factory.js";
import type { IncidentRepository } from "../../common/repositories/index.js";
import type { CreateIncidentDto } from "./dto/create-incident.dto.js";
import type { UpdateIncidentDto } from "./dto/update-incident.dto.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOccurredAt(value: string | null | undefined): string | null {
  const normalized = trimOrNull(value);
  if (!normalized) {
    return null;
  }

  const eventDate = new Date(normalized.length === 10 ? `${normalized}T00:00:00.000Z` : normalized);
  if (Number.isNaN(eventDate.getTime())) {
    throw new BadRequestException("Дата инцидента указана неверно.");
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (eventDate.getTime() > today.getTime()) {
    throw new BadRequestException("Дата инцидента не может быть в будущем.");
  }

  return normalized;
}

@Injectable()
export class IncidentsService {
  private readonly incidentRepository: IncidentRepository = makeIncidentRepository();

  constructor(private readonly notificationsCreateService: NotificationsCreateService) {}

  list(): Promise<ManagerIncidentItem[]> {
    return this.incidentRepository.list();
  }

  completeUntrackedRepair(carId: string): Promise<ManagerIncidentItem | null> {
    return this.incidentRepository.completeUntrackedRepair(carId);
  }

  listByCompany(companyName: string): Promise<ManagerIncidentItem[]> {
    return this.incidentRepository.listByCompany(companyName);
  }

  async create(input: CreateIncidentDto): Promise<ManagerIncidentItem> {
    const notifyText = trimOrNull(input.notifyDriverText);
    const notifyDate = trimOrNull(input.notifyDriverDate);
    const description = [
      trimOrNull(input.description),
      notifyText && notifyDate ? `Уведомить водителя ${notifyDate}: ${notifyText}` : null,
    ].filter(Boolean).join("\n");

    const incident = await this.incidentRepository.create({
      title: input.title.trim(),
      incidentType: trimOrNull(input.incidentType) || "general",
      status: input.status.trim(),
      priority: input.priority.trim(),
      driverId: trimOrNull(input.driverId),
      carId: trimOrNull(input.carId),
      occurredAt: normalizeOccurredAt(input.occurredAt),
      periodLabel: trimOrNull(input.periodLabel),
      referenceNumber: trimOrNull(input.referenceNumber),
      amount: input.amount ?? null,
      insuranceCompensationAmount: input.insuranceCompensationAmount ?? null,
      writeoffAmount: input.writeoffAmount ?? null,
      description: description || null,
      accidentPhotoUrl: trimOrNull(input.accidentPhotoUrl),
      insuranceNote: trimOrNull(input.insuranceNote),
      repairNote: trimOrNull(input.repairNote),
      locationNote: trimOrNull(input.locationNote),
      managerLabel: trimOrNull(input.managerLabel),
      serviceStage: trimOrNull(input.serviceStage),
      serviceCaseType: trimOrNull(input.serviceCaseType),
      servicePaymentStatus: trimOrNull(input.servicePaymentStatus),
      servicePayer: trimOrNull(input.servicePayer),
    });

    if (incident.incidentType === "inspection" && incident.driverId && notifyText && notifyDate) {
      await this.notificationsCreateService.scheduleDriverInspectionReminder(
        incident.driverId,
        notifyText,
        this.toScheduledInspectionReminderDate(notifyDate),
      );
    }

    return incident;
  }

  update(incidentId: string, input: UpdateIncidentDto): Promise<ManagerIncidentItem | null> {
    const patch: UpdateIncidentDto = {};

    if (input.title !== undefined) {
      patch.title = input.title.trim();
    }
    if (input.incidentType !== undefined) {
      patch.incidentType = trimOrNull(input.incidentType) || "general";
    }
    if (input.status !== undefined) {
      patch.status = input.status.trim();
    }
    if (input.priority !== undefined) {
      patch.priority = input.priority.trim();
    }
    if (input.driverId !== undefined) {
      patch.driverId = trimOrNull(input.driverId);
    }
    if (input.carId !== undefined) {
      patch.carId = trimOrNull(input.carId);
    }
    if (input.occurredAt !== undefined) {
      patch.occurredAt = normalizeOccurredAt(input.occurredAt);
    }
    if (input.periodLabel !== undefined) {
      patch.periodLabel = trimOrNull(input.periodLabel);
    }
    if (input.referenceNumber !== undefined) {
      patch.referenceNumber = trimOrNull(input.referenceNumber);
    }
    if (input.amount !== undefined) {
      patch.amount = input.amount ?? null;
    }
    if (input.insuranceCompensationAmount !== undefined) {
      patch.insuranceCompensationAmount = input.insuranceCompensationAmount ?? null;
    }
    if (input.writeoffAmount !== undefined) {
      patch.writeoffAmount = input.writeoffAmount ?? null;
    }
    if (input.description !== undefined) {
      patch.description = trimOrNull(input.description);
    }
    if (input.accidentPhotoUrl !== undefined) {
      patch.accidentPhotoUrl = trimOrNull(input.accidentPhotoUrl);
    }
    if (input.insuranceNote !== undefined) {
      patch.insuranceNote = trimOrNull(input.insuranceNote);
    }
    if (input.repairNote !== undefined) {
      patch.repairNote = trimOrNull(input.repairNote);
    }
    if (input.locationNote !== undefined) {
      patch.locationNote = trimOrNull(input.locationNote);
    }
    if (input.managerLabel !== undefined) {
      patch.managerLabel = trimOrNull(input.managerLabel);
    }
    if (input.serviceStage !== undefined) {
      patch.serviceStage = trimOrNull(input.serviceStage);
    }
    if (input.serviceCaseType !== undefined) {
      patch.serviceCaseType = trimOrNull(input.serviceCaseType);
    }
    if (input.servicePaymentStatus !== undefined) {
      patch.servicePaymentStatus = trimOrNull(input.servicePaymentStatus);
    }
    if (input.servicePayer !== undefined) {
      patch.servicePayer = trimOrNull(input.servicePayer);
    }

    return this.incidentRepository.update(incidentId, patch);
  }

  private toScheduledInspectionReminderDate(date: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Date().toISOString();
    }

    return new Date(`${date}T09:00:00+06:00`).toISOString();
  }
}
