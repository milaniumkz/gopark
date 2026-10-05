import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ManagerAlertItem,
  NotificationChannel,
  NotificationListItem,
  NotificationTemplate,
} from "@gopark/contracts";
import {
  makeDriverRepository,
  makeManagerAlertRepository,
  makeNotificationRepository,
  makeSettingsRepository,
  makeUserRepository,
} from "../../common/application/repository.factory.js";
import type {
  DriverRepository,
  ManagerAlertRepository,
  NotificationRepository,
  SettingsRepository,
  UserRepository,
} from "../../common/repositories/index.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { FcmService } from "./fcm.service.js";

@Injectable()
export class NotificationsCreateService {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly managerAlertRepository: ManagerAlertRepository = makeManagerAlertRepository();
  private readonly repository: NotificationRepository = makeNotificationRepository();
  private readonly settingsRepository: SettingsRepository = makeSettingsRepository();
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(
    private readonly outboxService: OutboxService,
    private readonly fcmService: FcmService,
  ) {}

  async createDriverPayoutRequested(driverId: string) {
    return this.createDriverNotification(driverId, "payout_requested", "push", { notifyStakeholders: false });
  }

  async createDriverPayoutApproved(driverId: string) {
    return this.createDriverNotification(driverId, "payout_approved");
  }

  async createDriverPayoutRejected(driverId: string) {
    return this.createDriverNotification(driverId, "payout_rejected");
  }

  async createDriverPaymentRegistered(driverId: string) {
    return this.createDriverNotification(driverId, "payment_registered", "in_app", { notifyStakeholders: false });
  }

  async createManagerPaymentRegistered(driverId: string, amount: number) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    const alerts = await this.createDriverStakeholderAlerts(driverId, "Оплата водителя", `оплатил ${amount} сом`);
    return alerts[0] ?? null;
  }

  async createDriverStatusRequestCreated(driverId: string) {
    return this.createDriverNotification(driverId, "status_request_created", "in_app", { notifyStakeholders: false });
  }

  async createDriverStatusRequestApproved(driverId: string) {
    return this.createDriverNotification(driverId, "status_request_approved");
  }

  async createDriverStatusRequestRejected(driverId: string) {
    return this.createDriverNotification(driverId, "status_request_rejected");
  }

  async createDriverChatMessageReceived(driverId: string) {
    return this.createDriverNotification(driverId, "chat_message_received", "push");
  }

  async createManagerStatusRequestCreated(driverId: string, type: string, period: string) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    const title = "Новый запрос водителя";
    const details = `${driver.fullName}: ${this.statusRequestTypeLabel(type)} на ${period}`;
    const managerIds = new Set<string>();
    if (driver.managerId) {
      managerIds.add(driver.managerId);
    }

    const users = driver.companyName
      ? await this.userRepository.listAdminByCompany(driver.companyName)
      : await this.userRepository.listAdmin();
    for (const user of users) {
      if (user.role === "manager" && user.managerLevel === "senior" && user.managerProfileId) {
        managerIds.add(user.managerProfileId);
      }
    }

    const alerts = [];
    for (const managerId of managerIds) {
      alerts.push(await this.createManagerAlert({ managerId, title, details }));
    }

    if (alerts.length === 0) {
      await this.fcmService.sendToCrmStaffByManager(null, title, details).catch(() => undefined);
      return null;
    }

    return alerts[0];
  }

  async createManagerPayoutRequested(driverId: string, amount: number) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    const alerts = await this.createDriverStakeholderAlerts(driverId, "Заявка на выплату", `${amount} сом`);
    return alerts[0] ?? null;
  }

  async createManagerChatMessageReceived(driverId: string) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver?.managerId) {
      return null;
    }

    const alerts = [await this.createManagerAlert({
      managerId: driver.managerId,
      title: "Сообщение от водителя",
      details: `${driver.fullName}: новое сообщение в чате`,
    })];
    const users = driver.companyName
      ? await this.userRepository.listAdminByCompany(driver.companyName)
      : await this.userRepository.listAdmin();
    const seniorManagerIds = users
      .filter((user) => user.role === "manager" && user.managerLevel === "senior" && user.managerProfileId && user.managerProfileId !== driver.managerId)
      .map((user) => user.managerProfileId as string);

    for (const managerId of seniorManagerIds) {
      alerts.push(await this.createManagerAlert({
        managerId,
        title: "Сообщение водителя старшему",
        details: `${driver.fullName}: новое сообщение в чате`,
      }));
    }

    return alerts[0];
  }

  async createManagerPasswordResetRequested(driverId: string, login: string) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    const title = "Запрос на сброс пароля";
    const details = `${driver.fullName}: просит сбросить пароль. Номер: ${login}`;
    const alerts = [];

    if (driver.managerId) {
      alerts.push(await this.createManagerAlert({
        managerId: driver.managerId,
        title,
        details,
      }));
    }

    const users = driver.companyName
      ? await this.userRepository.listAdminByCompany(driver.companyName)
      : await this.userRepository.listAdmin();
    const seniorManagerIds = users
      .filter((user) => user.role === "manager" && user.managerLevel === "senior" && user.managerProfileId)
      .map((user) => user.managerProfileId as string);

    for (const managerId of seniorManagerIds) {
      if (managerId !== driver.managerId) {
        alerts.push(await this.createManagerAlert({
          managerId,
          title,
          details,
        }));
      }
    }

    if (alerts.length === 0) {
      await this.fcmService.sendToCrmStaffByManager(null, title, details).catch(() => undefined);
      return null;
    }

    return alerts[0];
  }

  async createManagerDriverEvent(driverId: string, title: string, details: string) {
    const alerts = await this.createDriverStakeholderAlerts(driverId, title, details);
    return alerts[0] ?? null;
  }

  async scheduleDriverInspectionReminder(driverId: string, body: string, scheduledAt: string) {
    const safeChannel = await this.resolveNotificationChannel("push");
    const title = "Осмотр автомобиля";
    const notification = await this.repository.create({
      driverId,
      channel: safeChannel,
      template: "inspection_reminder",
      createdAt: scheduledAt,
    });
    await this.outboxService.create("driver.inspection_reminder", "notification", notification.id, {
      notificationId: notification.id,
      driverId,
      title,
      body,
      scheduledAt,
    }, scheduledAt);
    return notification;
  }

  async createSeniorRiskStatusReviewRequested(
    driverId: string,
    seniorManagerId: string,
    requestedStatus: string,
    requestedByName: string,
  ) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    return this.createManagerAlert({
      managerId: seniorManagerId,
      title: "Заявка на риск-статус",
      details: `${driver.fullName}: ${this.riskStatusLabel(requestedStatus)} от ${requestedByName || "бригадира"}`,
    });
  }

  private async createDriverNotification(
    driverId: string,
    template: NotificationTemplate,
    channel: NotificationChannel = "push",
    options: { notifyStakeholders?: boolean } = {},
  ) {
    const safeChannel = await this.resolveNotificationChannel(channel);
    const title = this.notificationTitle(template);
    const body = this.notificationBody(template);

    const notification = await this.repository.create({
      driverId,
      channel: safeChannel,
      template,
    });
    await this.dispatchNotification(notification);
    await this.fcmService
      .sendToDriver(driverId, title, body)
      .catch(() => undefined);
    if (options.notifyStakeholders !== false) {
      await this.createDriverStakeholderAlerts(driverId, title, body);
    }
    return notification;
  }

  private async createDriverStakeholderAlerts(driverId: string, title: string, body: string) {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      await this.fcmService.sendToCrmStaffByDriver(driverId, title, body).catch(() => undefined);
      return [];
    }

    const managerIds = new Set<string>();
    if (driver.managerId) {
      managerIds.add(driver.managerId);
    }

    const users = driver.companyName
      ? await this.userRepository.listAdminByCompany(driver.companyName)
      : await this.userRepository.listAdmin();
    for (const user of users) {
      if (user.role === "manager" && user.managerLevel === "senior" && user.managerProfileId) {
        managerIds.add(user.managerProfileId);
      }
    }

    const details = `${driver.fullName}: ${body}`;
    const alerts = [];
    for (const managerId of managerIds) {
      alerts.push(await this.createManagerAlert({ managerId, title, details }));
    }

    if (alerts.length === 0) {
      await this.fcmService.sendToCrmStaffByDriver(driverId, title, details).catch(() => undefined);
    }

    return alerts;
  }

  private async createManagerAlert(input: Omit<ManagerAlertItem, "id">) {
    const alert = await this.managerAlertRepository.create(input);
    await this.dispatchManagerAlert(alert);
    await this.fcmService
      .sendToManager(alert.managerId, alert.title, alert.details)
      .catch(() => undefined);
    await this.fcmService
      .sendToCrmStaffByManager(alert.managerId, alert.title, alert.details)
      .catch(() => undefined);
    return alert;
  }

  private async dispatchNotification(notification: NotificationListItem): Promise<void> {
    try {
      await this.outboxService.create("notification.dispatch", "notification", notification.id, {
        notificationId: notification.id,
        driverId: notification.driverId ?? null,
        userId: notification.userId ?? null,
        channel: notification.channel,
        template: notification.template,
      });
    } catch (error) {
      console.warn(
        `[gopark-api] failed to dispatch notification ${notification.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async dispatchManagerAlert(alert: ManagerAlertItem): Promise<void> {
    try {
      await this.outboxService.create("manager_alert.dispatch", "manager_alert", alert.id, {
        alertId: alert.id,
        managerId: alert.managerId ?? null,
        title: alert.title,
        details: alert.details,
      });
    } catch (error) {
      console.warn(
        `[gopark-api] failed to dispatch manager alert ${alert.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async resolveNotificationChannel(channel: NotificationChannel): Promise<NotificationChannel> {
    const settings = await this.settingsRepository.getOverview();
    if (settings.notificationChannels.includes(channel)) {
      return channel;
    }

    if (settings.notificationChannels.includes("push")) {
      return "push";
    }

    if (settings.notificationChannels.includes("in_app")) {
      return "in_app";
    }

    throw new BadRequestException(`Unsupported notification channel: ${channel}`);
  }

  private statusRequestTypeLabel(type: string): string {
    switch (type) {
      case "day_off":
        return "выходной";
      case "vacation":
        return "отпрос";
      case "force_majeure":
        return "форс-мажор";
      case "sick_leave":
        return "больничный";
      default:
        return type;
    }
  }

  private riskStatusLabel(status: string): string {
    switch (status) {
      case "normal":
        return "нормальный";
      case "medium":
        return "средний";
      case "risk":
        return "зона риска";
      default:
        return status;
    }
  }

  private notificationTitle(template: NotificationTemplate): string {
    switch (template) {
      case "chat_message_received":
        return "Новое сообщение";
      case "status_request_approved":
        return "Заявка одобрена";
      case "status_request_rejected":
        return "Заявка отклонена";
      case "payout_approved":
        return "Выплата одобрена";
      case "payout_rejected":
        return "Выплата отклонена";
      case "payment_registered":
        return "Оплата принята";
      case "inspection_reminder":
        return "Осмотр автомобиля";
      default:
        return "GoPark";
    }
  }

  private notificationBody(template: NotificationTemplate): string {
    switch (template) {
      case "chat_message_received":
        return "Откройте чат, чтобы прочитать сообщение.";
      case "status_request_approved":
        return "Ваш запрос подтверждён.";
      case "status_request_rejected":
        return "Ваш запрос отклонён.";
      case "payout_approved":
        return "Заявка на выплату подтверждена.";
      case "payout_rejected":
        return "Заявка на выплату отклонена.";
      case "payment_registered":
        return "Платёж зарегистрирован в системе.";
      case "inspection_reminder":
        return "Напоминание об осмотре.";
      default:
        return "Новое уведомление.";
    }
  }
}
