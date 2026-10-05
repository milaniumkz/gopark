import type {
  ContractDetail,
  ContractListItem,
  DashboardOverview,
  DashboardSummary,
  DriverDebtSummary,
  DriverListItem,
  DriverPaymentScheduleItem,
  DriverStatusRequestItem,
  LedgerEntry,
  ManagerAlertItem,
  ManagerIncidentItem,
  ManagerQuickActionItem,
  Money,
  AuditLogItem,
  ObligationListItem,
  NotificationListItem,
  OutboxEventItem,
  PaymentListItem,
  PayoutListItem,
  UserRole,
  VehicleListItem,
  SettingsOverview,
} from "@gopark/contracts";

export const seedDrivers: DriverListItem[] = [
  {
    id: "drv_1",
    fullName: "Бакыт Алиев",
    phone: "+996 555 123 456",
    companyName: null,
    weeklyDayOff: "sunday",
    status: "active",
    riskStatus: "normal",
    managerId: "mgr_1",
    activeContractId: "ctr_1",
    creditBalance: 0,
  },
  {
    id: "drv_2",
    fullName: "Эмир Токтогулов",
    phone: "+996 555 234 567",
    companyName: null,
    weeklyDayOff: "friday",
    status: "active",
    riskStatus: "normal",
    managerId: "mgr_2",
    activeContractId: "ctr_2",
    creditBalance: 0,
  },
];

export const seedCars: VehicleListItem[] = [
  {
    id: "car_1",
    plateNumber: "01 KG 1234",
    vin: "LGXC16EF5P0123456",
    make: "Hyundai",
    model: "Solaris",
    companyName: null,
    productionYear: 2023,
    mileage: 15000,
    color: "White",
    status: "assigned",
    assignedDriverId: "drv_1",
    purchasePrice: 780000,
    customsCost: 65000,
    deliveryCost: 25000,
    repairCost: 18000,
    targetSalePrice: 940000,
    totalAcquisitionCost: 888000,
  },
  {
    id: "car_2",
    plateNumber: "01 KG 5678",
    vin: "Z94CB41AABR123456",
    make: "Kia",
    model: "Rio",
    companyName: null,
    productionYear: 2022,
    mileage: 42000,
    color: "Gray",
    status: "assigned",
    assignedDriverId: "drv_2",
    purchasePrice: 420000,
    customsCost: 40000,
    deliveryCost: 18000,
    repairCost: 12000,
    targetSalePrice: 560000,
    totalAcquisitionCost: 490000,
  },
];

export const seedDashboard: DashboardSummary = {
  activeDrivers: 125,
  activeCars: 112,
  debtTotal: 190000,
  pendingPayouts: 12,
};

export const seedDashboardOverview: DashboardOverview = {
  plannedPayment: 5670000,
  actualPayment: 5480000,
  debt: 190000,
  overpayment: 45000,
  drivers: {
    total: 135,
    active: 125,
    paid: 98,
    unpaid: 27,
    dayoff: 5,
    vacation: 3,
  },
  vehicles: {
    installment: 112,
    office: 8,
    customs: 3,
    accident: 2,
    idle: 6,
    writtenOff: 0,
    sold: 4,
  },
};

export const seedSettingsOverview: SettingsOverview = {
  payoutApprovalThreshold: 10000,
  defaultInstallmentDay: 15,
  yandexSyncIntervalMinutes: 30,
  bakaiWebhookEnabled: true,
  allowedStatusRequestTypes: ["day_off", "vacation", "force_majeure"],
  notificationChannels: ["push", "sms", "in_app"],
  companies: [],
  customCrmRoles: [],
  crmRoleAccess: {
    owner: [
      "dashboard", "vehicles", "vehicle-detail", "drivers", "driver-detail", "contracts", "contract-detail",
      "payments", "service", "parts", "insurance-gps", "inspections", "fines", "blacklist", "writeoffs",
      "imports", "payouts", "ledger", "financial-ops", "incidents", "notifications", "chats", "support",
      "reports", "audit", "outbox", "users", "settings",
    ],
    admin: [
      "dashboard", "vehicles", "vehicle-detail", "drivers", "driver-detail", "contracts", "contract-detail",
      "payments", "service", "parts", "insurance-gps", "inspections", "fines", "blacklist", "writeoffs",
      "imports", "payouts", "ledger", "financial-ops", "incidents", "notifications", "chats", "support",
      "reports", "audit", "outbox", "users", "settings",
    ],
    finance: [
      "dashboard", "vehicles", "vehicle-detail", "drivers", "driver-detail", "contracts", "contract-detail",
      "payments", "service", "parts", "insurance-gps", "inspections", "fines", "blacklist", "writeoffs",
      "imports", "payouts", "ledger", "financial-ops", "incidents", "notifications", "chats", "support",
      "reports", "outbox", "settings",
    ],
    manager: [
      "dashboard", "vehicles", "vehicle-detail", "drivers", "driver-detail", "contracts", "contract-detail", "service",
      "parts", "insurance-gps", "inspections", "fines", "blacklist", "imports", "incidents", "notifications",
      "chats", "support",
    ],
    operator: ["vehicles", "vehicle-detail", "drivers", "driver-detail", "parts", "imports", "notifications", "chats", "support"],
    auditor: [
      "dashboard", "vehicles", "vehicle-detail", "drivers", "driver-detail", "contracts", "contract-detail",
      "payments", "service", "parts", "insurance-gps", "inspections", "fines", "blacklist", "writeoffs",
      "payouts", "ledger", "financial-ops", "notifications", "chats", "support", "reports", "audit",
      "outbox", "users",
    ],
  },
};

function money(amount: string): Money {
  return {
    amount,
    currency: "KGS",
  };
}

export const seedLedger: LedgerEntry[] = [
  {
    id: "led_1",
    accountId: "acct_driver_1",
    contractId: "ctr_1",
    driverId: "drv_1",
    type: "payment",
    money: money("25000"),
    postedAt: "2025-04-01T09:00:00.000Z",
    externalReference: "bakai-payment-1",
  },
  {
    id: "led_2",
    accountId: "acct_driver_1",
    contractId: "ctr_1",
    driverId: "drv_1",
    type: "obligation",
    money: money("30000"),
    postedAt: "2025-04-02T09:00:00.000Z",
  },
];

export const seedContracts: ContractListItem[] = [
  {
    id: "ctr_1",
    driverId: "drv_1",
    carId: "car_1",
    status: "active",
    contractNumber: "GP-2025-0001",
    financedAmount: 850000,
    installmentAmount: 30000,
    monthlyInsuranceAmount: 2500,
    monthlyGpsAmount: 800,
    termMonths: 24,
    startDate: "2025-01-15",
    endDate: "2027-01-14",
    currentDebt: 23000,
    nextDueDate: "2026-03-15",
    nextDueAmount: 5000,
    hasDeferredPayment: false,
  },
  {
    id: "ctr_2",
    driverId: "drv_2",
    carId: "car_2",
    status: "active",
    contractNumber: "GP-2025-0002",
    financedAmount: 320000,
    installmentAmount: 25000,
    monthlyInsuranceAmount: 2200,
    monthlyGpsAmount: 700,
    termMonths: 18,
    startDate: "2025-02-01",
    endDate: "2026-08-01",
    currentDebt: 13000,
    nextDueDate: "2026-03-15",
    nextDueAmount: 13000,
    hasDeferredPayment: false,
  },
];

export const seedContractDetails: ContractDetail[] = [
  {
    id: "ctr_1",
    driverId: "drv_1",
    carId: "car_1",
    status: "active",
    contractNumber: "GP-2025-0001",
    financedAmount: 850000,
    installmentAmount: 30000,
    monthlyInsuranceAmount: 2500,
    monthlyGpsAmount: 800,
    principalAmount: 1000000,
    installmentDay: 15,
    termMonths: 24,
    startDate: "2025-01-15",
    endDate: "2027-01-14",
    currentDebt: 23000,
    nextDueDate: "2026-03-15",
    nextDueAmount: 5000,
    hasDeferredPayment: false,
    schedule: [
      {
        id: "obl_1",
        driverId: "drv_1",
        contractId: "ctr_1",
        type: "installment",
        amount: 30000,
        paidAmount: 25000,
        dueDate: "2026-03-15",
      },
    ],
  },
  {
    id: "ctr_2",
    driverId: "drv_2",
    carId: "car_2",
    status: "active",
    contractNumber: "GP-2025-0002",
    financedAmount: 320000,
    installmentAmount: 25000,
    monthlyInsuranceAmount: 2200,
    monthlyGpsAmount: 700,
    principalAmount: 450000,
    installmentDay: 15,
    termMonths: 18,
    startDate: "2025-02-01",
    endDate: "2026-08-01",
    currentDebt: 13000,
    nextDueDate: "2026-03-15",
    nextDueAmount: 13000,
    hasDeferredPayment: false,
    schedule: [
      {
        id: "obl_2",
        driverId: "drv_2",
        contractId: "ctr_2",
        type: "installment",
        amount: 25000,
        paidAmount: 12000,
        dueDate: "2026-03-15",
      },
    ],
  },
];

export const seedPayments: PaymentListItem[] = [
  {
    id: "pay_1",
    driverId: "drv_1",
    contractId: "ctr_1",
    amount: 25000,
    appliedAmount: 25000,
    unappliedAmount: 0,
    status: "succeeded",
    provider: "bakai",
    createdAt: "2025-04-01T09:00:00.000Z",
  },
  {
    id: "pay_2",
    driverId: "drv_2",
    contractId: "ctr_2",
    amount: 12000,
    appliedAmount: 12000,
    unappliedAmount: 0,
    status: "processing",
    provider: "bakai",
    createdAt: "2025-04-03T09:00:00.000Z",
  },
];

export const seedDriverCreditBalances: Record<string, number> = {
  drv_1: 0,
  drv_2: 0,
};

export const seedPayouts: PayoutListItem[] = [
  {
    id: "po_1",
    driverId: "drv_1",
    amount: 8500,
    status: "requested",
    createdAt: "2025-04-02T10:30:00.000Z",
  },
];

export const seedDriverFinanceProfiles: Record<
  string,
  {
    yandexBalance: number;
  }
> = {
  drv_1: {
    yandexBalance: 45680,
  },
  drv_2: {
    yandexBalance: 28750,
  },
};

export const seedOutboxEvents: OutboxEventItem[] = [
  {
    id: "evt_1",
    topic: "payment.created",
    aggregateType: "payment",
    aggregateId: "pay_1",
    payload: { paymentId: "pay_1" },
    status: "pending" as const,
    createdAt: "2025-04-01T10:00:00.000Z",
  },
];

export const seedObligations: ObligationListItem[] = [
  {
    id: "obl_1",
    driverId: "drv_1",
    contractId: "ctr_1",
    type: "installment",
    amount: 30000,
    paidAmount: 25000,
    dueDate: "2026-03-15",
  },
  {
    id: "obl_2",
    driverId: "drv_2",
    contractId: "ctr_2",
    type: "installment",
    amount: 25000,
    paidAmount: 12000,
    dueDate: "2026-03-15",
  },
];

export const seedUsers: Array<{
  id: string;
  login: string;
  password: string;
  passwordHash?: string;
  mustChangePassword?: boolean;
  requestUserId: string;
  refreshTokenVersion: number;
  role: UserRole;
  customRoleKey?: string | null;
  status: string;
  mfaEnabled: boolean;
  displayName: string;
  companyName?: string | null;
  managerLevel?: "regular" | "senior" | null;
  seniorManagerId?: string | null;
}> = [
  {
    id: "usr_4",
    login: "owner@gopark.local",
    password: "owner123",
    requestUserId: "usr_4",
    refreshTokenVersion: 0,
    role: "owner",
    status: "active",
    mfaEnabled: true,
    displayName: "GoPark Owner",
    companyName: null,
  },
  {
    id: "usr_1",
    login: "admin@gopark.local",
    password: "admin123",
    requestUserId: "usr_1",
    refreshTokenVersion: 0,
    role: "admin",
    status: "active",
    mfaEnabled: true,
    displayName: "GoPark Admin",
    companyName: null,
  },
  {
    id: "usr_5",
    login: "finance@gopark.local",
    password: "finance123",
    requestUserId: "usr_5",
    refreshTokenVersion: 0,
    role: "finance",
    status: "active",
    mfaEnabled: true,
    displayName: "Айжан Финансы",
    companyName: null,
  },
  {
    id: "usr_3",
    login: "manager@gopark.local",
    password: "manager123",
    requestUserId: "mgr_1",
    refreshTokenVersion: 0,
    role: "manager",
    status: "active",
    mfaEnabled: false,
    displayName: "Нурлан Менеджер",
    companyName: null,
  },
  {
    id: "usr_6",
    login: "operator@gopark.local",
    password: "operator123",
    requestUserId: "usr_6",
    refreshTokenVersion: 0,
    role: "operator",
    status: "active",
    mfaEnabled: false,
    displayName: "Оператор GoPark",
    companyName: null,
  },
  {
    id: "usr_7",
    login: "auditor@gopark.local",
    password: "auditor123",
    requestUserId: "usr_7",
    refreshTokenVersion: 0,
    role: "auditor",
    status: "active",
    mfaEnabled: true,
    displayName: "Аудитор GoPark",
    companyName: null,
  },
  {
    id: "usr_2",
    login: "+996555123456",
    password: "driver123",
    requestUserId: "drv_1",
    refreshTokenVersion: 0,
    role: "driver",
    status: "active",
    mfaEnabled: false,
    displayName: "Алексей Иванов",
    companyName: null,
  },
];

export const seedDriverDebtSummary: DriverDebtSummary = {
  driverId: "drv_1",
  totalDebt: 23000,
  creditBalance: 0,
  overdueDebt: 0,
  nextPaymentAmount: 12500,
  nextPaymentDate: "2026-03-15",
};

export const seedDriverStatusRequests: DriverStatusRequestItem[] = [
  {
    id: "req_1",
    driverId: "drv_1",
    type: "vacation",
    status: "approved",
    period: "2026-04-01 .. 2026-04-07",
    createdAt: "2026-03-10T09:00:00.000Z",
  },
  {
    id: "req_2",
    driverId: "drv_1",
    type: "day_off",
    status: "pending",
    period: "2026-03-20",
    createdAt: "2026-03-18T08:30:00.000Z",
  },
];

export const seedDriverPaymentSchedule: DriverPaymentScheduleItem[] = [
  {
    id: "sch_1",
    type: "installment",
    dueDate: "2026-03-15",
    amount: 12500,
    paidAmount: 0,
    status: "planned",
  },
  {
    id: "sch_2",
    type: "installment",
    dueDate: "2026-02-15",
    amount: 12500,
    paidAmount: 12500,
    status: "paid",
  },
];

export const seedManagerAlerts: ManagerAlertItem[] = [
  {
    id: "alert_1",
    title: "Просрочка платежа",
    details: "Эмир Токтогулов · 23 000 сом",
    managerId: "mgr_2",
  },
  {
    id: "alert_2",
    title: "Страховка истекает",
    details: "2 автомобиля · срок менее 7 дней",
    managerId: "mgr_1",
  },
];

export const seedManagerQuickActions: ManagerQuickActionItem[] = [
  {
    id: "action_1",
    label: "Позвонить водителю",
    target: "Эмир Токтогулов",
    managerId: "mgr_2",
  },
  {
    id: "action_2",
    label: "Сменить статус",
    target: "Бакыт Алиев",
    managerId: "mgr_1",
  },
  {
    id: "action_3",
    label: "Открыть кейс просрочки",
    target: "Долг > 20 000 сом",
    managerId: "mgr_2",
  },
];

export const seedManagerIncidents: ManagerIncidentItem[] = [
  {
    id: "inc_1",
    title: "Просрочка платежа",
    incidentType: "finance",
    status: "open",
    priority: "high",
    driverId: "drv_2",
  },
  {
    id: "inc_2",
    title: "Страховка истекает",
    incidentType: "insurance",
    status: "open",
    priority: "medium",
    carId: "car_1",
  },
];

export const seedNotifications: NotificationListItem[] = [
  {
    id: "ntf_1",
    userId: "usr_1",
    channel: "push",
    template: "payout_requested",
    status: "pending",
    createdAt: "2026-03-18T10:00:00.000Z",
  },
];

export const seedAuditLogs: AuditLogItem[] = [
  {
    id: "aud_1",
    action: "driver.created",
    entityType: "driver",
    entityId: "drv_1",
    correlationId: "corr_1",
    createdAt: "2025-04-01T08:00:00.000Z",
  },
];
