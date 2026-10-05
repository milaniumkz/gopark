import { Controller, Get, Param, Post } from "@nestjs/common";
import type { NotificationListItem } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { NotificationsService } from "./notifications.service.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor", "driver")
  async listNotifications(@CurrentUser() currentUser: RequestUser | null): Promise<NotificationListItem[]> {
    if (currentUser?.companyName) {
      return this.notificationsService.listByCompany(currentUser.companyName);
    }

    return this.notificationsService.list();
  }

  @Post(":notificationId/retry")
  @Roles("owner", "admin", "finance", "manager", "operator")
  async retryNotification(
    @Param("notificationId") notificationId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<NotificationListItem> {
    return this.notificationsService.retry(notificationId, currentUser?.companyName ?? null);
  }
}
