import type { NotificationChannel, StatusRequestType } from "./contracts.js";

export type UserRole =
  | "owner"
  | "admin"
  | "finance"
  | "manager"
  | "operator"
  | "auditor"
  | "driver";

export type WebUserRole = Exclude<UserRole, "driver">;

export interface CustomCrmRole {
  key: string;
  label: string;
  baseRole: WebUserRole;
}

export type CrmRoleAccess = Partial<Record<string, string[]>>;

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface AuditEnvelope {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId: string;
  occurredAt: string;
}

export interface SettingsOverview {
  payoutApprovalThreshold: number;
  defaultInstallmentDay: number;
  yandexSyncIntervalMinutes: number;
  bakaiWebhookEnabled: boolean;
  allowedStatusRequestTypes: StatusRequestType[];
  notificationChannels: NotificationChannel[];
  companies: string[];
  customCrmRoles: CustomCrmRole[];
  crmRoleAccess: CrmRoleAccess;
}

export interface UpdateSettingsRequest {
  payoutApprovalThreshold: number;
  defaultInstallmentDay: number;
  yandexSyncIntervalMinutes: number;
  bakaiWebhookEnabled: boolean;
  allowedStatusRequestTypes: StatusRequestType[];
  notificationChannels: NotificationChannel[];
  companies: string[];
  customCrmRoles: CustomCrmRole[];
  crmRoleAccess: CrmRoleAccess;
}

export interface ApiHealthStatus {
  status: "ok";
  service: string;
  appRuntime: "api" | "worker";
  mode: "prisma" | "in-memory";
  prismaEnabled: boolean;
  databaseUrlConfigured: boolean;
  prismaClientAvailable: boolean;
  redisConfigured: boolean;
  bullmqAvailable: boolean;
  redisQueueReady: boolean;
  authTokenSecretConfigured: boolean;
  bearerAuthReady: boolean;
  bootstrapAuthEnabled: boolean;
  inMemoryProductionAllowed: boolean;
  productionStartupSafe: boolean;
}

export interface OutboxProcessResult {
  mode: "inline" | "queued";
  processedCount: number;
  processed: string[];
  queuedCount: number;
  queued: string[];
}

export interface OutboxEventItem {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  status: "pending" | "queued" | "published" | "failed";
  createdAt: string;
}

export interface ChatThreadItem {
  id: string;
  driverId: string | null;
  managerId: string | null;
  subject: string;
  status: "open" | "closed";
  driverName: string | null;
  managerName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface ChatMessageItem {
  id: string;
  threadId: string;
  senderUserId: string | null;
  senderRole: UserRole;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface ChatThreadDetail extends ChatThreadItem {
  messages: ChatMessageItem[];
}

export interface CreateChatThreadRequest {
  driverId?: string | null;
  managerId?: string | null;
  subject?: string | null;
  body: string;
}

export interface SendChatMessageRequest {
  body: string;
}

export interface YandexDriverBalance {
  driverId: string;
  amount: number;
  currency: "KGS";
  syncedAt: string;
}

export interface BakaiWebhookAck {
  accepted: true;
  payload: unknown;
}
