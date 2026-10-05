import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { downloadCsv } from "../lib/utils";
import {
  formatCurrency,
  formatDueDateLabel,
  formatDateOnly,
  formatDateTime,
  formatRepairPeriodLabel,
  getPaymentProviderLabel,
  getPaymentStatusLabel,
  getPayoutStatusLabel,
  getStatusLabel,
  getStatusTone,
  isPastDate,
} from "../lib/utils";
import { StatCard } from "../ui/StatCard";
import { CarIcon, ContractsIcon, DriversIcon, FinanceIcon, ShieldIcon, WalletIcon } from "../ui/CrmIcons";
import type {
  ContractListItem,
  DriverDetail,
  DriverDebtSummary,
  DriverDayEventItem,
  DriverPaymentScheduleItem,
  DriverProfileSummary,
  ManagerIncidentItem,
  PaymentListItem,
  PayoutListItem,
  DriverStatusRequestItem,
  VehicleListItem,
  UserAdminListItem,
} from "@gopark/contracts";
import { patchJson, postJson } from "../lib/api";

const weeklyDayOffOptions = [
  { value: "", label: "Без фиксированного выходного" },
  { value: "monday", label: "Понедельник" },
  { value: "tuesday", label: "Вторник" },
  { value: "wednesday", label: "Среда" },
  { value: "thursday", label: "Четверг" },
  { value: "friday", label: "Пятница" },
  { value: "saturday", label: "Суббота" },
  { value: "sunday", label: "Воскресенье" },
];

function getWeeklyDayOffLabel(value?: string | null): string {
  return weeklyDayOffOptions.find((item) => item.value === (value ?? ""))?.label ?? "Без фиксированного выходного";
}

type ScheduleComponent = "contract" | "gps" | "insurance";

function getScheduleComponentAmount(item: DriverPaymentScheduleItem, component: ScheduleComponent): number {
  if (component === "contract") {
    if (item.type === "gps" || item.type === "insurance") {
      return 0;
    }
    return item.installmentAmount ?? item.amount;
  }
  if (component === "gps") {
    return item.type === "gps" ? item.amount : item.gpsAmount ?? 0;
  }
  return item.type === "insurance" ? item.amount : item.insuranceAmount ?? 0;
}

function getScheduleComponentPaid(item: DriverPaymentScheduleItem, component: ScheduleComponent): number {
  const paidAmount = Math.max(item.paidAmount ?? 0, 0);
  const contractAmount = getScheduleComponentAmount(item, "contract");
  const gpsAmount = getScheduleComponentAmount(item, "gps");
  const insuranceAmount = getScheduleComponentAmount(item, "insurance");

  if (item.type === "gps") {
    return component === "gps" ? Math.min(paidAmount, gpsAmount) : 0;
  }
  if (item.type === "insurance") {
    return component === "insurance" ? Math.min(paidAmount, insuranceAmount) : 0;
  }
  if (component === "contract") {
    return Math.min(paidAmount, contractAmount);
  }
  if (component === "gps") {
    return Math.min(Math.max(paidAmount - contractAmount, 0), gpsAmount);
  }
  return Math.min(Math.max(paidAmount - contractAmount - gpsAmount, 0), insuranceAmount);
}

function formatScheduleComponentState(item: DriverPaymentScheduleItem, component: ScheduleComponent): string {
  const amount = getScheduleComponentAmount(item, component);
  const paidAmount = getScheduleComponentPaid(item, component);
  const parts = [getStatusLabel(item.status)];

  if (paidAmount > 0) {
    parts.push(`оплачено ${formatCurrency(paidAmount)}`);
  }
  const remainingAmount = Math.max(amount - paidAmount, 0);
  if (remainingAmount > 0 && paidAmount > 0) {
    parts.push(`остаток ${formatCurrency(remainingAmount)}`);
  }
  if (item.deferredByStatusRequest) {
    parts.push("по подтверждению");
  }

  return parts.join(" · ");
}

function getDateOnly(value?: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function getInclusiveDayCount(startDate?: string | null, endDate?: string | null): number | null {
  const start = getDateOnly(startDate);
  const end = getDateOnly(endDate);
  if (!start || !end) {
    return null;
  }
  const startTime = new Date(`${start}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${end}T00:00:00.000Z`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
    return null;
  }
  return Math.floor((endTime - startTime) / (24 * 60 * 60 * 1000)) + 1;
}

export function DriverDetailPage() {
  const { session } = useAuth();
  const { driverId } = useParams<{ driverId: string }>();
  const [statusRequestMessage, setStatusRequestMessage] = useState<string | null>(null);
  const [statusRequestError, setStatusRequestError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [pendingPayoutActionId, setPendingPayoutActionId] = useState<string | null>(null);
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  const [bulkPayoutActionLoading, setBulkPayoutActionLoading] = useState(false);
  const [selectedStatusRequestIds, setSelectedStatusRequestIds] = useState<string[]>([]);
  const [bulkStatusActionLoading, setBulkStatusActionLoading] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [managerMessage, setManagerMessage] = useState<string | null>(null);
  const [incidentMessage, setIncidentMessage] = useState<string | null>(null);
  const [pendingIncidentActionId, setPendingIncidentActionId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLicenseNumber, setEditLicenseNumber] = useState("");
  const [editPassportNumber, setEditPassportNumber] = useState("");
  const [editNearestRelativePhone, setEditNearestRelativePhone] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editWeeklyDayOff, setEditWeeklyDayOff] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedEventDate, setSelectedEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isManagerFormOpen, setIsManagerFormOpen] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [activeCardTab, setActiveCardTab] = useState<"overview" | "finance" | "schedule" | "history" | "requests">("overview");
  const api = useApiQuery<DriverDetail>(`drivers/${driverId}`);
  const dayEventsApi = useApiQuery<DriverDayEventItem[]>(`drivers/${driverId}/day-events?date=${selectedEventDate}`);
  const debtApi = useApiQuery<DriverDebtSummary>(`mobile/driver/${driverId}/debt-summary`);
  const profileApi = useApiQuery<DriverProfileSummary | null>(`mobile/driver/${driverId}/profile-summary`);
  const statusRequestsApi = useApiQuery<DriverStatusRequestItem[]>(`mobile/driver/${driverId}/status-requests`);
  const paymentScheduleApi = useApiQuery<DriverPaymentScheduleItem[]>(`mobile/driver/${driverId}/payment-schedule`);
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canApproveStatusRequest = hasCrmCapability(session.requestUserRole, "approve-status-request");
  const canApprovePayout = hasCrmCapability(session.requestUserRole, "approve-payout");
  const canAssignManager = hasCrmCapability(session.requestUserRole, "create-driver", session.managerLevel);
  const canEditDriver = hasCrmCapability(session.requestUserRole, "create-driver", session.managerLevel);
  const canCreateContract = hasCrmCapability(session.requestUserRole, "create-contract", session.managerLevel);
  const canUpdateIncident = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const effectiveStatus = profileApi.data?.currentStatus ?? api.data?.status ?? "";
  const paymentCoverage = api.data
    ? Math.round((api.data.totalPaid / Math.max(api.data.totalObligations, 1)) * 100)
    : 0;
  const contracts = useMemo(() => contractsApi.data ?? [], [contractsApi.data]);
  const vehicles = useMemo(() => vehiclesApi.data ?? [], [vehiclesApi.data]);
  const incidents = useMemo(() => incidentsApi.data ?? [], [incidentsApi.data]);
  const payments = useMemo(() => paymentsApi.data ?? [], [paymentsApi.data]);
  const payouts = useMemo(() => payoutsApi.data ?? [], [payoutsApi.data]);
  const users = useMemo(() => usersApi.data ?? [], [usersApi.data]);
  const statusRequests = useMemo(() => statusRequestsApi.data ?? [], [statusRequestsApi.data]);
  const paymentScheduleItems = useMemo(() => paymentScheduleApi.data ?? [], [paymentScheduleApi.data]);
  const contractPaymentSchedule = useMemo(
    () => paymentScheduleItems.filter((item) => getScheduleComponentAmount(item, "contract") > 0),
    [paymentScheduleItems],
  );
  const gpsPaymentSchedule = useMemo(
    () => paymentScheduleItems.filter((item) => getScheduleComponentAmount(item, "gps") > 0),
    [paymentScheduleItems],
  );
  const insurancePaymentSchedule = useMemo(
    () => paymentScheduleItems.filter((item) => getScheduleComponentAmount(item, "insurance") > 0),
    [paymentScheduleItems],
  );
  const contractMap = useMemo(() => new Map(contracts.map((item) => [item.id, item.contractNumber])), [contracts]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((item) => [item.id, item.plateNumber])), [vehicles]);
  const vehicleById = useMemo(() => new Map(vehicles.map((item) => [item.id, item])), [vehicles]);
  const activeContract = useMemo(() => contracts.find((item) => item.id === api.data?.activeContractId) ?? null, [api.data?.activeContractId, contracts]);
  const driverContracts = useMemo(() => contracts.filter((item) => item.driverId === api.data?.id), [api.data?.id, contracts]);
  const driverVehicleHistory = useMemo(
    () => [...driverContracts]
      .sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? ""))
      .map((contract) => {
        const vehicle = vehicleById.get(contract.carId);
        const overdueDebt = contract.overdueDebt ?? 0;
        return {
          contract,
          vehicle,
          title: [
            vehicle?.plateNumber ?? "Автомобиль не найден",
            [vehicle?.make, vehicle?.model].filter(Boolean).join(" "),
          ].filter(Boolean).join(" · "),
          periodStart: contract.startDate ?? null,
          periodEnd: contract.endedAt ?? (contract.status === "active" ? null : contract.endDate ?? null),
          overdueDebt,
        };
      }),
    [driverContracts, vehicleById],
  );
  const lastTerminatedContract = useMemo(
    () => [...driverContracts]
      .filter((item) => item.status === "terminated" || item.status === "defaulted" || item.status === "closed")
      .sort((left, right) => {
        const leftDate = getDateOnly(left.endedAt) ?? getDateOnly(left.endDate) ?? getDateOnly(left.startDate) ?? "";
        const rightDate = getDateOnly(right.endedAt) ?? getDateOnly(right.endDate) ?? getDateOnly(right.startDate) ?? "";
        return rightDate.localeCompare(leftDate);
      })[0] ?? null,
    [driverContracts],
  );
  const displayContract = activeContract ?? lastTerminatedContract;
  const isTerminatedDisplay = !activeContract && Boolean(lastTerminatedContract);
  const hasActiveFinanceProfile = Boolean(api.data?.activeContractId) || Boolean(lastTerminatedContract) || (api.data?.totalObligations ?? 0) > 0;
  const assignedVehicle = useMemo(() => vehicles.find((item) => item.id === api.data?.assignedCarId) ?? null, [api.data?.assignedCarId, vehicles]);
  const driverIncidents = useMemo(() => incidents.filter(
    (item) => item.driverId === api.data?.id || item.carId === api.data?.assignedCarId,
  ), [api.data?.assignedCarId, api.data?.id, incidents]);
  const activeContractLabel = api.data?.activeContractId
    ? (contractMap.get(api.data.activeContractId) ?? "Договор привязан")
    : lastTerminatedContract
      ? `${getStatusLabel(lastTerminatedContract.status)} · ${lastTerminatedContract.contractNumber}`
      : "Нет договора";
  const assignedCarLabel = api.data?.assignedCarId
    ? (vehicleMap.get(api.data.assignedCarId) ?? "Автомобиль на линии")
    : "Не привязан";
  const assignedVehicleModel = assignedVehicle
    ? [assignedVehicle.make, assignedVehicle.model].filter(Boolean).join(" ") || "Марка и модель не указаны"
    : "Авто не привязано";
  const assignedVehicleDetails = assignedVehicle
    ? [
        assignedVehicleModel,
        assignedVehicle.vin ? `VIN ${assignedVehicle.vin}` : null,
        assignedVehicle.companyName ?? api.data?.companyName ?? null,
      ].filter(Boolean).join(" · ")
    : "Нет закрепленного автомобиля";
  const driverPayments = useMemo(() => payments.filter((item) => item.driverId === api.data?.id), [api.data?.id, payments]);
  const displayContractPayments = useMemo(
    () => driverPayments.filter((item) => item.contractId === displayContract?.id && item.status === "succeeded"),
    [displayContract?.id, driverPayments],
  );
  const displayContractPaid = useMemo(
    () => displayContractPayments.reduce((sum, item) => sum + (item.appliedAmount || item.amount || 0), 0),
    [displayContractPayments],
  );
  const displayContractStartDate = getDateOnly(displayContract?.startDate);
  const displayContractEndedAt = getDateOnly(displayContract?.endedAt) ?? (isTerminatedDisplay ? getDateOnly(displayContract?.endDate) : null);
  const displayContractOwnershipDays = getInclusiveDayCount(displayContractStartDate, displayContractEndedAt);
  const driverPayouts = useMemo(() => payouts.filter((item) => item.driverId === api.data?.id), [api.data?.id, payouts]);
  const managerOptions = useMemo(() => users.filter((item) => item.role === "manager" && item.managerProfileId), [users]);
  const managerNameMap = useMemo(() => {
    const next = new Map<string, string>();
    for (const manager of managerOptions) {
      next.set(manager.id, manager.displayName);
      if (manager.managerProfileId) {
        next.set(manager.managerProfileId, manager.displayName);
      }
    }
    return next;
  }, [managerOptions]);
  const assignedManagerLabel = api.data?.managerId
    ? (managerNameMap.get(api.data.managerId) ?? api.data.managerId)
    : "Без бригадира";
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const availablePayoutAmount = Math.max(
    0,
    (profileApi.data?.yandexBalance ?? 0) - driverPayouts.filter((item) => item.status === "requested").reduce((sum, item) => sum + item.amount, 0),
  );
  const requestedDriverPayouts = useMemo(() => driverPayouts.filter((item) => item.status === "requested"), [driverPayouts]);
  const selectedPayoutCount = selectedPayoutIds.length;
  const allPayoutsSelected = requestedDriverPayouts.length > 0 && selectedPayoutCount === requestedDriverPayouts.length;
  const pendingStatusRequests = useMemo(() => statusRequests.filter((item) => item.status === "pending"), [statusRequests]);
  const selectedStatusCount = selectedStatusRequestIds.length;
  const allStatusSelected = pendingStatusRequests.length > 0 && selectedStatusCount === pendingStatusRequests.length;
  const riskScore = useMemo(() => {
    const overduePoints = (api.data?.currentDebt ?? 0) > 0 ? 20 : 0;
    const incidentPoints = driverIncidents.reduce((sum, item) => {
      if (item.incidentType === "accident") {
        return sum + 15;
      }
      if (item.incidentType === "repair") {
        return sum + 8;
      }
      if (item.incidentType === "fine") {
        return sum + 5;
      }
      return sum + 2;
    }, 0);
    const statusPoints = api.data?.riskStatus === "risk" ? 20 : api.data?.riskStatus === "medium" ? 10 : 0;
    return overduePoints + incidentPoints + statusPoints;
  }, [api.data?.currentDebt, api.data?.riskStatus, driverIncidents]);

  useEffect(() => {
    setManagerId(api.data?.managerId ?? "");
  }, [api.data?.managerId]);

  useEffect(() => {
    const parts = (api.data?.fullName ?? "").trim().split(/\s+/).filter(Boolean);
    setEditFirstName(parts[0] ?? "");
    setEditLastName(parts.slice(1).join(" "));
    setEditPhone(api.data?.phone ?? "");
    setEditLicenseNumber(api.data?.licenseNumber ?? "");
    setEditPassportNumber(api.data?.passportNumber ?? "");
    setEditNearestRelativePhone(api.data?.nearestRelativePhone ?? "");
    setEditCompanyName(api.data?.companyName ?? "");
    setEditWeeklyDayOff(api.data?.weeklyDayOff ?? "");
    setEditStatus(api.data?.status ?? "active");
  }, [api.data?.companyName, api.data?.fullName, api.data?.licenseNumber, api.data?.nearestRelativePhone, api.data?.passportNumber, api.data?.phone, api.data?.status, api.data?.weeklyDayOff]);

  useEffect(() => {
    setSelectedStatusRequestIds((current) =>
      current.filter((requestId) => pendingStatusRequests.some((item) => item.id === requestId)),
    );
  }, [pendingStatusRequests]);

  useEffect(() => {
    setSelectedPayoutIds((current) =>
      current.filter((payoutId) => requestedDriverPayouts.some((item) => item.id === payoutId)),
    );
  }, [requestedDriverPayouts]);

  async function handleAssignManager(): Promise<void> {
    if (!api.data?.id) {
      return;
    }

    setManagerMessage(null);
    try {
      await patchJson(`drivers/${api.data.id}/manager`, {
        managerId: managerId || null,
      });
      await api.refetch();
      await profileApi.refetch();
      setManagerMessage(managerId ? "Бригадир привязан." : "Бригадир снят.");
    } catch (error) {
      setManagerMessage(error instanceof Error ? error.message : "Не удалось обновить бригадира.");
    }
  }

  async function handleSaveProfile(): Promise<void> {
    if (!api.data?.id) {
      return;
    }

    setProfileMessage(null);
    setProfileSaving(true);
    try {
      await patchJson(`drivers/${api.data.id}`, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        phone: editPhone.trim(),
        licenseNumber: editLicenseNumber.trim(),
        passportNumber: editPassportNumber.trim(),
        nearestRelativePhone: editNearestRelativePhone.trim(),
        companyName: editCompanyName.trim() || null,
        weeklyDayOff: editWeeklyDayOff || null,
        status: editStatus,
      });
      await api.refetch();
      await profileApi.refetch();
      setProfileMessage("Карточка водителя обновлена.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Не удалось обновить карточку водителя.");
    } finally {
      setProfileSaving(false);
    }
  }

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

  async function handleReviewPhoto(action: "approve" | "reject"): Promise<void> {
    if (!api.data?.id) {
      return;
    }
    const note = action === "reject" ? window.prompt("Причина отклонения фото") : null;
    if (action === "reject" && !note?.trim()) {
      return;
    }
    setPhotoSaving(true);
    setPhotoMessage(null);
    try {
      await patchJson(`drivers/${api.data.id}/photo-review`, {
        action,
        note: note?.trim() || null,
      });
      await api.refetch();
      await profileApi.refetch();
      setPhotoMessage(action === "approve" ? "Фото одобрено." : "Фото отклонено.");
    } catch (error) {
      setPhotoMessage(error instanceof Error ? error.message : "Не удалось проверить фото.");
    } finally {
      setPhotoSaving(false);
    }
  }

  async function handleTerminateActiveContract(): Promise<void> {
    if (!api.data?.activeContractId) {
      return;
    }
    if (!window.confirm("Расторгнуть активный договор? Машина станет свободной, долг сохранится.")) {
      return;
    }
    const addToBlacklist = window.confirm("Добавить этого водителя в чёрный список перед архивом?");
    const blacklistReason = addToBlacklist
      ? window.prompt("Укажите причину для чёрного списка", "Расторжение договора")?.trim()
      : "";

    setProfileMessage(null);
    setProfileSaving(true);
    try {
      await patchJson(`contracts/${api.data.activeContractId}`, { status: "terminated" });
      if (addToBlacklist) {
        await postJson<ManagerIncidentItem, Record<string, unknown>>("incidents", {
          title: `Чёрный список: ${api.data.fullName}`,
          incidentType: "blacklist",
          status: "open",
          priority: "high",
          driverId: api.data.id,
          occurredAt: new Date().toISOString(),
          description: [
            blacklistReason || "Причина не указана",
            `Долг на момент расторжения: ${debtApi.data?.totalDebt ?? api.data.currentDebt ?? 0} сом`,
            api.data.assignedCarId ? `Авто: ${api.data.assignedCarId}` : null,
          ].filter(Boolean).join(". "),
          managerLabel: session.requestUserRole,
        });
      }
      await Promise.all([api.refetch(), profileApi.refetch(), debtApi.refetch(), contractsApi.refetch(), vehiclesApi.refetch()]);
      setProfileMessage(addToBlacklist ? "Договор расторгнут. Водитель добавлен в чёрный список." : "Договор расторгнут. Долг сохранён.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Не удалось расторгнуть договор.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleIssueCarByActiveContract(): Promise<void> {
    if (!api.data?.activeContractId) {
      return;
    }

    setProfileMessage(null);
    setProfileSaving(true);
    try {
      await patchJson(`contracts/${api.data.activeContractId}`, { status: "active" });
      await Promise.all([api.refetch(), profileApi.refetch(), debtApi.refetch(), contractsApi.refetch(), vehiclesApi.refetch()]);
      setProfileMessage("Авто выдано водителю по активному договору.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Не удалось выдать авто по договору.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleResetDriverPassword(): Promise<void> {
    if (!api.data?.id) {
      return;
    }
    if (!window.confirm("Сбросить пароль водителя на 123456? После входа водитель сможет поменять пароль.")) {
      return;
    }

    setProfileMessage(null);
    setProfileSaving(true);
    try {
      await patchJson(`drivers/${api.data.id}/reset-password`, {});
      await api.refetch();
      setProfileMessage("Пароль водителя сброшен на 123456. После входа он сможет поменять пароль.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Не удалось сбросить пароль водителя.");
    } finally {
      setProfileSaving(false);
    }
  }

  function toggleStatusRequestSelection(requestId: string): void {
    setSelectedStatusRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  function toggleSelectAllStatusRequests(): void {
    setSelectedStatusRequestIds(allStatusSelected ? [] : pendingStatusRequests.map((item) => item.id));
  }

  async function handleBulkStatusAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedStatusRequestIds.length) {
      setStatusRequestError("Выберите хотя бы один запрос.");
      return;
    }

    setStatusRequestMessage(null);
    setStatusRequestError(null);
    setBulkStatusActionLoading(true);
    let processedCount = 0;

    try {
      for (const requestId of selectedStatusRequestIds) {
        await postJson<DriverStatusRequestItem, Record<string, never>>(
          `approvals/status-requests/${requestId}/${action}`,
          {},
        );
        processedCount += 1;
      }

      setStatusRequestMessage(
        action === "approve"
          ? `Подтверждено ${processedCount} запросов.`
          : `Отклонено ${processedCount} запросов.`,
      );
      setSelectedStatusRequestIds([]);
      await statusRequestsApi.refetch();
      await profileApi.refetch();
    } catch (error) {
      setStatusRequestError(error instanceof Error ? error.message : "Не удалось выполнить массовую обработку запросов.");
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
    setSelectedPayoutIds(allPayoutsSelected ? [] : requestedDriverPayouts.map((item) => item.id));
  }

  async function handlePayoutAction(action: "approve" | "reject", payoutId: string): Promise<void> {
    setPayoutMessage(null);
    setPayoutError(null);
    setPendingPayoutActionId(payoutId);

    try {
      const result = await postJson<PayoutListItem, Record<string, never>>(
        `approvals/payouts/${payoutId}/${action}`,
        {},
      );
      setPayoutMessage(
        action === "approve"
          ? `Заявка на ${formatCurrency(result.amount)} одобрена.`
          : `Заявка на ${formatCurrency(result.amount)} отклонена.`,
      );
      await payoutsApi.refetch();
      await profileApi.refetch();
    } catch (error) {
      setPayoutError(error instanceof Error ? error.message : "Не удалось обработать заявку на вывод.");
    } finally {
      setPendingPayoutActionId(null);
    }
  }

  async function handleBulkPayoutAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedPayoutIds.length) {
      setPayoutError("Выберите хотя бы одну заявку на вывод.");
      return;
    }

    setPayoutMessage(null);
    setPayoutError(null);
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

      setPayoutMessage(
        action === "approve"
          ? `Массово одобрено ${processedCount} заявок на ${formatCurrency(processedAmount)}.`
          : `Массово отклонено ${processedCount} заявок на ${formatCurrency(processedAmount)}.`,
      );
      setSelectedPayoutIds([]);
      await payoutsApi.refetch();
      await profileApi.refetch();
    } catch (error) {
      setPayoutError(error instanceof Error ? error.message : "Не удалось выполнить массовую обработку выводов.");
    } finally {
      setBulkPayoutActionLoading(false);
    }
  }

  function handleExport(): void {
    if (!api.data) {
      return;
    }

    downloadCsv(`gopark-driver-${api.data.id}.csv`, [
      ["id", api.data.id],
      ["full_name", api.data.fullName],
      ["phone", api.data.phone],
      ["status", api.data.status],
      ["manager_id", api.data.managerId ?? ""],
      ["active_contract_id", api.data.activeContractId ?? ""],
      ["assigned_car_id", api.data.assignedCarId ?? ""],
      ["credit_balance", api.data.creditBalance],
      ["current_debt", api.data.currentDebt],
      ["total_obligations", api.data.totalObligations],
      ["total_paid", api.data.totalPaid],
    ]);
  }

  return (
    <>
    <section className={`page-stack driver-detail-page driver-detail-page--dispatcher driver-detail-tab-${activeCardTab}`}>
      <div className="hero-card hero-card--dashboard driver-dispatch-hero">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <DriversIcon width={18} height={18} />
            <span>Карточка водителя</span>
          </div>
          <div className="detail-identity driver-dispatch-identity">
            <button
              type="button"
              className="identity-avatar identity-avatar--green driver-detail-photo-avatar"
              onClick={() => api.data?.photoUrl?.startsWith("data:image/") ? setPhotoPreviewUrl(api.data.photoUrl) : undefined}
              aria-label="Открыть фото водителя"
            >
              {api.data?.photoUrl?.startsWith("data:image/") ? (
                <img src={api.data.photoUrl} alt="Фото водителя" />
              ) : (
                (api.data?.fullName ?? "DR")
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0] ?? "")
                  .join("")
              )}
            </button>
            <div className="detail-identity__meta">
              <h2>{api.data?.fullName ?? `Карточка водителя ${driverId}`}</h2>
              <p>{api.data?.phone ?? "Телефон не указан"} · {api.data?.companyName ?? "Компания не выбрана"}</p>
              {api.data ? (
                <div className="detail-badges">
                  <span className={getStatusTone(effectiveStatus)}>{getStatusLabel(effectiveStatus)}</span>
                  <span className={`inline-pill${api.data.managerId ? " inline-pill--accent" : ""}`}>{assignedManagerLabel}</span>
                  <span className={`inline-pill${api.data.activeContractId ? " inline-pill--success" : ""}`}>{activeContractLabel}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="hero-card__actions">
          <div className="toolbar toolbar--hero">
            <Link className="button-link" to="/drivers">
              К водителям
            </Link>
            {api.data ? <button onClick={handleExport}>Скачать CSV</button> : null}
          </div>
        </div>
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!api.data}
        emptyContent={
          <EmptyStatePanel
            title="Водитель не найден"
            message={`Карточка ${driverId ?? "водителя"} недоступна или ещё не создана.`}
            extra={
              <Link className="button-link" to="/drivers">
                Вернуться к водителям
              </Link>
            }
          />
        }
      >
        <div className="stats-grid driver-stats-grid">
          <StatCard
            title="Водитель"
            value={api.data?.phone ?? "—"}
            subtitle={api.data?.fullName}
            tone="blue"
            className="metric-card--compact-value"
            icon={<DriversIcon width={18} height={18} />}
          />
          <StatCard
            title="Данные авто"
            value={assignedVehicle?.plateNumber ?? "—"}
            subtitle={assignedVehicleDetails}
            tone="blue"
            className="metric-card--compact-value"
            icon={<CarIcon width={18} height={18} />}
            to={api.data?.assignedCarId && hasCrmAccess(session.requestUserRole, "vehicle-detail") ? `/vehicles/${api.data.assignedCarId}` : undefined}
          />
          <StatCard
            title={isTerminatedDisplay ? "Просроченный долг" : "Текущий долг"}
            value={formatCurrency(isTerminatedDisplay ? displayContract?.currentDebt ?? 0 : api.data?.currentDebt ?? 0)}
            subtitle={isTerminatedDisplay ? "Остаток после расторжения" : "Активная задолженность"}
            tone="orange"
            icon={<FinanceIcon width={18} height={18} />}
          />
          {isTerminatedDisplay ? (
            <StatCard
              title="Оплачено за владение"
              value={formatCurrency(displayContractPaid)}
              subtitle={displayContract?.contractNumber ?? "Расторгнутый договор"}
              tone="green"
              icon={<WalletIcon width={18} height={18} />}
            />
          ) : (
            <StatCard
              title="Всего начислено"
              value={formatCurrency(api.data?.totalObligations ?? 0)}
              subtitle="Сумма обязательств"
              tone="purple"
              icon={<ContractsIcon width={18} height={18} />}
            />
          )}
          <StatCard
            title={isTerminatedDisplay ? "Начал договор" : "Оплачено"}
            value={isTerminatedDisplay ? formatDateOnly(displayContractStartDate) : formatCurrency(api.data?.totalPaid ?? 0)}
            subtitle={isTerminatedDisplay ? "Дата выдачи" : "Покрытие обязательств"}
            tone="green"
            icon={<WalletIcon width={18} height={18} />}
            meta={isTerminatedDisplay ? undefined : hasActiveFinanceProfile ? `${paymentCoverage}% портфеля закрыто` : "Нет активного портфеля"}
          />
          <StatCard
            title={isTerminatedDisplay ? "Расторгнут" : "Свободный остаток"}
            value={isTerminatedDisplay ? formatDateOnly(displayContractEndedAt) : formatCurrency(api.data?.creditBalance ?? 0)}
            subtitle={isTerminatedDisplay && displayContractOwnershipDays ? `Ездил ${displayContractOwnershipDays} дн.` : "Свободный остаток водителя"}
            tone="blue"
            icon={<ShieldIcon width={18} height={18} />}
          />
          <StatCard
            title="Риск"
            value={getStatusLabel(api.data?.riskStatus ?? "normal")}
            subtitle={`${riskScore} баллов`}
            tone={api.data?.riskStatus === "risk" || api.data?.riskStatus === "medium" ? "orange" : "green"}
            icon={<ShieldIcon width={18} height={18} />}
          />
        </div>
        <div className="detail-card-tabs driver-card-tabs" role="tablist" aria-label="Разделы карточки водителя">
          {[
            ["overview", "Обзор"],
            ["finance", "Финансы"],
            ["schedule", "Графики"],
            ["history", "История"],
            ["requests", "Запросы"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={activeCardTab === tab ? "detail-card-tab detail-card-tab--active driver-card-tab driver-card-tab--active" : "detail-card-tab driver-card-tab"}
              onClick={() => setActiveCardTab(tab as typeof activeCardTab)}
            >
              <span>{label}</span>
              {tab === "history" ? <small>{driverContracts.length + driverIncidents.length}</small> : null}
              {tab === "requests" ? <small>{pendingStatusRequests.length + requestedDriverPayouts.length}</small> : null}
            </button>
          ))}
        </div>
        <div className="table-grid driver-detail-grid">
          <article className="panel driver-tab-panel driver-tab-panel--overview">
            <div className="panel__title">
              <ShieldIcon width={18} height={18} />
              <h3>Операционный профиль</h3>
            </div>
            <div className="summary-list">
              <div><span>Статус</span><strong>{getStatusLabel(api.data?.status ?? "")}</strong></div>
              <div><span>Текущий режим</span><strong>{getStatusLabel(effectiveStatus)}</strong></div>
              <div><span>Бригадир</span><strong>{assignedManagerLabel}</strong></div>
              <div><span>Компания</span><strong>{api.data?.companyName ?? "Не выбрана"}</strong></div>
              <div><span>Фиксированный выходной</span><strong>{getWeeklyDayOffLabel(api.data?.weeklyDayOff)}</strong></div>
              <div><span>Договор</span><strong>{activeContractLabel}</strong></div>
              {isTerminatedDisplay ? (
                <>
                  <div><span>Дата начала договора</span><strong>{formatDateOnly(displayContractStartDate)}</strong></div>
                  <div><span>Дата расторжения</span><strong>{formatDateOnly(displayContractEndedAt)}</strong></div>
                  <div><span>Сколько ездил</span><strong>{displayContractOwnershipDays ? `${displayContractOwnershipDays} дн.` : "Не посчитано"}</strong></div>
                  <div><span>Оплачено за владение</span><strong>{formatCurrency(displayContractPaid)}</strong></div>
                  <div><span>Просроченный долг</span><strong>{formatCurrency(displayContract?.currentDebt ?? 0)}</strong></div>
                </>
              ) : null}
              <div><span>Автомобиль</span><strong>{assignedCarLabel}</strong></div>
              <div><span>Свободный остаток</span><strong>{formatCurrency(api.data?.creditBalance ?? 0)}</strong></div>
              <div><span>Вод. удостоверение</span><strong>{api.data?.licenseNumber ?? "Не указано"}</strong></div>
              <div><span>Удостоверение личности</span><strong>{api.data?.passportNumber ?? "Не указано"}</strong></div>
              <div><span>Близкий родственник</span><strong>{api.data?.nearestRelativePhone ?? "Не указан"}</strong></div>
            </div>
            <div className="toolbar">
              {canAssignManager ? (
                <button type="button" className="button-secondary" onClick={() => setIsManagerFormOpen((current) => !current)}>
                  {isManagerFormOpen ? "Скрыть бригадира" : "Назначить бригадира"}
                </button>
              ) : null}
              {canEditDriver ? (
                <button type="button" className="button-secondary" onClick={() => setIsProfileFormOpen((current) => !current)}>
                  {isProfileFormOpen ? "Скрыть редактор" : "Редактировать карточку"}
                </button>
              ) : null}
            </div>
            {canAssignManager && isManagerFormOpen ? (
              <div className="quick-form">
                <p className="quick-form__title">Назначить бригадира</p>
                <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                  <option value="">Бригадир не привязан</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.managerProfileId ?? ""}>
                      {manager.displayName}
                    </option>
                  ))}
                </select>
                <div className="toolbar">
                  <button onClick={() => void handleAssignManager()}>Сохранить бригадира</button>
                </div>
                {managerMessage ? <div className="panel-note">{managerMessage}</div> : null}
              </div>
            ) : null}
            {canEditDriver && isProfileFormOpen ? (
              <div className="quick-form">
                <p className="quick-form__title">Редактировать карточку</p>
                <div className="form-grid">
                  <input value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} placeholder="Имя" />
                  <input value={editLastName} onChange={(event) => setEditLastName(event.target.value)} placeholder="Фамилия" />
                  <input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="Телефон" />
                  <input value={editLicenseNumber} onChange={(event) => setEditLicenseNumber(event.target.value)} placeholder="Вод. удостоверение" />
                  <input value={editPassportNumber} onChange={(event) => setEditPassportNumber(event.target.value)} placeholder="Удостоверение личности" />
                  <input
                    value={editNearestRelativePhone}
                    onChange={(event) => setEditNearestRelativePhone(event.target.value)}
                    placeholder="Телефон близкого родственника"
                  />
                  <select value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)}>
                    <option value="">Компания не выбрана</option>
                    {companies.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                  <select value={editWeeklyDayOff} onChange={(event) => setEditWeeklyDayOff(event.target.value)}>
                    {weeklyDayOffOptions.map((option) => (
                      <option key={option.value || "none"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
                    <option value="active">Активен</option>
                    <option value="day_off">Выходной</option>
                    <option value="vacation">Отпросился</option>
                    <option value="force_majeure">Форс-мажор</option>
                    <option value="accident">ДТП</option>
                    <option value="idle">Простой</option>
                  </select>
                </div>
                <div className="toolbar">
                  <button disabled={profileSaving} onClick={() => void handleSaveProfile()}>
                    {profileSaving ? "Сохраняем..." : "Сохранить карточку"}
                  </button>
                  <button type="button" disabled={profileSaving} onClick={() => void handleResetDriverPassword()}>
                    {profileSaving ? "Сбрасываем..." : "Сбросить пароль 123456"}
                  </button>
                </div>
                {profileMessage ? <div className="panel-note">{profileMessage}</div> : null}
              </div>
            ) : null}
            {canCreateContract ? (
              <div className="toolbar">
                <Link className="button-link" to={`/contracts?driverId=${api.data?.id ?? ""}`}>
                  Назначить авто по договору
                </Link>
                {api.data?.activeContractId ? (
                  <button type="button" disabled={profileSaving} onClick={() => void handleTerminateActiveContract()}>
                    {profileSaving ? "Расторгаем..." : "Расторгнуть договор"}
                  </button>
                ) : null}
                {api.data?.activeContractId && !api.data?.assignedCarId ? (
                  <button type="button" disabled={profileSaving} onClick={() => void handleIssueCarByActiveContract()}>
                    {profileSaving ? "Выдаём..." : "Выдать авто по договору"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--overview">
            <div className="panel__title">
              <ShieldIcon width={18} height={18} />
              <h3>Фото водителя</h3>
            </div>
            <div className="summary-list">
              <div>
                <span>Статус фото</span>
                <strong>{getStatusLabel(api.data?.photoStatus ?? "missing")}</strong>
              </div>
              <div>
                <span>Загружено</span>
                <strong>{formatDateTime(api.data?.photoUploadedAt)}</strong>
              </div>
              <div>
                <span>Проверено</span>
                <strong>{formatDateTime(api.data?.photoReviewedAt)}</strong>
              </div>
              {api.data?.photoReviewNote ? (
                <div>
                  <span>Комментарий</span>
                  <strong>{api.data.photoReviewNote}</strong>
                </div>
              ) : null}
            </div>
            {api.data?.photoUrl?.startsWith("data:image/") ? (
              <button type="button" className="photo-preview-button" onClick={() => setPhotoPreviewUrl(api.data?.photoUrl ?? null)}>
                <img
                  src={api.data.photoUrl}
                  alt="Фото водителя"
                  className="photo-preview-image photo-preview-image--contain"
                />
              </button>
            ) : (
              <p className="panel-note">Фото ещё не загружено.</p>
            )}
            {api.data?.photoStatus === "pending" ? (
              <div className="toolbar">
                <button type="button" disabled={photoSaving} onClick={() => void handleReviewPhoto("approve")}>
                  {photoSaving ? "Сохраняем..." : "Одобрить фото"}
                </button>
                <button type="button" disabled={photoSaving} onClick={() => void handleReviewPhoto("reject")}>
                  Отклонить фото
                </button>
              </div>
            ) : null}
            {photoMessage ? <div className="panel-note">{photoMessage}</div> : null}
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--overview">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>События за дату</h3>
            </div>
            <div className="toolbar">
              <input type="date" value={selectedEventDate} onChange={(event) => setSelectedEventDate(event.target.value)} />
            </div>
            <AsyncState
              loading={dayEventsApi.loading}
              error={dayEventsApi.error}
              empty={!dayEventsApi.data?.length}
              emptyContent={<EmptyStatePanel title="Событий нет" message="За выбранную дату событий по водителю не найдено." />}
            >
              <div className="summary-list">
                {dayEventsApi.data?.map((item) => (
                  <div key={item.id}>
                    <span>{formatDateTime(item.createdAt)} · {item.title}</span>
                    <strong>{item.details}</strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--finance">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>Финансы</h3>
            </div>
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>Покрытие обязательств</strong>
                <p>
                  {isTerminatedDisplay
                    ? `Договор расторгнут. Оплачено за владение: ${formatCurrency(displayContractPaid)}. Просроченный долг: ${formatCurrency(displayContract?.currentDebt ?? 0)}.`
                    : hasActiveFinanceProfile
                      ? `${paymentCoverage}% портфеля уже оплачено. Оставшийся долг: ${formatCurrency(api.data?.currentDebt ?? 0)}.`
                    : "Активного финансового контура пока нет. Начисления появятся после создания договора."}
                </p>
              </div>
              <div className="detail-list__item">
                <strong>Статус долга</strong>
                <p>{(isTerminatedDisplay ? displayContract?.currentDebt ?? 0 : api.data?.currentDebt ?? 0) > 0 ? "По водителю есть открытый долг." : "Открытого долга нет."}</p>
              </div>
              {isTerminatedDisplay ? (
                <div className="detail-list__item">
                  <strong>Период владения</strong>
                  <p>
                    С {formatDateOnly(displayContractStartDate)} по {formatDateOnly(displayContractEndedAt)}
                    {displayContractOwnershipDays ? ` · ${displayContractOwnershipDays} дн.` : ""}.
                  </p>
                </div>
              ) : null}
              {(api.data?.creditBalance ?? 0) > 0 ? (
                <div className="detail-list__item">
                  <strong>Есть свободный остаток</strong>
                  <p>На водителе доступно {formatCurrency(api.data?.creditBalance ?? 0)} для следующих начислений.</p>
                </div>
              ) : null}
              {debtApi.data?.nextPaymentDate ? (
                <div className="detail-list__item">
                  <strong>Ближайший платёж</strong>
                  <p>
                    {formatCurrency(debtApi.data.nextPaymentAmount)} ·{" "}
                    {formatDueDateLabel(
                      debtApi.data.nextPaymentDate,
                      debtApi.data.nextPaymentAmount > 0 && isPastDate(debtApi.data.nextPaymentDate),
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            {hasCrmAccess(session.requestUserRole, "financial-ops") ? (
              <div className="toolbar">
                {displayContract?.id && (isTerminatedDisplay ? displayContract.currentDebt : api.data?.currentDebt ?? 0) > 0 ? (
                  <Link
                    className="button-link"
                    to={`/financial-ops?action=payment&source=driver&driverId=${api.data?.id ?? ""}&contractId=${displayContract.id}&amount=${
                      !isTerminatedDisplay && debtApi.data?.nextPaymentAmount && debtApi.data.nextPaymentAmount > 0
                        ? debtApi.data.nextPaymentAmount
                        : isTerminatedDisplay
                          ? displayContract.currentDebt
                          : api.data?.currentDebt ?? 0
                    }`}
                  >
                    Подготовить платёж
                  </Link>
                ) : null}
                {availablePayoutAmount > 0 ? (
                  <Link
                    className="button-link"
                    to={`/financial-ops?action=payout&source=driver&driverId=${api.data?.id ?? ""}&amount=${availablePayoutAmount}`}
                  >
                    Подготовить вывод
                  </Link>
                ) : null}
                {hasCrmAccess(session.requestUserRole, "vehicles") ? (
                  <Link
                    className="button-link"
                    to={`/vehicles?driverId=${api.data?.id ?? ""}`}
                  >
                    Добавить авто и договор
                  </Link>
                ) : null}
                {(api.data?.creditBalance ?? 0) > 0 ? (
                  <Link
                    className="button-link"
                    to={`/financial-ops?action=credit-writeoff&source=driver&driverId=${api.data?.id ?? ""}&amount=${api.data?.creditBalance ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                  >
                    Списать остаток
                  </Link>
                ) : null}
              </div>
            ) : null}
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--requests">
            <div className="panel__title">
              <CarIcon width={18} height={18} />
              <h3>Связанные переходы</h3>
            </div>
            <div className="summary-list">
              {displayContract?.id && hasCrmAccess(session.requestUserRole, "contract-detail") ? (
                <div>
                  <span>Карточка договора</span>
                  <strong>
                    <Link className="table-link" to={`/contracts/${displayContract.id}`}>
                      Открыть договор
                    </Link>
                  </strong>
                </div>
              ) : null}
              {api.data?.assignedCarId && hasCrmAccess(session.requestUserRole, "vehicle-detail") ? (
                <div>
                  <span>Карточка автомобиля</span>
                  <strong>
                    <Link className="table-link" to={`/vehicles/${api.data.assignedCarId}`}>
                      Открыть автомобиль
                    </Link>
                  </strong>
                </div>
              ) : null}
              {!api.data?.activeContractId && !api.data?.assignedCarId ? (
                <div>
                  <span>Связи</span>
                  <strong>Связанные карточки пока не найдены</strong>
                </div>
              ) : null}
            </div>
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--requests">
            <div className="panel__title">
              <ContractsIcon width={18} height={18} />
              <h3>Проверка связей</h3>
            </div>
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>{api.data?.activeContractId ? activeContractLabel : "Нужен договор"}</strong>
                <p>{api.data?.activeContractId ? "Договор уже привязан." : "Нужно создать договор, чтобы включить финансовый контур."}</p>
              </div>
              <div className="detail-list__item">
                <strong>{api.data?.assignedCarId ? assignedCarLabel : "Авто не привязано"}</strong>
                <p>
                  {api.data?.assignedCarId
                    ? "Автомобиль уже привязан к карточке водителя."
                    : api.data?.activeContractId
                      ? "Договор есть. Нажмите «Выдать авто по договору», чтобы восстановить привязку."
                      : "Нужно назначить автомобиль по договору."}
                </p>
              </div>
            </div>
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--overview">
            <div className="panel__title">
              <CarIcon width={18} height={18} />
              <h3>Автомобиль и риск</h3>
            </div>
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>{assignedVehicle ? getStatusLabel(assignedVehicle.status) : "Автомобиль не выведен на линию"}</strong>
                <p>
                  {assignedVehicle
                    ? `${assignedVehicle.plateNumber} сейчас в статусе ${getStatusLabel(assignedVehicle.status).toLowerCase()}.`
                    : "По водителю пока не закреплён автомобиль."}
                </p>
              </div>
              <div className="detail-list__item">
                <strong>{driverIncidents.length > 0 ? "Есть открытые сигналы" : "Открытых сигналов нет"}</strong>
                <p>
                  {driverIncidents.length > 0
                    ? `По водителю или его машине открыто ${driverIncidents.length} инцидент(ов).`
                    : "По водителю и его машине сейчас нет активных инцидентов."}
                </p>
              </div>
              {activeContract?.nextDueDate ? (
                <div className="detail-list__item">
                  <strong>Ближайшее обязательство</strong>
                  <p>
                    {formatCurrency(activeContract.nextDueAmount ?? 0)}{" "}
                    {formatDueDateLabel(
                      activeContract.nextDueDate,
                      (activeContract.nextDueAmount ?? 0) > 0 &&
                        (activeContract.currentDebt ?? 0) > 0 &&
                        isPastDate(activeContract.nextDueDate),
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            {api.data?.assignedCarId && hasCrmAccess(session.requestUserRole, "vehicle-detail") ? (
              <div className="toolbar">
                <Link className="table-link" to={`/vehicles/${api.data.assignedCarId}`}>
                  Открыть автомобиль
                </Link>
                {driverIncidents.length > 0 ? (
                  <Link className="table-link" to="/incidents?view=operations">
                    Рабочий поток
                  </Link>
                ) : null}
              </div>
            ) : null}
            {incidentMessage ? <div className="panel-note">{incidentMessage}</div> : null}
            {driverIncidents.length > 0 ? (
              <div className="summary-list">
                {driverIncidents.slice(0, 4).map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <strong>{getStatusLabel(item.status)} · {item.priority}</strong>
                    <div className="toolbar">
                      <Link className="table-link" to="/incidents?view=operations">
                        Рабочий поток
                      </Link>
                      {canUpdateIncident && item.status === "open" ? (
                        <>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={pendingIncidentActionId === item.id}
                            onClick={() => void handleIncidentAction(item.id, "resolved")}
                          >
                            Решить
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={pendingIncidentActionId === item.id}
                            onClick={() => void handleIncidentAction(item.id, "closed")}
                          >
                            Закрыть
                          </button>
                        </>
                      ) : null}
                      {canUpdateIncident && item.status !== "archived" ? (
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={pendingIncidentActionId === item.id}
                          onClick={() => void handleIncidentAction(item.id, "archived")}
                        >
                          В архив
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--history">
            <div className="panel__title">
              <CarIcon width={18} height={18} />
              <h3>История автомобилей</h3>
            </div>
            <div className="summary-list">
              {driverVehicleHistory.map((item) => (
                <div key={`history-vehicle-${item.contract.id}`}>
                  <span>
                    {item.title} · договор {item.contract.contractNumber}
                  </span>
                  <strong>
                    {item.periodStart ? formatDateOnly(item.periodStart) : "Дата начала не указана"}
                    {" — "}
                    {item.periodEnd ? formatDateOnly(item.periodEnd) : "сейчас"}
                    {" · просроченная задолженность "}
                    {formatCurrency(item.overdueDebt)}
                  </strong>
                  {item.contract.overdueSinceDate || item.contract.overdueUntilDate ? (
                    <p>
                      Период просрочки: {item.contract.overdueSinceDate ? formatDateOnly(item.contract.overdueSinceDate) : "не указан"}
                      {" — "}
                      {item.contract.overdueUntilDate ? formatDateOnly(item.contract.overdueUntilDate) : "не указан"}
                    </p>
                  ) : null}
                  <div className="toolbar">
                    <Link className="table-link" to={`/contracts/${item.contract.id}`}>
                      Открыть договор
                    </Link>
                    {item.vehicle ? (
                      <Link className="table-link" to={`/vehicles/${item.vehicle.id}`}>
                        Открыть авто
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {!driverVehicleHistory.length ? (
                <div>
                  <span>История автомобилей</span>
                  <strong>Автомобили пока не выдавались</strong>
                </div>
              ) : null}
            </div>
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--history">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>История договоров и событий</h3>
            </div>
            <div className="summary-list">
              {driverContracts.map((item) => (
                <div key={`history-contract-${item.id}`}>
                  <span>Договор {item.contractNumber} · {formatDateOnly(item.startDate)}</span>
                  <strong>
                    {getStatusLabel(item.status)} · просрочка {formatCurrency(item.overdueDebt ?? 0)}
                  </strong>
                  <div className="toolbar">
                    <Link className="table-link" to={`/contracts/${item.id}`}>
                      Открыть договор
                    </Link>
                    {item.carId ? (
                      <Link className="table-link" to={`/vehicles/${item.carId}`}>
                        Открыть авто
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {driverIncidents.map((item) => (
                <div key={`history-incident-${item.id}`}>
                  <span>
                    {item.incidentType === "repair"
                      ? formatRepairPeriodLabel(item.occurredAt, item.periodLabel)
                      : item.occurredAt
                        ? formatDateTime(item.occurredAt)
                        : "Дата не указана"} · {item.title}
                  </span>
                  <strong>{getStatusLabel(item.status)} · {item.priority}</strong>
                  {item.description || item.repairNote || item.insuranceNote ? (
                    <p>{item.description ?? item.repairNote ?? item.insuranceNote}</p>
                  ) : null}
                  {item.accidentPhotoUrl?.startsWith("data:image/") ? (
                    <button type="button" className="photo-preview-button photo-preview-button--small" onClick={() => setPhotoPreviewUrl(item.accidentPhotoUrl ?? null)}>
                      <img src={item.accidentPhotoUrl} alt="Фото ДТП" className="photo-preview-image photo-preview-image--contain" />
                    </button>
                  ) : null}
                </div>
              ))}
              {(statusRequestsApi.data ?? []).map((item) => (
                <div key={`history-status-${item.id}`}>
                  <span>{item.createdAt ? formatDateTime(item.createdAt) : "Дата не указана"} · запрос водителя</span>
                  <strong>{getStatusLabel(item.status)} · {item.type} · {item.period}</strong>
                </div>
              ))}
              {!driverContracts.length && !driverIncidents.length && !(statusRequestsApi.data ?? []).length ? (
                <div>
                  <span>История</span>
                  <strong>Событий пока нет</strong>
                </div>
              ) : null}
            </div>
          </article>
          <AsyncState
            loading={paymentScheduleApi.loading}
            error={paymentScheduleApi.error}
            empty={!paymentScheduleItems.length}
            emptyContent={
              <article className="panel driver-tab-panel driver-tab-panel--schedule">
                <EmptyStatePanel
                  title="График пока пуст"
                  message="Для этого водителя пока нет активных платежей по графику."
                />
              </article>
            }
          >
            <article className="panel driver-payment-schedules driver-payment-schedules--compact driver-tab-panel driver-tab-panel--schedule">
              <div className="panel__title">
                <WalletIcon width={18} height={18} />
                <h3>График оплат</h3>
              </div>
              <div className="table-scroll table-scroll--compact">
                <table className="data-table schedule-compact-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Договор</th>
                      <th>GPS</th>
                      <th>Страховка</th>
                      <th>Итого</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentScheduleItems.map((item) => {
                      const contractAmount = getScheduleComponentAmount(item, "contract");
                      const gpsAmount = getScheduleComponentAmount(item, "gps");
                      const insuranceAmount = getScheduleComponentAmount(item, "insurance");
                      const totalAmount = contractAmount + gpsAmount + insuranceAmount;
                      return (
                        <tr key={item.id}>
                          <td>{formatDateOnly(item.dueDate)}</td>
                          <td>
                            <span>{formatCurrency(contractAmount)}</span>
                            <small>{formatScheduleComponentState(item, "contract")}</small>
                          </td>
                          <td>
                            <span>{formatCurrency(gpsAmount)}</span>
                            <small>{formatScheduleComponentState(item, "gps")}</small>
                          </td>
                          <td>
                            <span>{formatCurrency(insuranceAmount)}</span>
                            <small>{formatScheduleComponentState(item, "insurance")}</small>
                          </td>
                          <td><strong>{formatCurrency(totalAmount)}</strong></td>
                          <td>
                            <span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span>
                            {item.deferredByStatusRequest && hasCrmAccess(session.requestUserRole, "contract-detail") && api.data?.activeContractId ? (
                              <Link className="table-link schedule-compact-table__link" to={`/contracts/${api.data.activeContractId}`}>
                                Договор
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </AsyncState>
          <article className="panel driver-tab-panel driver-tab-panel--finance">
            <div className="panel__title">
              <FinanceIcon width={18} height={18} />
              <h3>История платежей</h3>
            </div>
            <AsyncState
              loading={paymentsApi.loading}
              error={paymentsApi.error}
              empty={!driverPayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="Платежей пока нет"
                  message="По этому водителю ещё нет зарегистрированных платежей."
                />
              }
            >
              <div className="summary-list">
                {driverPayments.map((item) => (
                  <div key={item.id}>
                    <span>
                      {formatDateTime(item.createdAt)} · {getPaymentProviderLabel(item.provider)}
                    </span>
                    <strong>
                      {formatCurrency(item.amount)} · {getPaymentStatusLabel(item.status)}
                      {item.appliedAmount > 0 ? ` · оплачено ${formatCurrency(item.appliedAmount)}` : ""}
                      {item.unappliedAmount > 0 ? ` · остаток ${formatCurrency(item.unappliedAmount)}` : ""}
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--finance">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>История выводов</h3>
            </div>
            {payoutMessage ? <div className="panel-note">{payoutMessage}</div> : null}
            {payoutError ? <div className="panel-note">Ошибка: {payoutError}</div> : null}
            <AsyncState
              loading={payoutsApi.loading}
              error={payoutsApi.error}
              empty={!driverPayouts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Выводов пока нет"
                  message="По этому водителю ещё нет заявок на вывод средств."
                />
              }
            >
              {canApprovePayout && requestedDriverPayouts.length ? (
                <div className="toolbar">
                  <button type="button" onClick={toggleSelectAllPayouts}>
                    {allPayoutsSelected ? "Снять выбор" : "Выбрать все"}
                  </button>
                  <span className="panel-note">Выбрано: {selectedPayoutCount}</span>
                  <button
                    type="button"
                    className="inline-action"
                    disabled={bulkPayoutActionLoading || !selectedPayoutCount}
                    onClick={() => void handleBulkPayoutAction("approve")}
                  >
                    {bulkPayoutActionLoading ? "Обрабатываем..." : "Массово одобрить"}
                  </button>
                  <button
                    type="button"
                    className="inline-action"
                    disabled={bulkPayoutActionLoading || !selectedPayoutCount}
                    onClick={() => void handleBulkPayoutAction("reject")}
                  >
                    {bulkPayoutActionLoading ? "Обрабатываем..." : "Массово отклонить"}
                  </button>
                </div>
              ) : null}
              <div className="summary-list">
                {driverPayouts.map((item) => (
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
                      <span>{formatDateTime(item.createdAt)}</span>
                    </span>
                    <strong>
                      {formatCurrency(item.amount)} · {getPayoutStatusLabel(item.status)}
                    </strong>
                    {item.status === "requested" && canApprovePayout ? (
                      <div className="toolbar">
                        <button
                          className="inline-action"
                          disabled={pendingPayoutActionId === item.id}
                          onClick={() => void handlePayoutAction("approve", item.id)}
                        >
                          {pendingPayoutActionId === item.id ? "Сохраняем..." : "Одобрить"}
                        </button>
                        <button
                          className="inline-action"
                          disabled={pendingPayoutActionId === item.id}
                          onClick={() => void handlePayoutAction("reject", item.id)}
                        >
                          {pendingPayoutActionId === item.id ? "Сохраняем..." : "Отклонить"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel driver-tab-panel driver-tab-panel--requests">
            <div className="panel__title">
              <ShieldIcon width={18} height={18} />
              <h3>Подтверждения снятия баланса с Яндекса</h3>
            </div>
            {statusRequestMessage ? <div className="panel-note">{statusRequestMessage}</div> : null}
            {statusRequestError ? <div className="panel-note">Ошибка: {statusRequestError}</div> : null}
            <AsyncState
              loading={statusRequestsApi.loading}
              error={statusRequestsApi.error}
              empty={!statusRequestsApi.data?.length}
              emptyContent={
                <EmptyStatePanel
                  title="Подтверждений пока нет"
                  message="По этому водителю ещё нет подтверждений на выходной, статус «Отпросился» или форс-мажор."
                />
              }
            >
              {canApproveStatusRequest && pendingStatusRequests.length ? (
                <div className="toolbar">
                  <button type="button" onClick={toggleSelectAllStatusRequests}>
                    {allStatusSelected ? "Снять выбор" : "Выбрать все"}
                  </button>
                  <span className="panel-note">Выбрано: {selectedStatusCount}</span>
                  <button
                    type="button"
                    className="inline-action"
                    disabled={bulkStatusActionLoading || !selectedStatusCount}
                    onClick={() => void handleBulkStatusAction("approve")}
                  >
                    {bulkStatusActionLoading ? "Обрабатываем..." : "Массово подтвердить"}
                  </button>
                  <button
                    type="button"
                    className="inline-action"
                    disabled={bulkStatusActionLoading || !selectedStatusCount}
                    onClick={() => void handleBulkStatusAction("reject")}
                  >
                    {bulkStatusActionLoading ? "Обрабатываем..." : "Массово отклонить"}
                  </button>
                </div>
              ) : null}
              <div className="summary-list">
                {statusRequestsApi.data?.map((item) => (
                  <div key={item.id}>
                    <span className="toolbar">
                      {item.status === "pending" && canApproveStatusRequest ? (
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={selectedStatusRequestIds.includes(item.id)}
                            onChange={() => toggleStatusRequestSelection(item.id)}
                          />
                        </label>
                      ) : null}
                      <span>
                        {getStatusLabel(item.type)} · {item.period}
                      </span>
                    </span>
                    <strong>{getStatusLabel(item.status)}</strong>
                    {item.status === "pending" && canApproveStatusRequest ? (
                      <div className="toolbar">
                        <button
                          className="inline-action"
                          disabled={pendingActionId === item.id}
                          onClick={async () => {
                            setStatusRequestError(null);
                            setPendingActionId(item.id);
                            try {
                              await postJson<DriverStatusRequestItem, Record<string, never>>(
                                `approvals/status-requests/${item.id}/approve`,
                                {},
                              );
                              setStatusRequestMessage("Запрос одобрен.");
                              await statusRequestsApi.refetch();
                              await profileApi.refetch();
                            } catch (error) {
                              setStatusRequestError(error instanceof Error ? error.message : "Не удалось одобрить запрос.");
                            } finally {
                              setPendingActionId(null);
                            }
                          }}
                        >
                          {pendingActionId === item.id ? "Сохраняем..." : "Одобрить"}
                        </button>
                        <button
                          className="inline-action"
                          disabled={pendingActionId === item.id}
                          onClick={async () => {
                            setStatusRequestError(null);
                            setPendingActionId(item.id);
                            try {
                              await postJson<DriverStatusRequestItem, Record<string, never>>(
                                `approvals/status-requests/${item.id}/reject`,
                                {},
                              );
                              setStatusRequestMessage("Запрос отклонён.");
                              await statusRequestsApi.refetch();
                              await profileApi.refetch();
                            } catch (error) {
                              setStatusRequestError(error instanceof Error ? error.message : "Не удалось отклонить запрос.");
                            } finally {
                              setPendingActionId(null);
                            }
                          }}
                        >
                          {pendingActionId === item.id ? "Сохраняем..." : "Отклонить"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
        </div>
      </AsyncState>
    </section>
    {photoPreviewUrl ? (
      <button type="button" className="photo-lightbox" onClick={() => setPhotoPreviewUrl(null)} aria-label="Закрыть фото">
        <img src={photoPreviewUrl} alt="Просмотр фото" />
      </button>
    ) : null}
    </>
  );
}
