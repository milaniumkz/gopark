import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchJson, patchJson, postJson } from "../lib/api";
import { hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import {
  downloadCsv,
  downloadCsvTable,
  formatCurrency,
  formatDateOnly,
  formatDueDateLabel,
  getIncidentTypeLabel,
  getNotificationStatusLabel,
  getOutboxStatusLabel,
  getPaymentProviderLabel,
  getStatusLabel,
  getUserRoleLabel,
  isPastDate,
} from "../lib/utils";
import type { ContractListItem, DriverListItem, DriverRiskStatusChangeItem, LedgerEntry, ManagerAssignedDriverItem, ManagerDriverDetail, ManagerIncidentItem, NotificationListItem, PaymentListItem, PayoutListItem, ReportsOverview, UserAdminListItem, VehicleListItem } from "@gopark/contracts";

type OutboxReportItem = {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  status: string;
  createdAt: string;
};

type ReportCatalogItem = {
  id: string;
  title: string;
  subtitle: string;
  count: number;
  to: string;
  headers: string[];
  rows: string[][];
};

interface ReportsRecentStatusRequestItem {
  driverId: string;
  driverName: string;
  requestId: string;
  type: string;
  period: string;
  status: string;
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

function isAccidentIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "accident" || item.title.toLowerCase().includes("дтп");
}

function isServiceIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "repair";
}

function isInsuranceGpsIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "insurance_gps";
}

function isFineIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "fine";
}

function isInspectionIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "inspection";
}

function isBlacklistIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "blacklist";
}

function getDriverRiskStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "normal":
      return "Нормальный";
    case "medium":
      return "Средний";
    case "risk":
      return "Зона риска";
    default:
      return "Нормальный";
  }
}

export function ReportsPage() {
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [recentStatusRequests, setRecentStatusRequests] = useState<ReportsRecentStatusRequestItem[]>([]);
  const [statusRequestsLoading, setStatusRequestsLoading] = useState(false);
  const [statusRequestsError, setStatusRequestsError] = useState<string | null>(null);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  const [selectedStatusRequestIds, setSelectedStatusRequestIds] = useState<string[]>([]);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryRetrying, setDeliveryRetrying] = useState(false);
  const [incidentMessage, setIncidentMessage] = useState<string | null>(null);
  const [pendingIncidentActionId, setPendingIncidentActionId] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("overview");
  const api = useApiQuery<ReportsOverview>("reports/overview");
  const driversApi = useApiQuery<ManagerAssignedDriverItem[]>("mobile/manager/drivers");
  const crmDriversApi = useApiQuery<DriverListItem[]>("drivers");
  const riskStatusChangesApi = useApiQuery<DriverRiskStatusChangeItem[]>("drivers/risk-status-changes");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const notificationsApi = useApiQuery<NotificationListItem[]>("notifications");
  const outboxApi = useApiQuery<OutboxReportItem[]>("outbox");
  const ledgerApi = useApiQuery<LedgerEntry[]>("ledger/entries");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canApprovePayout = hasCrmCapability(session.requestUserRole, "approve-payout");
  const canApproveStatusRequest = hasCrmCapability(session.requestUserRole, "approve-status-request");
  const canRetryNotifications = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const canRetryOutbox = ["owner", "admin", "finance"].includes(session.requestUserRole);
  const canUpdateIncident = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const companies = settingsApi.data?.companies ?? [];
  const driverCompanyMap = new Map((crmDriversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const vehicleCompanyMap = new Map((vehiclesApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const matchesCompany = (driverId?: string | null, carId?: string | null): boolean => {
    if (companyFilter === "all") {
      return true;
    }

    return (driverId ? driverCompanyMap.get(driverId) : "") === companyFilter
      || (carId ? vehicleCompanyMap.get(carId) : "") === companyFilter;
  };
  const activeContracts = (contractsApi.data ?? []).filter((item) => item.status === "active");
  const topOverdueDrivers = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => item.overdueDebt > 0)
    .sort((left, right) => right.overdueDebt - left.overdueDebt)
    .slice(0, 5);
  const topUpcomingDrivers = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => item.nextPaymentDate && item.nextPaymentAmount > 0)
    .sort((left, right) => (left.nextPaymentDate ?? "").localeCompare(right.nextPaymentDate ?? ""))
    .slice(0, 5);
  const topCreditDrivers = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => item.creditBalance > 0)
    .sort((left, right) => right.creditBalance - left.creditBalance)
    .slice(0, 5);
  const topYandexBalanceDrivers = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => item.yandexBalance > 0)
    .sort((left, right) => right.yandexBalance - left.yandexBalance)
    .slice(0, 5);
  const driversWithoutPayments = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => item.contractId && !item.lastPaymentDate)
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, 5);
  const offlineDrivers = [...(driversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => ["day_off", "vacation", "force_majeure", "accident", "idle"].includes(item.status))
    .sort((left, right) => {
      const priority = ["accident", "force_majeure", "idle", "vacation", "day_off"];
      const leftIndex = priority.indexOf(left.status);
      const rightIndex = priority.indexOf(right.status);

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return right.overdueDebt - left.overdueDebt;
    })
    .slice(0, 5);
  const topUpcomingContracts = [...activeContracts]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.nextDueDate && item.nextDueAmount && item.nextDueAmount > 0)
    .sort((left, right) => (left.nextDueDate ?? "").localeCompare(right.nextDueDate ?? ""))
    .slice(0, 5);
  const topDebtContracts = [...activeContracts]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.currentDebt > 0)
    .sort((left, right) => right.currentDebt - left.currentDebt)
    .slice(0, 5);
  const paidContractIds = new Set((paymentsApi.data ?? []).map((item) => item.contractId));
  const contractsWithoutPayments = [...(contractsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "active" && !paidContractIds.has(item.id))
    .sort((left, right) => left.contractNumber.localeCompare(right.contractNumber))
    .slice(0, 5);
  const boughtOutContracts = [...(contractsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "closed")
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 5);
  const terminatedContracts = [...(contractsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "terminated" || item.status === "defaulted")
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 5);
  const recentContracts = [...(contractsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 5);
  const driversWithoutContract = [...(crmDriversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => !item.activeContractId)
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, 5);
  const driversWithoutManager = [...(crmDriversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .filter((item) => !item.managerId)
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, 5);
  const recentDrivers = [...(crmDriversApi.data ?? [])]
    .filter((item) => matchesCompany(item.id, null))
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, 5);
  const scopedDriversForRisk = [...(crmDriversApi.data ?? [])].filter((item) => matchesCompany(item.id, null));
  const driverRiskCounts = {
    normal: scopedDriversForRisk.filter((item) => (item.riskStatus ?? "normal") === "normal").length,
    medium: scopedDriversForRisk.filter((item) => item.riskStatus === "medium").length,
    risk: scopedDriversForRisk.filter((item) => item.riskStatus === "risk").length,
  };
  const driverRiskChanges = [...(riskStatusChangesApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, null))
    .slice(0, 8);
  const driverCreditMap = new Map((crmDriversApi.data ?? []).map((item) => [item.id, item.creditBalance]));
  const vehiclesWithoutDriver = [...(vehiclesApi.data ?? [])]
    .filter((item) => matchesCompany(item.assignedDriverId, item.id))
    .filter((item) => !item.assignedDriverId)
    .sort((left, right) => left.plateNumber.localeCompare(right.plateNumber))
    .slice(0, 5);
  const recentVehicles = [...(vehiclesApi.data ?? [])]
    .filter((item) => matchesCompany(item.assignedDriverId, item.id))
    .sort((left, right) => left.plateNumber.localeCompare(right.plateNumber))
    .slice(0, 5);
  const activeContractByCarId = activeContracts.reduce<Map<string, ContractListItem>>((acc, item) => {
    acc.set(item.carId, item);
    return acc;
  }, new Map());
  const contractCountByCarId = (contractsApi.data ?? []).reduce<Map<string, number>>((acc, item) => {
    acc.set(item.carId, (acc.get(item.carId) ?? 0) + 1);
    return acc;
  }, new Map());
  const longestTermMonthsByCarId = (contractsApi.data ?? []).reduce<Map<string, number>>((acc, item) => {
    acc.set(item.carId, Math.max(acc.get(item.carId) ?? 0, item.termMonths ?? 0));
    return acc;
  }, new Map());
  const riskyVehicles = [...(vehiclesApi.data ?? [])]
    .filter((item) => matchesCompany(item.assignedDriverId, item.id))
    .filter((item) => getVehicleRiskReasons(item, contractCountByCarId, longestTermMonthsByCarId, activeContractByCarId).length > 0)
    .sort((left, right) => left.plateNumber.localeCompare(right.plateNumber))
    .slice(0, 5);
  const creditPayments = [...(paymentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.contractId ? contractsApi.data?.find((contract) => contract.id === item.contractId)?.carId : null))
    .filter((item) => item.unappliedAmount > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);
  const recentPayments = [...(paymentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.contractId ? contractsApi.data?.find((contract) => contract.id === item.contractId)?.carId : null))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);
  const recentPayouts = [...(payoutsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, null))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);
  const requestedRecentPayouts = recentPayouts.filter((item) => item.status === "requested");
  const pendingRecentStatusRequests = recentStatusRequests.filter((item) => item.status === "pending");
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
  const availablePayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of driversApi.data ?? []) {
      amounts.set(item.id, Math.max(0, item.yandexBalance - (requestedPayoutAmountByDriverId.get(item.id) ?? 0) - 100));
    }

    return amounts;
  }, [driversApi.data, requestedPayoutAmountByDriverId]);
  const openIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open")
    .sort((left, right) => {
      if (left.priority === right.priority) {
        return left.title.localeCompare(right.title);
      }
      return left.priority === "high" ? -1 : 1;
    })
    .slice(0, 5);
  const archivedIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived").length;
  const archivedAccidentIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived" && isAccidentIncident(item)).length;
  const archivedServiceIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived" && isServiceIncident(item)).length;
  const archivedInsuranceGpsIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived" && isInsuranceGpsIncident(item)).length;
  const archivedFineIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived" && isFineIncident(item)).length;
  const archivedInspectionIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived" && isInspectionIncident(item)).length;
  const archivedBlacklistIncidentsCount = (incidentsApi.data ?? []).filter((item) => item.status === "archived" && isBlacklistIncident(item)).length;
  const accidentIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open" && isAccidentIncident(item))
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
    .slice(0, 5);
  const serviceIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open" && isServiceIncident(item))
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
    .slice(0, 5);
  const insuranceGpsIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open" && isInsuranceGpsIncident(item))
    .sort((left, right) => ((right.periodLabel ?? right.occurredAt ?? "").localeCompare(left.periodLabel ?? left.occurredAt ?? "")))
    .slice(0, 5);
  const fineIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open" && isFineIncident(item))
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
    .slice(0, 5);
  const inspectionIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open" && isInspectionIncident(item))
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
    .slice(0, 5);
  const blacklistIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
    .filter((item) => item.status === "open" && isBlacklistIncident(item))
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
    .slice(0, 5);
  const recentIncidents = [...(incidentsApi.data ?? [])]
    .filter((item) => matchesCompany(item.driverId, item.carId))
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
    .slice(0, 5);

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
  const deliveryIssues = [
    ...(notificationsApi.data ?? [])
      .filter((item) => item.status === "failed" || item.status === "pending")
      .map((item) => ({
        id: `notification-${item.id}`,
        label: item.status === "failed" ? "Ошибка доставки уведомления" : "Уведомление ожидает отправки",
        detail: item.template.startsWith("payout_") ? "По выплате" : "Служебное уведомление",
        to: "/notifications",
        actionLabel: "Открыть уведомления",
      })),
    ...(outboxApi.data ?? [])
      .filter((item) => item.status === "failed" || item.status === "pending" || item.status === "queued")
      .map((item) => ({
        id: `outbox-${item.id}`,
        label:
          item.status === "failed"
            ? "Ошибка отправки события"
            : item.status === "queued"
              ? "Событие в очереди"
              : "Событие ожидает обработку",
        detail: item.topic.startsWith("payment.")
          ? "Платёжное событие"
          : item.topic.startsWith("payout.")
            ? "Событие по выплате"
            : "Интеграционное событие",
        to: "/outbox",
        actionLabel: "Открыть события",
      })),
  ].slice(0, 5);
  const retryableNotificationIds = (notificationsApi.data ?? [])
    .filter((item) => matchesCompany(item.driverId, null))
    .filter((item) => item.status === "failed" || item.status === "pending")
    .map((item) => item.id);
  const retryableOutboxIds = (outboxApi.data ?? [])
    .filter((item) => item.status === "failed" || item.status === "pending" || item.status === "queued")
    .map((item) => item.id);
  const recentNotifications = [...(notificationsApi.data ?? [])]
    .sort((left, right) => right.id.localeCompare(left.id))
    .slice(0, 5);
  const recentOutboxEvents = [...(outboxApi.data ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);
  const recentLedgerEntries = [...(ledgerApi.data ?? [])]
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .slice(0, 5);
  const usersWithoutMfa = [...(usersApi.data ?? [])]
    .filter((item) => !item.mfaEnabled)
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);
  const managersInSystem = [...(usersApi.data ?? [])]
    .filter((item) => item.role === "manager")
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);
  const financeRolesInSystem = [...(usersApi.data ?? [])]
    .filter((item) => ["owner", "admin", "finance"].includes(item.role))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);
  const operationsRolesInSystem = [...(usersApi.data ?? [])]
    .filter((item) => ["operator", "auditor"].includes(item.role))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);
  const driverAccountsInSystem = [...(usersApi.data ?? [])]
    .filter((item) => item.role === "driver")
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);
  const inactiveUsers = [...(usersApi.data ?? [])]
    .filter((item) => item.status !== "active")
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);
  const recentUsers = [...(usersApi.data ?? [])]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, 5);

  const reportCatalog: ReportCatalogItem[] = [
    {
      id: "overview",
      title: "Сводка парка",
      subtitle: "Собираемость, долг, выплаты и очередь событий",
      count: 5,
      to: "/dashboard",
      headers: ["Показатель", "Значение", "Раздел"],
      rows: [
        ["Собираемость", `${api.data?.collectionRatePercent ?? 0}%`, "Отчеты"],
        ["Просроченный долг", formatCurrency(api.data?.overdueDebtTotal ?? 0), "Водители"],
        ["Заявки на вывод", String(api.data?.requestedPayoutsCount ?? 0), "Выплаты"],
        ["Открытые инциденты", String(api.data?.openIncidentsCount ?? 0), "Инциденты"],
        ["Очередь событий", String(api.data?.pendingOutboxCount ?? 0), "Очередь событий"],
      ],
    },
    {
      id: "debts",
      title: "Задолженность",
      subtitle: "Водители и договоры с долгом",
      count: topOverdueDrivers.length + topDebtContracts.length,
      to: "/drivers?status=overdue",
      headers: ["Водитель / договор", "Сумма", "Действие"],
      rows: [
        ...topOverdueDrivers.map((item) => [item.fullName, formatCurrency(item.overdueDebt), "Подготовить платеж"]),
        ...topDebtContracts.map((item) => [item.contractNumber, formatCurrency(item.currentDebt), "Открыть договор"]),
      ],
    },
    {
      id: "payments",
      title: "Платежи",
      subtitle: "Последние платежи и свободные остатки",
      count: recentPayments.length + creditPayments.length,
      to: "/payments",
      headers: ["Дата", "Сумма", "Статус"],
      rows: [
        ...recentPayments.map((item) => [formatDateOnly(item.createdAt), formatCurrency(item.amount), getPaymentProviderLabel(item.provider)]),
        ...creditPayments.map((item) => [formatDateOnly(item.createdAt), formatCurrency(item.unappliedAmount), "Свободный остаток"]),
      ],
    },
    {
      id: "payouts",
      title: "Выводы",
      subtitle: "Заявки водителей на вывод средств",
      count: recentPayouts.length,
      to: "/payouts",
      headers: ["Водитель", "Сумма", "Статус"],
      rows: recentPayouts.map((item) => [
        item.driverId,
        formatCurrency(item.amount),
        getStatusLabel(item.status),
      ]),
    },
    {
      id: "incidents",
      title: "Инциденты",
      subtitle: "ДТП, СТО, штрафы, осмотры и архив",
      count: recentIncidents.length,
      to: "/incidents?view=operations",
      headers: ["Дата", "Тип", "Описание"],
      rows: recentIncidents.map((item) => [
        formatDateOnly(item.occurredAt),
        getIncidentTypeLabel(item.incidentType),
        item.description ?? item.title,
      ]),
    },
    {
      id: "vehicles",
      title: "Автомобили",
      subtitle: "Свободные машины и машины под наблюдением",
      count: vehiclesWithoutDriver.length + riskyVehicles.length,
      to: "/vehicles",
      headers: ["Авто", "Статус", "Причина"],
      rows: [
        ...vehiclesWithoutDriver.map((item) => [item.plateNumber, getStatusLabel(item.status), "Без водителя"]),
        ...riskyVehicles.map((item) => [
          item.plateNumber,
          getStatusLabel(item.status),
          getVehicleRiskReasons(item, contractCountByCarId, longestTermMonthsByCarId, activeContractByCarId).join(", "),
        ]),
      ],
    },
    {
      id: "drivers",
      title: "Водители",
      subtitle: "Без договора, без бригадира и риск-статусы",
      count: driversWithoutContract.length + driversWithoutManager.length + driverRiskChanges.length,
      to: "/drivers",
      headers: ["Водитель", "Статус", "Комментарий"],
      rows: [
        ...driversWithoutContract.map((item) => [item.fullName, getStatusLabel(item.status), "Нет активного договора"]),
        ...driversWithoutManager.map((item) => [item.fullName, getStatusLabel(item.status), "Нет бригадира"]),
        ...driverRiskChanges.map((item) => [item.driverName, getDriverRiskStatusLabel(item.nextStatus), formatDateOnly(item.changedAt)]),
      ],
    },
    {
      id: "users",
      title: "Пользователи",
      subtitle: "Роли, доступ и защита входа",
      count: recentUsers.length + usersWithoutMfa.length,
      to: "/users",
      headers: ["Пользователь", "Роль", "Статус"],
      rows: recentUsers.map((item) => [item.displayName, getUserRoleLabel(item.role), getStatusLabel(item.status)]),
    },
  ];
  const visibleReportCatalog = reportCatalog.filter((item) =>
    `${item.title} ${item.subtitle}`.toLowerCase().includes(reportSearch.trim().toLowerCase()),
  );
  const selectedReport = reportCatalog.find((item) => item.id === selectedReportId) ?? reportCatalog[0];

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
        await postJson<OutboxReportItem, Record<string, never>>(`outbox/${eventId}/retry`, {});
      }
      setDeliveryMessage(`Переочередь поставлена для ${outboxIds.length} событий.`);
      await outboxApi.refetch();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Не удалось поставить события в повторную обработку.");
    } finally {
      setDeliveryRetrying(false);
    }
  }

  async function loadRecentStatusRequests(): Promise<void> {
    setStatusRequestsLoading(true);
    setStatusRequestsError(null);

    try {
      const drivers = await fetchJson<ManagerAssignedDriverItem[]>("mobile/manager/drivers");
      const details = await Promise.all(
        drivers.slice(0, 12).map((driver) =>
          fetchJson<ManagerDriverDetail>(`mobile/manager/drivers/${driver.id}`).catch(() => null),
        ),
      );

      const requests = details
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

      setRecentStatusRequests(requests);
      setStatusRequestsLoading(false);
    } catch (error) {
      setStatusRequestsError(error instanceof Error ? error.message : "Не удалось загрузить статусные запросы.");
      setStatusRequestsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void loadRecentStatusRequests().catch(() => {
      if (!cancelled) {
        setStatusRequestsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePayoutAction(payoutId: string, action: "approve" | "reject"): Promise<void> {
    setApprovalMessage(null);
    setApprovalError(null);
    setApprovalLoading(true);
    try {
      await postJson(`approvals/payouts/${payoutId}/${action}`, {});
      setApprovalMessage(
        action === "approve" ? "Заявка на вывод согласована." : "Заявка на вывод отклонена.",
      );
      setSelectedPayoutIds((current) => current.filter((item) => item !== payoutId));
      await payoutsApi.refetch();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Не удалось обновить заявку на вывод.");
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleBulkPayoutAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedPayoutIds.length) {
      return;
    }

    setApprovalMessage(null);
    setApprovalError(null);
    setApprovalLoading(true);
    try {
      for (const payoutId of selectedPayoutIds) {
        await postJson(`approvals/payouts/${payoutId}/${action}`, {});
      }
      setApprovalMessage(
        action === "approve"
          ? `Согласовано заявок: ${selectedPayoutIds.length}.`
          : `Отклонено заявок: ${selectedPayoutIds.length}.`,
      );
      setSelectedPayoutIds([]);
      await payoutsApi.refetch();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Не удалось массово обновить заявки на вывод.");
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleStatusRequestAction(requestId: string, action: "approve" | "reject"): Promise<void> {
    setApprovalMessage(null);
    setApprovalError(null);
    setApprovalLoading(true);
    try {
      await postJson(`approvals/status-requests/${requestId}/${action}`, {});
      setApprovalMessage(
        action === "approve" ? "Статусный запрос подтверждён." : "Статусный запрос отклонён.",
      );
      setSelectedStatusRequestIds((current) => current.filter((item) => item !== requestId));
      await loadRecentStatusRequests();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Не удалось обновить статусный запрос.");
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleBulkStatusRequestAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedStatusRequestIds.length) {
      return;
    }

    setApprovalMessage(null);
    setApprovalError(null);
    setApprovalLoading(true);
    try {
      for (const requestId of selectedStatusRequestIds) {
        await postJson(`approvals/status-requests/${requestId}/${action}`, {});
      }
      setApprovalMessage(
        action === "approve"
          ? `Подтверждено запросов: ${selectedStatusRequestIds.length}.`
          : `Отклонено запросов: ${selectedStatusRequestIds.length}.`,
      );
      setSelectedStatusRequestIds([]);
      await loadRecentStatusRequests();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Не удалось массово обновить статусные запросы.");
    } finally {
      setApprovalLoading(false);
    }
  }

  function handleExport(): void {
    if (!api.data) {
      return;
    }

    downloadCsv("gopark-reports-overview.csv", [
      ["collection_rate_percent", api.data.collectionRatePercent],
      ["overdue_debt_total", api.data.overdueDebtTotal],
      ["requested_payouts_count", api.data.requestedPayoutsCount],
      ["open_incidents_count", api.data.openIncidentsCount],
      ["pending_outbox_count", api.data.pendingOutboxCount],
    ]);
  }

  function handleSelectedReportExport(): void {
    downloadCsvTable(
      `gopark-report-${selectedReport.id}.csv`,
      selectedReport.headers,
      selectedReport.rows.length ? selectedReport.rows : [["Нет данных", "", ""]],
    );
  }

  return (
    <section className="page-stack reports-page">
      <div className="hero-card">
        <p className="eyebrow">Отчеты</p>
        <h2>Отчеты</h2>
        <p>Сводка по собираемости, долгу, выплатам и инцидентам.</p>
        <div className="toolbar">
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Все компании</option>
            {companies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {api.data ? (
            <button onClick={handleExport}>Скачать CSV</button>
          ) : null}
        </div>
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!api.data}
        emptyContent={
          <EmptyStatePanel
            title="Отчетность пока недоступна"
            message="Сводный отчёт пока не готов. Проверьте, появились ли данные для текущего периода, и обновите страницу позже."
          />
        }
      >
        <article className="panel reports-workspace">
          <div className="reports-toolbar">
            <div>
              <h3>Отчеты</h3>
              <p className="panel-note">Выберите отчет, посмотрите данные в веб-версии или скачайте CSV.</p>
            </div>
            <input
              value={reportSearch}
              onChange={(event) => setReportSearch(event.target.value)}
              placeholder="Поиск отчета..."
            />
          </div>
          <div className="reports-chip-grid">
            {visibleReportCatalog.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`report-chip-card${selectedReport.id === item.id ? " report-chip-card--active" : ""}`}
                onClick={() => setSelectedReportId(item.id)}
              >
                <span>{item.title}</span>
                <strong>{item.count}</strong>
                <p>{item.subtitle}</p>
              </button>
            ))}
          </div>
          <div className="report-preview-card">
            <div className="report-preview-card__header">
              <div>
                <span className="eyebrow">Предпросмотр</span>
                <h3>{selectedReport.title}</h3>
                <p>{selectedReport.subtitle}</p>
              </div>
              <div className="toolbar">
                <Link className="button-link" to={selectedReport.to}>
                  Смотреть раздел
                </Link>
                <button type="button" onClick={handleSelectedReportExport}>
                  Скачать CSV
                </button>
              </div>
            </div>
            {selectedReport.rows.length ? (
              <div className="table-scroll">
                <table className="data-table report-preview-table">
                  <thead>
                    <tr>
                      {selectedReport.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.rows.slice(0, 10).map((row, rowIndex) => (
                      <tr key={`${selectedReport.id}-${rowIndex}`}>
                        {selectedReport.headers.map((header, cellIndex) => (
                          <td key={`${header}-${cellIndex}`}>{row[cellIndex] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyStatePanel title="Данных нет" message="По этому отчету сейчас нет строк для выбранной компании." />
            )}
          </div>
        </article>
        <div className="stats-grid">
          <Link className="metric-card metric-card--link" to="/reports">
            <span>Собираемость</span>
            <strong>{api.data?.collectionRatePercent ?? 0}%</strong>
            <p className="metric-card__sub">Доля закрытых обязательств</p>
          </Link>
          <Link className="metric-card metric-card--link" to="/drivers">
            <span>Просроченный долг</span>
            <strong>{formatCurrency(api.data?.overdueDebtTotal ?? 0)}</strong>
            <p className="metric-card__sub">Текущий портфель долга</p>
          </Link>
          <Link className="metric-card metric-card--link" to="/payouts">
            <span>Заявки на вывод</span>
            <strong>{api.data?.requestedPayoutsCount ?? 0}</strong>
            <p className="metric-card__sub">Ожидают согласования</p>
          </Link>
          <Link className="metric-card metric-card--link" to="/incidents?view=operations">
            <span>Открытые инциденты</span>
            <strong>{api.data?.openIncidentsCount ?? 0}</strong>
            <p className="metric-card__sub">Операционные кейсы</p>
          </Link>
          <Link className="metric-card metric-card--link" to="/incidents?view=archive">
            <span>В архиве</span>
            <strong>{archivedIncidentsCount}</strong>
            <p className="metric-card__sub">История operational-кейсов</p>
          </Link>
        </div>
        <article className="panel">
          <h3>Что требует внимания</h3>
          <div className="stack-list">
            {(api.data?.overdueDebtTotal ?? 0) > 0 ? (
              <Link className="table-link" to="/drivers">
                Есть просрочка по водителям: {formatCurrency(api.data?.overdueDebtTotal ?? 0)}
              </Link>
            ) : null}
            {(api.data?.requestedPayoutsCount ?? 0) > 0 ? (
              <Link className="table-link" to="/payouts">
                На согласовании выплат: {api.data?.requestedPayoutsCount ?? 0}
              </Link>
            ) : null}
            {(api.data?.openIncidentsCount ?? 0) > 0 ? (
              <Link className="table-link" to="/incidents?view=operations">
                Открытых инцидентов: {api.data?.openIncidentsCount ?? 0}
              </Link>
            ) : null}
            {(api.data?.pendingOutboxCount ?? 0) > 0 ? (
              <Link className="table-link" to="/outbox">
                Ожидающих событий: {api.data?.pendingOutboxCount ?? 0}
              </Link>
            ) : null}
            {(api.data?.overdueDebtTotal ?? 0) === 0 &&
            (api.data?.requestedPayoutsCount ?? 0) === 0 &&
            (api.data?.openIncidentsCount ?? 0) === 0 &&
            (api.data?.pendingOutboxCount ?? 0) === 0 ? (
              <p className="panel-note">Критичных очередей сейчас нет.</p>
            ) : null}
          </div>
        </article>
        <article className="panel">
          <h3>Риск-статусы водителей</h3>
          <AsyncState
            loading={crmDriversApi.loading || riskStatusChangesApi.loading}
            error={crmDriversApi.error || riskStatusChangesApi.error}
            empty={!scopedDriversForRisk.length}
            emptyContent={
              <EmptyStatePanel
                title="Нет водителей для отчёта"
                message="Добавьте водителей или выберите другую компанию."
              />
            }
          >
            <div className="stats-grid">
              <article className="metric-card">
                <span>Нормальный</span>
                <strong>{driverRiskCounts.normal}</strong>
                <p className="metric-card__sub">Водители без риска</p>
              </article>
              <article className="metric-card">
                <span>Средний</span>
                <strong>{driverRiskCounts.medium}</strong>
                <p className="metric-card__sub">Нужно контролировать</p>
              </article>
              <article className="metric-card">
                <span>Зона риска</span>
                <strong>{driverRiskCounts.risk}</strong>
                <p className="metric-card__sub">Требует внимания бригадира</p>
              </article>
            </div>
            <h4>Последние изменения</h4>
            {driverRiskChanges.length ? (
              <div className="stack-list">
                {driverRiskChanges.map((item) => (
                  <div className="table-row" key={item.id}>
                    <span>{item.driverName}</span>
                    <strong>
                      {item.previousStatus ? getDriverRiskStatusLabel(item.previousStatus) : "Не задан"} →{" "}
                      {getDriverRiskStatusLabel(item.nextStatus)}
                    </strong>
                    <small>{formatDateOnly(item.changedAt)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="panel-note">Истории изменений пока нет. Все водители по умолчанию в статусе “Нормальный”.</p>
            )}
          </AsyncState>
        </article>
        <article className="panel">
          <h3>Состояние отчётности</h3>
          <p className="panel-note">
            Ожидающих событий: <strong>{api.data?.pendingOutboxCount ?? 0}</strong>.
          </p>
          {(api.data?.pendingOutboxCount ?? 0) > 0 ? (
            <Link className="table-link" to="/outbox">Перейти в очередь событий</Link>
          ) : null}
        </article>
        <div className="table-grid">
          <article className="panel">
            <h3>Лидеры по просрочке</h3>
            <AsyncState
              loading={driversApi.loading}
              error={driversApi.error}
              empty={!topOverdueDrivers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Просрочки нет"
                  message="Сейчас нет водителей с открытой просрочкой."
                />
              }
            >
              <div className="summary-list">
                {topOverdueDrivers.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {formatCurrency(item.overdueDebt)}</span>
                    <strong>
                      {item.contractId ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=reports&driverId=${item.id}&contractId=${item.contractId}&amount=${item.overdueDebt}`}
                        >
                          Подготовить платёж
                        </Link>
                      ) : (
                        <Link className="table-link" to={`/drivers/${item.id}`}>
                          Открыть водителя
                        </Link>
                      )}
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Лидеры по переплате</h3>
            <AsyncState
              loading={driversApi.loading}
              error={driversApi.error}
              empty={!topCreditDrivers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Свободной переплаты нет"
                  message="Сейчас нет водителей со свободным остатком."
                />
              }
            >
              <div className="summary-list">
                {topCreditDrivers.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {formatCurrency(item.creditBalance)}</span>
                    <strong>
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=credit-writeoff&source=reports&driverId=${item.id}&amount=${item.creditBalance}&reason=${encodeURIComponent("Ручная корректировка")}`}
                      >
                        Списать остаток
                      </Link>
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Лидеры по балансу агрегатора</h3>
            <AsyncState
              loading={driversApi.loading}
              error={driversApi.error}
              empty={!topYandexBalanceDrivers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Баланса агрегатора нет"
                  message="Сейчас нет водителей с положительным балансом агрегатора."
                />
              }
            >
              <div className="summary-list">
                {topYandexBalanceDrivers.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {formatCurrency(item.yandexBalance)}</span>
                    <strong>
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Ближайшие платежи по водителям</h3>
            <AsyncState
              loading={driversApi.loading}
              error={driversApi.error}
              empty={!topUpcomingDrivers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Ближайших платежей нет"
                  message="Сейчас нет водителей с ближайшим платежом."
                />
              }
            >
              <div className="summary-list">
                {topUpcomingDrivers.map((item) => (
                  <div key={item.id}>
                    {(() => {
                      const isOverdue = Boolean(item.nextPaymentDate) && item.nextPaymentAmount > 0 && new Date(item.nextPaymentDate!).getTime() < Date.now();
                      return (
                    <span>
                      {item.fullName} · {formatCurrency(item.nextPaymentAmount)}{" "}
                      {isOverdue
                        ? "просрочено с"
                        : "до"}{" "}
                      {formatDateOnly(item.nextPaymentDate)}
                    </span>
                      );
                    })()}
                    <strong>
                      {item.contractId ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=reports&driverId=${item.id}&contractId=${item.contractId}&amount=${item.nextPaymentAmount}`}
                        >
                          Подготовить платёж
                        </Link>
                      ) : (
                        <Link className="table-link" to={`/drivers/${item.id}`}>
                          Открыть водителя
                        </Link>
                      )}
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Водители без платежей</h3>
            <AsyncState
              loading={driversApi.loading}
              error={driversApi.error}
              empty={!driversWithoutPayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="История оплат есть у всех"
                  message="Сейчас в отчётной выборке нет водителей с договором без зарегистрированных платежей."
                />
              }
            >
              <div className="summary-list">
                {driversWithoutPayments.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {item.phone}</span>
                    <strong>Платежей ещё не было</strong>
                    <div className="toolbar">
                      {item.contractId && item.nextPaymentAmount > 0 ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payment&source=reports&driverId=${item.id}&contractId=${item.contractId}&amount=${item.nextPaymentAmount}`}
                        >
                          Подготовить платёж
                        </Link>
                      ) : null}
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Ближайшие обязательства</h3>
            <AsyncState
              loading={contractsApi.loading}
              error={contractsApi.error}
              empty={!topUpcomingContracts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Ближайших обязательств нет"
                  message="Сейчас нет договоров с ближайшим обязательством."
                />
              }
            >
              <div className="summary-list">
                {topUpcomingContracts.map((item) => (
                  <div key={item.id}>
                    {(() => {
                      const isOverdue = Boolean(item.nextDueDate) && (item.currentDebt ?? 0) > 0 && new Date(item.nextDueDate!).getTime() < Date.now();
                      return (
                    <span>
                      {item.contractNumber} · {formatCurrency(item.nextDueAmount ?? 0)}{" "}
                      {isOverdue
                        ? "просрочено с"
                        : "до"}{" "}
                      {formatDateOnly(item.nextDueDate)}
                    </span>
                      );
                    })()}
                    <strong>
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=payment&source=reports&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt}`}
                      >
                        Подготовить платёж
                      </Link>
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Договоры с долгом</h3>
            <AsyncState
              loading={contractsApi.loading}
              error={contractsApi.error}
              empty={!topDebtContracts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Договоров с долгом нет"
                  message="Сейчас нет договоров с открытым долгом в отчётной выборке."
                />
              }
            >
              <div className="summary-list">
                {topDebtContracts.map((item) => (
                  <div key={item.id}>
                    <span>{item.contractNumber} · {formatCurrency(item.currentDebt)}</span>
                    <strong>
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=payment&source=reports&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt}`}
                      >
                        Подготовить платёж
                      </Link>
                    </strong>
                    <Link className="table-link" to={`/contracts/${item.id}`}>
                      Открыть договор
                    </Link>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Договоры без платежей</h3>
            <AsyncState
              loading={contractsApi.loading || paymentsApi.loading}
              error={contractsApi.error ?? paymentsApi.error}
              empty={!contractsWithoutPayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="История оплат есть у всех договоров"
                  message="Сейчас в отчётной выборке нет активных договоров без зарегистрированных платежей."
                />
              }
            >
              <div className="summary-list">
                {contractsWithoutPayments.map((item) => (
                  <div key={item.id}>
                    <span>{item.contractNumber} · {formatCurrency(item.currentDebt)}</span>
                    <strong>Платежей по договору ещё не было</strong>
                    <div className="toolbar">
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=payment&source=reports&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt}`}
                      >
                        Подготовить платёж
                      </Link>
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Выкупленные договоры</h3>
            <AsyncState
              loading={contractsApi.loading}
              error={contractsApi.error}
              empty={!boughtOutContracts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Выкупленных договоров нет"
                  message="Сейчас нет выкупленных договоров в отчётной выборке."
                />
              }
            >
              <div className="summary-list">
                {boughtOutContracts.map((item) => (
                  <div key={item.id}>
                    <span>{item.contractNumber}</span>
                    <strong>
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                    </strong>
                    <Link className="table-link" to={`/drivers/${item.driverId}`}>
                      Открыть водителя
                    </Link>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Расторгнутые договоры</h3>
            <AsyncState
              loading={contractsApi.loading}
              error={contractsApi.error}
              empty={!terminatedContracts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Расторгнутых договоров нет"
                  message="Сейчас нет расторгнутых договоров в отчётной выборке."
                />
              }
            >
              <div className="summary-list">
                {terminatedContracts.map((item) => (
                  <div key={item.id}>
                    <span>{item.contractNumber}</span>
                    <strong>
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                    </strong>
                    <Link className="table-link" to={`/drivers/${item.driverId}`}>
                      Открыть водителя
                    </Link>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые платежи</h3>
            <AsyncState
              loading={paymentsApi.loading}
              error={paymentsApi.error}
              empty={!recentPayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="Платежей пока нет"
                  message="Новые входящие платежи появятся здесь сразу после регистрации."
                />
              }
            >
              <div className="summary-list">
                {recentPayments.map((item) => (
                  <div key={item.id}>
                    <span>{formatDateOnly(item.createdAt)} · {getPaymentProviderLabel(item.provider)}</span>
                    <strong>
                      {formatCurrency(item.amount)}
                      {item.appliedAmount > 0 ? ` · оплачено ${formatCurrency(item.appliedAmount)}` : ""}
                      {item.unappliedAmount > 0 ? ` · остаток ${formatCurrency(item.unappliedAmount)}` : ""}
                    </strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        Открыть водителя
                      </Link>
                      <Link className="table-link" to={`/contracts/${item.contractId}`}>
                        Открыть договор
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Платежи со свободным остатком</h3>
            <AsyncState
              loading={paymentsApi.loading}
              error={paymentsApi.error}
              empty={!creditPayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="Платежей со свободным остатком пока нет"
                  message="Сейчас в отчётной выборке нет платежей, после которых остался свободный остаток."
                />
              }
            >
              <div className="summary-list">
                {creditPayments.map((item) => (
                  <div key={item.id}>
                    <span>{formatCurrency(item.unappliedAmount)} · {formatDateOnly(item.createdAt)}</span>
                    <strong>
                      {(driverCreditMap.get(item.driverId) ?? 0) > 0 ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=credit-writeoff&source=reports&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                        >
                          Списать остаток
                        </Link>
                      ) : null}
                    </strong>
                    <Link className="table-link" to={`/contracts/${item.contractId}`}>
                      Открыть договор
                    </Link>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые выводы</h3>
            {approvalMessage ? <div className="panel-note">{approvalMessage}</div> : null}
            {approvalError ? <div className="panel-note">Ошибка: {approvalError}</div> : null}
            {canApprovePayout && requestedRecentPayouts.length > 0 ? (
              <div className="toolbar">
                <button type="button" className="button-secondary" onClick={() => setSelectedPayoutIds(requestedRecentPayouts.map((item) => item.id))}>
                  Выбрать все
                </button>
                <button type="button" className="button-secondary" onClick={() => setSelectedPayoutIds([])}>
                  Снять выбор
                </button>
                <span>Выбрано: {selectedPayoutIds.length}</span>
                <button type="button" disabled={!selectedPayoutIds.length || approvalLoading} onClick={() => void handleBulkPayoutAction("approve")}>
                  {approvalLoading ? "Согласуем..." : "Массово одобрить"}
                </button>
                <button type="button" className="button-secondary" disabled={!selectedPayoutIds.length || approvalLoading} onClick={() => void handleBulkPayoutAction("reject")}>
                  {approvalLoading ? "Отклоняем..." : "Массово отклонить"}
                </button>
              </div>
            ) : null}
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
              <div className="summary-list">
                {recentPayouts.map((item) => (
                  <div key={item.id}>
                    <span>{formatDateOnly(item.createdAt)} · {formatCurrency(item.amount)}</span>
                    <strong>
                      {item.status === "approved" ? "Вывод согласован" : item.status === "requested" ? "Ожидает согласования" : getStatusLabel(item.status)}
                    </strong>
                    <div className="toolbar">
                      {canApprovePayout && item.status === "requested" ? (
                        <input
                          type="checkbox"
                          checked={selectedPayoutIds.includes(item.id)}
                          onChange={() =>
                            setSelectedPayoutIds((current) =>
                              current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id],
                            )
                          }
                        />
                      ) : null}
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        Открыть водителя
                      </Link>
                      {canApprovePayout && item.status === "requested" ? (
                        <>
                          <button type="button" className="button-secondary" disabled={approvalLoading} onClick={() => void handlePayoutAction(item.id, "approve")}>
                            Одобрить
                          </button>
                          <button type="button" className="button-secondary" disabled={approvalLoading} onClick={() => void handlePayoutAction(item.id, "reject")}>
                            Отклонить
                          </button>
                        </>
                      ) : null}
                      {(availablePayoutAmountByDriverId.get(item.driverId) ?? 0) > 0 ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payout&source=reports&driverId=${item.driverId}&amount=${availablePayoutAmountByDriverId.get(item.driverId) ?? 0}`}
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
          <article className="panel">
            <h3>Служба поддержки</h3>
            {canApproveStatusRequest && pendingRecentStatusRequests.length > 0 ? (
              <div className="toolbar">
                <button type="button" className="button-secondary" onClick={() => setSelectedStatusRequestIds(pendingRecentStatusRequests.map((item) => item.requestId))}>
                  Выбрать все
                </button>
                <button type="button" className="button-secondary" onClick={() => setSelectedStatusRequestIds([])}>
                  Снять выбор
                </button>
                <span>Выбрано: {selectedStatusRequestIds.length}</span>
                <button type="button" disabled={!selectedStatusRequestIds.length || approvalLoading} onClick={() => void handleBulkStatusRequestAction("approve")}>
                  {approvalLoading ? "Подтверждаем..." : "Массово подтвердить"}
                </button>
                <button type="button" className="button-secondary" disabled={!selectedStatusRequestIds.length || approvalLoading} onClick={() => void handleBulkStatusRequestAction("reject")}>
                  {approvalLoading ? "Отклоняем..." : "Массово отклонить"}
                </button>
              </div>
            ) : null}
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
              loading={statusRequestsLoading}
              error={statusRequestsError}
              empty={!recentStatusRequests.length}
              emptyContent={
                <EmptyStatePanel
                  title="Подтверждений пока нет"
                  message="Новые, одобренные и отклонённые подтверждения появятся здесь после обработки."
                />
              }
            >
              <div className="summary-list">
                {recentStatusRequests.map((item) => (
                  <div key={item.requestId}>
                    <span>{item.driverName} · {item.period}</span>
                    <strong>{getStatusLabel(item.type)} · {getStatusLabel(item.status)}</strong>
                    <div className="toolbar">
                      {canApproveStatusRequest && item.status === "pending" ? (
                        <input
                          type="checkbox"
                          checked={selectedStatusRequestIds.includes(item.requestId)}
                          onChange={() =>
                            setSelectedStatusRequestIds((current) =>
                              current.includes(item.requestId)
                                ? current.filter((value) => value !== item.requestId)
                                : [...current, item.requestId],
                            )
                          }
                        />
                      ) : null}
                      <Link className="table-link" to="/support">
                        Открыть службу поддержки
                      </Link>
                      <Link className="table-link" to={`/support?theme=${item.type}`}>
                        Открыть тему
                      </Link>
                      {canApproveStatusRequest && item.status === "pending" ? (
                        <>
                          <button type="button" className="button-secondary" disabled={approvalLoading} onClick={() => void handleStatusRequestAction(item.requestId, "approve")}>
                            Подтвердить
                          </button>
                          <button type="button" className="button-secondary" disabled={approvalLoading} onClick={() => void handleStatusRequestAction(item.requestId, "reject")}>
                            Отклонить
                          </button>
                        </>
                      ) : null}
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        Открыть водителя
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Водители вне линии</h3>
            <AsyncState
              loading={driversApi.loading}
              error={driversApi.error}
              empty={!offlineDrivers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Все водители на линии"
                  message="Сейчас в отчётной выборке нет водителей с простоем, статусом «Отпросился», выходным или форс-мажором."
                />
              }
            >
              <div className="summary-list">
                {offlineDrivers.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {item.phone}</span>
                    <strong>
                      {getStatusLabel(item.status)}
                      {item.overdueDebt > 0 ? ` · просрочка ${formatCurrency(item.overdueDebt)}` : ""}
                    </strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                      {item.status === "accident" ? (
                        <Link className="table-link" to="/incidents?view=accidents">
                          Открыть инциденты
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>ДТП</h3>
            <div className="toolbar">
              <Link className="table-link" to="/incidents?view=accidents">Рабочий поток</Link>
              <Link className="table-link" to="/incidents?view=archive">Архив {archivedAccidentIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!accidentIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Открытых ДТП нет"
                  message="Когда по машине зарегистрируют ДТП, здесь сразу появятся авто, водитель и страховой/СТО контур."
                />
              }
            >
              <div className="summary-list">
                {accidentIncidents.map((item) => (
                  <div key={item.id}>
                    <span>
                      {(item.carId ? vehiclesApi.data?.find((vehicle) => vehicle.id === item.carId)?.plateNumber : null) ?? "Авто не указано"} ·{" "}
                      {(item.driverId ? crmDriversApi.data?.find((driver) => driver.id === item.driverId)?.fullName : null) ?? "Водитель не указан"}
                    </span>
                    <strong>{item.occurredAt ? `ДТП ${formatDateOnly(item.occurredAt)}` : item.title}</strong>
                    <div className="panel-note">
                      {item.description ?? "Описание ещё не заполнено"}
                      {item.insuranceNote ? ` · ${item.insuranceNote}` : ""}
                      {item.repairNote ? ` · ${item.repairNote}` : ""}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to="/incidents?view=accidents">
                        Рабочий поток
                      </Link>
                      <Link className="table-link" to="/incidents?view=archive">
                        Архив
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
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>СТО</h3>
            <div className="toolbar">
              <Link className="table-link" to="/service?view=operations">Рабочий поток</Link>
              <Link className="table-link" to="/service?view=archive">Архив {archivedServiceIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!serviceIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Открытых кейсов СТО нет"
                  message="Когда по машине зарегистрируют ремонт, здесь сразу появятся автомобиль, водитель и суммы."
                />
              }
            >
              <div className="summary-list">
                {serviceIncidents.map((item) => (
                  <div key={item.id}>
                    <span>
                      {(item.carId ? vehiclesApi.data?.find((vehicle) => vehicle.id === item.carId)?.plateNumber : null) ?? "Авто не указано"} ·{" "}
                      {(item.driverId ? crmDriversApi.data?.find((driver) => driver.id === item.driverId)?.fullName : null) ?? "Водитель не указан"}
                    </span>
                    <strong>{item.description ?? item.title}</strong>
                    <div className="panel-note">
                      {item.amount ? `расход ${formatCurrency(item.amount)}` : "Расход не указан"}
                      {item.insuranceCompensationAmount ? ` · страховка ${formatCurrency(item.insuranceCompensationAmount)}` : ""}
                      {item.writeoffAmount ? ` · вычет ${formatCurrency(item.writeoffAmount)}` : ""}
                    </div>
                    <div className="panel-note">
                      {item.repairNote ?? "СТО не указано"}
                      {item.insuranceNote ? ` · ${item.insuranceNote}` : ""}
                      {item.managerLabel ? ` · ${item.managerLabel}` : ""}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to="/service?view=operations">
                        Рабочий поток
                      </Link>
                      <Link className="table-link" to="/service?view=archive">
                        Архив
                      </Link>
                      {item.carId ? (
                        <Link className="table-link" to={`/vehicles/${item.carId}`}>
                          Открыть авто
                        </Link>
                      ) : null}
                      {item.driverId ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Страховка и ТО</h3>
            <div className="toolbar">
              <Link className="table-link" to="/insurance-gps?view=currentMonth">Рабочий поток</Link>
              <Link className="table-link" to="/insurance-gps?view=archive">Архив {archivedInsuranceGpsIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!insuranceGpsIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Открытых начислений нет"
                  message="Когда по машине зарегистрируют страховку или GPS за период, запись сразу появится здесь."
                />
              }
            >
              <div className="summary-list">
                {insuranceGpsIncidents.map((item) => (
                  <div key={item.id}>
                    <span>
                      {(item.carId ? vehiclesApi.data?.find((vehicle) => vehicle.id === item.carId)?.plateNumber : null) ?? "Авто не указано"} ·{" "}
                      {(item.driverId ? crmDriversApi.data?.find((driver) => driver.id === item.driverId)?.fullName : null) ?? "Водитель не указан"}
                    </span>
                    <strong>
                      {item.periodLabel ?? "Период не указан"}
                      {item.amount ? ` · ${formatCurrency(item.amount)}` : ""}
                    </strong>
                    <div className="panel-note">
                      {item.occurredAt ? `Дата ${formatDateOnly(item.occurredAt)}` : "Дата не указана"}
                      {item.managerLabel ? ` · ${item.managerLabel}` : ""}
                    </div>
                    <div className="panel-note">
                      {item.description ?? "Комментарий не добавлен"}
                      {item.insuranceNote ? ` · ${item.insuranceNote}` : ""}
                      {item.locationNote ? ` · ${item.locationNote}` : ""}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to="/insurance-gps?view=currentMonth">
                        Рабочий поток
                      </Link>
                      <Link className="table-link" to="/insurance-gps?view=archive">
                        Архив
                      </Link>
                      {item.carId ? (
                        <Link className="table-link" to={`/vehicles/${item.carId}`}>
                          Открыть авто
                        </Link>
                      ) : null}
                      {item.driverId ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Штрафы</h3>
            <div className="toolbar">
              <Link className="table-link" to="/fines?view=operations">Рабочий поток</Link>
              <Link className="table-link" to="/fines?view=archive">Архив {archivedFineIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!fineIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Открытых штрафов нет"
                  message="Когда по машине или водителю зарегистрируют штраф, он появится здесь с суммой и номером постановления."
                />
              }
            >
              <div className="summary-list">
                {fineIncidents.map((item) => (
                  <div key={item.id}>
                    <span>
                      {(item.carId ? vehiclesApi.data?.find((vehicle) => vehicle.id === item.carId)?.plateNumber : null) ?? "Авто не указано"} ·{" "}
                      {(item.driverId ? crmDriversApi.data?.find((driver) => driver.id === item.driverId)?.fullName : null) ?? "Водитель не указан"}
                    </span>
                    <strong>{item.amount ? `${formatCurrency(item.amount)} · ` : ""}{item.description ?? item.title}</strong>
                    <div className="panel-note">
                      {item.referenceNumber ? `№ ${item.referenceNumber}` : getIncidentTypeLabel(item.incidentType)}
                      {item.locationNote ? ` · ${item.locationNote}` : ""}
                      {item.managerLabel ? ` · ${item.managerLabel}` : ""}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to="/fines?view=operations">
                        Рабочий поток
                      </Link>
                      <Link className="table-link" to="/fines?view=archive">
                        Архив
                      </Link>
                      {item.carId ? (
                        <Link className="table-link" to={`/vehicles/${item.carId}`}>
                          Открыть авто
                        </Link>
                      ) : null}
                      {item.driverId ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Осмотр</h3>
            <div className="toolbar">
              <Link className="table-link" to="/inspections?view=currentMonth">Рабочий поток</Link>
              <Link className="table-link" to="/inspections?view=archive">Архив {archivedInspectionIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!inspectionIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Отметок осмотра пока нет"
                  message="После регистрации планового осмотра здесь сразу появятся авто, водитель и период."
                />
              }
            >
              <div className="summary-list">
                {inspectionIncidents.map((item) => (
                  <div key={item.id}>
                    <span>
                      {(item.carId ? vehiclesApi.data?.find((vehicle) => vehicle.id === item.carId)?.plateNumber : null) ?? "Авто не указано"} ·{" "}
                      {(item.driverId ? crmDriversApi.data?.find((driver) => driver.id === item.driverId)?.fullName : null) ?? "Водитель не указан"}
                    </span>
                    <strong>{item.periodLabel ?? "Период не указан"}</strong>
                    <div className="panel-note">
                      {item.occurredAt ? `Осмотр ${formatDateOnly(item.occurredAt)}` : "Дата осмотра не указана"}
                      {item.managerLabel ? ` · ${item.managerLabel}` : ""}
                    </div>
                    <div className="panel-note">{item.description ?? "Комментарий по осмотру не добавлен"}</div>
                    <div className="toolbar">
                      <Link className="table-link" to="/inspections?view=currentMonth">
                        Рабочий поток
                      </Link>
                      <Link className="table-link" to="/inspections?view=archive">
                        Архив
                      </Link>
                      {item.carId ? (
                        <Link className="table-link" to={`/vehicles/${item.carId}`}>
                          Открыть авто
                        </Link>
                      ) : null}
                      {item.driverId ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Чёрный список</h3>
            <div className="toolbar">
              <Link className="table-link" to="/blacklist?view=operations">Рабочий поток</Link>
              <Link className="table-link" to="/blacklist?view=archive">Архив {archivedBlacklistIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!blacklistIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Чёрный список пуст"
                  message="После первой записи по проблемному водителю здесь сразу появятся причина и ответственный бригадир."
                />
              }
            >
              <div className="summary-list">
                {blacklistIncidents.map((item) => (
                  <div key={item.id}>
                    <span>{(item.driverId ? crmDriversApi.data?.find((driver) => driver.id === item.driverId)?.fullName : null) ?? item.title}</span>
                    <strong>{item.occurredAt ? `Добавлен ${formatDateOnly(item.occurredAt)}` : "Дата не указана"}</strong>
                    <div className="panel-note">{item.description ?? "Причина не указана"}</div>
                    <div className="panel-note">
                      {item.managerLabel ?? "Бригадир не указан"}
                      {item.locationNote ? ` · ${item.locationNote}` : ""}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to="/blacklist?view=operations">
                        Рабочий поток
                      </Link>
                      <Link className="table-link" to="/blacklist?view=archive">
                        Архив
                      </Link>
                      {item.driverId ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые инциденты</h3>
            {incidentMessage ? <p className="panel-note">{incidentMessage}</p> : null}
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!recentIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Инцидентов пока нет"
                  message="Новые кейсы по водителям и машинам появятся здесь сразу после регистрации."
                />
              }
            >
              <div className="summary-list">
                {recentIncidents.map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <strong>{item.priority === "high" ? "Высокий приоритет" : "Требует внимания"}</strong>
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
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Открытые инциденты</h3>
            {incidentMessage ? <p className="panel-note">{incidentMessage}</p> : null}
            <div className="toolbar">
              <Link className="table-link" to="/incidents?view=operations">Рабочий поток</Link>
              <Link className="table-link" to="/incidents?view=archive">Архив {archivedIncidentsCount}</Link>
            </div>
            <AsyncState
              loading={incidentsApi.loading}
              error={incidentsApi.error}
              empty={!openIncidents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Открытых инцидентов нет"
                  message="Сейчас в отчётной выборке нет активных кейсов, которые требуют разбора."
                />
              }
            >
              <div className="summary-list">
                {openIncidents.map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <strong>{item.priority === "high" ? "Высокий приоритет" : "Требует внимания"}</strong>
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
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые уведомления</h3>
            <AsyncState
              loading={notificationsApi.loading}
              error={notificationsApi.error}
              empty={!recentNotifications.length}
              emptyContent={
                <EmptyStatePanel
                  title="Уведомлений пока нет"
                  message="Новые уведомления появятся здесь сразу после постановки в доставку."
                />
              }
            >
              <div className="summary-list">
                {recentNotifications.map((item) => (
                  <div key={item.id}>
                    <span>
                      {item.template.startsWith("payout_") ? "По выплате" : "Служебное уведомление"}
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
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Проблемы доставки</h3>
            <AsyncState
              loading={notificationsApi.loading || outboxApi.loading}
              error={notificationsApi.error ?? outboxApi.error}
              empty={!deliveryIssues.length}
              emptyContent={
                <EmptyStatePanel
                  title="Сбоев доставки нет"
                  message="Уведомления и события сейчас проходят без ошибок и очередей."
                />
              }
            >
              {deliveryMessage ? <p className="panel-note">{deliveryMessage}</p> : null}
              {deliveryError ? <p className="panel-note">Ошибка: {deliveryError}</p> : null}
              <p className="panel-note">
                Ошибки и зависшие в ожидании уведомления/события собираются в одну очередь для ручной проверки.
              </p>
              <div className="summary-list">
                {deliveryIssues.map((item) => (
                  <div key={item.id}>
                    <span>{item.label}</span>
                    <strong>{item.detail}</strong>
                    <Link className="table-link" to={item.to}>
                      {item.actionLabel}
                    </Link>
                  </div>
                ))}
              </div>
              <div className="toolbar">
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
                {canRetryOutbox && retryableOutboxIds.length > 0 ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={deliveryRetrying}
                    onClick={() => void handleRetryOutbox(retryableOutboxIds)}
                  >
                    {deliveryRetrying ? "Переочередим..." : "Переочередить события"}
                  </button>
                ) : null}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые события</h3>
            <AsyncState
              loading={outboxApi.loading}
              error={outboxApi.error}
              empty={!recentOutboxEvents.length}
              emptyContent={
                <EmptyStatePanel
                  title="Событий пока нет"
                  message="Новые интеграционные события появятся здесь сразу после записи в очередь."
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
                          ? "Событие по выплате"
                          : item.topic.startsWith("driver.")
                            ? "Событие по водителю"
                            : item.topic.startsWith("contract.")
                              ? "Событие по договору"
                              : "Интеграционное событие"}
                    </span>
                    <strong>{getOutboxStatusLabel(item.status)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/outbox">
                        Открыть события
                      </Link>
                      {canRetryOutbox && item.status !== "published" ? (
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
          <article className="panel">
            <h3>Новые движения денежных средств</h3>
            <AsyncState
              loading={ledgerApi.loading}
              error={ledgerApi.error}
              empty={!recentLedgerEntries.length}
              emptyContent={
                <EmptyStatePanel
                  title="Движения денежных средств пока нет"
                  message="Новые финансовые движения появятся здесь сразу после записи в журнал."
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
                          : item.type === "adjustment" || item.type === "refund"
                            ? "Корректировка"
                            : "Начисление"}{" "}
                      · {formatCurrency(Number(item.money.amount))}
                    </span>
                    <strong>
                      {item.driverId ? "Есть водитель" : item.contractId ? "Есть договор" : "Системная запись"}
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
          <article className="panel">
            <h3>Новые договоры</h3>
            <AsyncState
              loading={contractsApi.loading}
              error={contractsApi.error}
              empty={!recentContracts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Договоров пока нет"
                  message="Новые договоры появятся здесь сразу после оформления."
                />
              }
            >
              <div className="summary-list">
                {recentContracts.map((item) => (
                  <div key={item.id}>
                    <span>{item.contractNumber}{driverCompanyMap.get(item.driverId) ? ` · ${driverCompanyMap.get(item.driverId)}` : ""}</span>
                    <strong>
                      {item.currentDebt > 0
                        ? formatCurrency(item.currentDebt)
                        : item.status === "closed"
                          ? "Закрыт"
                          : "Без долга"}
                    </strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        Открыть водителя
                      </Link>
                      <Link className="table-link" to={`/vehicles/${item.carId}`}>
                        Открыть авто
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые водители</h3>
            <AsyncState
              loading={crmDriversApi.loading}
              error={crmDriversApi.error}
              empty={!recentDrivers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Водителей пока нет"
                  message="Новые водители появятся здесь сразу после оформления."
                />
              }
            >
              <div className="summary-list">
                {recentDrivers.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {item.phone}{item.companyName ? ` · ${item.companyName}` : ""}</span>
                    <strong>{item.activeContractId ? "Договор привязан" : "Договор ещё не привязан"}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                      {item.activeContractId ? (
                        <Link className="table-link" to={`/contracts/${item.activeContractId}`}>
                          Открыть договор
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Водители без договора</h3>
            <AsyncState
              loading={crmDriversApi.loading}
              error={crmDriversApi.error}
              empty={!driversWithoutContract.length}
              emptyContent={
                <EmptyStatePanel
                  title="Все водители с договором"
                  message="Сейчас в отчётной выборке нет водителей без активного договора."
                />
              }
            >
              <div className="summary-list">
                {driversWithoutContract.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {item.phone}{item.companyName ? ` · ${item.companyName}` : ""}</span>
                    <strong>Договор ещё не привязан</strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Водители без бригадира</h3>
            <AsyncState
              loading={crmDriversApi.loading}
              error={crmDriversApi.error}
              empty={!driversWithoutManager.length}
              emptyContent={
                <EmptyStatePanel
                  title="У всех водителей есть бригадир"
                  message="Сейчас в отчётной выборке нет водителей без закреплённого бригадира."
                />
              }
            >
              <div className="summary-list">
                {driversWithoutManager.map((item) => (
                  <div key={item.id}>
                    <span>{item.fullName} · {item.phone}{item.companyName ? ` · ${item.companyName}` : ""}</span>
                    <strong>Бригадир ещё не привязан</strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/drivers/${item.id}`}>
                        Открыть водителя
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые автомобили</h3>
            <AsyncState
              loading={vehiclesApi.loading}
              error={vehiclesApi.error}
              empty={!recentVehicles.length}
              emptyContent={
                <EmptyStatePanel
                  title="Автомобилей пока нет"
                  message="Новые машины появятся здесь сразу после добавления в автопарк."
                />
              }
            >
              <div className="summary-list">
                {recentVehicles.map((item) => (
                  <div key={item.id}>
                    <span>{item.plateNumber} · {item.vin}{item.companyName ? ` · ${item.companyName}` : ""}</span>
                    <strong>{item.assignedDriverId ? getStatusLabel(item.status) : "Водитель ещё не привязан"}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/vehicles/${item.id}`}>
                        Открыть авто
                      </Link>
                      {item.assignedDriverId ? (
                        <Link className="table-link" to={`/drivers/${item.assignedDriverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Автомобили без водителя</h3>
            <AsyncState
              loading={vehiclesApi.loading}
              error={vehiclesApi.error}
              empty={!vehiclesWithoutDriver.length}
              emptyContent={
                <EmptyStatePanel
                  title="Все машины на линии"
                  message="Сейчас в отчётной выборке нет автомобилей без закреплённого водителя."
                />
              }
            >
              <div className="summary-list">
                {vehiclesWithoutDriver.map((item) => (
                  <div key={item.id}>
                    <span>{item.plateNumber} · {getStatusLabel(item.status)}</span>
                    <strong>Водитель ещё не привязан</strong>
                    <div className="toolbar">
                      <Link className="table-link" to={`/vehicles/${item.id}`}>
                        Открыть авто
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Машины под риском</h3>
            <AsyncState
              loading={vehiclesApi.loading}
              error={vehiclesApi.error}
              empty={!riskyVehicles.length}
              emptyContent={
                <EmptyStatePanel
                  title="Проблемных машин нет"
                  message="Сейчас в отчётной выборке нет машин с простоем, ДТП, ремонтом, штрафстоянкой, долгим сроком или частой сменой водителей."
                />
              }
            >
              <div className="summary-list">
                {riskyVehicles.map((item) => (
                  <div key={item.id}>
                    <span>{item.plateNumber}</span>
                    <strong>
                      {getVehicleRiskReasons(item, contractCountByCarId, longestTermMonthsByCarId, activeContractByCarId)[0] ?? getStatusLabel(item.status)}
                    </strong>
                    <div className="panel-note">
                      {getVehicleRiskReasons(item, contractCountByCarId, longestTermMonthsByCarId, activeContractByCarId).join(" · ")}
                    </div>
                    <div className="toolbar">
                      <Link className="table-link" to={`/vehicles/${item.id}`}>
                        Открыть авто
                      </Link>
                      <Link className="table-link" to="/incidents?view=operations">
                        Открыть инциденты
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Доступ без доп. защиты</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!usersWithoutMfa.length}
              emptyContent={
                <EmptyStatePanel
                  title="Все входы защищены"
                  message="Сейчас в отчётной выборке нет пользователей без дополнительной защиты входа."
                />
              }
            >
              <div className="summary-list">
                {usersWithoutMfa.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getUserRoleLabel(item.role)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      <Link className="table-link" to="/settings">
                        Открыть настройки
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Новые пользователи</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!recentUsers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Пользователей пока нет"
                  message="Новые учетные записи появятся здесь сразу после создания."
                />
              }
            >
              <div className="summary-list">
                {recentUsers.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getUserRoleLabel(item.role)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      {!item.mfaEnabled ? (
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
          <article className="panel">
            <h3>Бригадиры в системе</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!managersInSystem.length}
              emptyContent={
                <EmptyStatePanel
                  title="Бригадиров пока нет"
                  message="После создания рабочих учётных записей бригадиры появятся в этой сводке."
                />
              }
            >
              <div className="summary-list">
                {managersInSystem.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getUserRoleLabel(item.role)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      <Link className="table-link" to="/drivers">
                        Открыть водителей
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Финансовые роли</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!financeRolesInSystem.length}
              emptyContent={
                <EmptyStatePanel
                  title="Финансовых ролей пока нет"
                  message="После настройки доступов owner, admin и finance появятся в этой сводке."
                />
              }
            >
              <div className="summary-list">
                {financeRolesInSystem.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getUserRoleLabel(item.role)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      <Link className="table-link" to="/financial-ops">
                        Открыть финансы
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Операционные роли</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!operationsRolesInSystem.length}
              emptyContent={
                <EmptyStatePanel
                  title="Операционных ролей пока нет"
                  message="После настройки operator и auditor их учётные записи появятся в этой сводке."
                />
              }
            >
              <div className="summary-list">
                {operationsRolesInSystem.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getUserRoleLabel(item.role)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      <Link className="table-link" to={item.role === "auditor" ? "/audit" : "/incidents"}>
                        {item.role === "auditor" ? "Открыть журнал" : "Открыть инциденты"}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Аккаунты водителей</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!driverAccountsInSystem.length}
              emptyContent={
                <EmptyStatePanel
                  title="Аккаунтов водителей пока нет"
                  message="После выдачи учётных записей водителям они появятся в этой сводке."
                />
              }
            >
              <div className="summary-list">
                {driverAccountsInSystem.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getUserRoleLabel(item.role)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      <Link className="table-link" to="/drivers">
                        Открыть водителей
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <h3>Неактивные аккаунты</h3>
            <AsyncState
              loading={usersApi.loading}
              error={usersApi.error}
              empty={!inactiveUsers.length}
              emptyContent={
                <EmptyStatePanel
                  title="Все аккаунты активны"
                  message="Сейчас в системе нет пользователей с неактивным статусом."
                />
              }
            >
              <div className="summary-list">
                {inactiveUsers.map((item) => (
                  <div key={item.id}>
                    <span>{item.displayName} · {item.login}</span>
                    <strong>{getStatusLabel(item.status)}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/users">
                        Открыть пользователей
                      </Link>
                      <Link className="table-link" to="/audit">
                        Открыть журнал
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
        </div>
      </AsyncState>
    </section>
  );
}
