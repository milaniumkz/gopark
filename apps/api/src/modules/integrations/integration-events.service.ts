import { createHash } from "node:crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { Injectable } from "@nestjs/common";
import { makeNotificationRepository } from "../../common/application/repository.factory.js";
import type { NotificationRepository } from "../../common/repositories/index.js";
import { FcmService } from "../notifications/fcm.service.js";

@Injectable()
export class IntegrationEventsService {
  private readonly notificationRepository: NotificationRepository = makeNotificationRepository();

  constructor(private readonly fcmService: FcmService, private readonly prisma: PrismaService) {}

  async handle(topic: string, payload: Record<string, unknown>) {
    switch (topic) {
      case "service.changed":
      case "service.arrival_overdue":
        return this.deliverServiceEvent(topic, payload);
      case "payment.registered":
        return {
          integration: "billing-sync",
          accepted: true,
          payload,
        };
      case "payout.requested":
        return {
          integration: "bakai-payout-queue",
          accepted: true,
          payload,
        };
      case "payout.approved":
        return {
          integration: "payout-approval-sync",
          accepted: true,
          payload,
        };
      case "notification.dispatch":
        return {
          integration: "notification-delivery",
          accepted: true,
          payload,
        };
      case "manager_alert.dispatch":
        return {
          integration: "manager-alert-delivery",
          accepted: true,
          payload,
        };
      case "driver.inspection_reminder": {
        const driverId = typeof payload.driverId === "string" ? payload.driverId : "";
        const title = typeof payload.title === "string" ? payload.title : "Осмотр автомобиля";
        const body = typeof payload.body === "string" ? payload.body : "Напоминание об осмотре.";
        if (driverId) {
          await this.fcmService.sendToDriver(driverId, title, body).catch(() => undefined);
        }
        if (typeof payload.notificationId === "string") {
          await this.notificationRepository.updateStatus(payload.notificationId, "sent").catch(() => undefined);
        }
        return {
          integration: "inspection-reminder-delivery",
          accepted: true,
          payload,
        };
      }
      default:
        return {
          integration: "unknown",
          accepted: false,
          payload,
        };
    }
  }
  private async deliverServiceEvent(topic: string, payload: Record<string, unknown>) {
    const client = this.prisma.client;
    if (!client || typeof payload.incidentId !== "string") return { accepted: true };
    const alerts = await client.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2036548158)`;
      const incident = await tx.incident.findUnique({ where: { id: payload.incidentId } });
      if (!incident) return [];
      if (topic === "service.arrival_overdue" && (incident.serviceStage !== "sent_to_service" || incident.status !== "open" || incident.serviceDetails?.arrivedAt || Date.parse(incident.serviceDetails?.sentAt ?? "") + 86400000 > Date.now())) return [];
      const car = incident.carId ? await tx.car.findUnique({ where: { id: incident.carId } }) : null;
      const driver = incident.driverId ? await tx.driver.findUnique({ where: { id: incident.driverId } }) : null;
      const ids = [...new Set([car?.managerId, driver?.managerId].filter(Boolean))] as string[];
      const labels: Record<string, string> = { sent_to_service: "Отправлен на СТО", awaiting_repair: "Прибыл на СТО · в ожидании", in_repair: "Ремонт начат", completed: "Машина готова", written_off: "Автомобиль списан" };
      const title = topic === "service.arrival_overdue" ? "СТО не подтвердило прибытие за 24 часа" : payload.kind === "updated" ? "Обновлена карточка ремонта" : labels[String(payload.stage)] ?? "Обновление ремонта";
      const details = `${car?.plateNumber ?? incident.title}: ${payload.details ?? incident.serviceDetails?.reason ?? "Откройте карточку ремонта"}`;
      const results = [];
      for (const managerId of ids) {
        const hash = createHash("sha256").update(`${payload.eventId}:${topic}:${managerId}`).digest("hex").slice(0,32);
        const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}`;
        const existing = await tx.managerAlert.findUnique({ where: { id } });
        if (!existing) await tx.managerAlert.create({ data: { id, managerId, title, details } });
        results.push({ managerId, title, details });
      }
      return results;
    });
    for (const alert of alerts) await this.fcmService.sendToManager(alert.managerId, alert.title, alert.details);
    return { integration: "service-notifications", accepted: true };
  }

}
