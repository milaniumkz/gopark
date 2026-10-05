import { Injectable } from "@nestjs/common";
import { makeNotificationRepository } from "../../common/application/repository.factory.js";
import type { NotificationRepository } from "../../common/repositories/index.js";
import { FcmService } from "../notifications/fcm.service.js";

@Injectable()
export class IntegrationEventsService {
  private readonly notificationRepository: NotificationRepository = makeNotificationRepository();

  constructor(private readonly fcmService: FcmService) {}

  async handle(topic: string, payload: Record<string, unknown>) {
    switch (topic) {
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
}
