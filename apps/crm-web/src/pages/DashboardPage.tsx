import { Link } from "react-router-dom";
import { useState } from "react";
import { useEffect, useMemo } from "react";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import type {
  AuditLogItem,
  ContractListItem,
  DashboardOverview,
  DriverListItem,
  LedgerEntry,
  ManagerAssignedDriverItem,
  ManagerDashboardSummary,
  ManagerDriverDetail,
  ManagerIncidentItem,
  NotificationListItem,
  OutboxEventItem,
  PaymentListItem,
  PayoutListItem,
  UserAdminListItem,
  VehicleListItem,
} from "@gopark/contracts";
import { fetchJson, fetchJsonWithQuery, patchJson, postJson } from "../lib/api";
import {
  downloadCsv,
  formatCurrency,
  formatDateOnly,
  formatDueDateLabel,
  getNotificationStatusLabel,
  getOutboxStatusLabel,
  getStatusLabel,
  getUserRoleLabel,
  isPastDate,
} from "../lib/utils";
import { VEHICLE_MAKE_OPTIONS, getVehicleModelOptions } from "../lib/vehicleCatalog";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { useAuth } from "../ui/AuthContext";
import { useApiQuery } from "../hooks/useApiQuery";
import {
  CarIcon,
  ContractsIcon,
  DashboardIcon,
  DriversIcon,
  FinanceIcon,
  IncidentIcon,
  PaymentsIcon,
  ReportsIcon,
  ShieldIcon,
  WalletIcon,
} from "../ui/CrmIcons";

interface DashboardStatusQueueItem {
  driverId: string;
  driverName: string;
  requestId: string;
  type: string;
  period: string;
}

function getVehicleRiskReasons(
  vehicle: VehicleListItem,
  contractCountByCarId: Map<string, number>,
  longestTermMonthsByCarId: Map<string, number>,
  activeContractByCarId: Map<string, ContractListItem>,
): string[] {
  const reasons: string[] = [];
  if (vehicle.status === "maintenance") {
    reasons.push("ремонт");
  }
  if (vehicle.status === "accident") {
    reasons.push("ДТП");
  }
  if (vehicle.status === "impound") {
    reasons.push("штрафстоянка");
  }
  if (vehicle.status === "idle") {
    reasons.push("простой");
  }
  if (vehicle.status === "written_off") {
    reasons.push("списан");
  }
  if ((vehicle.mileage ?? 0) >= 150000) {
    reasons.push("большой пробег");
  }
  if ((contractCountByCarId.get(vehicle.id) ?? 0) > 1) {
    reasons.push("частая смена водителей");
  }
  if ((longestTermMonthsByCarId.get(vehicle.id) ?? 0) >= 24) {
    reasons.push("долгий срок");
  }
  const activeContract = activeContractByCarId.get(vehicle.id);
  if (activeContract?.nextDueDate && activeContract.currentDebt > 0 && isPastDate(activeContract.nextDueDate)) {
    reasons.push("просрочка по договору");
  }
  return reasons;
}

interface DashboardRecentStatusRequestItem {
  driverId: string;
  driverName: string;
  requestId: string;
  type: string;
  period: string;
  status: string;
}

interface DashboardOverdueDriverItem {
  driverId: string;
  driverName: string;
  overdueDebt: number;
  contractId: string | null;
}

interface DashboardPaymentDueDriverItem {
  driverId: string;
  driverName: string;
  amount: number;
  dueDate: string | null;
  contractId: string | null;
}

type DashboardIdleVehicleFilter = "all" | "office" | "accident" | "maintenance" | "idle" | "impound" | "written_off";

interface DashboardCreditDriverItem {
  driverId: string;
  driverName: string;
  creditBalance: number;
}

function resolveWeeklyDayOffIndex(weeklyDayOff?: string | null): number | null {
  switch (weeklyDayOff) {
    case "sunday":
      return 0;
    case "monday":
      return 1;
    case "tuesday":
      return 2;
    case "wednesday":
      return 3;
    case "thursday":
      return 4;
    case "friday":
      return 5;
    case "saturday":
      return 6;
    default:
      return null;
  }
}

function normalizeComparableValue(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function normalizePhoneValue(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\d+]/g, "");
}

function calculatePayableDays(startDate: string, endDate: string, weeklyDayOff?: string | null): number {
  if (!startDate || !endDate) {
    return 0;
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    return 0;
  }

  const weeklyDayOffIndex = resolveWeeklyDayOffIndex(weeklyDayOff);
  let payableDays = 0;
  for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (weeklyDayOffIndex !== null && cursor.getUTCDay() === weeklyDayOffIndex) {
      continue;
    }

    payableDays += 1;
  }

  return payableDays;
}

function calculateTermMonthsFromDates(startDate: string, endDate: string): number {
  if (!startDate || !endDate) {
    return 0;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return 0;
  }

  const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);
  return Math.max(1, Math.ceil(diffDays / 30));
}

function calculateEndDateFromPayableDays(startDate: string, payableDays: number, weeklyDayOff?: string | null): string {
  if (!startDate || !Number.isInteger(payableDays) || payableDays <= 0) {
    return "";
  }

  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime())) {
    return "";
  }

  const weeklyDayOffIndex = resolveWeeklyDayOffIndex(weeklyDayOff);
  let remaining = payableDays;
  while (remaining > 0) {
    if (weeklyDayOffIndex === null || cursor.getUTCDay() !== weeklyDayOffIndex) {
      remaining -= 1;
    }

    if (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return cursor.toISOString().slice(0, 10);
}

function resolveMonthlyAmount(value: string, mode: "monthly" | "daily"): number | undefined {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  return mode === "daily" ? amount * 30 : amount;
}

function toOptionalNumber(value: string): number | undefined {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function getLocalDateOnly(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDashboardPeriodRange(period: "today" | "week" | "month" | "year"): { startDate: string; endDate: string } {
  const start = new Date(`${getLocalDateOnly()}T00:00:00.000Z`);
  const end = new Date(start);
  const days = period === "today" ? 0 : period === "week" ? 6 : period === "month" ? 29 : 364;
  end.setUTCDate(end.getUTCDate() + days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function DashboardPage() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("today");
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardOverview | null>(null);
  const [statusQueueLoading, setStatusQueueLoading] = useState(false);
  const [statusQueueError, setStatusQueueError] = useState<string | null>(null);
  const [statusQueue, setStatusQueue] = useState<DashboardStatusQueueItem[]>([]);
  const [recentStatusRequests, setRecentStatusRequests] = useState<DashboardRecentStatusRequestItem[]>([]);
  const [overdueQueue, setOverdueQueue] = useState<DashboardOverdueDriverItem[]>([]);
  const [paymentDueQueue, setPaymentDueQueue] = useState<DashboardPaymentDueDriverItem[]>([]);
  const [creditQueue, setCreditQueue] = useState<DashboardCreditDriverItem[]>([]);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [queueActionError, setQueueActionError] = useState<string | null>(null);
  const [pendingStatusActionId, setPendingStatusActionId] = useState<string | null>(null);
  const [selectedStatusRequestIds, setSelectedStatusRequestIds] = useState<string[]>([]);
  const [bulkStatusActionLoading, setBulkStatusActionLoading] = useState(false);
  const [contractMessage, setContractMessage] = useState<string | null>(null);
  const [pendingContractActionId, setPendingContractActionId] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryProcessing, setDeliveryProcessing] = useState(false);
  const [deliveryRetrying, setDeliveryRetrying] = useState(false);
  const [incidentMessage, setIncidentMessage] = useState<string | null>(null);
  const [pendingIncidentActionId, setPendingIncidentActionId] = useState<string | null>(null);
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  const [bulkPayoutActionLoading, setBulkPayoutActionLoading] = useState(false);
  const [pendingPayoutActionId, setPendingPayoutActionId] = useState<string | null>(null);
  const [payoutActionMessage, setPayoutActionMessage] = useState<string | null>(null);
  const [payoutActionError, setPayoutActionError] = useState<string | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateMessage, setQuickCreateMessage] = useState<string | null>(null);
  const [quickDriverFirstName, setQuickDriverFirstName] = useState("");
  const [quickDriverLastName, setQuickDriverLastName] = useState("");
  const [quickDriverPhone, setQuickDriverPhone] = useState("");
  const [quickDriverNearestRelativePhone, setQuickDriverNearestRelativePhone] = useState("");
  const [quickDriverLicenseNumber, setQuickDriverLicenseNumber] = useState("");
  const [quickDriverPassportNumber, setQuickDriverPassportNumber] = useState("");
  const [quickDriverWeeklyDayOff, setQuickDriverWeeklyDayOff] = useState("");
  const [quickManagerId, setQuickManagerId] = useState("");
  const [quickVin, setQuickVin] = useState("");
  const [quickPlateNumber, setQuickPlateNumber] = useState("");
  const [quickMake, setQuickMake] = useState("");
  const [quickModel, setQuickModel] = useState("");
  const quickModelOptions = getVehicleModelOptions(quickMake);
  const [quickCompanyName, setQuickCompanyName] = useState(session.companyName?.trim() || "");
  const [quickProductionYear, setQuickProductionYear] = useState("");
  const [quickMileage, setQuickMileage] = useState("");
  const [quickContractNumber, setQuickContractNumber] = useState("");
  const [quickPrincipalAmount, setQuickPrincipalAmount] = useState("1000000");
  const [quickDailyPayment, setQuickDailyPayment] = useState("2300");
  const [quickInsuranceAmount, setQuickInsuranceAmount] = useState("");
  const [quickInsuranceMode, setQuickInsuranceMode] = useState<"monthly" | "daily">("monthly");
  const [quickGpsAmount, setQuickGpsAmount] = useState("");
  const [quickGpsMode, setQuickGpsMode] = useState<"monthly" | "daily">("monthly");
  const [quickHasOsago, setQuickHasOsago] = useState(false);
  const [quickOsagoStartDate, setQuickOsagoStartDate] = useState("");
  const [quickHasCasco, setQuickHasCasco] = useState(false);
  const [quickCascoStartDate, setQuickCascoStartDate] = useState("");
  const [quickStartDate, setQuickStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [quickEndDate, setQuickEndDate] = useState("");
  const [idleVehicleFilter, setIdleVehicleFilter] = useState<DashboardIdleVehicleFilter>("all");
  const paymentPeriodRange = getDashboardPeriodRange(period);
  const [dashboardDateFrom, setDashboardDateFrom] = useState(paymentPeriodRange.startDate);
  const [dashboardDateTo, setDashboardDateTo] = useState(paymentPeriodRange.endDate);
  const dashboardDateEnd = dashboardDateTo || dashboardDateFrom;
  const dashboardCompanyQuery = companyFilter !== "all" ? `&companyName=${encodeURIComponent(companyFilter)}` : "";
  const dashboardPeriodQuery = `paymentDateFrom=${encodeURIComponent(dashboardDateFrom)}&paymentDateTo=${encodeURIComponent(dashboardDateEnd)}${dashboardCompanyQuery}`;
  const dashboardActualPaymentsQuery = `view=actual&status=succeeded&${dashboardPeriodQuery}`;
  const dashboardDebtQuery = `status=payment_due&dueDateFrom=${encodeURIComponent(dashboardDateFrom)}&dueDateTo=${encodeURIComponent(dashboardDateEnd)}${dashboardCompanyQuery}`;
  const todayDate = getLocalDateOnly();
  const dashboardTodayDebtQuery = `status=payment_due&dueDateFrom=${encodeURIComponent(todayDate)}&dueDateTo=${encodeURIComponent(todayDate)}${dashboardCompanyQuery}`;
  const managerSummary = useApiQuery<ManagerDashboardSummary>("mobile/manager/summary");
  const effectiveDriversApi = useApiQuery<ManagerAssignedDriverItem[]>("mobile/manager/drivers");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const notificationsApi = useApiQuery<NotificationListItem[]>("notifications");
  const outboxApi = useApiQuery<OutboxEventItem[]>("outbox");
  const ledgerApi = useApiQuery<LedgerEntry[]>("ledger/entries");
  const auditApi = useApiQuery<AuditLogItem[]>("audit/logs");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canOpenReports = hasCrmAccess(session.requestUserRole, "reports");
  const canApproveStatusRequest = hasCrmCapability(session.requestUserRole, "approve-status-request");
  const canApprovePayout = hasCrmCapability(session.requestUserRole, "approve-payout");
  const canEditContract = hasCrmCapability(session.requestUserRole, "create-contract", session.managerLevel);
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const canOpenPayments = hasCrmAccess(session.requestUserRole, "payments");
  const canOpenNotifications = hasCrmAccess(session.requestUserRole, "notifications");
  const canOpenOutbox = hasCrmAccess(session.requestUserRole, "outbox");
  const canOpenUsers = hasCrmAccess(session.requestUserRole, "users");
  const canOpenSettings = hasCrmAccess(session.requestUserRole, "settings");
  const canCreateCar = hasCrmCapability(session.requestUserRole, "create-car", session.managerLevel);
  const canCreateDriver = hasCrmCapability(session.requestUserRole, "create-driver", session.managerLevel);
  const canProcessOutbox = hasCrmCapability(session.requestUserRole, "process-outbox");
  const canRetryNotifications = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const canUpdateIncident = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const effectiveDriverMap = new Map((effectiveDriversApi.data ?? []).map((item) => [item.id, item]));
  const driverCompanyMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const driverCreditMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.creditBalance]));
  const vehicleCompanyMap = new Map((vehiclesApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const vehicleMap = new Map((vehiclesApi.data ?? []).map((item) => [item.id, item.plateNumber]));
  const companies = settingsApi.data?.companies ?? [];
  const managerOptions = (usersApi.data ?? []).filter((item) => item.role === "manager" && item.managerProfileId);
  const managerCards = managerOptions
    .filter((manager) => companyFilter === "all" || (manager.companyName ?? "") === companyFilter)
    .map((manager) => {
      const managerProfileId = manager.managerProfileId ?? "";
      const managerDrivers = (driversApi.data ?? []).filter((driver) =>
        driver.managerId === managerProfileId
        && (companyFilter === "all" || (driver.companyName ?? "") === companyFilter),
      );
      const managerCars = (vehiclesApi.data ?? []).filter((vehicle) =>
        vehicle.assignedDriverId
        && managerDrivers.some((driver) => driver.id === vehicle.assignedDriverId),
      );

      return {
        id: manager.id,
        managerProfileId,
        displayName: manager.displayName,
        managerLevel: manager.managerLevel,
        companyName: manager.companyName ?? "",
        driversCount: managerDrivers.length,
        carsCount: managerCars.length,
      };
    })
    .sort((left, right) => right.driversCount - left.driversCount || left.displayName.localeCompare(right.displayName, "ru"));
  const canUseQuickCreate = canCreateCar && canCreateDriver && canEditContract;
  const quickTermMonths = useMemo(() => calculateTermMonthsFromDates(quickStartDate, quickEndDate), [quickEndDate, quickStartDate]);
  const quickPayableDays = useMemo(
    () => calculatePayableDays(quickStartDate, quickEndDate, quickDriverWeeklyDayOff || null),
    [quickDriverWeeklyDayOff, quickEndDate, quickStartDate],
  );

  useEffect(() => {
    setDashboardDateFrom(paymentPeriodRange.startDate);
    setDashboardDateTo(paymentPeriodRange.endDate);
  }, [paymentPeriodRange.endDate, paymentPeriodRange.startDate]);
  const matchesCompany = (driverId?: string | null, carId?: string | null): boolean => {
    if (companyFilter === "all") {
      return true;
    }

    return (driverId ? driverCompanyMap.get(driverId) : "") === companyFilter
      || (carId ? vehicleCompanyMap.get(carId) : "") === companyFilter;
  };
  const activeContracts = (contractsApi.data ?? []).filter((item) => item.status === "active");
  const activeContractMap = new Map(activeContracts.map((item) => [item.id, item]));
  const activeContractIds = new Set(activeContracts.map((item) => item.id));
  const activeContractRecordIdByCarId = new Map(
    activeContracts
      .map((item) => [item.carId, item.id]),
  );
  const contractCountByCarId = (contractsApi.data ?? []).reduce<Map<string, number>>((acc, item) => {
    acc.set(item.carId, (acc.get(item.carId) ?? 0) + 1);
    return acc;
  }, new Map());
  const recentDrivers = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, 4)
    .map((item) => {
      const effectiveDriver = effectiveDriverMap.get(item.id);
      const effectiveContractId = effectiveDriver?.contractId ?? item.activeContractId;

      return {
        ...item,
        activeContractId: effectiveContractId && activeContractMap.has(effectiveContractId) ? effectiveContractId : null,
      };
    });
  const recentVehicles = [...(vehiclesApi.data ?? [])]
    .filter((item) => matchesCompany(item.assignedDriverId, item.id))
    .sort((left, right) => left.plateNumber.localeCompare(right.plateNumber))
    .slice(0, 4);
  const topContracts = [...activeContracts]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.currentDebt > 0)
    .sort((left, right) => right.currentDebt - left.currentDebt)
    .slice(0, 4);
  const recentContracts = [...(contractsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 4);
  const recentlyClosedContracts = [...(contractsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "closed")
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 4);
  const upcomingContracts = [...activeContracts]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.nextDueDate && item.nextDueAmount && item.nextDueAmount > 0)
    .sort((left, right) => (left.nextDueDate ?? "").localeCompare(right.nextDueDate ?? ""))
    .slice(0, 4);
  const activeContractByCarId = activeContracts.reduce<Map<string, ContractListItem>>((acc, item) => {
    acc.set(item.carId, item);
    return acc;
  }, new Map());
  const longestTermMonthsByCarId = (contractsApi.data ?? []).reduce<Map<string, number>>((acc, item) => {
    acc.set(item.carId, Math.max(acc.get(item.carId) ?? 0, item.termMonths ?? 0));
    return acc;
  }, new Map());
  const riskyVehicles = [...(vehiclesApi.data ?? [])]
    .filter((item) => matchesCompany(item.assignedDriverId, item.id))
    .filter((item) => getVehicleRiskReasons(item, contractCountByCarId, longestTermMonthsByCarId, activeContractByCarId).length > 0)
    .slice(0, 4);
  const idleVehicleFilters: Array<{ value: DashboardIdleVehicleFilter; label: string }> = [
    { value: "all", label: "Все" },
    { value: "office", label: "В офисе" },
    { value: "accident", label: "ДТП" },
    { value: "maintenance", label: "Ремонт" },
    { value: "idle", label: "Простой" },
    { value: "impound", label: "Штрафстоянка" },
    { value: "written_off", label: "Списанные" },
  ];
  const idleVehicleStatuses = new Set(["free", "office", "accident", "maintenance", "idle", "impound", "written_off"]);
  const idleVehicleStatusMatches = (vehicle: VehicleListItem, filter: DashboardIdleVehicleFilter) => {
    if (filter === "all") {
      return idleVehicleStatuses.has(vehicle.status);
    }
    if (filter === "office") {
      return vehicle.status === "office" || vehicle.status === "free";
    }
    return vehicle.status === filter;
  };
  const idleVehicles = [...(vehiclesApi.data ?? [])]
    .filter((item) => matchesCompany(item.assignedDriverId, item.id))
    .filter((item) => idleVehicleStatusMatches(item, idleVehicleFilter))
    .sort((left, right) => {
      const leftPriority = left.status === "accident" ? 0 : left.status === "maintenance" ? 1 : left.status === "written_off" ? 2 : left.status === "impound" ? 3 : 4;
      const rightPriority = right.status === "accident" ? 0 : right.status === "maintenance" ? 1 : right.status === "written_off" ? 2 : right.status === "impound" ? 3 : 4;
      return leftPriority - rightPriority || left.plateNumber.localeCompare(right.plateNumber, "ru");
    })
    .slice(0, 12);
  const openIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open")
    .sort((left, right) => {
      if (left.priority === right.priority) {
        return left.title.localeCompare(right.title);
      }
      if (left.priority === "high") {
        return -1;
      }
      if (right.priority === "high") {
        return 1;
      }
      return 0;
    })
    .slice(0, 4);
  const archivedIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived").length;
  const incidentsByVehicleId = new Map<string, number>();

  for (const item of incidentsApi.data ?? []) {
    if (!item.carId) {
      continue;
    }

    incidentsByVehicleId.set(item.carId, (incidentsByVehicleId.get(item.carId) ?? 0) + 1);
  }

  const recentPayouts = useMemo(
    () => [...(payoutsApi.data ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 4),
    [payoutsApi.data],
  );
  const requestedRecentPayouts = useMemo(
    () => recentPayouts.filter((item) => item.status === "requested"),
    [recentPayouts],
  );
  const requestedPayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of payoutsApi.data ?? []) {
      if (item.status !== "requested") {
        continue;
      }

      amounts.set(item.driverId, (amounts.get(item.driverId) ?? 0) + item.amount);
    }

    return amounts;
  }, [payoutsApi.data]);
  const yandexBalanceByDriverId = new Map((effectiveDriversApi.data ?? []).map((item) => [item.id, item.yandexBalance]));
  const availablePayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of driversApi.data ?? []) {
      amounts.set(
        item.id,
        Math.max(
          0,
          (yandexBalanceByDriverId.get(item.id) ?? 0) - (requestedPayoutAmountByDriverId.get(item.id) ?? 0) - 100,
        ),
      );
    }

    return amounts;
  }, [driversApi.data, requestedPayoutAmountByDriverId, yandexBalanceByDriverId]);
  const recentNotifications = [...(notificationsApi.data ?? [])]
    .sort((left, right) => right.id.localeCompare(left.id))
    .slice(0, 4);
  const recentOutboxEvents = [...(outboxApi.data ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);
  const recentLedgerEntries = [...(ledgerApi.data ?? [])]
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .slice(0, 4);
  const recentObligationEntries = [...(ledgerApi.data ?? [])]
    .filter((item) => item.type === "obligation" && !!item.contractId && activeContractIds.has(item.contractId))
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .slice(0, 4);
  const recentCreditEntries = [...(ledgerApi.data ?? [])]
    .filter((item) => item.type === "adjustment" || item.type === "refund")
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .slice(0, 4);

  async function handleIncidentAction(incidentId: string, status: "resolved" | "closed" | "archived"): Promise<void> {
    setIncidentMessage(null);
    setPendingIncidentActionId(incidentId);
    try {
      const updated = await patchJson<ManagerIncidentItem | null, { status: string }>(`incidents/${incidentId}`, { status });
      if (!updated) {
        setIncidentMessage("Инцидент не найден.");
        return;
      }

      setIncidentMessage(
        status === "resolved"
          ? "Инцидент переведён в решённые."
          : status === "closed"
            ? "Инцидент закрыт."
            : "Инцидент отправлен в архив.",
      );
      await incidentsApi.refetch();
    } catch (error) {
      setIncidentMessage(error instanceof Error ? error.message : "Не удалось обновить инцидент.");
    } finally {
      setPendingIncidentActionId(null);
    }
  }

  async function handleContractAction(contractId: string, status: ContractListItem["status"]): Promise<void> {
    setContractMessage(null);
    setPendingContractActionId(contractId);
    try {
      await patchJson(`contracts/${contractId}`, { status });
      setContractMessage(
        status === "active"
          ? "Договор возвращён в работу."
          : status === "closed"
            ? "Договор отмечен как выкупленный."
            : status === "defaulted"
              ? "Договор отмечен как проблемный."
              : "Договор отмечен как расторгнутый.",
      );
      await contractsApi.refetch();
    } catch (error) {
      setContractMessage(error instanceof Error ? error.message : "Не удалось обновить договор.");
    } finally {
      setPendingContractActionId(null);
    }
  }
  const recentAuditLogs = [...(auditApi.data ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);
  const usersWithoutMfa = [...(usersApi.data ?? [])]
    .filter((item) => !item.mfaEnabled)
    .slice(0, 4);
  const recentPayments = [...(paymentsApi.data ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);
  const failedNotificationCount = (notificationsApi.data ?? []).filter((item) => item.status === "failed").length;
  const failedOutboxCount = (outboxApi.data ?? []).filter((item) => item.status === "failed").length;
  const pendingOutboxCount = (outboxApi.data ?? []).filter(
    (item) => item.status === "pending" || item.status === "queued",
  ).length;
  const retryableNotificationIds = (notificationsApi.data ?? [])
    .filter((item) => item.status === "failed" || item.status === "pending")
    .map((item) => item.id);
  const retryableOutboxIds = (outboxApi.data ?? [])
    .filter((item) => item.status === "failed" || item.status === "pending" || item.status === "queued")
    .map((item) => item.id);
  const selectedPayoutCount = selectedPayoutIds.length;
  const allPayoutsSelected = requestedRecentPayouts.length > 0 && selectedPayoutCount === requestedRecentPayouts.length;
  const selectedStatusCount = selectedStatusRequestIds.length;
  const allStatusSelected = statusQueue.length > 0 && selectedStatusCount === statusQueue.length;
  const deliveryIssues = [
    ...(notificationsApi.data ?? [])
      .filter((item) => item.status === "failed" || item.status === "pending")
      .sort((left, right) => (left.status === "failed" ? -1 : 1) - (right.status === "failed" ? -1 : 1))
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        label: item.driverId ? `${driverMap.get(item.driverId) ?? "Водитель"} · уведомление` : "Уведомление",
        detail: item.status === "failed" ? "Ошибка доставки уведомления" : "Уведомление ожидает отправки",
        to: canOpenNotifications ? "/notifications" : null,
        actionLabel: "Открыть уведомления",
      })),
    ...(outboxApi.data ?? [])
      .filter((item) => item.status === "failed" || item.status === "pending" || item.status === "queued")
      .sort((left, right) => (left.status === "failed" ? -1 : 1) - (right.status === "failed" ? -1 : 1))
      .slice(0, 4)
      .map((item) => ({
        id: item.id,
        label: item.aggregateType === "driver"
          ? `${driverMap.get(item.aggregateId) ?? "Водитель"} · событие`
          : "Событие интеграции",
        detail:
          item.status === "failed"
            ? "Ошибка отправки события"
            : item.status === "queued"
              ? "Событие стоит в очереди"
              : "Событие ожидает обработку",
        to: canOpenOutbox ? "/outbox" : null,
        actionLabel: canProcessOutbox ? "Открыть очередь событий" : "Открыть события",
      })),
  ].slice(0, 6);

  async function handleRetryNotifications(notificationIds: string[]): Promise<void> {
    if (!notificationIds.length) {
      return;
    }

    setDeliveryError(null);
    setDeliveryMessage(null);
    setDeliveryRetrying(true);
    try {
      for (const notificationId of notificationIds) {
        await postJson<NotificationListItem, Record<string, never>>(`notifications/${notificationId}/retry`, {});
      }
      setDeliveryMessage(`Переотправка поставлена для ${notificationIds.length} уведомлений.`);
      await notificationsApi.refetch();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Не удалось поставить уведомления в повторную отправку.");
    } finally {
      setDeliveryRetrying(false);
    }
  }

  async function handleRetryOutbox(outboxIds: string[]): Promise<void> {
    if (!outboxIds.length) {
      return;
    }

    setDeliveryError(null);
    setDeliveryMessage(null);
    setDeliveryRetrying(true);
    try {
      for (const eventId of outboxIds) {
        await postJson<OutboxEventItem, Record<string, never>>(`outbox/${eventId}/retry`, {});
      }
      setDeliveryMessage(`Переочередь поставлена для ${outboxIds.length} событий.`);
      await outboxApi.refetch();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Не удалось поставить события в повторную обработку.");
    } finally {
      setDeliveryRetrying(false);
    }
  }

  function handleExport(): void {
    if (!stats) {
      return;
    }

    downloadCsv(`gopark-dashboard-${period}.csv`, [
      ["period", period],
      ["planned_payment", stats.plannedPayment],
      ["actual_payment", stats.actualPayment],
      ["debt", stats.debt],
      ["overpayment", stats.overpayment],
      ["drivers_total", stats.drivers.total],
      ["drivers_active", stats.drivers.active],
      ["drivers_paid", stats.drivers.paid],
      ["drivers_unpaid", stats.drivers.unpaid],
      ["drivers_dayoff", stats.drivers.dayoff],
      ["drivers_vacation", stats.drivers.vacation],
      ["vehicles_installment", stats.vehicles.installment],
      ["vehicles_office", stats.vehicles.office],
      ["vehicles_customs", stats.vehicles.customs],
      ["vehicles_accident", stats.vehicles.accident],
      ["vehicles_idle", stats.vehicles.idle],
      ["vehicles_sold", stats.vehicles.sold],
    ]);
  }

  useEffect(() => {
    const principal = Number(quickPrincipalAmount);
    const dailyPayment = Number(quickDailyPayment);
    if (!quickStartDate || !Number.isFinite(principal) || !Number.isFinite(dailyPayment) || principal <= 0 || dailyPayment <= 0) {
      return;
    }

    const nextEndDate = calculateEndDateFromPayableDays(quickStartDate, Math.ceil(principal / dailyPayment), quickDriverWeeklyDayOff || null);
    if (nextEndDate && nextEndDate !== quickEndDate) {
      setQuickEndDate(nextEndDate);
    }
  }, [quickDailyPayment, quickDriverWeeklyDayOff, quickEndDate, quickPrincipalAmount, quickStartDate]);

  async function handleQuickCreateDriverCarContract(): Promise<void> {
    if (!canUseQuickCreate) {
      setQuickCreateMessage("Для этого действия нужны права на создание водителя, авто и договора.");
      return;
    }

    if (!quickDriverFirstName || !quickDriverLastName || !quickDriverPhone) {
      setQuickCreateMessage("Заполните имя, фамилию и телефон водителя.");
      return;
    }

    if (!quickVin || !quickPlateNumber || !quickMake || !quickModel) {
      setQuickCreateMessage("Заполните VIN, госномер, марку и модель авто.");
      return;
    }

    if (!quickStartDate || !quickEndDate || Number(quickPrincipalAmount) <= 0 || Number(quickDailyPayment) <= 0 || quickTermMonths <= 0) {
      setQuickCreateMessage("Заполните сумму договора, ежедневный платёж и даты.");
      return;
    }

    if (!quickContractNumber.trim()) {
      setQuickCreateMessage("Введите номер договора вручную.");
      return;
    }

    const normalizedPhone = normalizePhoneValue(quickDriverPhone);
    const existingDriver = (driversApi.data ?? []).find((driver) => normalizePhoneValue(driver.phone) === normalizedPhone);

    const normalizedVin = normalizeComparableValue(quickVin);
    const normalizedPlateNumber = normalizeComparableValue(quickPlateNumber);
    const existingVehicle = (vehiclesApi.data ?? []).find(
      (vehicle) => normalizeComparableValue(vehicle.vin) === normalizedVin || normalizeComparableValue(vehicle.plateNumber) === normalizedPlateNumber,
    );
    if (existingVehicle) {
      setQuickCreateMessage(`Авто с таким VIN или госномером уже есть: ${existingVehicle.plateNumber}. Используйте существующую карточку авто.`);
      return;
    }

    const resolvedContractNumber = quickContractNumber.trim();
    const normalizedContractNumber = normalizeComparableValue(resolvedContractNumber);
    const existingContract = (contractsApi.data ?? []).find((contract) => normalizeComparableValue(contract.contractNumber) === normalizedContractNumber);
    if (existingContract) {
      setQuickCreateMessage(`Договор с номером ${resolvedContractNumber} уже существует. Укажите другой номер договора.`);
      return;
    }

    setQuickCreateLoading(true);
    setQuickCreateMessage(null);
    try {
      const driver = existingDriver ?? await postJson<DriverListItem, {
          firstName: string;
          lastName: string;
          phone: string;
          nearestRelativePhone?: string;
          licenseNumber?: string;
          passportNumber?: string;
          companyName?: string;
          weeklyDayOff?: string;
          managerId?: string;
        }>("drivers", {
          firstName: quickDriverFirstName,
          lastName: quickDriverLastName,
          phone: quickDriverPhone,
          nearestRelativePhone: quickDriverNearestRelativePhone || undefined,
          licenseNumber: quickDriverLicenseNumber || undefined,
          passportNumber: quickDriverPassportNumber || undefined,
          companyName: quickCompanyName || undefined,
          weeklyDayOff: quickDriverWeeklyDayOff || undefined,
          managerId: quickManagerId || undefined,
        });

      const car = await postJson<VehicleListItem, {
        vin: string;
        plateNumber: string;
        make: string;
        model: string;
        companyName?: string;
        productionYear?: number;
        mileage?: number;
      }>("cars", {
        vin: quickVin,
        plateNumber: quickPlateNumber,
        make: quickMake,
        model: quickModel,
        companyName: quickCompanyName || undefined,
        productionYear: quickProductionYear ? Number(quickProductionYear) : undefined,
        mileage: toOptionalNumber(quickMileage),
      });

      const contract = await postJson<ContractListItem, {
        driverId: string;
        carId: string;
        contractNumber: string;
        principalAmount: number;
        financedAmount: number;
        installmentAmount: number;
        monthlyInsuranceAmount?: number;
        monthlyGpsAmount?: number;
        insuranceBillingMode?: "monthly" | "daily";
        gpsBillingMode?: "monthly" | "daily";
        handoverMileage?: number;
        hasOsago?: boolean;
        osagoStartDate?: string;
        hasCasco?: boolean;
        cascoStartDate?: string;
        installmentDay: number;
        termMonths: number;
        startDate: string;
        endDate: string;
      }>("contracts", {
        driverId: driver.id,
        carId: car.id,
        contractNumber: resolvedContractNumber,
        principalAmount: Number(quickPrincipalAmount),
        financedAmount: Number(quickPrincipalAmount),
        installmentAmount: Number(quickDailyPayment),
        monthlyInsuranceAmount: toOptionalNumber(quickInsuranceAmount),
        monthlyGpsAmount: toOptionalNumber(quickGpsAmount),
        insuranceBillingMode: quickInsuranceMode,
        gpsBillingMode: quickGpsMode,
        handoverMileage: toOptionalNumber(quickMileage),
        hasOsago: quickHasOsago,
        osagoStartDate: quickHasOsago ? quickOsagoStartDate || undefined : undefined,
        hasCasco: quickHasCasco,
        cascoStartDate: quickHasCasco ? quickCascoStartDate || undefined : undefined,
        installmentDay: new Date(quickEndDate).getDate() || 15,
        termMonths: quickTermMonths,
        startDate: quickStartDate,
        endDate: quickEndDate,
      });

      await Promise.all([driversApi.refetch(), vehiclesApi.refetch(), contractsApi.refetch()]);
      setQuickCreateMessage(
        [
          existingDriver ? `Водитель найден: ${driver.fullName}.` : `Водитель добавлен: ${driver.fullName}.`,
          `Автомобиль добавлен: ${car.plateNumber} (${car.make} ${car.model}).`,
          `Договор добавлен: ${contract.contractNumber}.`,
          `Связка готова: ${driver.fullName} закреплён за авто ${car.plateNumber} по договору ${contract.contractNumber}.`,
        ].join(" "),
      );
      setQuickDriverFirstName("");
      setQuickDriverLastName("");
      setQuickDriverPhone("");
      setQuickDriverNearestRelativePhone("");
      setQuickDriverLicenseNumber("");
      setQuickDriverPassportNumber("");
      setQuickDriverWeeklyDayOff("");
      setQuickManagerId("");
      setQuickVin("");
      setQuickPlateNumber("");
      setQuickMake("");
      setQuickModel("");
      setQuickProductionYear("");
      setQuickMileage("");
      setQuickContractNumber("");
      setQuickPrincipalAmount("1000000");
      setQuickDailyPayment("2300");
      setQuickInsuranceAmount("");
      setQuickGpsAmount("");
      setQuickInsuranceMode("monthly");
      setQuickGpsMode("monthly");
      setQuickHasOsago(false);
      setQuickOsagoStartDate("");
      setQuickHasCasco(false);
      setQuickCascoStartDate("");
      setQuickStartDate(new Date().toISOString().slice(0, 10));
      setQuickEndDate("");
    } catch (quickCreateError) {
      setQuickCreateMessage(quickCreateError instanceof Error ? quickCreateError.message : "Не удалось создать водителя, авто и договор.");
    } finally {
      setQuickCreateLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchJsonWithQuery<DashboardOverview>("dashboard/overview", {
      period,
      startDate: dashboardDateFrom,
      endDate: dashboardDateEnd,
      ...(companyFilter !== "all" ? { companyName: companyFilter } : {}),
    })
      .then((payload) => {
        if (!cancelled) {
          setStats(payload);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyFilter, dashboardDateEnd, dashboardDateFrom, period]);

  useEffect(() => {
    if (!canApproveStatusRequest) {
      setStatusQueue([]);
      setSelectedStatusRequestIds([]);
      setRecentStatusRequests([]);
      setOverdueQueue([]);
      setPaymentDueQueue([]);
      setCreditQueue([]);
      setStatusQueueError(null);
      setStatusQueueLoading(false);
      return;
    }

    let cancelled = false;
    setStatusQueueLoading(true);
    setStatusQueueError(null);

    fetchJson<ManagerAssignedDriverItem[]>("mobile/manager/drivers")
      .then(async (drivers) => {
        const details = await Promise.all(
          drivers.slice(0, 12).map((driver) =>
            fetchJson<ManagerDriverDetail>(`mobile/manager/drivers/${driver.id}`).catch(() => null),
          ),
        );

        if (cancelled) {
          return;
        }

        const queueItems = details
          .filter((item): item is ManagerDriverDetail => item !== null)
          .flatMap((item) =>
            item.recentStatusRequests
              .filter((request) => request.status === "pending")
              .map((request) => ({
                driverId: item.id,
                driverName: item.fullName,
                requestId: request.id,
                type: request.type,
                period: request.period,
              })),
          )
          .slice(0, 6);

        const recentRequests = details
          .filter((item): item is ManagerDriverDetail => item !== null)
          .flatMap((item) =>
            item.recentStatusRequests.map((request) => ({
              driverId: item.id,
              driverName: item.fullName,
              requestId: request.id,
              type: request.type,
              period: request.period,
              status: request.status,
            })),
          )
          .slice(0, 6);

        const overdueItems = drivers
          .filter((item) => item.overdueDebt > 0)
          .sort((left, right) => right.overdueDebt - left.overdueDebt)
          .slice(0, 6)
          .map((item) => ({
            driverId: item.id,
            driverName: item.fullName,
            overdueDebt: item.overdueDebt,
            contractId: item.contractId,
          }));

        const today = getLocalDateOnly();
        const paymentDueItems = drivers
          .filter((item) => (item.nextPaymentAmount ?? 0) > 0 && Boolean(item.nextPaymentDate) && (item.nextPaymentDate ?? "") <= today)
          .sort((left, right) => (left.nextPaymentDate ?? "").localeCompare(right.nextPaymentDate ?? "") || right.nextPaymentAmount - left.nextPaymentAmount)
          .slice(0, 8)
          .map((item) => ({
            driverId: item.id,
            driverName: item.fullName,
            amount: item.nextPaymentAmount,
            dueDate: item.nextPaymentDate,
            contractId: item.contractId,
          }));

        const creditItems = drivers
          .filter((item) => item.creditBalance > 0)
          .sort((left, right) => right.creditBalance - left.creditBalance)
          .slice(0, 6)
          .map((item) => ({
            driverId: item.id,
            driverName: item.fullName,
            creditBalance: item.creditBalance,
          }));

        setStatusQueue(queueItems);
        setRecentStatusRequests(recentRequests);
        setOverdueQueue(overdueItems);
        setPaymentDueQueue(paymentDueItems);
        setCreditQueue(creditItems);
        setStatusQueueLoading(false);
      })
      .catch((fetchError: Error) => {
        if (!cancelled) {
          setStatusQueueError(fetchError.message);
          setStatusQueueLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canApproveStatusRequest]);

  useEffect(() => {
    setSelectedStatusRequestIds((current) =>
      current.filter((requestId) => statusQueue.some((item) => item.requestId === requestId)),
    );
  }, [statusQueue]);

  useEffect(() => {
    setSelectedPayoutIds((current) =>
      current.filter((payoutId) => requestedRecentPayouts.some((item) => item.id === payoutId)),
    );
  }, [requestedRecentPayouts]);

  function toggleStatusRequestSelection(requestId: string): void {
    setSelectedStatusRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  function toggleSelectAllStatusRequests(): void {
    setSelectedStatusRequestIds(allStatusSelected ? [] : statusQueue.map((item) => item.requestId));
  }

  async function handleBulkStatusQueueAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedStatusRequestIds.length) {
      setQueueActionError("Выберите хотя бы один запрос.");
      return;
    }

    setQueueMessage(null);
    setQueueActionError(null);
    setBulkStatusActionLoading(true);
    let processedCount = 0;

    try {
      for (const requestId of selectedStatusRequestIds) {
        await postJson<{ status: string }, Record<string, never>>(
          `approvals/status-requests/${requestId}/${action}`,
          {},
        );
        processedCount += 1;
      }

      setStatusQueue((current) => current.filter((item) => !selectedStatusRequestIds.includes(item.requestId)));
      setSelectedStatusRequestIds([]);
      setQueueMessage(
        action === "approve"
          ? `Подтверждено ${processedCount} запросов.`
          : `Отклонено ${processedCount} запросов.`,
      );
      void managerSummary.refetch();
    } catch (error) {
      setQueueActionError(error instanceof Error ? error.message : "Не удалось выполнить массовую обработку запросов.");
    } finally {
      setBulkStatusActionLoading(false);
    }
  }

  function togglePayoutSelection(payoutId: string): void {
    setSelectedPayoutIds((current) =>
      current.includes(payoutId) ? current.filter((id) => id !== payoutId) : [...current, payoutId],
    );
  }

  function toggleSelectAllPayouts(): void {
    setSelectedPayoutIds(allPayoutsSelected ? [] : requestedRecentPayouts.map((item) => item.id));
  }

  async function handlePayoutAction(action: "approve" | "reject", payoutId: string): Promise<void> {
    setPayoutActionMessage(null);
    setPayoutActionError(null);
    setPendingPayoutActionId(payoutId);

    try {
      const result = await postJson<PayoutListItem, Record<string, never>>(
        `approvals/payouts/${payoutId}/${action}`,
        {},
      );
      await payoutsApi.refetch();
      setPayoutActionMessage(
        action === "approve"
          ? `Заявка на ${formatCurrency(result.amount)} одобрена.`
          : `Заявка на ${formatCurrency(result.amount)} отклонена.`,
      );
    } catch (error) {
      setPayoutActionError(error instanceof Error ? error.message : "Не удалось обработать заявку на вывод.");
    } finally {
      setPendingPayoutActionId(null);
    }
  }

  async function handleBulkPayoutAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedPayoutIds.length) {
      setPayoutActionError("Выберите хотя бы одну заявку на вывод.");
      return;
    }

    setPayoutActionMessage(null);
    setPayoutActionError(null);
    setBulkPayoutActionLoading(true);
    let processedCount = 0;
    let processedAmount = 0;

    try {
      for (const payoutId of selectedPayoutIds) {
        const result = await postJson<PayoutListItem, Record<string, never>>(
          `approvals/payouts/${payoutId}/${action}`,
          {},
        );
        processedCount += 1;
        processedAmount += result.amount;
      }

      await payoutsApi.refetch();
      setSelectedPayoutIds([]);
      setPayoutActionMessage(
        action === "approve"
          ? `Массово одобрено ${processedCount} заявок на ${formatCurrency(processedAmount)}.`
          : `Массово отклонено ${processedCount} заявок на ${formatCurrency(processedAmount)}.`,
      );
    } catch (error) {
      setPayoutActionError(error instanceof Error ? error.message : "Не удалось выполнить массовую обработку выводов.");
    } finally {
      setBulkPayoutActionLoading(false);
    }
  }

  return (
    <section className="page-stack dashboard-page">
      <div className="hero-card hero-card--dashboard dashboard-quick-header">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <DashboardIcon width={18} height={18} />
            <span>Главная</span>
          </div>
          <h2>Добрый день</h2>
          <p>Сводка парка и действия за выбранный период.</p>
        </div>
        <div className="hero-card__actions">
          <div className="period-switcher" role="tablist" aria-label="Период обзора">
            {(["today", "week", "month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`period-switcher__item${period === value ? " period-switcher__item--active" : ""}`}
                onClick={() => setPeriod(value)}
              >
                {value === "today" ? "Сегодня" : value === "week" ? "Неделя" : value === "month" ? "Месяц" : "Год"}
              </button>
            ))}
          </div>
          <div className="toolbar toolbar--hero">
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              aria-label="Дата начала периода"
              type="date"
              value={dashboardDateFrom}
              onChange={(event) => setDashboardDateFrom(event.target.value)}
            />
            <input
              aria-label="Дата окончания периода"
              type="date"
              value={dashboardDateTo}
              onChange={(event) => setDashboardDateTo(event.target.value)}
            />
            {canCreateCar && canCreateDriver ? (
              <button type="button" onClick={() => setIsQuickCreateOpen(true)}>
                <DriversIcon width={16} height={16} />
                <span>Добавить водителя</span>
              </button>
            ) : null}
            {canOpenReports ? (
              <>
                <Link className="button-link" to="/reports">
                  <ReportsIcon width={16} height={16} />
                  <span>Экспорт и отчёты</span>
                </Link>
                {stats ? (
                  <button type="button" onClick={handleExport}>
                    <PaymentsIcon width={16} height={16} />
                    <span>Скачать CSV</span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {!canOpenReports ? (
          <ReadOnlyNotice message="Для этой роли доступны обзор и рабочие разделы." />
        ) : null}
      </div>
      {isQuickCreateOpen ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            onClick={() => setIsQuickCreateOpen(false)}
            aria-label="Закрыть быстрое добавление"
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="dashboard-quick-create-title">
            <div className="entity-modal__header">
              <div>
                <span className="layout-settings__eyebrow">Быстрое добавление</span>
                <h3 id="dashboard-quick-create-title">Водитель, авто и договор</h3>
                <p>Заполните данные один раз: CRM создаст водителя, автомобиль и активный договор.</p>
              </div>
              <button type="button" className="topbar__button" onClick={() => setIsQuickCreateOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="entity-modal__body quick-form">
              {!canUseQuickCreate ? (
                <ReadOnlyNotice message="Для полного сценария нужны права на создание водителя, авто и договора." />
              ) : null}
              <p className="quick-form__title">Водитель</p>
              <div className="form-grid">
                <input value={quickDriverFirstName} onChange={(event) => setQuickDriverFirstName(event.target.value)} placeholder="Имя" />
                <input value={quickDriverLastName} onChange={(event) => setQuickDriverLastName(event.target.value)} placeholder="Фамилия" />
                <input value={quickDriverPhone} onChange={(event) => setQuickDriverPhone(event.target.value)} placeholder="Телефон" />
                <input value={quickDriverNearestRelativePhone} onChange={(event) => setQuickDriverNearestRelativePhone(event.target.value)} placeholder="Телефон родственника" />
                <input value={quickDriverLicenseNumber} onChange={(event) => setQuickDriverLicenseNumber(event.target.value)} placeholder="Вод. удостоверение" />
                <input value={quickDriverPassportNumber} onChange={(event) => setQuickDriverPassportNumber(event.target.value)} placeholder="Удостоверение личности" />
                <select value={quickDriverWeeklyDayOff} onChange={(event) => setQuickDriverWeeklyDayOff(event.target.value)}>
                  <option value="">Выходной не выбран</option>
                  <option value="monday">Понедельник</option>
                  <option value="tuesday">Вторник</option>
                  <option value="wednesday">Среда</option>
                  <option value="thursday">Четверг</option>
                  <option value="friday">Пятница</option>
                  <option value="saturday">Суббота</option>
                  <option value="sunday">Воскресенье</option>
                </select>
                <select value={quickManagerId} onChange={(event) => setQuickManagerId(event.target.value)}>
                  <option value="">Бригадир не привязан</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.managerProfileId ?? ""}>
                      {manager.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <p className="quick-form__title">Автомобиль</p>
              <div className="form-grid">
                <input value={quickVin} onChange={(event) => setQuickVin(event.target.value)} placeholder="VIN" />
                <input value={quickPlateNumber} onChange={(event) => setQuickPlateNumber(event.target.value)} placeholder="Госномер" />
                <input list="dashboard-car-make-options" value={quickMake} onChange={(event) => setQuickMake(event.target.value)} placeholder="Марка" />
                <input list="dashboard-car-model-options" value={quickModel} onChange={(event) => setQuickModel(event.target.value)} placeholder="Модель" />
                <datalist id="dashboard-car-make-options">
                  {VEHICLE_MAKE_OPTIONS.map((item) => <option key={item} value={item} />)}
                </datalist>
                <datalist id="dashboard-car-model-options">
                  {quickModelOptions.map((item) => <option key={item} value={item} />)}
                </datalist>
                <input value={quickProductionYear} onChange={(event) => setQuickProductionYear(event.target.value)} placeholder="Год выпуска" inputMode="numeric" />
                <input value={quickMileage} onChange={(event) => setQuickMileage(event.target.value)} placeholder="Пробег" inputMode="numeric" />
                <select value={quickCompanyName} onChange={(event) => setQuickCompanyName(event.target.value)}>
                  <option value="">Компания не выбрана</option>
                  {companies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <p className="quick-form__title">Договор</p>
              <div className="form-grid">
                <input value={quickContractNumber} onChange={(event) => setQuickContractNumber(event.target.value)} placeholder="Номер договора" />
                <input value={quickPrincipalAmount} onChange={(event) => setQuickPrincipalAmount(event.target.value)} placeholder="Сумма договора" inputMode="numeric" />
                <input value={quickDailyPayment} onChange={(event) => setQuickDailyPayment(event.target.value)} placeholder="Ежедневный платёж" inputMode="numeric" readOnly />
                <input value={quickInsuranceAmount} onChange={(event) => setQuickInsuranceAmount(event.target.value)} placeholder={quickInsuranceMode === "daily" ? "Страховка в день" : "Страховка в месяц"} inputMode="numeric" />
                <select value={quickInsuranceMode} onChange={(event) => setQuickInsuranceMode(event.target.value as "monthly" | "daily")}>
                  <option value="monthly">Страховка ежемесячно</option>
                  <option value="daily">Страховка ежедневно</option>
                </select>
                <input value={quickGpsAmount} onChange={(event) => setQuickGpsAmount(event.target.value)} placeholder={quickGpsMode === "daily" ? "GPS в день" : "GPS в месяц"} inputMode="numeric" />
                <select value={quickGpsMode} onChange={(event) => setQuickGpsMode(event.target.value as "monthly" | "daily")}>
                  <option value="monthly">GPS ежемесячно</option>
                  <option value="daily">GPS ежедневно</option>
                </select>
                <div className="contract-document-row">
                  <label className="checkbox-row contract-document-row__check">
                    <input type="checkbox" checked={quickHasOsago} onChange={(event) => setQuickHasOsago(event.target.checked)} />
                    <span>ОСАГО</span>
                  </label>
                  <input value={quickOsagoStartDate} onChange={(event) => setQuickOsagoStartDate(event.target.value)} type="date" aria-label="Дата начала ОСАГО" disabled={!quickHasOsago} />
                </div>
                <div className="contract-document-row">
                  <label className="checkbox-row contract-document-row__check">
                    <input type="checkbox" checked={quickHasCasco} onChange={(event) => setQuickHasCasco(event.target.checked)} />
                    <span>КАСКО</span>
                  </label>
                  <input value={quickCascoStartDate} onChange={(event) => setQuickCascoStartDate(event.target.value)} type="date" aria-label="Дата начала КАСКО" disabled={!quickHasCasco} />
                </div>
                <input value={quickStartDate} onChange={(event) => setQuickStartDate(event.target.value)} type="date" min="2020-01-01" />
                <input value={quickEndDate} onChange={(event) => setQuickEndDate(event.target.value)} type="date" min="2020-01-01" />
              </div>
              <p className="panel-note">
                Дата выплаты считается автоматически из суммы и ежедневного платежа: {quickTermMonths > 0 ? `${quickTermMonths} мес.` : "укажите сумму и платёж"}.
                {" "}Рабочих дней: {quickPayableDays || "—"}.
              </p>
              <div className="toolbar">
                <button type="button" disabled={quickCreateLoading || !canUseQuickCreate} onClick={() => void handleQuickCreateDriverCarContract()}>
                  {quickCreateLoading ? "Сохраняем..." : "Создать водителя, авто и договор"}
                </button>
              </div>
              {quickCreateMessage ? <p className="panel-note">{quickCreateMessage}</p> : null}
            </div>
          </section>
        </>
      ) : null}
      <AsyncState
        loading={loading}
        error={error}
        empty={!stats}
        emptyContent={
          <EmptyStatePanel
            title="Сводка пока недоступна"
            message="Сводные данные для выбранного периода пока не готовы. Попробуйте другой период или обновите страницу позже."
          />
        }
      >
        {(stats?.debt ?? 0) > 0 ? (
          <Link className="dashboard-alert" to={`/drivers?${dashboardDebtQuery}`}>
            <span className="dashboard-alert__icon">!</span>
            <span>
              <strong>{formatCurrency(stats?.debt ?? 0)} к оплате</strong>
              <small>Откройте список водителей с задолженностью за выбранный период</small>
            </span>
          </Link>
        ) : null}
        <div className="stats-grid dashboard-summary-grid dashboard-summary-grid--parkpro">
          <StatCard
            title="Автомобили"
            value={String(vehiclesApi.data?.length ?? 0)}
            subtitle={`На линии ${stats?.vehicles.installment ?? 0}`}
            tone="blue"
            icon={<CarIcon width={18} height={18} />}
            to="/vehicles"
          />
          <StatCard
            title="К оплате"
            value={formatCurrency(stats?.debt ?? 0)}
            subtitle="Долг за выбранный период"
            tone="orange"
            icon={<IncidentIcon width={18} height={18} />}
            to={`/drivers?${dashboardDebtQuery}`}
          />
          <StatCard
            title="Водители"
            value={String(stats?.drivers.total ?? 0)}
            subtitle={`Активных ${stats?.drivers.active ?? 0}`}
            tone="purple"
            icon={<DriversIcon width={18} height={18} />}
            to="/drivers"
          />
          <StatCard
            title="Начислено"
            value={formatCurrency(stats?.plannedPayment ?? 0)}
            subtitle="Начислено за период"
            tone="blue"
            icon={<FinanceIcon width={18} height={18} />}
            to={`/payments?${dashboardActualPaymentsQuery}`}
          />
          <StatCard
            title="Фактические выплаты"
            value={formatCurrency(stats?.actualPayment ?? 0)}
            subtitle="Факт за период"
            tone="green"
            icon={<PaymentsIcon width={18} height={18} />}
            to={`/payments?${dashboardActualPaymentsQuery}`}
          />
          <StatCard
            title="Сегодня"
            value={formatCurrency(managerSummary.data?.dueTodayAmount ?? 0)}
            subtitle="К оплате сегодня"
            tone="orange"
            icon={<WalletIcon width={18} height={18} />}
            to={`/drivers?${dashboardTodayDebtQuery}`}
          />
        </div>
        <div className="dashboard-shortcuts" aria-label="Быстрые разделы">
          <Link className="dashboard-shortcut dashboard-shortcut--blue" to="/drivers">
            <DriversIcon width={20} height={20} />
            <span>Водители</span>
            <strong>{stats?.drivers.total ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--green" to={`/payments?${dashboardActualPaymentsQuery}`}>
            <PaymentsIcon width={20} height={20} />
            <span>Оплатили</span>
            <strong>{formatCurrency(stats?.actualPayment ?? 0)}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--orange" to={`/drivers?${dashboardDebtQuery}`}>
            <IncidentIcon width={20} height={20} />
            <span>К оплате</span>
            <strong>{formatCurrency(stats?.debt ?? 0)}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--purple" to="/financial-ops?action=credit-writeoff&source=dashboard">
            <WalletIcon width={20} height={20} />
            <span>Остаток</span>
            <strong>{formatCurrency(stats?.overpayment ?? 0)}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--blue" to="/vehicles">
            <CarIcon width={20} height={20} />
            <span>Авто</span>
            <strong>{vehiclesApi.data?.length ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--green" to="/vehicles?status=office">
            <CarIcon width={20} height={20} />
            <span>В офисе</span>
            <strong>{stats?.vehicles.office ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--green" to="/vehicles?status=assigned">
            <CarIcon width={20} height={20} />
            <span>На линии</span>
            <strong>{stats?.vehicles.installment ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--red" to="/vehicles?status=accident">
            <IncidentIcon width={20} height={20} />
            <span>ДТП</span>
            <strong>{stats?.vehicles.accident ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--orange" to="/vehicles?status=maintenance">
            <CarIcon width={20} height={20} />
            <span>Ремонт</span>
            <strong>{(vehiclesApi.data ?? []).filter((item) => item.status === "maintenance" || item.status === "repair").length}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--orange" to="/vehicles?status=idle">
            <CarIcon width={20} height={20} />
            <span>Простой</span>
            <strong>{stats?.vehicles.idle ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--red" to="/vehicles?status=impound">
            <CarIcon width={20} height={20} />
            <span>Штрафстоянка</span>
            <strong>{(vehiclesApi.data ?? []).filter((item) => item.status === "impound").length}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--slate" to="/vehicles?status=written_off">
            <CarIcon width={20} height={20} />
            <span>Списанные</span>
            <strong>{stats?.vehicles.writtenOff ?? 0}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--blue" to="/contracts?status=active">
            <ContractsIcon width={20} height={20} />
            <span>Договоры</span>
            <strong>{activeContracts.length}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--slate" to="/contracts?status=terminated">
            <ContractsIcon width={20} height={20} />
            <span>Расторгнутые</span>
            <strong>{(contractsApi.data ?? []).filter((item) => item.status === "terminated").length}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--red" to="/incidents?view=operations">
            <IncidentIcon width={20} height={20} />
            <span>Инциденты</span>
            <strong>{openIncidents.length}</strong>
          </Link>
          <Link className="dashboard-shortcut dashboard-shortcut--orange" to="/support">
            <ShieldIcon width={20} height={20} />
            <span>Запросы</span>
            <strong>{statusQueue.length}</strong>
          </Link>
          {canOpenPayments ? (
            <Link className="dashboard-shortcut dashboard-shortcut--green" to="/payments">
              <PaymentsIcon width={20} height={20} />
              <span>Платежи</span>
              <strong>{paymentsApi.data?.length ?? 0}</strong>
            </Link>
          ) : null}
          {hasCrmAccess(session.requestUserRole, "payouts") ? (
            <Link className="dashboard-shortcut dashboard-shortcut--purple" to="/payouts?status=requested">
              <FinanceIcon width={20} height={20} />
              <span>Выводы</span>
              <strong>{requestedRecentPayouts.length}</strong>
            </Link>
          ) : null}
          {canOpenNotifications ? (
            <Link className="dashboard-shortcut dashboard-shortcut--blue" to="/notifications">
              <ShieldIcon width={20} height={20} />
              <span>Уведомления</span>
              <strong>{notificationsApi.data?.length ?? 0}</strong>
            </Link>
          ) : null}
          {canOpenOutbox ? (
            <Link className="dashboard-shortcut dashboard-shortcut--slate" to="/outbox">
              <ShieldIcon width={20} height={20} />
              <span>События</span>
              <strong>{outboxApi.data?.length ?? 0}</strong>
            </Link>
          ) : null}
          {canOpenUsers ? (
            <Link className="dashboard-shortcut dashboard-shortcut--blue" to="/users">
              <ShieldIcon width={20} height={20} />
              <span>Пользователи</span>
              <strong>{usersApi.data?.length ?? 0}</strong>
            </Link>
          ) : null}
          {canOpenSettings ? (
            <Link className="dashboard-shortcut dashboard-shortcut--slate" to="/settings">
              <ShieldIcon width={20} height={20} />
              <span>Настройки</span>
              <strong>{companies.length}</strong>
            </Link>
          ) : null}
          {canOpenReports ? (
            <Link className="dashboard-shortcut dashboard-shortcut--purple" to="/reports">
              <ReportsIcon width={20} height={20} />
              <span>Отчёты</span>
              <strong>CSV</strong>
            </Link>
          ) : null}
        </div>
        {managerCards.length ? (
          <article className="panel dashboard-manager-panel">
            <div className="panel__title">
              <DriversIcon width={18} height={18} />
              <h3>Бригадиры</h3>
            </div>
            <div className="hero-inline-metrics">
              {managerCards.map((manager) => (
                <Link
                  key={manager.id}
                  className="hero-inline-metric hero-inline-metric--button"
                  to={`/drivers?managerId=${encodeURIComponent(manager.managerProfileId)}`}
                >
                  <span>{manager.managerLevel === "senior" ? "Старший бригадир" : "Бригадир"}</span>
                  <strong>{manager.displayName}</strong>
                  <p>
                    Водители: {manager.driversCount} · Машины: {manager.carsCount}
                    {manager.companyName ? ` · ${manager.companyName}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          </article>
        ) : null}
        <div className="stats-grid dashboard-summary-grid" hidden>
          <StatCard
            title="Начислено"
            value={formatCurrency(stats?.plannedPayment ?? 0)}
            subtitle="Начислено за период"
            tone="blue"
            icon={<FinanceIcon width={18} height={18} />}
            to={`/payments?${dashboardActualPaymentsQuery}`}
          />
          <StatCard
            title="Фактические выплаты"
            value={formatCurrency(stats?.actualPayment ?? 0)}
            subtitle="Факт"
            tone="green"
            icon={<PaymentsIcon width={18} height={18} />}
            to={`/payments?${dashboardPeriodQuery}`}
          />
          <StatCard
            title="Задолженность"
            value={formatCurrency(stats?.debt ?? 0)}
            subtitle="Долг за выбранный период"
            tone="orange"
            icon={<IncidentIcon width={18} height={18} />}
            to={`/drivers?${dashboardDebtQuery}`}
          />
          <StatCard
            title="Свободный остаток"
            value={formatCurrency(stats?.overpayment ?? 0)}
            subtitle="После оплаты начислений"
            tone="purple"
            icon={<WalletIcon width={18} height={18} />}
            to="/financial-ops?action=credit-writeoff&source=dashboard"
          />
        </div>

        <div hidden>
        <div className="table-grid">
          <article className="panel">
            <div className="panel__title">
              <FinanceIcon width={18} height={18} />
              <h3>Оперативный контур</h3>
            </div>
            <div className="toolbar">
              <Link className="table-link" to="/incidents?view=operations">Рабочий поток</Link>
              <Link className="table-link" to="/incidents?view=archive">Архив {archivedIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={managerSummary.loading}
              error={managerSummary.error}
              empty={!managerSummary.data}
              emptyContent={
                <EmptyStatePanel
                  title="Оперативная сводка недоступна"
                  message="Сводка по сегодняшним начислениям и подтверждениям снятия баланса с Яндекса пока не загружена."
                />
              }
            >
              <div className="summary-list">
                <div><span>К оплате сегодня</span><strong>{formatCurrency(managerSummary.data?.dueTodayAmount ?? 0)}</strong></div>
                <div><span>Подтверждения на снятие баланса с Яндекса</span><strong>{managerSummary.data?.pendingStatusRequests ?? 0}</strong></div>
                <div><span>Критичные сигналы</span><strong>{managerSummary.data?.criticalAlerts ?? 0}</strong></div>
                <div><span>Открытые инциденты</span><strong>{managerSummary.data?.incidentsOpen ?? 0}</strong></div>
                <div><span>В архиве</span><strong>{archivedIncidentsCount}</strong></div>
              </div>
            </AsyncState>
          </article>
          {canApproveStatusRequest ? (
            <article className="panel">
              <div className="panel__title">
                <IncidentIcon width={18} height={18} />
                <h3>Служба поддержки</h3>
              </div>
              <div className="toolbar">
                <Link className="table-link" to="/support">
                  Открыть службу поддержки
                </Link>
                <Link className="table-link" to="/support?theme=day_off">
                  Выходной
                </Link>
                <Link className="table-link" to="/support?theme=vacation">
                  Отпросился
                </Link>
                <Link className="table-link" to="/support?theme=force_majeure">
                  Форс-мажор
                </Link>
              </div>
              <AsyncState
                loading={statusQueueLoading}
                error={statusQueueError}
                empty={!statusQueue.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Открытых запросов нет"
                    message="Сейчас нет заявок, которые требуют ручного решения."
                  />
                }
              >
                {queueMessage ? <p className="panel-note">{queueMessage}</p> : null}
                {queueActionError ? <p className="panel-note">Ошибка: {queueActionError}</p> : null}
                {statusQueue.length ? (
                  <div className="toolbar">
                    <button type="button" onClick={toggleSelectAllStatusRequests}>
                      {allStatusSelected ? "Снять выбор" : "Выбрать все"}
                    </button>
                    <span className="panel-note">Выбрано: {selectedStatusCount}</span>
                    <button
                      type="button"
                      disabled={bulkStatusActionLoading || !selectedStatusCount}
                      onClick={() => void handleBulkStatusQueueAction("approve")}
                    >
                      {bulkStatusActionLoading ? "Обрабатываем..." : "Массово подтвердить"}
                    </button>
                    <button
                      type="button"
                      disabled={bulkStatusActionLoading || !selectedStatusCount}
                      onClick={() => void handleBulkStatusQueueAction("reject")}
                    >
                      {bulkStatusActionLoading ? "Обрабатываем..." : "Массово отклонить"}
                    </button>
                  </div>
                ) : null}
                <div className="summary-list">
                  {statusQueue.map((item) => (
                    <div key={item.requestId}>
                      <span className="toolbar">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedStatusRequestIds.includes(item.requestId)}
                            onChange={() => toggleStatusRequestSelection(item.requestId)}
                          />
                        </label>
                        <span>
                          {item.driverName} · {item.period}
                        </span>
                      </span>
                      <strong>
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          {item.type === "day_off" ? "Выходной" : item.type === "vacation" ? "Отпросился" : "Форс-мажор"}
                        </Link>
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/support">
                          Открыть службу поддержки
                        </Link>
                        <Link className="table-link" to={`/support?theme=${item.type}`}>
                          Открыть тему
                        </Link>
                        <button
                          className="inline-action"
                          disabled={pendingStatusActionId === item.requestId}
                          onClick={async () => {
                            setQueueActionError(null);
                            setPendingStatusActionId(item.requestId);
                            try {
                              await postJson<{ status: string }, Record<string, never>>(
                                `approvals/status-requests/${item.requestId}/approve`,
                                {},
                              );
                              setStatusQueue((current) => current.filter((entry) => entry.requestId !== item.requestId));
                              setQueueMessage(`Запрос водителя ${item.driverName} одобрен.`);
                              void managerSummary.refetch();
                            } catch (error) {
                              setQueueActionError(error instanceof Error ? error.message : "Не удалось одобрить запрос.");
                            } finally {
                              setPendingStatusActionId(null);
                            }
                          }}
                        >
                          {pendingStatusActionId === item.requestId ? "Сохраняем..." : "Одобрить"}
                        </button>
                        <button
                          className="inline-action"
                          disabled={pendingStatusActionId === item.requestId}
                          onClick={async () => {
                            setQueueActionError(null);
                            setPendingStatusActionId(item.requestId);
                            try {
                              await postJson<{ status: string }, Record<string, never>>(
                                `approvals/status-requests/${item.requestId}/reject`,
                                {},
                              );
                              setStatusQueue((current) => current.filter((entry) => entry.requestId !== item.requestId));
                              setQueueMessage(`Запрос водителя ${item.driverName} отклонён.`);
                              void managerSummary.refetch();
                            } catch (error) {
                              setQueueActionError(error instanceof Error ? error.message : "Не удалось отклонить запрос.");
                            } finally {
                              setPendingStatusActionId(null);
                            }
                          }}
                        >
                          {pendingStatusActionId === item.requestId ? "Сохраняем..." : "Отклонить"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canApproveStatusRequest ? (
            <article className="panel">
              <div className="panel__title">
                <ShieldIcon width={18} height={18} />
                <h3>Подтверждения на снятие баланса с Яндекса</h3>
              </div>
              <div className="toolbar">
                <Link className="table-link" to="/support">
                  Открыть службу поддержки
                </Link>
                <Link className="table-link" to="/support?theme=day_off">
                  Выходной
                </Link>
                <Link className="table-link" to="/support?theme=vacation">
                  Отпросился
                </Link>
                <Link className="table-link" to="/support?theme=force_majeure">
                  Форс-мажор
                </Link>
              </div>
              <AsyncState
                loading={statusQueueLoading}
                error={statusQueueError}
                empty={!recentStatusRequests.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Подтверждений пока нет"
                    message="Одобренные, отклонённые и новые подтверждения появятся здесь."
                  />
                }
              >
                <div className="summary-list">
                  {recentStatusRequests.map((item) => (
                    <div key={item.requestId}>
                      <span>
                        {item.driverName} · {item.period}
                      </span>
                      <strong>
                        {item.status === "approved"
                          ? "Одобрен"
                          : item.status === "rejected"
                            ? "Отклонён"
                            : "Ожидает решения"}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/support">
                          Открыть службу поддержки
                        </Link>
                        <Link className="table-link" to={`/support?theme=${item.type}`}>
                          Открыть тему
                        </Link>
                        {item.driverId ? (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            Открыть водителя
                          </Link>
                        ) : (
                          <Link className="table-link" to="/drivers">
                            Открыть водителей
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenUsers ? (
            <article className="panel">
              <div className="panel__title">
                <ShieldIcon width={18} height={18} />
                <h3>Доступ без доп. защиты</h3>
              </div>
              <AsyncState
                loading={usersApi.loading}
                error={usersApi.error}
                empty={!usersWithoutMfa.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Дополнительная защита включена"
                    message="Сейчас нет пользователей без MFA."
                  />
                }
              >
                <div className="summary-list">
                  {usersWithoutMfa.map((item) => (
                    <div key={item.id}>
                      <span>
                        {item.displayName} · {getUserRoleLabel(item.role)}
                      </span>
                      <strong>Проверьте вход</strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/users">
                          Открыть пользователей
                        </Link>
                        {canOpenSettings ? (
                          <Link className="table-link" to="/settings">
                            Открыть настройки
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenFinancialOps ? (
            <article className="panel">
              <div className="panel__title">
                <PaymentsIcon width={18} height={18} />
                <h3>К оплате сегодня</h3>
              </div>
              <AsyncState
                loading={statusQueueLoading}
                error={statusQueueError}
                empty={!paymentDueQueue.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Платежей на сегодня нет"
                    message="Нет водителей, у кого ближайший платёж назначен на сегодня или уже просрочен."
                  />
                }
              >
                <div className="summary-list">
                  {paymentDueQueue.map((item) => (
                    <div key={item.driverId}>
                      <span>
                        {item.driverName} · {formatCurrency(item.amount)}
                      </span>
                      <strong>
                        {item.dueDate ? `дата оплаты: ${formatDateOnly(item.dueDate)}` : "дата не указана"}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                        {item.contractId ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=payment&source=dashboard&driverId=${item.driverId}&contractId=${item.contractId}&amount=${item.amount}`}
                          >
                            Подготовить платёж
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenFinancialOps ? (
            <article className="panel">
              <div className="panel__title">
                <WalletIcon width={18} height={18} />
                <h3>Водители с просрочкой</h3>
              </div>
              <AsyncState
                loading={statusQueueLoading}
                error={statusQueueError}
                empty={!overdueQueue.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Просрочки нет"
                    message="Сейчас нет водителей с открытой просрочкой."
                  />
                }
              >
                <div className="summary-list">
                  {overdueQueue.map((item) => (
                    <div key={item.driverId}>
                      <span>
                        {item.driverName} · {formatCurrency(item.overdueDebt)}
                      </span>
                      <strong>
                        {item.contractId ? (
                          <Link
                            className="table-link"
                          to={`/financial-ops?action=payment&source=dashboard&driverId=${item.driverId}&contractId=${item.contractId}&amount=${item.overdueDebt}`}
                          >
                            Подготовить платёж
                          </Link>
                        ) : (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            Открыть водителя
                          </Link>
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenPayments ? (
            <article className="panel">
              <div className="panel__title">
                <PaymentsIcon width={18} height={18} />
                <h3>Новые платежи</h3>
              </div>
              <AsyncState
                loading={paymentsApi.loading}
                error={paymentsApi.error}
                empty={!recentPayments.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Платежей пока нет"
                    message="Новые поступления появятся здесь сразу после регистрации."
                  />
                }
              >
                <div className="summary-list">
                  {recentPayments.map((item) => (
                    <div key={item.id}>
                      <span>
                        {driverMap.get(item.driverId) ?? "Водитель"} · {formatCurrency(item.amount)}
                      </span>
                      <strong>
                        {item.appliedAmount > 0 ? `оплачено ${formatCurrency(item.appliedAmount)}` : "оплачено 0"}{" "}
                        {item.unappliedAmount > 0 ? `· остаток ${formatCurrency(item.unappliedAmount)}` : ""}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                        <Link className="table-link" to={`/contracts/${item.contractId}`}>
                          Открыть договор
                        </Link>
                        {canOpenFinancialOps && item.unappliedAmount > 0 && (driverCreditMap.get(item.driverId) ?? 0) > 0 ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=credit-writeoff&source=dashboard&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                          >
                            Списать остаток
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {hasCrmAccess(session.requestUserRole, "payouts") ? (
            <article className="panel">
              <div className="panel__title">
                <FinanceIcon width={18} height={18} />
                <h3>Новые выводы</h3>
              </div>
              {payoutActionMessage ? <div className="panel-note">{payoutActionMessage}</div> : null}
              {payoutActionError ? <div className="panel-note">Ошибка: {payoutActionError}</div> : null}
              <AsyncState
                loading={payoutsApi.loading}
                error={payoutsApi.error}
                empty={!recentPayouts.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Выводов пока нет"
                    message="Новые заявки на вывод появятся здесь сразу после создания."
                  />
                }
              >
                {canApprovePayout && requestedRecentPayouts.length ? (
                  <div className="toolbar">
                    <button type="button" onClick={toggleSelectAllPayouts}>
                      {allPayoutsSelected ? "Снять выбор" : "Выбрать все"}
                    </button>
                    <span className="panel-note">Выбрано: {selectedPayoutCount}</span>
                    <button
                      type="button"
                      disabled={bulkPayoutActionLoading || !selectedPayoutCount}
                      onClick={() => void handleBulkPayoutAction("approve")}
                    >
                      {bulkPayoutActionLoading ? "Обрабатываем..." : "Массово одобрить"}
                    </button>
                    <button
                      type="button"
                      disabled={bulkPayoutActionLoading || !selectedPayoutCount}
                      onClick={() => void handleBulkPayoutAction("reject")}
                    >
                      {bulkPayoutActionLoading ? "Обрабатываем..." : "Массово отклонить"}
                    </button>
                  </div>
                ) : null}
                <div className="summary-list">
                  {recentPayouts.map((item) => (
                    <div key={item.id}>
                      <span className="toolbar">
                        {item.status === "requested" && canApprovePayout ? (
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={selectedPayoutIds.includes(item.id)}
                              onChange={() => togglePayoutSelection(item.id)}
                            />
                          </label>
                        ) : null}
                        <span>
                          {driverMap.get(item.driverId) ?? "Водитель"} · {formatCurrency(item.amount)}
                        </span>
                      </span>
                      <strong>{item.status === "approved" ? "Вывод согласован" : "Ожидает согласования"}</strong>
                      <div className="toolbar">
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                        {item.status === "requested" && canApprovePayout ? (
                          <>
                            <button
                              type="button"
                              className="inline-action"
                              disabled={pendingPayoutActionId === item.id}
                              onClick={() => void handlePayoutAction("approve", item.id)}
                            >
                              {pendingPayoutActionId === item.id ? "Сохраняем..." : "Одобрить"}
                            </button>
                            <button
                              type="button"
                              className="inline-action"
                              disabled={pendingPayoutActionId === item.id}
                              onClick={() => void handlePayoutAction("reject", item.id)}
                            >
                              {pendingPayoutActionId === item.id ? "Сохраняем..." : "Отклонить"}
                            </button>
                          </>
                        ) : null}
                        {(availablePayoutAmountByDriverId.get(item.driverId) ?? 0) > 0 ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=payout&source=dashboard&driverId=${item.driverId}&amount=${availablePayoutAmountByDriverId.get(item.driverId) ?? 0}`}
                          >
                            Подготовить вывод
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenFinancialOps ? (
            <article className="panel">
              <div className="panel__title">
                <FinanceIcon width={18} height={18} />
                <h3>Свободный остаток</h3>
              </div>
              <AsyncState
                loading={statusQueueLoading}
                error={statusQueueError}
                empty={!creditQueue.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Свободного остатка нет"
                    message="Сейчас нет водителей со свободным остатком, который требует ручного действия."
                  />
                }
              >
                <div className="summary-list">
                  {creditQueue.map((item) => (
                    <div key={item.driverId}>
                      <span>
                        {item.driverName} · {formatCurrency(item.creditBalance)}
                      </span>
                      <strong>
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=credit-writeoff&source=dashboard&driverId=${item.driverId}&amount=${item.creditBalance}&reason=${encodeURIComponent("Ручная корректировка")}`}
                        >
                          Списать остаток
                        </Link>
                      </strong>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenNotifications ? (
            <article className="panel">
              <div className="panel__title">
                <ShieldIcon width={18} height={18} />
                <h3>Новые уведомления</h3>
              </div>
              <AsyncState
                loading={notificationsApi.loading}
                error={notificationsApi.error}
                empty={!recentNotifications.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Уведомлений пока нет"
                    message="Новые сообщения и статусы доставки появятся здесь сразу после отправки."
                  />
                }
              >
                <div className="summary-list">
                  {recentNotifications.map((item) => (
                    <div key={item.id}>
                      <span>
                        {item.driverId ? driverMap.get(item.driverId) ?? "Водитель" : "Системное уведомление"} ·{" "}
                        {item.template.startsWith("payout_") ? "По выплате" : "Служебное"}
                      </span>
                      <strong>{getNotificationStatusLabel(item.status)}</strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/notifications">
                          Открыть уведомления
                        </Link>
                        {canRetryNotifications && item.status !== "published" ? (
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={deliveryRetrying}
                            onClick={() => void handleRetryNotifications([item.id])}
                          >
                            Переотправить
                          </button>
                        ) : null}
                        {item.driverId ? (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            Открыть водителя
                          </Link>
                        ) : null}
                        {item.template.startsWith("payout_") ? (
                          <Link className="table-link" to="/payouts">
                            Открыть выплаты
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenOutbox ? (
            <article className="panel">
              <div className="panel__title">
                <ShieldIcon width={18} height={18} />
                <h3>Новые события</h3>
              </div>
              <AsyncState
                loading={outboxApi.loading}
                error={outboxApi.error}
                empty={!recentOutboxEvents.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Событий пока нет"
                    message="Новые события интеграции появятся здесь сразу после создания."
                  />
                }
              >
                <div className="summary-list">
                  {recentOutboxEvents.map((item) => (
                    <div key={item.id}>
                      <span>
                        {item.topic.startsWith("payment.")
                          ? "Платёжное событие"
                          : item.topic.startsWith("payout.")
                            ? "Событие выплаты"
                            : item.topic.startsWith("driver.")
                              ? "Событие по водителю"
                              : "Системное событие"}
                      </span>
                      <strong>{getOutboxStatusLabel(item.status)}</strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/outbox">
                          Открыть события
                        </Link>
                        {canProcessOutbox && item.status !== "published" ? (
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={deliveryRetrying}
                            onClick={() => void handleRetryOutbox([item.id])}
                          >
                            Переочередить
                          </button>
                        ) : null}
                        {item.aggregateType === "driver" ? (
                          <Link className="table-link" to={`/drivers/${item.aggregateId}`}>
                            Открыть водителя
                          </Link>
                        ) : null}
                        {item.aggregateType === "contract" ? (
                          <Link className="table-link" to={`/contracts/${item.aggregateId}`}>
                            Открыть договор
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {hasCrmAccess(session.requestUserRole, "ledger") ? (
            <article className="panel">
              <div className="panel__title">
                <WalletIcon width={18} height={18} />
                <h3>Новые движение денежных средств</h3>
              </div>
              <AsyncState
                loading={ledgerApi.loading}
                error={ledgerApi.error}
                empty={!recentLedgerEntries.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Проводок пока нет"
                    message="Новые финансовые движения появятся здесь сразу после записи."
                  />
                }
              >
                <div className="summary-list">
                  {recentLedgerEntries.map((item) => (
                    <div key={item.id}>
                      <span>
                        {item.type === "payment"
                          ? "Платёж"
                          : item.type === "payout"
                            ? "Выплата"
                            : item.type === "adjustment"
                              ? "Корректировка"
                              : "Начисление"}{" "}
                        · {formatCurrency(Number(item.money.amount))}
                      </span>
                      <strong>
                        {item.driverId ? driverMap.get(item.driverId) ?? "Водитель" : "Без водителя"}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/ledger">
                          Открыть движение денежных средств
                        </Link>
                        {item.driverId ? (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            Открыть водителя
                          </Link>
                        ) : null}
                        {item.contractId ? (
                          <Link className="table-link" to={`/contracts/${item.contractId}`}>
                            Открыть договор
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {hasCrmAccess(session.requestUserRole, "ledger") ? (
            <article className="panel">
              <div className="panel__title">
                <WalletIcon width={18} height={18} />
                <h3>Новый свободный остаток</h3>
              </div>
              <AsyncState
                loading={ledgerApi.loading}
                error={ledgerApi.error}
                empty={!recentCreditEntries.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Операций по свободному остатку пока нет"
                    message="Создание и списание свободного остатка появятся здесь."
                  />
                }
              >
                <div className="summary-list">
                  {recentCreditEntries.map((item) => (
                    <div key={item.id}>
                      <span>
                        {item.type === "adjustment" ? "Создан свободный остаток" : "Списан свободный остаток"} · {formatCurrency(Number(item.money.amount))}
                      </span>
                      <strong>
                        {item.driverId ? driverMap.get(item.driverId) ?? "Водитель" : "Без водителя"}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/ledger">
                          Открыть движение денежных средств
                        </Link>
                        {item.driverId ? (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            Открыть водителя
                          </Link>
                        ) : null}
                        {canOpenFinancialOps && item.driverId && item.type === "adjustment" && (driverCreditMap.get(item.driverId) ?? 0) > 0 ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=credit-writeoff&source=dashboard&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                          >
                            Списать остаток
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {hasCrmAccess(session.requestUserRole, "ledger") ? (
            <article className="panel">
              <div className="panel__title">
                <WalletIcon width={18} height={18} />
                <h3>Новые начисления</h3>
              </div>
              <AsyncState
                loading={ledgerApi.loading}
                error={ledgerApi.error}
                empty={!recentObligationEntries.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Начислений пока нет"
                    message="Новые обязательства появятся здесь сразу после расчёта."
                  />
                }
              >
                <div className="summary-list">
                  {recentObligationEntries.map((item) => (
                    <div key={item.id}>
                      <span>
                        Начисление · {formatCurrency(Number(item.money.amount))}
                      </span>
                      <strong>
                        {item.driverId ? driverMap.get(item.driverId) ?? "Водитель" : "Без водителя"}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to="/ledger">
                          Открыть движение денежных средств
                        </Link>
                        {item.contractId ? (
                          <Link className="table-link" to={`/contracts/${item.contractId}`}>
                            Открыть договор
                          </Link>
                        ) : null}
                        {canOpenFinancialOps && item.driverId && item.contractId ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=payment&source=dashboard&driverId=${item.driverId}&contractId=${item.contractId}&amount=${item.money.amount}`}
                          >
                            Подготовить платёж
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </AsyncState>
            </article>
          ) : null}
          {canOpenNotifications || canOpenOutbox ? (
            <article className="panel">
              <div className="panel__title">
                <ShieldIcon width={18} height={18} />
                <h3>Проблемы доставки</h3>
              </div>
              <AsyncState
                loading={notificationsApi.loading || outboxApi.loading}
                error={notificationsApi.error ?? outboxApi.error}
                empty={!deliveryIssues.length}
                emptyContent={
                  <EmptyStatePanel
                    title="Ошибок доставки нет"
                    message="Уведомления и события сейчас проходят без сбоев."
                  />
                }
              >
                {deliveryMessage ? <p className="panel-note">{deliveryMessage}</p> : null}
                {deliveryError ? <p className="panel-note">Ошибка: {deliveryError}</p> : null}
                <div className="summary-list">
                  {deliveryIssues.map((item) => (
                    <div key={item.id}>
                      <span>{item.label}</span>
                      <strong>{item.detail}</strong>
                      {item.to ? (
                        <div className="toolbar">
                          <Link className="table-link" to={item.to}>
                            {item.actionLabel}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="toolbar">
                  {canOpenNotifications && failedNotificationCount > 0 ? (
                    <Link className="table-link" to="/notifications">
                      Открыть уведомления
                    </Link>
                  ) : null}
                  {canRetryNotifications && retryableNotificationIds.length > 0 ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={deliveryRetrying}
                      onClick={() => void handleRetryNotifications(retryableNotificationIds)}
                    >
                      {deliveryRetrying ? "Переотправляем..." : "Переотправить уведомления"}
                    </button>
                  ) : null}
                  {canOpenOutbox ? (
                    <Link className="table-link" to="/outbox">
                      Открыть события
                    </Link>
                  ) : null}
                  {canProcessOutbox && retryableOutboxIds.length > 0 ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={deliveryRetrying}
                      onClick={() => void handleRetryOutbox(retryableOutboxIds)}
                    >
                      {deliveryRetrying ? "Переочередим..." : "Переочередить события"}
                    </button>
                  ) : null}
                  {canProcessOutbox && (failedOutboxCount > 0 || pendingOutboxCount > 0) ? (
                    <button
                      disabled={deliveryProcessing || deliveryRetrying}
                      onClick={async () => {
                        setDeliveryError(null);
                        setDeliveryMessage(null);
                        setDeliveryProcessing(true);
                        try {
                          const result = await postJson<{
                            mode: "inline" | "queued";
                            processedCount: number;
                            queuedCount: number;
                          }, Record<string, never>>("workers/outbox/process", {});
                          setDeliveryMessage(
                            result.mode === "queued"
                              ? `События добавлены в очередь: ${result.queuedCount}`
                              : `События обработаны: ${result.processedCount}`,
                          );
                          void outboxApi.refetch();
                        } catch (error) {
                          setDeliveryError(error instanceof Error ? error.message : "Не удалось запустить обработку.");
                        } finally {
                          setDeliveryProcessing(false);
                        }
                      }}
                    >
                      {deliveryProcessing ? "Запускаем..." : "Запустить обработку"}
                    </button>
                  ) : null}
                </div>
              </AsyncState>
            </article>
          ) : null}
          <article className="panel">
            <div className="panel__title">
              <DriversIcon width={18} height={18} />
              <h3>Водители</h3>
            </div>
            <div className="summary-list">
              <div><span>Всего</span><strong>{stats?.drivers.total ?? 0}</strong></div>
              <div><span>Активные</span><strong>{stats?.drivers.active ?? 0}</strong></div>
              <div><span>Оплатили</span><strong>{stats?.drivers.paid ?? 0}</strong></div>
              <div><span>Не оплатили</span><strong>{stats?.drivers.unpaid ?? 0}</strong></div>
              <div><span>Выходной</span><strong>{stats?.drivers.dayoff ?? 0}</strong></div>
                <div><span>Отпросились</span><strong>{stats?.drivers.vacation ?? 0}</strong></div>
              </div>
            </article>
          <article className="panel">
            <div className="panel__title">
              <DriversIcon width={18} height={18} />
              <h3>Новые водители</h3>
            </div>
            {recentDrivers.length > 0 ? (
              <div className="summary-list">
                {recentDrivers.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.fullName} · {item.phone}
                    </span>
                    <strong>
                      {item.activeContractId ? "Есть активный договор" : "Договор ещё не привязан"}
                    </strong>
                    {item.companyName ? <p className="table-meta">{item.companyName}</p> : null}
                    <div className="toolbar">
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                      {item.activeContractId ? (
                        <Link className="table-link" to={`/contracts/${item.activeContractId}`}>
                          Открыть договор
                        </Link>
                      ) : null}
                      {canOpenFinancialOps && item.activeContractId ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=dashboard&driverId=${item.id}&contractId=${item.activeContractId}&amount=${
                            activeContractMap.get(item.activeContractId)?.nextDueAmount
                            ?? activeContractMap.get(item.activeContractId)?.currentDebt
                            ?? activeContractMap.get(item.activeContractId)?.installmentAmount
                            ?? 0
                          }`}
                        >
                          Подготовить платёж
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Новых водителей пока нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>Проблемные договоры</h3>
            </div>
            {contractMessage ? <p className="panel-note">{contractMessage}</p> : null}
            {topContracts.length > 0 ? (
              <div className="summary-list">
                {topContracts.map((item) => (
                  <div key={item.id}>
                    <span>{driverMap.get(item.driverId) ?? "Водитель"} · {formatCurrency(item.currentDebt)}</span>
                    <strong>
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        {item.contractNumber}
                      </Link>
                    </strong>
                    {canOpenFinancialOps ? (
                      <div className="toolbar">
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=dashboard&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt ?? item.installmentAmount}`}
                        >
                          Платёж
                        </Link>
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payoff&source=dashboard&driverId=${item.driverId}&contractId=${item.id}&amount=${item.currentDebt}`}
                        >
                          Досрочно закрыть
                        </Link>
                        {canEditContract && item.status !== "defaulted" ? (
                          <button
                            disabled={pendingContractActionId === item.id}
                            onClick={() => void handleContractAction(item.id, "defaulted")}
                          >
                            Проблемный
                          </button>
                        ) : null}
                        {canEditContract && item.status !== "terminated" ? (
                          <button
                            disabled={pendingContractActionId === item.id}
                            onClick={() => void handleContractAction(item.id, "terminated")}
                          >
                            Расторгнуть
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Договоров с долгом сейчас нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <ContractsIcon width={18} height={18} />
              <h3>Новые договоры</h3>
            </div>
            {contractMessage ? <p className="panel-note">{contractMessage}</p> : null}
            {recentContracts.length > 0 ? (
              <div className="summary-list">
                {recentContracts.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.contractNumber} · {driverMap.get(item.driverId) ?? "Водитель"}
                    </span>
                    <strong>
                      {item.currentDebt > 0 ? formatCurrency(item.currentDebt) : "Долга сейчас нет"}
                    </strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                      <Link className="table-link" to={`/vehicles/${item.carId}`}>
                        Открыть авто
                      </Link>
                      {canOpenFinancialOps && item.status === "active" && (item.nextDueAmount ?? item.currentDebt ?? 0) > 0 ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=dashboard&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt ?? item.installmentAmount}`}
                        >
                          Подготовить платёж
                        </Link>
                      ) : null}
                      {canEditContract && item.status !== "closed" ? (
                        <button
                          disabled={pendingContractActionId === item.id}
                          onClick={() => void handleContractAction(item.id, "closed")}
                        >
                          Выкуплен
                        </button>
                      ) : null}
                      {canEditContract && item.status !== "defaulted" ? (
                        <button
                          disabled={pendingContractActionId === item.id}
                          onClick={() => void handleContractAction(item.id, "defaulted")}
                        >
                          Проблемный
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Новых договоров пока нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <ContractsIcon width={18} height={18} />
              <h3>Новые закрытия</h3>
            </div>
            {recentlyClosedContracts.length > 0 ? (
              <div className="summary-list">
                {recentlyClosedContracts.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.contractNumber} · {driverMap.get(item.driverId) ?? "Водитель"}
                    </span>
                    <strong>{item.currentDebt > 0 ? formatCurrency(item.currentDebt) : "Закрыт"}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        Открыть водителя
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Новых закрытых договоров пока нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <PaymentsIcon width={18} height={18} />
              <h3>Ближайшие обязательства</h3>
            </div>
            {upcomingContracts.length > 0 ? (
              <div className="summary-list">
                {upcomingContracts.map((item) => {
                  const isOverdue =
                    Boolean(item.nextDueDate) &&
                    item.currentDebt > 0 &&
                    new Date(item.nextDueDate!).getTime() < Date.now();

                  return (
                    <div key={item.id}>
                      <span>
                        {item.contractNumber} · {driverMap.get(item.driverId) ?? "Водитель"}
                      </span>
                      <strong>
                        {item.nextDueAmount ? formatCurrency(item.nextDueAmount) : "Сумма уточняется"} ·{" "}
                        {item.nextDueDate
                          ? isOverdue
                            ? `просрочено с ${formatDateOnly(item.nextDueDate)}`
                            : formatDateOnly(item.nextDueDate)
                          : "Дата уточняется"}
                      </strong>
                      <div className="toolbar">
                        <Link className="table-link" to={`/contracts/${item.id}`}>
                          Открыть договор
                        </Link>
                        {canOpenFinancialOps ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=payment&source=dashboard&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt}`}
                          >
                            Подготовить платёж
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="panel-note">Ближайших обязательств сейчас нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <CarIcon width={18} height={18} />
              <h3>Автомобили</h3>
            </div>
              <div className="summary-list">
                <div><span>В рассрочке</span><strong>{stats?.vehicles.installment ?? 0}</strong></div>
                <div><span>В офисе</span><strong>{stats?.vehicles.office ?? 0}</strong></div>
                <div><span>Растаможка</span><strong>{stats?.vehicles.customs ?? 0}</strong></div>
	                <div><span>ДТП</span><strong>{stats?.vehicles.accident ?? 0}</strong></div>
	                <div><span>Простой</span><strong>{stats?.vehicles.idle ?? 0}</strong></div>
	                <div><span>Списанные</span><strong>{stats?.vehicles.writtenOff ?? 0}</strong></div>
	                <div><span>Продан</span><strong>{stats?.vehicles.sold ?? 0}</strong></div>
              </div>
            </article>
          <article className="panel">
            <div className="panel__title">
              <CarIcon width={18} height={18} />
              <h3>Новые автомобили</h3>
            </div>
            {recentVehicles.length > 0 ? (
              <div className="summary-list">
                {recentVehicles.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.plateNumber} · {getStatusLabel(item.status)}
                    </span>
                    <strong>{item.assignedDriverId ? getStatusLabel(item.status) : "Водитель ещё не привязан"}</strong>
                    {item.companyName ? <p className="table-meta">{item.companyName}</p> : null}
                    <div className="toolbar">
                      <Link className="table-link" to={`/vehicles/${item.id}`}>
                        Открыть авто
                      </Link>
                      {item.assignedDriverId ? (
                        <Link className="table-link" to={`/drivers/${item.assignedDriverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                      {canOpenFinancialOps && activeContractRecordIdByCarId.get(item.id) && item.assignedDriverId ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=dashboard&driverId=${item.assignedDriverId}&contractId=${activeContractRecordIdByCarId.get(item.id)}&amount=${
                            activeContractMap.get(activeContractRecordIdByCarId.get(item.id) ?? "")?.nextDueAmount
                            ?? activeContractMap.get(activeContractRecordIdByCarId.get(item.id) ?? "")?.currentDebt
                            ?? activeContractMap.get(activeContractRecordIdByCarId.get(item.id) ?? "")?.installmentAmount
                            ?? 0
                          }`}
                        >
                          Подготовить платёж
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Новых автомобилей пока нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <IncidentIcon width={18} height={18} />
              <h3>Машины в простое</h3>
            </div>
            <div className="toolbar">
              {idleVehicleFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={idleVehicleFilter === filter.value ? "inline-action" : undefined}
                  onClick={() => setIdleVehicleFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {idleVehicles.length > 0 ? (
              <div className="summary-list">
                {idleVehicles.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.plateNumber} · {getStatusLabel(item.status)}
                    </span>
                    <strong>
                      <Link className="table-link" to={`/vehicles/${item.id}`}>
                        Открыть авто
                      </Link>
                    </strong>
                    <div className="panel-note">
                      {[item.make, item.model].filter(Boolean).join(" ") || item.vin}
                      {item.assignedDriverId ? ` · водитель: ${driverMap.get(item.assignedDriverId) ?? "назначен"}` : " · свободна для выдачи"}
                      {(incidentsByVehicleId.get(item.id) ?? 0) > 0 ? ` · открытых инцидентов: ${incidentsByVehicleId.get(item.id)}` : ""}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to={`/vehicles/${item.id}`}>
                        Карточка авто
                      </Link>
                      {item.assignedDriverId ? (
                        <Link className="table-link" to={`/drivers/${item.assignedDriverId}`}>
                          Водитель
                        </Link>
                      ) : null}
                      {(incidentsByVehicleId.get(item.id) ?? 0) > 0 ? (
                        <Link className="table-link" to="/incidents?view=operations">
                          Инциденты
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">По выбранному фильтру машин нет.</p>
            )}
          </article>
          <article className="panel">
            <div className="panel__title">
              <IncidentIcon width={18} height={18} />
              <h3>Открытые инциденты</h3>
            </div>
            {incidentMessage ? <p className="panel-note">{incidentMessage}</p> : null}
            <div className="toolbar">
              <Link className="table-link" to="/incidents?view=operations">Рабочий поток</Link>
              <Link className="table-link" to="/incidents?view=archive">Архив {archivedIncidentsCount}</Link>
            </div>
            {openIncidents.length > 0 ? (
              <div className="summary-list">
                {openIncidents.map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <strong>
                      {item.priority === "high" ? "Высокий приоритет" : "Требует внимания"}
                    </strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/incidents?view=operations">
                        Рабочий поток
                      </Link>
                      {item.driverId ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                      {item.carId ? (
                        <Link className="table-link" to={`/vehicles/${item.carId}`}>
                          Открыть авто
                        </Link>
                      ) : null}
                      {canUpdateIncident ? (
                        <>
                          <button
                            disabled={pendingIncidentActionId === item.id}
                            onClick={() => void handleIncidentAction(item.id, "resolved")}
                          >
                            Решить
                          </button>
                          <button
                            disabled={pendingIncidentActionId === item.id}
                            onClick={() => void handleIncidentAction(item.id, "closed")}
                          >
                            Закрыть
                          </button>
                          <button
                            disabled={pendingIncidentActionId === item.id}
                            onClick={() => void handleIncidentAction(item.id, "archived")}
                          >
                            В архив
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Открытых инцидентов сейчас нет.</p>
            )}
          </article>
        </div>
        </div>
      </AsyncState>
    </section>
  );
}
