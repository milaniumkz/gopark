import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { NotificationListItem } from "@gopark/contracts";
import { makeNotificationRepository } from "../../common/application/repository.factory.js";
import type { NotificationRepository } from "../../common/repositories/index.js";

@Injectable()
export class NotificationsService {
  private readonly repository: NotificationRepository = makeNotificationRepository();

  async list(): Promise<NotificationListItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<NotificationListItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async retry(notificationId: string, companyName?: string | null): Promise<NotificationListItem> {
    if (companyName) {
      const allowed = await this.repository.listByCompany(companyName);
      if (!allowed.some((item) => item.id === notificationId)) {
        throw new NotFoundException("Уведомление не найдено.");
      }
    }

    const current = await this.repository.getById(notificationId);
    if (!current) {
      throw new NotFoundException("Уведомление не найдено.");
    }

    if (current.status === "published") {
      throw new BadRequestException("Отправленное уведомление не требует повторной постановки.");
    }

    const updated = await this.repository.updateStatus(notificationId, "pending");
    if (!updated) {
      throw new NotFoundException("Уведомление не найдено.");
    }

    return updated;
  }
}
