import type { CustomCrmRole, UserRole } from "@gopark/contracts";

export type CrmRouteKey =
  | "dashboard"
  | "vehicles"
  | "vehicle-detail"
  | "drivers"
  | "driver-detail"
  | "contracts"
  | "contract-detail"
  | "payments"
  | "service"
  | "parts"
  | "insurance-gps"
  | "inspections"
  | "fines"
  | "blacklist"
  | "writeoffs"
  | "imports"
  | "payouts"
  | "ledger"
  | "financial-ops"
  | "incidents"
  | "notifications"
  | "chats"
  | "support"
  | "reports"
  | "audit"
  | "outbox"
  | "users"
  | "settings";

export interface CrmNavigationItem {
  key: CrmRouteKey;
  label: string;
  to: string;
}

type WebRole = Exclude<UserRole, "driver">;
export type CrmRoleAccess = Partial<Record<string, string[]>>;
export type CrmCapability =
  | "create-car"
  | "create-driver"
  | "create-contract"
  | "create-payment"
  | "create-payout"
  | "early-payoff"
  | "writeoff-credit"
  | "manage-parts"
  | "approve-status-request"
  | "approve-payout"
  | "process-outbox";

export const crmAccessMatrix: Record<CrmRouteKey, readonly WebRole[]> = {
  dashboard: ["owner", "admin", "finance", "manager", "auditor"],
  vehicles: ["owner", "admin", "finance", "manager", "operator", "auditor"],
  "vehicle-detail": ["owner", "admin", "finance", "manager", "operator", "auditor"],
  drivers: ["owner", "admin", "finance", "manager", "operator", "auditor"],
  "driver-detail": ["owner", "admin", "finance", "manager", "operator", "auditor"],
  contracts: ["owner", "admin", "finance", "manager", "auditor"],
  "contract-detail": ["owner", "admin", "finance", "manager", "auditor"],
  payments: ["owner", "admin", "finance", "auditor"],
  service: ["owner", "admin", "finance", "manager", "auditor"],
  parts: ["owner", "admin", "finance", "manager", "operator", "auditor"],
  "insurance-gps": ["owner", "admin", "finance", "manager", "auditor"],
  inspections: ["owner", "admin", "finance", "manager", "auditor"],
  fines: ["owner", "admin", "finance", "manager", "auditor"],
  blacklist: ["owner", "admin", "finance", "manager", "auditor"],
  writeoffs: ["owner", "admin", "finance", "auditor"],
  imports: ["owner", "admin", "finance", "manager", "operator"],
  payouts: ["owner", "admin", "finance", "auditor"],
  ledger: ["owner", "admin", "finance", "auditor"],
  "financial-ops": ["owner", "admin", "finance", "auditor"],
  incidents: ["owner", "admin", "finance", "manager"],
  notifications: ["owner", "admin", "finance", "manager", "operator", "auditor"],
  chats: ["owner", "admin", "finance", "manager", "operator", "auditor"],
  support: ["owner", "admin", "finance", "manager", "operator", "auditor"],
  reports: ["owner", "admin", "finance", "auditor"],
  audit: ["owner", "admin", "auditor"],
  outbox: ["owner", "admin", "finance", "auditor"],
  users: ["owner", "admin", "auditor"],
  settings: ["owner", "admin", "finance"],
};

export const crmWebRoles: WebRole[] = ["owner", "admin", "finance", "manager", "operator", "auditor"];

export const crmAccessBlocks: CrmNavigationItem[] = [
  { key: "dashboard", label: "Главная", to: "/dashboard" },
  { key: "vehicles", label: "Автомобили", to: "/vehicles" },
  { key: "vehicle-detail", label: "Карточка автомобиля", to: "/vehicles/:carId" },
  { key: "drivers", label: "Водители", to: "/drivers" },
  { key: "driver-detail", label: "Карточка водителя", to: "/drivers/:driverId" },
  { key: "contracts", label: "Договоры", to: "/contracts" },
  { key: "contract-detail", label: "Карточка договора", to: "/contracts/:contractId" },
  { key: "payments", label: "Платежи", to: "/payments" },
  { key: "service", label: "СТО", to: "/service" },
  { key: "parts", label: "Запчасти", to: "/parts" },
  { key: "insurance-gps", label: "Страховка и ТО", to: "/insurance-gps" },
  { key: "inspections", label: "Осмотр", to: "/inspections" },
  { key: "fines", label: "Штрафы", to: "/fines" },
  { key: "blacklist", label: "Чёрный список", to: "/blacklist" },
  { key: "writeoffs", label: "Списания", to: "/writeoffs" },
  { key: "imports", label: "Импорт Excel", to: "/imports" },
  { key: "payouts", label: "Выплаты", to: "/payouts" },
  { key: "ledger", label: "Движение денежных средств", to: "/ledger" },
  { key: "financial-ops", label: "Финансы", to: "/financial-ops" },
  { key: "incidents", label: "Инциденты", to: "/incidents" },
  { key: "notifications", label: "Уведомления", to: "/notifications" },
  { key: "chats", label: "Чаты", to: "/chats" },
  { key: "support", label: "Служба поддержки", to: "/support" },
  { key: "reports", label: "Отчеты", to: "/reports" },
  { key: "audit", label: "События", to: "/audit" },
  { key: "outbox", label: "Очередь событий", to: "/outbox" },
  { key: "users", label: "Пользователи", to: "/users" },
  { key: "settings", label: "Настройки", to: "/settings" },
];

const crmCapabilityMatrix: Record<CrmCapability, readonly WebRole[]> = {
  "create-car": ["owner", "admin", "manager", "operator"],
  "create-driver": ["owner", "admin", "manager", "operator"],
  "create-contract": ["owner", "admin", "finance", "manager"],
  "create-payment": ["owner", "admin", "finance", "operator"],
  "create-payout": ["owner", "admin", "finance"],
  "early-payoff": ["owner", "admin", "finance"],
  "writeoff-credit": ["owner", "admin", "finance"],
  "manage-parts": ["owner", "admin", "finance", "manager", "operator"],
  "approve-status-request": ["owner", "admin", "finance", "manager"],
  "approve-payout": ["owner", "admin", "finance"],
  "process-outbox": ["owner", "admin", "finance"],
};

export const crmNavigationItems: CrmNavigationItem[] = [
  { key: "dashboard", label: "Главная", to: "/dashboard" },
  { key: "vehicles", label: "Автомобили", to: "/vehicles" },
  { key: "drivers", label: "Водители", to: "/drivers" },
  { key: "contracts", label: "Договоры", to: "/contracts" },
  { key: "payments", label: "Платежи", to: "/payments" },
  { key: "service", label: "СТО", to: "/service" },
  { key: "parts", label: "Запчасти", to: "/parts" },
  { key: "insurance-gps", label: "Страховка и ТО", to: "/insurance-gps" },
  { key: "inspections", label: "Осмотр", to: "/inspections" },
  { key: "fines", label: "Штрафы", to: "/fines" },
  { key: "blacklist", label: "Чёрный список", to: "/blacklist" },
  { key: "writeoffs", label: "Списания", to: "/writeoffs" },
  { key: "imports", label: "Импорт Excel", to: "/imports" },
  { key: "payouts", label: "Выплаты", to: "/payouts" },
  { key: "ledger", label: "Движение денежных средств", to: "/ledger" },
  { key: "financial-ops", label: "Финансы", to: "/financial-ops" },
  { key: "incidents", label: "Инциденты", to: "/incidents" },
  { key: "notifications", label: "Уведомления", to: "/notifications" },
  { key: "chats", label: "Чаты", to: "/chats" },
  { key: "support", label: "Служба поддержки", to: "/support" },
  { key: "reports", label: "Отчеты", to: "/reports" },
  { key: "audit", label: "События", to: "/audit" },
  { key: "outbox", label: "Очередь событий", to: "/outbox" },
  { key: "users", label: "Пользователи", to: "/users" },
  { key: "settings", label: "Настройки", to: "/settings" },
];

export function getDefaultRoleAccess(): CrmRoleAccess {
  return crmWebRoles.reduce<CrmRoleAccess>((acc, role) => {
    acc[role] = crmAccessBlocks
      .filter((block) => crmAccessMatrix[block.key].includes(role))
      .map((block) => block.key);
    return acc;
  }, {});
}

export function hasCrmAccess(
  role: UserRole,
  routeKey: CrmRouteKey,
  roleAccess?: CrmRoleAccess | null,
  customRoleKey?: string | null,
): boolean {
  if (role === "driver") {
    return false;
  }

  const accessKey = customRoleKey?.trim() || role;
  const customRoutes = roleAccess?.[accessKey];
  if (Array.isArray(customRoutes)) {
    return customRoutes.includes(routeKey);
  }

  return crmAccessMatrix[routeKey].includes(role);
}

export function getRoleAccessKeys(customRoles: CustomCrmRole[] = []): Array<WebRole | string> {
  return [...crmWebRoles, ...customRoles.map((role) => role.key)];
}

export function hasCrmCapability(
  role: UserRole,
  capability: CrmCapability,
  managerLevel?: "regular" | "senior" | null,
): boolean {
  if (role === "driver") {
    return false;
  }

  if (
    role === "manager"
    && ["create-car", "create-driver", "create-contract"].includes(capability)
    && managerLevel !== "senior"
  ) {
    return false;
  }

  return crmCapabilityMatrix[capability].includes(role);
}
