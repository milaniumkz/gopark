import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { formatCurrency, formatDateOnly, getStatusLabel, getStatusTone } from "../lib/utils";
import { hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { useApiMutation } from "../hooks/useApiMutation";
import { patchJson } from "../lib/api";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { downloadCsvTable } from "../lib/utils";
import { VEHICLE_MAKE_OPTIONS, getVehicleModelOptions } from "../lib/vehicleCatalog";
import { CarIcon, DriversIcon, FinanceIcon } from "../ui/CrmIcons";
import type { ContractListItem, DriverListItem, ManagerIncidentItem, PaymentListItem, UserAdminListItem, VehicleListItem } from "@gopark/contracts";

function getContractStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Активный";
    case "closed":
      return "Выкуплен";
    case "terminated":
      return "Расторгнут";
    case "problem":
      return "Проблемный";
    case "draft":
      return "Черновик";
    default:
      return status;
  }
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

function normalizeTemplateValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const idleVehicleStatuses = new Set(["free", "office", "idle", "maintenance", "repair", "accident", "impound", "written_off"]);
const lineVehicleStatuses = new Set(["assigned", "active_installment"]);

function isOfficeReadyVehicle(vehicle: Pick<VehicleListItem, "assignedDriverId" | "status">): boolean {
  return !vehicle.assignedDriverId && (vehicle.status === "office" || vehicle.status === "free");
}

function matchesVehicleStatus(vehicle: VehicleListItem, selectedStatus: string): boolean {
  if (selectedStatus === "all") {
    return true;
  }
  if (selectedStatus === "office") {
    return isOfficeReadyVehicle(vehicle);
  }
  if (selectedStatus === "idle") {
    return idleVehicleStatuses.has(vehicle.status);
  }
  if (selectedStatus === "assigned") {
    return lineVehicleStatuses.has(vehicle.status);
  }
  if (selectedStatus === "maintenance") {
    return vehicle.status === "maintenance" || vehicle.status === "repair";
  }
  return vehicle.status === selectedStatus;
}

export function VehiclesPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? "assigned");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("keep");
  const [bulkCompanyName, setBulkCompanyName] = useState("keep");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [vin, setVin] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [templateLabel, setTemplateLabel] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [productionYear, setProductionYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [color, setColor] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [customsCost, setCustomsCost] = useState("");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [targetSalePrice, setTargetSalePrice] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [newDriverFirstName, setNewDriverFirstName] = useState("");
  const [newDriverLastName, setNewDriverLastName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [newDriverLicenseNumber, setNewDriverLicenseNumber] = useState("");
  const [newDriverPassportNumber, setNewDriverPassportNumber] = useState("");
  const [newDriverWeeklyDayOff, setNewDriverWeeklyDayOff] = useState("");
  const nextContractNumber = useApiQuery<{ contractNumber: string }>("contracts/next-number");
  const contractNumber = nextContractNumber.data?.contractNumber ?? "";
  const [principalAmount, setPrincipalAmount] = useState("1000000");
  const [installmentAmount, setInstallmentAmount] = useState("2300");
  const [monthlyInsuranceAmount, setMonthlyInsuranceAmount] = useState("");
  const [monthlyGpsAmount, setMonthlyGpsAmount] = useState("");
  const [insuranceMode, setInsuranceMode] = useState<"monthly" | "daily">("monthly");
  const [gpsMode, setGpsMode] = useState<"monthly" | "daily">("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const vinInputRef = useRef<HTMLInputElement | null>(null);
  const quickFormRef = useRef<HTMLDivElement | null>(null);
  const api = useApiQuery<VehicleListItem[]>("cars");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createCar = useApiMutation<
    VehicleListItem,
    {
      vin: string;
      plateNumber: string;
      make: string;
      model: string;
      companyName?: string;
      productionYear?: number;
      mileage?: number;
      color?: string;
      purchasePrice?: number;
      customsCost?: number;
      deliveryCost?: number;
      repairCost?: number;
      targetSalePrice?: number;
    }
  >("cars");
  const createContract = useApiMutation<
    ContractListItem,
    {
      driverId: string;
      carId: string;
      principalAmount: number;
      financedAmount: number;
      installmentAmount: number;
      monthlyInsuranceAmount?: number;
      monthlyGpsAmount?: number;
      insuranceBillingMode?: "monthly" | "daily";
      gpsBillingMode?: "monthly" | "daily";
      installmentDay: number;
      termMonths: number;
      startDate: string;
      endDate: string;
    }
  >("contracts");
  const createDriver = useApiMutation<
    DriverListItem,
    {
      firstName: string;
      lastName: string;
      phone: string;
      licenseNumber?: string;
      passportNumber?: string;
      companyName?: string;
      weeklyDayOff?: string;
    }
  >("drivers");
  const createIncident = useApiMutation<
    ManagerIncidentItem,
    {
      title: string;
      incidentType: string;
      status: string;
      priority: string;
      driverId?: string | null;
      carId?: string | null;
      occurredAt?: string | null;
      periodLabel?: string | null;
      amount?: number | null;
      description?: string | null;
      insuranceNote?: string | null;
      locationNote?: string | null;
    }
  >("incidents");
  const canCreateCar = hasCrmCapability(session.requestUserRole, "create-car", session.managerLevel);
  const canCreateDriver = hasCrmCapability(session.requestUserRole, "create-driver", session.managerLevel);
  const canCreateContract = hasCrmCapability(session.requestUserRole, "create-contract", session.managerLevel);
  const canOpenFinancialOps = hasCrmCapability(session.requestUserRole, "create-payment");
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const driverManagerIdMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.managerId]));
  const managerNameMap = new Map<string, string>();
  for (const user of usersApi.data ?? []) {
    if (user.role !== "manager") {
      continue;
    }
    managerNameMap.set(user.id, user.displayName);
    if (user.managerProfileId) {
      managerNameMap.set(user.managerProfileId, user.displayName);
    }
  }
  const resolveVehicleManagerLabel = (vehicle: VehicleListItem): string => {
    if (vehicle.managerName?.trim()) {
      return vehicle.managerName;
    }
    if (!vehicle.assignedDriverId) {
      return "Не закреплена";
    }
    const managerId = driverManagerIdMap.get(vehicle.assignedDriverId);
    if (!managerId) {
      return "Бригадир не назначен";
    }
    return managerNameMap.get(managerId) ?? managerId;
  };
  const driverWeekOffMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.weeklyDayOff ?? ""]));
  const companies = settingsApi.data?.companies ?? [];
  const vehicleTemplateOptions = useMemo(() => {
    const templates = new Map<string, VehicleListItem>();

    for (const vehicle of api.data ?? []) {
      if (!vehicle.make && !vehicle.model) {
        continue;
      }

      const label = [
        [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim(),
        vehicle.productionYear ? String(vehicle.productionYear) : "",
        vehicle.companyName ?? "",
      ]
        .filter(Boolean)
        .join(" · ");

      if (!label) {
        continue;
      }

      const current = templates.get(label);
      if (!current) {
        templates.set(label, vehicle);
        continue;
      }

      const currentScore = Number(Boolean(current.color)) + Number(Boolean(current.purchasePrice)) + Number(Boolean(current.targetSalePrice));
      const nextScore = Number(Boolean(vehicle.color)) + Number(Boolean(vehicle.purchasePrice)) + Number(Boolean(vehicle.targetSalePrice));
      if (nextScore > currentScore) {
        templates.set(label, vehicle);
      }
    }

    return [...templates.entries()]
      .map(([label, vehicle]) => ({ label, vehicle }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [api.data]);
  const contractByCarId = new Map((contractsApi.data ?? []).map((item) => [item.carId, item]));
  const paidByContractId = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of paymentsApi.data ?? []) {
      map.set(payment.contractId, (map.get(payment.contractId) ?? 0) + (payment.appliedAmount || 0));
    }
    return map;
  }, [paymentsApi.data]);
  const contractHistoryByCarId = useMemo(() => {
    const map = new Map<string, ContractListItem[]>();
    for (const contract of contractsApi.data ?? []) {
      const current = map.get(contract.carId) ?? [];
      current.push(contract);
      map.set(contract.carId, current);
    }

    for (const [carId, items] of map.entries()) {
      map.set(
        carId,
        [...items].sort((left, right) => {
          const leftDate = new Date(left.startDate ?? "").getTime() || 0;
          const rightDate = new Date(right.startDate ?? "").getTime() || 0;
          return rightDate - leftDate;
        }),
      );
    }

    return map;
  }, [contractsApi.data]);
  const getContractSummary = (vehicle: VehicleListItem) =>
    vehicle.activeContractId
      ? {
          id: vehicle.activeContractId,
          driverId: vehicle.assignedDriverId ?? "",
          currentDebt: vehicle.currentDebt ?? 0,
          nextDueAmount: vehicle.nextDueAmount ?? 0,
          nextDueDate: vehicle.nextDueDate ?? null,
          hasDeferredPayment: vehicle.hasDeferredPayment ?? false,
        }
      : contractByCarId.get(vehicle.id) ?? null;
  const isCreatingDriverInline = assignDriverId === "__new_driver__";
  const inlineDriverLabel = [newDriverFirstName, newDriverLastName].filter(Boolean).join(" ").trim() || "новым водителем";
  const selectedDriverLabel = assignDriverId
    ? isCreatingDriverInline
      ? inlineDriverLabel
      : (driverMap.get(assignDriverId) ?? "Водитель")
    : null;
  const incidentCountByCarId = new Map<string, number>();

  for (const item of incidentsApi.data ?? []) {
    if (!item.carId) {
      continue;
    }

    incidentCountByCarId.set(item.carId, (incidentCountByCarId.get(item.carId) ?? 0) + 1);
  }

  const rows = useMemo(
    () =>
      (api.data ?? []).filter((vehicle) => {
        const normalizedQuery = query.toLowerCase();
        const inSearch =
          vehicle.plateNumber.toLowerCase().includes(normalizedQuery) ||
          vehicle.vin.toLowerCase().includes(normalizedQuery) ||
          (vehicle.make ?? "").toLowerCase().includes(normalizedQuery) ||
          (vehicle.model ?? "").toLowerCase().includes(normalizedQuery);
        const inStatus = matchesVehicleStatus(vehicle, status);
        const inCompany = companyFilter === "all" || (vehicle.companyName ?? "") === companyFilter;
        return inSearch && inStatus && inCompany;
      }),
    [api.data, companyFilter, query, status],
  );
  const normalizedExactVehicleQuery = query.trim().toLowerCase();
  const compactExactVehicleQuery = normalizedExactVehicleQuery.replace(/\s+/g, "");
  const hasSpecificVehicleStatusFilter = status !== "all";
  const shouldShowInlineVehicleHistory = (vehicle: VehicleListItem) => {
    if (!hasSpecificVehicleStatusFilter || !normalizedExactVehicleQuery) {
      return false;
    }

    const plate = vehicle.plateNumber.trim().toLowerCase();
    const vin = vehicle.vin.trim().toLowerCase();
    return (
      plate === normalizedExactVehicleQuery
      || vin === normalizedExactVehicleQuery
      || plate.replace(/\s+/g, "") === compactExactVehicleQuery
      || vin.replace(/\s+/g, "") === compactExactVehicleQuery
    );
  };
  const metricRows = useMemo(
    () =>
      (api.data ?? []).filter((vehicle) => {
        const normalizedQuery = query.toLowerCase();
        const inSearch =
          vehicle.plateNumber.toLowerCase().includes(normalizedQuery) ||
          vehicle.vin.toLowerCase().includes(normalizedQuery) ||
          (vehicle.make ?? "").toLowerCase().includes(normalizedQuery) ||
          (vehicle.model ?? "").toLowerCase().includes(normalizedQuery);
        const inCompany = companyFilter === "all" || (vehicle.companyName ?? "") === companyFilter;
        return inSearch && inCompany;
      }),
    [api.data, companyFilter, query],
  );
  const assignedCount = metricRows.filter((vehicle) => lineVehicleStatuses.has(vehicle.status)).length;
  const linkedDriverCount = metricRows.filter((vehicle) => vehicle.assignedDriverId).length;
  const officeCount = metricRows.filter(isOfficeReadyVehicle).length;
  const idleCount = metricRows.filter((vehicle) => idleVehicleStatuses.has(vehicle.status)).length;
  const repairCount = metricRows.filter((vehicle) => vehicle.status === "maintenance" || vehicle.status === "repair").length;
  const accidentCount = metricRows.filter((vehicle) => vehicle.status === "accident").length;
  const impoundCount = metricRows.filter((vehicle) => vehicle.status === "impound").length;
  const customsCount = metricRows.filter((vehicle) => vehicle.status === "customs").length;
  const soldCount = metricRows.filter((vehicle) => vehicle.status === "sold").length;
  const writtenOffCount = metricRows.filter((vehicle) => vehicle.status === "written_off").length;
  const withIncidentsCount = metricRows.filter((vehicle) => (incidentCountByCarId.get(vehicle.id) ?? 0) > 0).length;
  const debtTotal = rows.reduce((total, vehicle) => total + (getContractSummary(vehicle)?.currentDebt ?? 0), 0);
  const statusMetrics = [
    { key: "all", label: "Все авто", value: metricRows.length, hint: "Все статусы" },
    { key: "assigned", label: "На линии", value: assignedCount, hint: "Есть связанный водитель" },
    { key: "office", label: "В офисе", value: officeCount, hint: "Свободные к выдаче" },
    { key: "maintenance", label: "Ремонт", value: repairCount, hint: "СТО и ремонт" },
    { key: "accident", label: "ДТП", value: accidentCount, hint: "Машины после ДТП" },
    { key: "impound", label: "Штрафстоянка", value: impoundCount, hint: "На штрафстоянке" },
    { key: "idle", label: "Простой", value: idleCount, hint: "Все вне линии" },
    { key: "customs", label: "Растаможка", value: customsCount, hint: "Оформление" },
    { key: "sold", label: "Продан", value: soldCount, hint: "Выведен из парка" },
    { key: "written_off", label: "Списанные", value: writtenOffCount, hint: "Не в работе" },
  ];
  const selectedCount = selectedVehicleIds.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const vehicleModelOptions = getVehicleModelOptions(make);
  const calculatedTermMonths = useMemo(() => calculateTermMonthsFromDates(startDate, endDate), [endDate, startDate]);
  const payableDays = useMemo(
    () => calculatePayableDays(startDate, endDate, isCreatingDriverInline ? newDriverWeeklyDayOff : (driverWeekOffMap.get(assignDriverId) ?? null)),
    [assignDriverId, driverWeekOffMap, endDate, isCreatingDriverInline, newDriverWeeklyDayOff, startDate],
  );
  const calculatedInstallmentDay = useMemo(() => {
    if (!endDate) {
      return 15;
    }

    return new Date(endDate).getDate() || 15;
  }, [endDate]);

  useEffect(() => {
    const principal = Number(principalAmount);
    const dailyPayment = Number(installmentAmount);
    if (!startDate || !Number.isFinite(principal) || !Number.isFinite(dailyPayment) || principal <= 0 || dailyPayment <= 0) {
      return;
    }

    const payableDaysNeeded = Math.ceil(principal / dailyPayment);
    const nextEndDate = calculateEndDateFromPayableDays(
      startDate,
      payableDaysNeeded,
      isCreatingDriverInline ? newDriverWeeklyDayOff : (driverWeekOffMap.get(assignDriverId) ?? null),
    );
    if (nextEndDate && nextEndDate !== endDate) {
      setEndDate(nextEndDate);
    }
  }, [assignDriverId, driverWeekOffMap, endDate, installmentAmount, isCreatingDriverInline, newDriverWeeklyDayOff, principalAmount, startDate]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    vinInputRef.current?.focus();
  }, [isCreateModalOpen]);

  useEffect(() => {
    const statusParam = searchParams.get("status");
    setStatus(statusParam ?? "assigned");
  }, [searchParams]);

  useEffect(() => {
    const driverIdParam = searchParams.get("driverId");
    if (!driverIdParam) {
      return;
    }

    if ((driversApi.data ?? []).some((driver) => driver.id === driverIdParam)) {
      setAssignDriverId(driverIdParam);
      setPresetNotice("Авто и договор подготовлены из карточки водителя.");
      setIsCreateModalOpen(true);
    }
  }, [driversApi.data, searchParams]);

  useEffect(() => {
    setSelectedVehicleIds((current) => current.filter((vehicleId) => rows.some((item) => item.id === vehicleId)));
  }, [rows]);

  function toggleVehicleSelection(vehicleId: string): void {
    setSelectedVehicleIds((current) =>
      current.includes(vehicleId) ? current.filter((id) => id !== vehicleId) : [...current, vehicleId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedVehicleIds(allSelected ? [] : rows.map((item) => item.id));
  }

  function handleExport(): void {
    if (!rows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-vehicles.csv",
      ["plate_number", "vin", "make", "model", "production_year", "color", "purchase_price", "customs_cost", "delivery_cost", "repair_cost", "target_sale_price", "total_acquisition_cost", "status", "driver", "manager", "current_debt", "next_due_amount", "next_due_date", "has_deferred_payment", "open_incidents"],
      rows.map((vehicle) => [
        vehicle.plateNumber,
        vehicle.vin,
        vehicle.make ?? "",
        vehicle.model ?? "",
        vehicle.productionYear ?? "",
        vehicle.color ?? "",
        vehicle.purchasePrice ?? 0,
        vehicle.customsCost ?? 0,
        vehicle.deliveryCost ?? 0,
        vehicle.repairCost ?? 0,
        vehicle.targetSalePrice ?? 0,
        vehicle.totalAcquisitionCost ?? 0,
        getStatusLabel(vehicle.status),
        vehicle.assignedDriverId ? (driverMap.get(vehicle.assignedDriverId) ?? "Водитель назначен") : "Не привязан",
        resolveVehicleManagerLabel(vehicle),
        getContractSummary(vehicle)?.currentDebt ?? 0,
        getContractSummary(vehicle)?.nextDueAmount ?? 0,
        getContractSummary(vehicle)?.nextDueDate ?? "",
        getContractSummary(vehicle)?.hasDeferredPayment ? "yes" : "no",
        incidentCountByCarId.get(vehicle.id) ?? 0,
      ]),
    );
  }

  function applyVehicleTemplate(label: string): void {
    setTemplateLabel(label);
    const normalizedLabel = normalizeTemplateValue(label);
    const directMatch = vehicleTemplateOptions.find((item) => item.label === label);
    const makeModelMatches = vehicleTemplateOptions.filter(({ vehicle }) => {
      const makeModel = normalizeTemplateValue([vehicle.make, vehicle.model].filter(Boolean).join(" "));
      return makeModel === normalizedLabel;
    });
    const makeOnlyMatches = vehicleTemplateOptions.filter(({ vehicle }) => normalizeTemplateValue(vehicle.make ?? "") === normalizedLabel);
    const matchedTemplate = directMatch?.vehicle
      ?? (makeModelMatches.length === 1 ? makeModelMatches[0]?.vehicle : null)
      ?? (makeOnlyMatches.length === 1 ? makeOnlyMatches[0]?.vehicle : null);

    if (!matchedTemplate) {
      if (label.trim()) {
        setPresetNotice("Точного шаблона пока нет. Можно продолжить ввод вручную или выбрать готовую машину из списка.");
      } else {
        setPresetNotice(null);
      }
      return;
    }

    const matchedLabel = directMatch?.label
      ?? makeModelMatches[0]?.label
      ?? makeOnlyMatches[0]?.label
      ?? label;
    setTemplateLabel(matchedLabel);
    setMake(matchedTemplate.make ?? "");
    setModel(matchedTemplate.model ?? "");
    setCompanyName(matchedTemplate.companyName ?? "");
    setProductionYear(matchedTemplate.productionYear ? String(matchedTemplate.productionYear) : "");
    setMileage(matchedTemplate.mileage ? String(matchedTemplate.mileage) : "");
    setColor(matchedTemplate.color ?? "");
    setPurchasePrice(matchedTemplate.purchasePrice ? String(matchedTemplate.purchasePrice) : "");
    setCustomsCost(matchedTemplate.customsCost ? String(matchedTemplate.customsCost) : "");
    setDeliveryCost(matchedTemplate.deliveryCost ? String(matchedTemplate.deliveryCost) : "");
    setRepairCost(matchedTemplate.repairCost ? String(matchedTemplate.repairCost) : "");
    setTargetSalePrice(matchedTemplate.targetSalePrice ? String(matchedTemplate.targetSalePrice) : "");
    setPresetNotice(`Шаблон ${matchedLabel} применён. Типовые поля подставлены автоматически. Осталось указать VIN, госномер и при необходимости водителя.`);
  }

  async function handleCreateCar(): Promise<void> {
    if (!vin || !plateNumber || !make || !model) {
      setFormMessage("Заполните VIN, госномер, марку и модель.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      vinInputRef.current?.focus();
      return;
    }

    if (assignDriverId) {
      if (isCreatingDriverInline && (!newDriverFirstName || !newDriverLastName || !newDriverPhone)) {
        setFormMessage("Для нового водителя заполните имя, фамилию и телефон.");
        quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        vinInputRef.current?.focus();
        return;
      }

      if (!canCreateContract) {
        setFormMessage("Для быстрого вывода авто на линию нужен доступ к созданию договора.");
        quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        vinInputRef.current?.focus();
        return;
      }


      if (
        !startDate ||
        !endDate ||
        Number(principalAmount) <= 0 ||
        Number(installmentAmount) <= 0 ||
        calculatedTermMonths <= 0
      ) {
        setFormMessage("Для вывода авто на линию заполните суммы, дату взятия авто и дату выплаты.");
        quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        vinInputRef.current?.focus();
        return;
      }
    }

    setFormMessage(null);
    const createdCar = await createCar.mutate({
      vin,
      plateNumber,
      make,
      model,
      companyName: companyName || undefined,
      productionYear: productionYear ? Number(productionYear) : undefined,
      mileage: mileage ? Number(mileage) : undefined,
      color: color.trim() || undefined,
      purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
      customsCost: customsCost ? Number(customsCost) : undefined,
      deliveryCost: deliveryCost ? Number(deliveryCost) : undefined,
      repairCost: repairCost ? Number(repairCost) : undefined,
      targetSalePrice: targetSalePrice ? Number(targetSalePrice) : undefined,
    });

    if (assignDriverId) {
      const assignedDriver = isCreatingDriverInline
        ? await createDriver.mutate({
            firstName: newDriverFirstName,
            lastName: newDriverLastName,
            phone: newDriverPhone,
            licenseNumber: newDriverLicenseNumber || undefined,
            passportNumber: newDriverPassportNumber || undefined,
            companyName: companyName || undefined,
            weeklyDayOff: newDriverWeeklyDayOff || undefined,
          })
        : null;
      const resolvedDriverId = assignedDriver?.id ?? assignDriverId;
      const createdContract = await createContract.mutate({
        driverId: resolvedDriverId,
        carId: createdCar.id,
        principalAmount: Number(principalAmount),
        financedAmount: Number(principalAmount),
        installmentAmount: Number(installmentAmount),
        monthlyInsuranceAmount: toOptionalNumber(monthlyInsuranceAmount),
        monthlyGpsAmount: toOptionalNumber(monthlyGpsAmount),
        insuranceBillingMode: insuranceMode,
        gpsBillingMode: gpsMode,
        installmentDay: calculatedInstallmentDay,
        termMonths: calculatedTermMonths,
        startDate,
        endDate,
      });

      const insuranceAmount = resolveMonthlyAmount(monthlyInsuranceAmount, insuranceMode) ?? 0;
      const gpsAmount = resolveMonthlyAmount(monthlyGpsAmount, gpsMode) ?? 0;
      if (insuranceAmount > 0 || gpsAmount > 0) {
        const periodLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date());
        const noteParts = [
          insuranceAmount > 0 ? `Страховка ${formatCurrency(insuranceAmount)}` : "",
          gpsAmount > 0 ? `GPS ${formatCurrency(gpsAmount)}` : "",
        ].filter(Boolean);

        await createIncident.mutate({
          title: `Страховка и ТО · ${createdCar.plateNumber}`,
          incidentType: "insurance_gps",
          status: "open",
          priority: "medium",
          driverId: resolvedDriverId,
          carId: createdCar.id,
          occurredAt: startDate || new Date().toISOString().slice(0, 10),
          periodLabel,
          amount: insuranceAmount + gpsAmount,
          description: "Ежемесячное начисление при закреплении авто",
          insuranceNote: noteParts.join(" · ") || null,
          locationNote: createdContract.contractNumber,
        });
      }

      await api.refetch();
      await contractsApi.refetch();
      await driversApi.refetch();
      navigate(`/contracts/${createdContract.id}`);
      return;
    }

    await api.refetch();
    await contractsApi.refetch();
    await driversApi.refetch();
    setVin("");
    setPlateNumber("");
    setMake("");
    setModel("");
    setCompanyName("");
    setProductionYear("");
    setMileage("");
    setColor("");
    setPurchasePrice("");
    setCustomsCost("");
    setDeliveryCost("");
    setRepairCost("");
    setTargetSalePrice("");
    setAssignDriverId("");
    setNewDriverFirstName("");
    setNewDriverLastName("");
    setNewDriverPhone("");
    setNewDriverLicenseNumber("");
    setNewDriverPassportNumber("");
    setNewDriverWeeklyDayOff("");
    void nextContractNumber.refetch({ silent: true }).catch(() => undefined);
    setPrincipalAmount("");
    setInstallmentAmount("");
    setMonthlyInsuranceAmount("");
    setMonthlyGpsAmount("");
    setInsuranceMode("monthly");
    setGpsMode("monthly");
    setStartDate("");
    setEndDate("");
    setFormMessage(assignDriverId ? "Автомобиль добавлен, договор создан, машина выведена на линию." : "Автомобиль добавлен.");
    vinInputRef.current?.focus();
  }

  async function handleBulkStatusUpdate(): Promise<void> {
    if (!selectedVehicleIds.length) {
      setBulkMessage("Выберите хотя бы один автомобиль.");
      return;
    }

    if (bulkStatus === "keep") {
      setBulkMessage("Выберите новый статус для автомобилей.");
      return;
    }

    setBulkMessage(null);
    setBulkSaving(true);
    let updatedCount = 0;

    try {
      for (const vehicleId of selectedVehicleIds) {
        await patchJson(`cars/${vehicleId}`, { status: bulkStatus });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedVehicleIds([]);
      setBulkStatus("keep");
      setBulkMessage(`Статус обновлён для ${updatedCount} автомобилей.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось массово обновить статус автомобилей.");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkCompanyUpdate(): Promise<void> {
    if (!selectedVehicleIds.length) {
      setBulkMessage("Выберите хотя бы один автомобиль.");
      return;
    }

    if (bulkCompanyName === "keep") {
      setBulkMessage("Выберите компанию или вариант снятия компании.");
      return;
    }

    setBulkMessage(null);
    setBulkSaving(true);
    let updatedCount = 0;

    try {
      for (const vehicleId of selectedVehicleIds) {
        await patchJson(`cars/${vehicleId}`, {
          companyName: bulkCompanyName === "" ? null : bulkCompanyName,
        });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedVehicleIds([]);
      setBulkCompanyName("keep");
      setBulkMessage(`Компания обновлена для ${updatedCount} автомобилей.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось массово обновить компанию автомобилей.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <section className="page-stack vehicles-page">
      <div className="hero-card hero-card--dashboard">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <CarIcon width={18} height={18} />
            <span>Автомобили</span>
          </div>
          <h2>Автомобили</h2>
          <p>Автопарк, статусы и водители на линии.</p>
        </div>
        <div className="hero-card__actions">
          <div className="toolbar toolbar--hero">
            {rows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
            {canCreateCar ? (
              <button
                onClick={() => {
                  setIsCreateModalOpen(true);
                }}
              >
                {createCar.loading ? "Сохраняем..." : "Добавить авто"}
              </button>
            ) : null}
          </div>
          {!canCreateCar ? (
            <ReadOnlyNotice message="Для этой роли доступен только просмотр автомобилей." />
          ) : null}
        </div>
      </div>
      <div className="stats-grid vehicle-status-grid vehicle-status-grid--parkpro">
        {statusMetrics.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`hero-inline-metric hero-inline-metric--button${status === item.key ? " hero-inline-metric--active" : ""}`}
            onClick={() => setStatus(item.key)}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.hint}</p>
          </button>
        ))}
      </div>
      <article className="panel filter-panel vehicles-filter-panel">
        <div className="panel__title">
          <CarIcon width={18} height={18} />
          <h3>Поиск автомобилей</h3>
        </div>
        <div className="filter-panel__stack">
          <div className="toolbar">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по VIN, номеру, марке" />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Все статусы</option>
              <option value="customs">Растаможка</option>
              <option value="office">В офисе</option>
              <option value="assigned">На линии</option>
              <option value="maintenance">Ремонт</option>
              <option value="accident">В ДТП</option>
              <option value="impound">Штрафстоянка</option>
              <option value="idle">Простой</option>
              <option value="sold">Продан</option>
              <option value="written_off">Списанные</option>
            </select>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <p className="panel-note">
            Поиск помогает быстро находить автомобиль по VIN и госномеру, а форма добавления теперь открывается отдельно в модальном окне.
          </p>
          {canCreateCar ? (
            <div className="toolbar">
              <button type="button" className="button-secondary" onClick={() => setIsBulkPanelOpen((value) => !value)}>
                {isBulkPanelOpen ? "Скрыть массовые действия" : "Массовые действия"}
              </button>
            </div>
          ) : null}
          {canCreateCar && isBulkPanelOpen ? (
            <div className="quick-form">
              <p className="quick-form__title">Массовый статус автомобилей</p>
              <div className="toolbar">
                <button type="button" onClick={toggleSelectAll}>
                  {allSelected ? "Снять выбор" : "Выбрать все"}
                </button>
                <span className="panel-note">Выбрано: {selectedCount}</span>
              </div>
              <div className="toolbar">
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                  <option value="keep">Статус без изменений</option>
                  <option value="customs">Растаможка</option>
                  <option value="office">В офисе</option>
                  <option value="assigned">На линии</option>
                  <option value="maintenance">Ремонт</option>
                  <option value="accident">В ДТП</option>
                  <option value="impound">Штрафстоянка</option>
                  <option value="idle">Простой</option>
                  <option value="sold">Продан</option>
                  <option value="written_off">Списан</option>
                </select>
                <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkStatusUpdate()}>
                  {bulkSaving ? "Сохраняем..." : "Применить массово"}
                </button>
              </div>
              <div className="toolbar">
                <select value={bulkCompanyName} onChange={(e) => setBulkCompanyName(e.target.value)}>
                  <option value="keep">Компания без изменений</option>
                  <option value="">Снять компанию</option>
                  {companies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkCompanyUpdate()}>
                  {bulkSaving ? "Сохраняем..." : "Массово сменить компанию"}
                </button>
              </div>
              {bulkMessage ? <p className="panel-note">{bulkMessage}</p> : null}
            </div>
          ) : null}
        </div>
      </article>
      {isCreateModalOpen && canCreateCar ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            onClick={() => setIsCreateModalOpen(false)}
            aria-label="Закрыть окно добавления автомобиля"
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="vehicle-create-title">
            <div className="entity-modal__header">
              <div>
                <span className="layout-settings__eyebrow">Автомобили</span>
                <h3 id="vehicle-create-title">Добавление автомобиля</h3>
                <p>Можно оставить машину в пуле или сразу закрепить её за водителем с договором в одном действии.</p>
              </div>
              <button type="button" className="topbar__button" onClick={() => setIsCreateModalOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="entity-modal__body quick-form" ref={quickFormRef}>
              <p className="panel-note">Поля растаможки, доставки и подготовки необязательны. Их можно заполнить позже.</p>
              {vehicleTemplateOptions.length ? (
                <>
                  <div className="form-grid">
                    <input
                      list="vehicle-template-options"
                      value={templateLabel}
                      onChange={(e) => applyVehicleTemplate(e.target.value)}
                      placeholder="Быстрое добавление: марка или марка и модель"
                    />
                    <datalist id="vehicle-template-options">
                      {vehicleTemplateOptions.map((item) => (
                        <option key={item.label} value={item.label} />
                      ))}
                    </datalist>
                  </div>
                  <p className="panel-note">Введите марку или марку и модель, либо выберите готовый шаблон из уже заведённых машин, чтобы автоматически подставить типовые поля.</p>
                </>
              ) : null}
              {presetNotice ? <p className="panel-note">{presetNotice}</p> : null}
              <div className="form-grid">
                <input ref={vinInputRef} value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN" />
                <input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="Госномер" />
                <input list="vehicle-make-options" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Марка" />
                <input list="vehicle-model-options" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Модель" />
                <datalist id="vehicle-make-options">
                  {VEHICLE_MAKE_OPTIONS.map((item) => <option key={item} value={item} />)}
                </datalist>
                <datalist id="vehicle-model-options">
                  {vehicleModelOptions.map((item) => <option key={item} value={item} />)}
                </datalist>
                <select value={companyName} onChange={(e) => setCompanyName(e.target.value)}>
                  <option value="">Компания не выбрана</option>
                  {companies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <input
                  value={productionYear}
                  onChange={(e) => setProductionYear(e.target.value)}
                  placeholder="Год выпуска"
                  inputMode="numeric"
                />
                <input value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="Пробег" inputMode="numeric" />
                <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Цвет" />
                <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="Цена покупки" inputMode="numeric" />
                <input value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} placeholder="Растаможка" inputMode="numeric" />
                <input value={deliveryCost} onChange={(e) => setDeliveryCost(e.target.value)} placeholder="Доставка" inputMode="numeric" />
                <input value={repairCost} onChange={(e) => setRepairCost(e.target.value)} placeholder="Подготовка / ремонт" inputMode="numeric" />
                <input value={targetSalePrice} onChange={(e) => setTargetSalePrice(e.target.value)} placeholder="Плановая стоимость" inputMode="numeric" />
                <select value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
                  <option value="">Оставить без привязки</option>
                  {canCreateDriver ? <option value="__new_driver__">Создать нового водителя</option> : null}
                  {(driversApi.data ?? []).map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="toolbar">
                {canCreateDriver ? (
                  <>
                    <button type="button" className="button-link" onClick={() => setAssignDriverId("__new_driver__")}>
                      Создать нового водителя
                    </button>
                    {isCreatingDriverInline ? (
                      <button type="button" onClick={() => setAssignDriverId("")}>
                        Убрать нового водителя
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="panel-note">Для создания нового водителя в этом окне нужна роль владельца, администратора или оператора.</p>
                )}
              </div>
              {isCreatingDriverInline ? (
                <div className="form-grid">
                  <input value={newDriverFirstName} onChange={(e) => setNewDriverFirstName(e.target.value)} placeholder="Имя водителя" />
                  <input value={newDriverLastName} onChange={(e) => setNewDriverLastName(e.target.value)} placeholder="Фамилия водителя" />
                  <input value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} placeholder="Телефон водителя" />
                  <input value={newDriverLicenseNumber} onChange={(e) => setNewDriverLicenseNumber(e.target.value)} placeholder="Вод. удостоверение" />
                  <input value={newDriverPassportNumber} onChange={(e) => setNewDriverPassportNumber(e.target.value)} placeholder="Удостоверение личности" />
                  <select value={newDriverWeeklyDayOff} onChange={(e) => setNewDriverWeeklyDayOff(e.target.value)}>
                    <option value="">Выходной не выбран</option>
                    <option value="monday">Понедельник</option>
                    <option value="tuesday">Вторник</option>
                    <option value="wednesday">Среда</option>
                    <option value="thursday">Четверг</option>
                    <option value="friday">Пятница</option>
                    <option value="saturday">Суббота</option>
                    <option value="sunday">Воскресенье</option>
                  </select>
                </div>
              ) : null}
              {assignDriverId ? (
                <div className="detail-list">
                  <div className="detail-list__item">
                    <strong>Быстрый вывод на линию</strong>
                <p>
                      Машина будет сразу закреплена за {selectedDriverLabel ?? "водителем"} через создание договора с ежедневным графиком и личным выходным водителя.
                    </p>
                  </div>
                </div>
              ) : null}
              {assignDriverId ? (
                <div className="form-grid">
                  <input value={contractNumber} readOnly title="Номер назначается автоматически при сохранении" placeholder="Номер договора" />
                  <input value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} placeholder="Сумма договора" inputMode="numeric" />
                  <input value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} placeholder="Ежедневный платёж" inputMode="numeric" />
                  <input value={monthlyInsuranceAmount} onChange={(e) => setMonthlyInsuranceAmount(e.target.value)} placeholder={insuranceMode === "daily" ? "Страховка в день" : "Страховка в месяц"} inputMode="numeric" />
                  <select value={insuranceMode} onChange={(e) => setInsuranceMode(e.target.value as "monthly" | "daily")}>
                    <option value="monthly">Страховка ежемесячно</option>
                    <option value="daily">Страховка ежедневно</option>
                  </select>
                  <input value={monthlyGpsAmount} onChange={(e) => setMonthlyGpsAmount(e.target.value)} placeholder={gpsMode === "daily" ? "GPS в день" : "GPS в месяц"} inputMode="numeric" />
                  <select value={gpsMode} onChange={(e) => setGpsMode(e.target.value as "monthly" | "daily")}>
                    <option value="monthly">GPS ежемесячно</option>
                    <option value="daily">GPS ежедневно</option>
                  </select>
                  <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" />
                  <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" />
                </div>
              ) : null}
              {assignDriverId ? (
                <p className="panel-note">
                  Дата выплаты и срок рассчитываются автоматически из суммы договора и ежедневного платежа: {calculatedTermMonths > 0 ? `${calculatedTermMonths} мес.` : "укажите сумму и платёж"}.
                  {" "}Рабочих дней в графике: {payableDays || "—"}. Страховку и GPS можно вводить ежедневно или ежемесячно.
                </p>
              ) : null}
              <div className="toolbar">
                <button disabled={createCar.loading || createContract.loading || createDriver.loading} onClick={() => void handleCreateCar()}>
                  {createCar.loading || createContract.loading || createDriver.loading
                    ? "Сохраняем..."
                    : assignDriverId
                      ? "Сохранить, назначить и открыть договор"
                      : "Сохранить авто"}
                </button>
              </div>
              {(purchasePrice || customsCost || deliveryCost || repairCost) ? (
                <p className="panel-note">
                  Общая стоимость входа: {formatCurrency((Number(purchasePrice) || 0) + (Number(customsCost) || 0) + (Number(deliveryCost) || 0) + (Number(repairCost) || 0))}
                </p>
              ) : null}
              {formMessage ? <p className="panel-note">{formMessage}</p> : null}
            </div>
          </section>
        </>
      ) : null}
      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={rows.length === 0}
        emptyContent={
          <EmptyStatePanel
            title="Автомобили не найдены"
            message={canCreateCar
              ? "Автомобилей пока нет. Добавьте первый автомобиль через форму выше."
              : "Автомобилей пока нет."}
          />
        }
      >
        <div className="registry-layout">
          <article className="panel">
            {createCar.error ? <div className="panel-note">Ошибка создания авто: {createCar.error}</div> : null}
            {createContract.error ? <div className="panel-note">Ошибка создания договора: {createContract.error}</div> : null}
            {createDriver.error ? <div className="panel-note">Ошибка создания водителя: {createDriver.error}</div> : null}
            {createCar.data ? <div className="panel-note">Создано авто: {createCar.data.plateNumber}</div> : null}
            <div className="table-scroll">
              <table className="data-table vehicles-table">
                <thead>
                  <tr>
                    <th />
                    <th>Автомобиль</th>
                    <th>VIN и договор</th>
                    <th>Водитель</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((vehicle) => {
                    const contract = getContractSummary(vehicle);
                    const driverLabel = vehicle.assignedDriverId ? (driverMap.get(vehicle.assignedDriverId) ?? "Водитель назначен") : "Не привязан";
                    const managerLabel = resolveVehicleManagerLabel(vehicle);
                    const incidentCount = incidentCountByCarId.get(vehicle.id) ?? 0;
                    const vehicleHistory = contractHistoryByCarId.get(vehicle.id) ?? [];
                    const visibleVehicleHistory = vehicleHistory.slice(0, 4);
                    const showVehicleHistory = shouldShowInlineVehicleHistory(vehicle);
                    const nextDueText = contract?.nextDueDate
                      ? `Ближайшее обязательство ${formatCurrency(contract.nextDueAmount ?? 0)} ${
                          (contract.currentDebt ?? 0) > 0 && new Date(contract.nextDueDate).getTime() < Date.now() ? "просрочено с" : "до"
                        } ${formatDateOnly(contract.nextDueDate)}`
                      : "Ближайших обязательств нет";

                    return (
                      <Fragment key={vehicle.id}>
                        <tr>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedVehicleIds.includes(vehicle.id)}
                              onChange={() => toggleVehicleSelection(vehicle.id)}
                            />
                          </td>
                          <td>
                            <div className="identity-cell">
                              <div className="identity-avatar">
                                <CarIcon width={20} height={20} />
                              </div>
                              <div className="identity-meta">
                                <Link className="table-link table-strong" to={`/vehicles/${vehicle.id}`} title={vehicle.plateNumber}>
                                  {vehicle.plateNumber}
                                </Link>
                                <p className="table-meta" title={[vehicle.make, vehicle.model, vehicle.productionYear].filter(Boolean).join(" ")}>
                                  {[vehicle.make, vehicle.model, vehicle.productionYear].filter(Boolean).join(" ") || "Авто без модели"}
                                </p>
                                {vehicle.companyName ? <p className="table-meta">{vehicle.companyName}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="amount-stack">
                              <strong title={vehicle.vin}>{vehicle.vin}</strong>
                              <span>
                                {contract ? `Долг по договору ${formatCurrency(contract.currentDebt)}` : "Договор пока не привязан"}
                              </span>
                              <span title={nextDueText}>{nextDueText}</span>
                            </div>
                          </td>
                          <td>
                            <div className="amount-stack">
                              <strong title={driverLabel}>{driverLabel}</strong>
                              <span>{vehicle.assignedDriverId ? getStatusLabel(vehicle.status) : "Без привязки"}</span>
                              <span title={`Бригадир: ${managerLabel}`}>Бригадир: {managerLabel}</span>
                            </div>
                          </td>
                          <td>
                            <div className="amount-stack">
                              <strong>
                                <span className={getStatusTone(vehicle.status)}>{getStatusLabel(vehicle.status)}</span>
                              </strong>
                              <span>{incidentCount > 0 ? `Открытых инцидентов: ${incidentCount}` : "Открытых инцидентов нет"}</span>
                            </div>
                          </td>
                          <td>
                            <div className="row-actions row-actions--vertical">
                              <Link className="table-link" to={`/vehicles/${vehicle.id}`}>Открыть авто</Link>
                              {vehicle.assignedDriverId ? (
                                <Link className="table-link" to={`/drivers/${vehicle.assignedDriverId}`}>Водитель</Link>
                              ) : canCreateContract ? (
                                <Link className="table-link" to={`/contracts?carId=${vehicle.id}`}>Назначить</Link>
                              ) : null}
                              {contract?.id ? <Link className="table-link" to={`/contracts/${contract.id}`}>Договор</Link> : null}
                              {canOpenFinancialOps && contract?.currentDebt ? (
                                <>
                                  <Link
                                    className="table-link"
                                    to={`/financial-ops?action=payment&source=vehicles&driverId=${contract.driverId ?? ""}&contractId=${contract.id}&amount=${contract.nextDueAmount ?? contract.currentDebt ?? 0}`}
                                  >
                                    Платёж
                                  </Link>
                                  <Link
                                    className="table-link"
                                    to={`/financial-ops?action=payoff&source=vehicles&driverId=${contract.driverId ?? ""}&contractId=${contract.id}&amount=${contract.currentDebt ?? 0}`}
                                  >
                                    Закрыть
                                  </Link>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {showVehicleHistory ? (
                          <tr className="vehicle-history-row">
                            <td />
                            <td colSpan={5}>
                              <div className="vehicle-history-inline">
                                <div className="vehicle-history-inline__head">
                                  <strong>История автомобиля</strong>
                                  <span>Выдач: {vehicleHistory.length}</span>
                                </div>
                                {visibleVehicleHistory.length > 0 ? (
                                  <div className="vehicle-history-inline__list">
                                    {visibleVehicleHistory.map((historyItem) => {
                                      const historyDriverName = driverMap.get(historyItem.driverId) ?? "Водитель не найден";
                                      const paidAmount = paidByContractId.get(historyItem.id) ?? 0;
                                      const periodEnd = historyItem.endedAt ?? historyItem.endDate ?? null;
                                      return (
                                        <div className="vehicle-history-inline__card" key={historyItem.id}>
                                          <div>
                                            <strong title={historyDriverName}>{historyDriverName}</strong>
                                            <span>
                                              {formatDateOnly(historyItem.startDate)} — {periodEnd ? formatDateOnly(periodEnd) : "по сегодня"} · {getContractStatusLabel(historyItem.status)}
                                            </span>
                                          </div>
                                          <div>
                                            <span>Договор {historyItem.contractNumber}</span>
                                            <span>
                                              Начислено {formatCurrency(historyItem.financedAmount)} · оплачено {formatCurrency(paidAmount)} · остаток {formatCurrency(historyItem.currentDebt)}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {vehicleHistory.length > visibleVehicleHistory.length ? (
                                      <Link className="table-link" to={`/vehicles/${vehicle.id}`}>
                                        Еще {vehicleHistory.length - visibleVehicleHistory.length}
                                      </Link>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="panel-note">Истории выдачи пока нет.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
          <div className="registry-side">
            <article className="panel">
              <div className="panel__title">
                <DriversIcon width={18} height={18} />
                <h3>Распределение</h3>
              </div>
              <div className="stack-list">
                <button type="button" className="stack-list__item stack-list__item--button" onClick={() => setStatus("assigned")}>
                  <span className="stack-list__eyebrow">На линии</span>
                  <strong className="stack-list__value">{linkedDriverCount}</strong>
                  <p className="stack-list__meta">{metricRows.length - linkedDriverCount} машин без активного водителя</p>
                </button>
                <button type="button" className="stack-list__item stack-list__item--button" onClick={() => setStatus("office")}>
                  <span className="stack-list__eyebrow">В офисе / растаможка</span>
                  <strong className="stack-list__value">{officeCount + customsCount}</strong>
                  <p className="stack-list__meta">Готовятся к выдаче или ещё в вводе</p>
                </button>
                <button type="button" className="stack-list__item stack-list__item--button" onClick={() => setStatus("assigned")}>
                  <span className="stack-list__eyebrow">Текущий долг по машинам</span>
                  <strong className="stack-list__value">{formatCurrency(debtTotal)}</strong>
                  <p className="stack-list__meta">Сумма активных договоров по текущей выдаче</p>
                </button>
              </div>
            </article>
            <article className="panel">
              <div className="panel__title">
                <FinanceIcon width={18} height={18} />
                <h3>Под наблюдением</h3>
              </div>
              <div className="summary-list">
                <button type="button" className="summary-list__button" onClick={() => setStatus("maintenance")}><span>Ремонт</span><strong>{repairCount}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("office")}><span>В офисе</span><strong>{officeCount}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("accident")}><span>ДТП</span><strong>{accidentCount}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("impound")}><span>Штрафстоянка</span><strong>{impoundCount}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("idle")}><span>Простой</span><strong>{idleCount}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("written_off")}><span>Списанные</span><strong>{writtenOffCount}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("all")}><span>С открытыми инцидентами</span><strong>{withIncidentsCount}</strong></button>
              </div>
            </article>
          </div>
        </div>
      </AsyncState>
      <Outlet />
    </section>
  );
}
