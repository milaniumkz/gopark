import type { UpdateSettingsRequest } from "@gopark/contracts";
import type { SettingsRepository } from "../../common/repositories/index.js";
import { seedSettingsOverview } from "../../data/seed.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export class SettingsPrismaRepository implements SettingsRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async getOverview() {
    const prisma = this._prisma.client;
    if (prisma) {
      const settings = await prisma.settings.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          payoutApprovalThreshold: true,
          defaultInstallmentDay: true,
          yandexSyncIntervalMinutes: true,
          bakaiWebhookEnabled: true,
          allowedStatusRequestTypes: true,
          notificationChannels: true,
          companies: true,
          customCrmRoles: true,
          crmRoleAccess: true,
        },
      });

      if (settings) {
        return settings;
      }
    }

    return seedSettingsOverview;
  }

  async updateOverview(input: UpdateSettingsRequest) {
    const prisma = this._prisma.client;
    if (prisma) {
      const current = await prisma.settings.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

      if (current) {
        return prisma.settings.update({
          where: { id: current.id },
          data: {
            payoutApprovalThreshold: input.payoutApprovalThreshold,
            defaultInstallmentDay: input.defaultInstallmentDay,
            yandexSyncIntervalMinutes: input.yandexSyncIntervalMinutes,
            bakaiWebhookEnabled: input.bakaiWebhookEnabled,
            allowedStatusRequestTypes: [...input.allowedStatusRequestTypes],
            notificationChannels: [...input.notificationChannels],
            companies: [...input.companies],
            customCrmRoles: input.customCrmRoles ?? [],
            crmRoleAccess: input.crmRoleAccess ?? {},
          },
          select: {
            payoutApprovalThreshold: true,
            defaultInstallmentDay: true,
            yandexSyncIntervalMinutes: true,
            bakaiWebhookEnabled: true,
            allowedStatusRequestTypes: true,
            notificationChannels: true,
            companies: true,
            customCrmRoles: true,
            crmRoleAccess: true,
          },
        });
      }

      return prisma.settings.create({
        data: {
          payoutApprovalThreshold: input.payoutApprovalThreshold,
          defaultInstallmentDay: input.defaultInstallmentDay,
          yandexSyncIntervalMinutes: input.yandexSyncIntervalMinutes,
          bakaiWebhookEnabled: input.bakaiWebhookEnabled,
          allowedStatusRequestTypes: [...input.allowedStatusRequestTypes],
          notificationChannels: [...input.notificationChannels],
          companies: [...input.companies],
          customCrmRoles: input.customCrmRoles ?? [],
          crmRoleAccess: input.crmRoleAccess ?? {},
        },
        select: {
          payoutApprovalThreshold: true,
          defaultInstallmentDay: true,
          yandexSyncIntervalMinutes: true,
          bakaiWebhookEnabled: true,
          allowedStatusRequestTypes: true,
          notificationChannels: true,
          companies: true,
          customCrmRoles: true,
          crmRoleAccess: true,
        },
      });
    }

    seedSettingsOverview.payoutApprovalThreshold = input.payoutApprovalThreshold;
    seedSettingsOverview.defaultInstallmentDay = input.defaultInstallmentDay;
    seedSettingsOverview.yandexSyncIntervalMinutes = input.yandexSyncIntervalMinutes;
    seedSettingsOverview.bakaiWebhookEnabled = input.bakaiWebhookEnabled;
    seedSettingsOverview.allowedStatusRequestTypes = [...input.allowedStatusRequestTypes];
    seedSettingsOverview.notificationChannels = [...input.notificationChannels];
    seedSettingsOverview.companies = [...input.companies];
    seedSettingsOverview.customCrmRoles = [...(input.customCrmRoles ?? [])];
    seedSettingsOverview.crmRoleAccess = input.crmRoleAccess ?? {};
    return seedSettingsOverview;
  }
}
