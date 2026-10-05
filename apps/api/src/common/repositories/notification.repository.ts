import type { NotificationListItem } from "@gopark/contracts";

export interface NotificationRepository {
  list(): Promise<NotificationListItem[]>;
  listByCompany(companyName: string): Promise<NotificationListItem[]>;
  getById(notificationId: string): Promise<NotificationListItem | null>;
  updateStatus(notificationId: string, status: NotificationListItem["status"]): Promise<NotificationListItem | null>;
  countPendingByDriverOrUser(driverId: string, userId: string | null): Promise<number>;
  create(input: Omit<NotificationListItem, "id" | "status">): Promise<NotificationListItem>;
}
