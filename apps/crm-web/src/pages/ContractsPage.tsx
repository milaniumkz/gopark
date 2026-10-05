import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useSearchParams } from "react-router-dom";
import { patchJson } from "../lib/api";
import { formatCurrency, formatDateOnly, formatShortId, getStatusLabel, getStatusTone } from "../lib/utils";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { useApiMutation } from "../hooks/useApiMutation";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { downloadCsvTable } from "../lib/utils";
import { VEHICLE_MAKE_OPTIONS, getVehicleModelOptions } from "../lib/vehicleCatalog";
import { ContractsIcon, FinanceIcon } from "../ui/CrmIcons";
import type { ContractListItem, DriverListItem, UserAdminListItem, VehicleListItem } from "@gopark/contracts";

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

export function ContractsPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [driverId, setDriverId] = useState("");
  const [carId, setCarId] = useState("");
  const [driverMode, setDriverMode] = useState<"existing" | "new">("existing");
  const [carMode, setCarMode] = useState<"existing" | "new">("existing");
  const [newDriverFirstName, setNewDriverFirstName] = useState("");
  const [newDriverLastName, setNewDriverLastName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [newDriverLicenseNumber, setNewDriverLicenseNumber] = useState("");
  const [newDriverPassportNumber, setNewDriverPassportNumber] = useState("");
  const [newDriverNearestRelativePhone, setNewDriverNearestRelativePhone] = useState("");
  const [newDriverWeeklyDayOff, setNewDriverWeeklyDayOff] = useState("");
  const [newDriverManagerId, setNewDriverManagerId] = useState("");
  const [newCarVin, setNewCarVin] = useState("");
  const [newCarPlateNumber, setNewCarPlateNumber] = useState("");
  const [newCarMake, setNewCarMake] = useState("");
  const [newCarModel, setNewCarModel] = useState("");
  const [newCarProductionYear, setNewCarProductionYear] = useState("");
  const [newCarMileage, setNewCarMileage] = useState("");
  const [newCarColor, setNewCarColor] = useState("");
  const [newRecordCompanyName, setNewRecordCompanyName] = useState(session.companyName?.trim() || "");
  const [contractNumber, setContractNumber] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("1000000");
  const [installmentAmount, setInstallmentAmount] = useState("2300");
  const [monthlyInsuranceAmount, setMonthlyInsuranceAmount] = useState("");
  const [monthlyGpsAmount, setMonthlyGpsAmount] = useState("");
  const [insuranceMode, setInsuranceMode] = useState<"monthly" | "daily">("monthly");
  const [gpsMode, setGpsMode] = useState<"monthly" | "daily">("monthly");
  const [handoverMileage, setHandoverMileage] = useState("");
  const [hasOsago, setHasOsago] = useState(false);
  const [osagoStartDate, setOsagoStartDate] = useState("");
  const [hasCasco, setHasCasco] = useState(false);
  const [cascoStartDate, setCascoStartDate] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [actionContractId, setActionContractId] = useState<string | null>(null);
  const [actionMenuContractId, setActionMenuContractId] = useState<string | null>(null);
  const contractNumberInputRef = useRef<HTMLInputElement | null>(null);
  const quickFormRef = useRef<HTMLDivElement | null>(null);

  const api = useApiQuery<ContractListItem[]>("contracts");
  const drivers = useApiQuery<DriverListItem[]>("drivers");
  const cars = useApiQuery<VehicleListItem[]>("cars");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createDriver = useApiMutation<
    DriverListItem,
    {
      firstName: string;
      lastName: string;
      phone: string;
      nearestRelativePhone?: string;
      licenseNumber?: string;
      passportNumber?: string;
      companyName?: string;
      weeklyDayOff?: string;
      managerId?: string;
    }
  >("drivers");
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
    }
  >("cars");
  const createContract = useApiMutation<
    ContractListItem,
    {
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
    }
  >("contracts");
  const canCreateContract = hasCrmCapability(session.requestUserRole, "create-contract", session.managerLevel);
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const canOpenDriverDetail = hasCrmAccess(session.requestUserRole, "driver-detail");
  const canOpenVehicleDetail = hasCrmAccess(session.requestUserRole, "vehicle-detail");
  const contracts = useMemo(() => api.data ?? [], [api.data]);
  const activeContracts = useMemo(() => contracts.filter((item) => item.status === "active"), [contracts]);
  const availableDrivers = useMemo(() => drivers.data ?? [], [drivers.data]);
  const availableCars = useMemo(() => cars.data ?? [], [cars.data]);
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const managerOptions = useMemo(
    () => (usersApi.data ?? []).filter((item) => item.role === "manager" && item.managerProfileId),
    [usersApi.data],
  );
  const contractCars = useMemo(
    () => availableCars.filter((item) => !item.assignedDriverId || (driverMode === "existing" && item.assignedDriverId === driverId)),
    [availableCars, driverId, driverMode],
  );
  const selectedContractCar = useMemo(
    () => availableCars.find((item) => item.id === carId) ?? null,
    [availableCars, carId],
  );
  const driverMap = useMemo(() => new Map(availableDrivers.map((item) => [item.id, item.fullName])), [availableDrivers]);
  const driverWeekOffMap = useMemo(() => new Map(availableDrivers.map((item) => [item.id, item.weeklyDayOff ?? ""])), [availableDrivers]);
  const driverCompanyMap = useMemo(() => new Map(availableDrivers.map((item) => [item.id, item.companyName ?? ""])), [availableDrivers]);
  const carMap = useMemo(() => new Map(availableCars.map((item) => [item.id, item.plateNumber])), [availableCars]);
  const carCompanyMap = useMemo(() => new Map(availableCars.map((item) => [item.id, item.companyName ?? ""])), [availableCars]);
  const filteredContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contracts.filter((item) => {
      const driverLabel = driverMap.get(item.driverId) ?? "";
      const companyLabel = driverCompanyMap.get(item.driverId) || carCompanyMap.get(item.carId) || "";
      const matchesQuery =
        !normalizedQuery ||
        `${item.contractNumber} ${driverLabel} ${companyLabel}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "bought_out"
            ? item.status === "closed"
            : statusFilter === "terminated"
              ? item.status === "terminated" || item.status === "defaulted"
              : item.status === statusFilter;
      const matchesCompany = companyFilter === "all" ? true : companyLabel === companyFilter;
      return matchesQuery && matchesStatus && matchesCompany;
    });
  }, [carCompanyMap, companyFilter, contracts, driverCompanyMap, driverMap, query, statusFilter]);
  const activeCount = activeContracts.length;
  const financedTotal = activeContracts.reduce((sum, item) => sum + item.financedAmount, 0);
  const installmentTotal = activeContracts.reduce((sum, item) => sum + item.installmentAmount, 0);
  const debtTotal = activeContracts.reduce((sum, item) => sum + item.currentDebt, 0);
  const calculatedTermMonths = useMemo(() => calculateTermMonthsFromDates(startDate, endDate), [endDate, startDate]);
  const payableDays = useMemo(
    () => calculatePayableDays(startDate, endDate, driverWeekOffMap.get(driverId) ?? null),
    [driverId, driverWeekOffMap, endDate, startDate],
  );
  const newCarModelOptions = getVehicleModelOptions(newCarMake);
  const calculatedInstallmentDay = useMemo(() => {
    if (!endDate) {
      return 15;
    }

    return new Date(endDate).getDate() || 15;
  }, [endDate]);
  const boughtOutContracts = [...contracts]
    .filter((item) => item.status === "closed")
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 5);
  const terminatedContracts = [...contracts]
    .filter((item) => item.status === "terminated" || item.status === "defaulted")
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 5);
  const selectedCount = selectedContractIds.length;
  const allSelected = filteredContracts.length > 0 && selectedCount === filteredContracts.length;
  const actionMenuContract = actionMenuContractId
    ? filteredContracts.find((item) => item.id === actionMenuContractId) ?? contracts.find((item) => item.id === actionMenuContractId) ?? null
    : null;
  const selectedCarMaxIssuedAmount = useMemo(
    () =>
      Math.max(
        0,
        ...contracts
          .filter((item) => item.carId === carId)
          .map((item) => item.financedAmount),
      ),
    [carId, contracts],
  );
  const isPrincipalAbovePreviousIssue =
    selectedCarMaxIssuedAmount > 0 && Number(principalAmount) > selectedCarMaxIssuedAmount;

  useEffect(() => {
    const principal = Number(principalAmount);
    const dailyPayment = Number(installmentAmount);
    if (!startDate || !Number.isFinite(principal) || !Number.isFinite(dailyPayment) || principal <= 0 || dailyPayment <= 0) {
      return;
    }

    const payableDaysNeeded = Math.ceil(principal / dailyPayment);
    const nextEndDate = calculateEndDateFromPayableDays(startDate, payableDaysNeeded, driverWeekOffMap.get(driverId) ?? null);
    if (nextEndDate && nextEndDate !== endDate) {
      setEndDate(nextEndDate);
    }
  }, [driverId, driverWeekOffMap, endDate, installmentAmount, principalAmount, startDate]);

  useEffect(() => {
    const nextStatus = searchParams.get("status");
    if (nextStatus) {
      setStatusFilter(nextStatus);
    }
  }, [searchParams]);

  useEffect(() => {
    const driverIdParam = searchParams.get("driverId");
    if (driverIdParam && availableDrivers.some((item) => item.id === driverIdParam)) {
      setDriverId(driverIdParam);
    }
  }, [availableDrivers, searchParams]);

  useEffect(() => {
    const carIdParam = searchParams.get("carId");
    if (carIdParam && contractCars.some((item) => item.id === carIdParam)) {
      setCarId(carIdParam);
    }
  }, [contractCars, searchParams]);

  useEffect(() => {
    if (!availableDrivers.length) {
      return;
    }

    const hasSelectedDriver = availableDrivers.some((item) => item.id === driverId);
    if (!driverId || !hasSelectedDriver) {
      setDriverId(availableDrivers[0].id);
    }
  }, [availableDrivers, driverId]);

  useEffect(() => {
    if (!contractCars.length) {
      return;
    }

    const hasSelectedCar = contractCars.some((item) => item.id === carId);
    if (!carId || !hasSelectedCar) {
      setCarId(contractCars[0].id);
    }
  }, [contractCars, carId]);

  useEffect(() => {
    if (carMode !== "existing" || !selectedContractCar?.managerId) {
      return;
    }

    setNewDriverManagerId(selectedContractCar.managerId);
  }, [carMode, selectedContractCar?.managerId]);

  useEffect(() => {
    setSelectedContractIds((current) =>
      current.filter((contractId) => filteredContracts.some((item) => item.id === contractId)),
    );
  }, [filteredContracts]);

  function handleExport(): void {
    if (!api.data?.length) {
      return;
    }

    downloadCsvTable(
      "gopark-contracts.csv",
      ["contract_number", "company", "driver", "vehicle", "status", "contract_amount", "accrual_amount", "current_debt", "next_due_amount", "next_due_date", "has_deferred_payment"],
      api.data.map((item) => [
        item.contractNumber,
        driverCompanyMap.get(item.driverId) || carCompanyMap.get(item.carId) || "",
        driverMap.get(item.driverId) ?? formatShortId(item.driverId),
        carMap.get(item.carId) ?? formatShortId(item.carId),
        getStatusLabel(item.status),
        item.financedAmount,
        item.installmentAmount,
        item.currentDebt,
        item.nextDueAmount ?? 0,
        item.nextDueDate ?? "",
        item.hasDeferredPayment ? "yes" : "no",
      ]),
    );
  }

  async function handleCreateContract(): Promise<void> {
    if (!contractNumber.trim()) {
      setFormMessage("Укажите номер договора.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      contractNumberInputRef.current?.focus();
      return;
    }

    if (driverMode === "existing" && !driverId) {
      setFormMessage("Выберите водителя или включите создание нового водителя.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (driverMode === "new" && (!newDriverFirstName.trim() || !newDriverLastName.trim() || !newDriverPhone.trim())) {
      setFormMessage("Для нового водителя заполните имя, фамилию и телефон.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (carMode === "existing" && !carId) {
      setFormMessage("Выберите доступный автомобиль или включите создание нового автомобиля.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (carMode === "new" && (!newCarVin.trim() || !newCarPlateNumber.trim() || !newCarMake.trim() || !newCarModel.trim())) {
      setFormMessage("Для нового автомобиля заполните VIN, госномер, марку и модель.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (
      Number(principalAmount) <= 0 ||
      Number(installmentAmount) <= 0 ||
      calculatedTermMonths <= 0 ||
      !startDate ||
      !endDate
    ) {
      setFormMessage("Заполните сумму, ежедневный платёж, дату взятия авто и дату выплаты.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      contractNumberInputRef.current?.focus();
      return;
    }

    if (carMode === "existing" && isPrincipalAbovePreviousIssue) {
      setFormMessage(`Сумма по авто не может быть выше предыдущей выдачи: максимум ${formatCurrency(selectedCarMaxIssuedAmount)}. Перерасчитайте договор.`);
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setFormMessage(null);

    const resolvedDriver = driverMode === "new"
      ? await createDriver.mutate({
          firstName: newDriverFirstName.trim(),
          lastName: newDriverLastName.trim(),
          phone: newDriverPhone.trim(),
          nearestRelativePhone: newDriverNearestRelativePhone.trim() || undefined,
          licenseNumber: newDriverLicenseNumber.trim() || undefined,
          passportNumber: newDriverPassportNumber.trim() || undefined,
          companyName: newRecordCompanyName.trim() || undefined,
          weeklyDayOff: newDriverWeeklyDayOff || undefined,
          managerId: newDriverManagerId || undefined,
        })
      : null;
    const resolvedCar = carMode === "new"
      ? await createCar.mutate({
          vin: newCarVin.trim(),
          plateNumber: newCarPlateNumber.trim(),
          make: newCarMake.trim(),
          model: newCarModel.trim(),
          companyName: newRecordCompanyName.trim() || undefined,
          productionYear: newCarProductionYear ? Number(newCarProductionYear) : undefined,
          mileage: newCarMileage ? Number(newCarMileage) : undefined,
          color: newCarColor.trim() || undefined,
        })
      : null;
    const resolvedDriverId = resolvedDriver?.id ?? driverId;
    const resolvedCarId = resolvedCar?.id ?? carId;

    await createContract.mutate({
      driverId: resolvedDriverId,
      carId: resolvedCarId,
      contractNumber: contractNumber.trim(),
      principalAmount: Number(principalAmount),
      financedAmount: Number(principalAmount),
      installmentAmount: Number(installmentAmount),
      monthlyInsuranceAmount: toOptionalNumber(monthlyInsuranceAmount),
      monthlyGpsAmount: toOptionalNumber(monthlyGpsAmount),
      insuranceBillingMode: insuranceMode,
      gpsBillingMode: gpsMode,
      handoverMileage: toOptionalNumber(handoverMileage),
      hasOsago,
      osagoStartDate: hasOsago ? osagoStartDate || undefined : undefined,
      hasCasco,
      cascoStartDate: hasCasco ? cascoStartDate || undefined : undefined,
      installmentDay: calculatedInstallmentDay,
      termMonths: calculatedTermMonths,
      startDate,
      endDate,
    });
    await Promise.all([api.refetch(), drivers.refetch(), cars.refetch()]);

    setDriverId(resolvedDriverId);
    setCarId(resolvedCarId);
    setContractNumber("");
    setPrincipalAmount("1000000");
    setInstallmentAmount("2300");
    setMonthlyInsuranceAmount("");
    setMonthlyGpsAmount("");
    setInsuranceMode("monthly");
    setGpsMode("monthly");
    setHandoverMileage("");
    setHasOsago(false);
    setOsagoStartDate("");
    setHasCasco(false);
    setCascoStartDate("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    if (driverMode === "new") {
      setNewDriverFirstName("");
      setNewDriverLastName("");
      setNewDriverPhone("");
      setNewDriverLicenseNumber("");
      setNewDriverPassportNumber("");
      setNewDriverNearestRelativePhone("");
      setNewDriverWeeklyDayOff("");
      setNewDriverManagerId("");
      setDriverMode("existing");
    }
    if (carMode === "new") {
      setNewCarVin("");
      setNewCarPlateNumber("");
      setNewCarMake("");
      setNewCarModel("");
      setNewCarProductionYear("");
      setNewCarMileage("");
      setNewCarColor("");
      setCarMode("existing");
    }
    setFormMessage("Договор создан.");
    contractNumberInputRef.current?.focus();
  }

  function toggleContractSelection(contractId: string): void {
    setSelectedContractIds((current) =>
      current.includes(contractId) ? current.filter((id) => id !== contractId) : [...current, contractId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedContractIds(allSelected ? [] : filteredContracts.map((item) => item.id));
  }

  async function handleBulkStatusUpdate(status: ContractListItem["status"]): Promise<void> {
    if (!selectedContractIds.length) {
      setFormMessage("Выберите хотя бы один договор для массового действия.");
      return;
    }

    setFormMessage(null);
    setBulkSaving(true);
    let updatedCount = 0;

    try {
      for (const contractId of selectedContractIds) {
        await patchJson(`contracts/${contractId}`, { status });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedContractIds([]);
      setFormMessage(
        status === "active"
          ? `В работу возвращены ${updatedCount} договоров.`
          : status === "closed"
            ? `Как выкупленные отмечены ${updatedCount} договоров.`
            : status === "defaulted"
              ? `Как проблемные отмечены ${updatedCount} договоров.`
              : `Расторгнуты ${updatedCount} договоров.`,
      );
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое действие по договорам.");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleContractStatusUpdate(contractId: string, status: ContractListItem["status"]): Promise<void> {
    const message =
      status === "terminated"
        ? "Расторгнуть этот договор? Машина станет свободной."
        : "Изменить статус договора?";
    if (!window.confirm(message)) {
      return;
    }

    setFormMessage(null);
    setActionContractId(contractId);
    try {
      await patchJson(`contracts/${contractId}`, { status });
      await api.refetch();
      setActionMenuContractId(null);
      setFormMessage(status === "terminated" ? "Договор расторгнут." : "Статус договора обновлён.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось обновить договор.");
    } finally {
      setActionContractId(null);
    }
  }

  return (
    <section className="page-stack contracts-page">
      <div className="hero-card hero-card--dashboard">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <ContractsIcon width={18} height={18} />
            <span>Договоры</span>
          </div>
          <h2>Договоры</h2>
          <p>Список договоров и основные суммы по портфелю.</p>
          <div className="hero-inline-metrics">
            <button
              type="button"
              className={`hero-inline-metric hero-inline-metric--button${statusFilter === "all" ? " hero-inline-metric--active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              <span>Всего договоров</span>
              <strong>{contracts.length}</strong>
              <p>Всего в списке</p>
            </button>
            <button
              type="button"
              className={`hero-inline-metric hero-inline-metric--button${statusFilter === "active" ? " hero-inline-metric--active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              <span>Активные</span>
              <strong>{activeCount}</strong>
              <p>Сейчас активны</p>
            </button>
            <button
              type="button"
              className="hero-inline-metric hero-inline-metric--button"
              onClick={() => setStatusFilter("active")}
            >
              <span>Портфель</span>
              <strong>{formatCurrency(financedTotal)}</strong>
              <p>Общая сумма</p>
            </button>
          </div>
        </div>
        <div className="hero-card__actions">
          <div className="toolbar toolbar--hero">
            {canCreateContract ? (
              <button
                type="button"
                onClick={() => {
                  setIsCreatePanelOpen(true);
                  window.setTimeout(() => {
                    quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    contractNumberInputRef.current?.focus();
                  }, 0);
                }}
              >
                Новый договор
              </button>
            ) : null}
            {contracts.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
          </div>
          {!canCreateContract ? (
            <ReadOnlyNotice message="Текущая роль может просматривать договоры, но не создавать их. Создание договоров доступно owner, admin и finance." />
          ) : null}
        </div>
      </div>
      <article className="panel filter-panel">
        <div className="panel__title">
          <ContractsIcon width={18} height={18} />
          <h3>Создание договора</h3>
          {canCreateContract ? (
            <button type="button" className="button button--ghost" onClick={() => setIsCreatePanelOpen((current) => !current)}>
              {isCreatePanelOpen ? "Скрыть форму" : "Открыть форму"}
            </button>
          ) : null}
        </div>
        <div className="filter-panel__grid">
          {canCreateContract && isCreatePanelOpen ? (
            <div className="quick-form" ref={quickFormRef}>
              <p className="quick-form__title">Новый договор</p>
              <p className="quick-form__meta">Введите номер, сумму договора, ежедневный платёж и даты. CRM построит ежедневный график до даты выплаты и пропустит личный выходной водителя.</p>
              <div className="form-grid">
                <select value={driverMode} onChange={(e) => setDriverMode(e.target.value as "existing" | "new")}>
                  <option value="existing">Выбрать водителя</option>
                  <option value="new">Создать нового водителя</option>
                </select>
                <select value={carMode} onChange={(e) => setCarMode(e.target.value as "existing" | "new")}>
                  <option value="existing">Выбрать автомобиль</option>
                  <option value="new">Создать новый автомобиль</option>
                </select>
                <select value={newRecordCompanyName} onChange={(e) => setNewRecordCompanyName(e.target.value)}>
                  <option value="">Компания не выбрана</option>
                  {companies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
                {driverMode === "existing" ? (
                  <select value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={!availableDrivers.length}>
                    <option value="">Выберите водителя</option>
                    {availableDrivers.length ? (
                      availableDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.fullName} · {driver.phone}
                        </option>
                      ))
                    ) : (
                      <option value="">Нет водителей</option>
                    )}
                  </select>
                ) : (
                  <>
                    <input value={newDriverFirstName} onChange={(e) => setNewDriverFirstName(e.target.value)} placeholder="Имя водителя" />
                    <input value={newDriverLastName} onChange={(e) => setNewDriverLastName(e.target.value)} placeholder="Фамилия водителя" />
                    <input value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} placeholder="Телефон водителя" />
                    <input value={newDriverLicenseNumber} onChange={(e) => setNewDriverLicenseNumber(e.target.value)} placeholder="Вод. удостоверение" />
                    <input value={newDriverPassportNumber} onChange={(e) => setNewDriverPassportNumber(e.target.value)} placeholder="Удостоверение личности" />
                    <input value={newDriverNearestRelativePhone} onChange={(e) => setNewDriverNearestRelativePhone(e.target.value)} placeholder="Телефон ближайшего родственника" />
                    <select value={newDriverWeeklyDayOff} onChange={(e) => setNewDriverWeeklyDayOff(e.target.value)}>
                      {weeklyDayOffOptions.map((option) => (
                        <option key={option.value || "none"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select value={newDriverManagerId} onChange={(e) => setNewDriverManagerId(e.target.value)}>
                      <option value="">Бригадир не привязан</option>
                      {managerOptions.map((manager) => (
                        <option key={manager.id} value={manager.managerProfileId ?? ""}>
                          {manager.displayName}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {carMode === "existing" ? (
                  <>
                    <select value={carId} onChange={(e) => setCarId(e.target.value)} disabled={!contractCars.length}>
                      <option value="">Выберите автомобиль</option>
                      {contractCars.length ? (
                        contractCars.map((car) => (
                          <option key={car.id} value={car.id}>
                            {car.plateNumber} · {car.make} {car.model}
                          </option>
                        ))
                      ) : (
                        <option value="">Нет доступных автомобилей</option>
                      )}
                    </select>
                    {selectedContractCar?.managerName ? (
                      <p className="panel-note">Бригадир машины: {selectedContractCar.managerName}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <input value={newCarVin} onChange={(e) => setNewCarVin(e.target.value)} placeholder="VIN автомобиля" />
                    <input value={newCarPlateNumber} onChange={(e) => setNewCarPlateNumber(e.target.value)} placeholder="Госномер автомобиля" />
                    <input list="contract-car-make-options" value={newCarMake} onChange={(e) => setNewCarMake(e.target.value)} placeholder="Марка" />
                    <input list="contract-car-model-options" value={newCarModel} onChange={(e) => setNewCarModel(e.target.value)} placeholder="Модель" />
                    <datalist id="contract-car-make-options">
                      {VEHICLE_MAKE_OPTIONS.map((item) => <option key={item} value={item} />)}
                    </datalist>
                    <datalist id="contract-car-model-options">
                      {newCarModelOptions.map((item) => <option key={item} value={item} />)}
                    </datalist>
                    <input value={newCarProductionYear} onChange={(e) => setNewCarProductionYear(e.target.value)} placeholder="Год выпуска" inputMode="numeric" />
                    <input value={newCarMileage} onChange={(e) => setNewCarMileage(e.target.value)} placeholder="Пробег" inputMode="numeric" />
                    <input value={newCarColor} onChange={(e) => setNewCarColor(e.target.value)} placeholder="Цвет" />
                  </>
                )}
                <input
                  ref={contractNumberInputRef}
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="Номер договора"
                />
                <input value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} placeholder="Сумма договора" inputMode="numeric" />
                <input value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} placeholder="Ежедневный платёж" inputMode="numeric" readOnly />
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
                <input value={handoverMileage} onChange={(e) => setHandoverMileage(e.target.value)} placeholder="Пробег при выдаче" inputMode="numeric" />
                <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Дата взятия авто" type="date" min="2020-01-01" />
                <input value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="Дата выплаты" type="date" min="2020-01-01" />
                <div className="contract-document-row">
                  <label className="checkbox-row contract-document-row__check">
                    <input type="checkbox" checked={hasOsago} onChange={(event) => setHasOsago(event.target.checked)} />
                    <span>ОСАГО</span>
                  </label>
                  <input value={osagoStartDate} onChange={(e) => setOsagoStartDate(e.target.value)} type="date" aria-label="Дата начала ОСАГО" disabled={!hasOsago} />
                </div>
                <div className="contract-document-row">
                  <label className="checkbox-row contract-document-row__check">
                    <input type="checkbox" checked={hasCasco} onChange={(event) => setHasCasco(event.target.checked)} />
                    <span>КАСКО</span>
                  </label>
                  <input value={cascoStartDate} onChange={(e) => setCascoStartDate(e.target.value)} type="date" aria-label="Дата начала КАСКО" disabled={!hasCasco} />
                </div>
              </div>
              <p className="panel-note">
                Срок и дата выплаты рассчитываются автоматически из суммы договора и ежедневного платежа: {calculatedTermMonths > 0 ? `${calculatedTermMonths} мес.` : "укажите сумму и платёж"}.
                {" "}Рабочих дней в графике: {payableDays || "—"}. ОСАГО и КАСКО считаются на 1 год от даты начала.
              </p>
              {carMode === "existing" && isPrincipalAbovePreviousIssue ? (
                <p className="panel-note">
                  Сумма по авто выше предыдущей выдачи. Максимум: {formatCurrency(selectedCarMaxIssuedAmount)}. Перерасчитайте договор.
                </p>
              ) : null}
              <div className="toolbar">
                <button disabled={createContract.loading || createDriver.loading || createCar.loading} onClick={() => void handleCreateContract()}>
                  {createContract.loading || createDriver.loading || createCar.loading ? "Сохраняем..." : "Создать договор"}
                </button>
              </div>
              <p className="panel-note">
                Можно выбрать существующие записи или сразу создать нового водителя и новый автомобиль.
              </p>
              {createDriver.error ? <p className="panel-note">Ошибка создания водителя: {createDriver.error}</p> : null}
              {createCar.error ? <p className="panel-note">Ошибка создания авто: {createCar.error}</p> : null}
              {formMessage ? <p className="panel-note">{formMessage}</p> : null}
            </div>
          ) : null}
          <div className="registry-summary">
            <div className="stack-list__item">
              <span className="stack-list__eyebrow">Средняя сумма договора</span>
              <strong className="stack-list__value">
                {formatCurrency(contracts.length ? Math.round(financedTotal / contracts.length) : 0)}
              </strong>
              <p className="stack-list__meta">Средняя сумма на один договор</p>
            </div>
            <div className="stack-list__item">
              <span className="stack-list__eyebrow">Средний ежедневный платёж</span>
              <strong className="stack-list__value">
                {formatCurrency(contracts.length ? Math.round(installmentTotal / contracts.length) : 0)}
              </strong>
              <p className="stack-list__meta">Средний ежедневный платёж на один договор</p>
            </div>
            <div className="stack-list__item">
              <span className="stack-list__eyebrow">Средний текущий долг</span>
              <strong className="stack-list__value">
                {formatCurrency(contracts.length ? Math.round(debtTotal / contracts.length) : 0)}
              </strong>
              <p className="stack-list__meta">Средний остаток по договору</p>
            </div>
          </div>
        </div>
      </article>

      <article className="panel filter-panel">
        <div className="panel__title">
          <ContractsIcon width={18} height={18} />
          <h3>Поиск договора</h3>
        </div>
        <div className="quick-form">
          <div className="toolbar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск договора по имени и номеру договора"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Все договоры</option>
              <option value="active">Активные</option>
              <option value="draft">Черновики</option>
              <option value="bought_out">Выкупленные</option>
              <option value="terminated">Расторгнутые</option>
            </select>
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          {canCreateContract ? (
            <div className="toolbar">
              <button type="button" onClick={toggleSelectAll}>
                {allSelected ? "Снять выбор" : "Выбрать все"}
              </button>
              <span className="panel-note">Выбрано: {selectedCount}</span>
              <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkStatusUpdate("active")}>
                {bulkSaving ? "Сохраняем..." : "Вернуть в работу"}
              </button>
              <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkStatusUpdate("closed")}>
                {bulkSaving ? "Сохраняем..." : "Выкуплен"}
              </button>
              <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkStatusUpdate("defaulted")}>
                {bulkSaving ? "Сохраняем..." : "Проблемный"}
              </button>
              <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkStatusUpdate("terminated")}>
                {bulkSaving ? "Сохраняем..." : "Расторгнуть"}
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!filteredContracts.length}
        emptyContent={
          <EmptyStatePanel
            title="Договоры не найдены"
            message={contracts.length
              ? "По текущему запросу договоров не найдено."
              : canCreateContract
                ? "Договоров пока нет. Создайте первый договор через форму выше."
                : "Договоров пока нет."}
          />
        }
      >
        <div className="registry-layout">
          <article className="panel">
            {createContract.error ? <div className="panel-note">Ошибка создания: {createContract.error}</div> : null}
            {createContract.data ? (
              <div className="panel-note">Создан договор: {createContract.data.contractNumber}</div>
            ) : null}
            <div className="table-scroll">
              <table className="data-table contracts-table">
                <thead>
                  <tr>
                    <th />
                    <th>Договор</th>
                    <th>Водитель и авто</th>
                    <th>Суммы</th>
                    <th>Долг</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedContractIds.includes(item.id)}
                          onChange={() => toggleContractSelection(item.id)}
                        />
                      </td>
                      <td>
                        <div className="identity-cell">
                          <div className="identity-avatar">
                            <ContractsIcon width={20} height={20} />
                          </div>
                          <div className="identity-meta">
                            <Link className="table-link table-strong" to={`/contracts/${item.id}`}>
                              {item.contractNumber}
                            </Link>
                            <p className="table-meta">ID: {formatShortId(item.id)}</p>
                            {driverCompanyMap.get(item.driverId) || carCompanyMap.get(item.carId) ? (
                              <p className="table-meta">{driverCompanyMap.get(item.driverId) || carCompanyMap.get(item.carId)}</p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          {canOpenDriverDetail ? (
                            <Link className="table-link table-strong" to={`/drivers/${item.driverId}`}>
                              {driverMap.get(item.driverId) ?? `Водитель ${formatShortId(item.driverId)}`}
                            </Link>
                          ) : (
                            <strong>{driverMap.get(item.driverId) ?? `Водитель ${formatShortId(item.driverId)}`}</strong>
                          )}
                          <span>{carMap.get(item.carId) ?? `Авто ${formatShortId(item.carId)}`}</span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{formatCurrency(item.financedAmount)}</strong>
                          <span>Начисление: {formatCurrency(item.installmentAmount)}</span>
                          <span>
                            {item.nextDueDate
                              ? `Ближайшее обязательство ${formatCurrency(item.nextDueAmount ?? 0)} ${
                                  item.currentDebt > 0 && new Date(item.nextDueDate).getTime() < Date.now()
                                    ? "просрочено с"
                                    : "до"
                                } ${formatDateOnly(item.nextDueDate)}`
                              : "Ближайших обязательств нет"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{formatCurrency(item.currentDebt)}</strong>
                          <span>{item.currentDebt > 0 ? "Есть остаток" : "Долг закрыт"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span>
                          <span>{item.hasDeferredPayment ? "Есть перенос" : "Без переноса"}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-menu-button"
                          aria-label={`Действия по договору ${item.contractNumber}`}
                          onClick={() => setActionMenuContractId(item.id)}
                        >
                          ⋯
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          {actionMenuContract ? (
            <>
              <button
                type="button"
                className="entity-modal__backdrop"
                aria-label="Закрыть действия договора"
                onClick={() => setActionMenuContractId(null)}
              />
              <section className="entity-modal contract-actions-modal" aria-modal="true" role="dialog" aria-labelledby="contract-actions-title">
                <div className="entity-modal__header">
                  <div>
                    <p className="eyebrow">Действия</p>
                    <h3 id="contract-actions-title">Договор {actionMenuContract.contractNumber}</h3>
                    <p>
                      {driverMap.get(actionMenuContract.driverId) ?? `Водитель ${formatShortId(actionMenuContract.driverId)}`} ·{" "}
                      {carMap.get(actionMenuContract.carId) ?? `Авто ${formatShortId(actionMenuContract.carId)}`}
                    </p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => setActionMenuContractId(null)}>
                    Закрыть
                  </button>
                </div>
                <div className="entity-modal__body">
                  <div className="contract-actions-list">
                    <Link className="contract-action-item" to={`/contracts/${actionMenuContract.id}`} onClick={() => setActionMenuContractId(null)}>
                      Открыть договор
                    </Link>
                    {canOpenDriverDetail ? (
                      <Link className="contract-action-item" to={`/drivers/${actionMenuContract.driverId}`} onClick={() => setActionMenuContractId(null)}>
                        Открыть водителя
                      </Link>
                    ) : null}
                    {canOpenVehicleDetail ? (
                      <Link className="contract-action-item" to={`/vehicles/${actionMenuContract.carId}`} onClick={() => setActionMenuContractId(null)}>
                        Открыть автомобиль
                      </Link>
                    ) : null}
                    {canOpenFinancialOps && actionMenuContract.currentDebt > 0 ? (
                      <>
                        <Link
                          className="contract-action-item"
                          to={`/financial-ops?action=payment&source=contracts&driverId=${actionMenuContract.driverId}&contractId=${actionMenuContract.id}&amount=${actionMenuContract.nextDueAmount ?? actionMenuContract.currentDebt}`}
                          onClick={() => setActionMenuContractId(null)}
                        >
                          Подготовить платёж
                        </Link>
                        <Link
                          className="contract-action-item"
                          to={`/financial-ops?action=payoff&source=contracts&driverId=${actionMenuContract.driverId}&contractId=${actionMenuContract.id}&amount=${actionMenuContract.currentDebt}`}
                          onClick={() => setActionMenuContractId(null)}
                        >
                          Досрочно закрыть
                        </Link>
                      </>
                    ) : null}
                    {canCreateContract && actionMenuContract.status !== "terminated" && actionMenuContract.status !== "closed" ? (
                      <button
                        type="button"
                        className="contract-action-item contract-action-item--danger"
                        disabled={actionContractId === actionMenuContract.id || bulkSaving}
                        onClick={() => void handleContractStatusUpdate(actionMenuContract.id, "terminated")}
                      >
                        {actionContractId === actionMenuContract.id ? "Выполняем..." : "Расторгнуть договор"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          ) : null}
          <div className="registry-side">
            <article className="panel">
              <div className="panel__title">
                <FinanceIcon width={18} height={18} />
                <h3>Финансовый профиль</h3>
              </div>
              <div className="summary-list">
                <button type="button" className="summary-list__button" onClick={() => setStatusFilter("all")}><span>Сумма портфеля</span><strong>{formatCurrency(financedTotal)}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatusFilter("active")}><span>Платёжный поток</span><strong>{formatCurrency(installmentTotal)}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatusFilter("active")}><span>Текущий долг</span><strong>{formatCurrency(debtTotal)}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatusFilter("all")}><span>Средняя сумма договора</span><strong>{formatCurrency(contracts.length ? Math.round(financedTotal / contracts.length) : 0)}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatusFilter("all")}><span>Средний платёж</span><strong>{formatCurrency(contracts.length ? Math.round(installmentTotal / contracts.length) : 0)}</strong></button>
              </div>
            </article>
            <article className="panel">
              <div className="panel__title">
                <ContractsIcon width={18} height={18} />
                <h3>Выкупленные договоры</h3>
              </div>
              <div className="summary-list">
                {boughtOutContracts.map((item) => (
                  <div key={`closed-${item.id}`}>
                    <span>{item.contractNumber} · {driverMap.get(item.driverId) ?? formatShortId(item.driverId)}</span>
                    <strong>Выкуплен</strong>
                    <div className="row-actions">
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                      {canOpenDriverDetail ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!boughtOutContracts.length ? (
                  <p className="panel-note">Выкупленных договоров сейчас нет.</p>
                ) : null}
              </div>
            </article>
            <article className="panel">
              <div className="panel__title">
                <ContractsIcon width={18} height={18} />
                <h3>Расторгнутые договоры</h3>
              </div>
              <div className="summary-list">
                {terminatedContracts.map((item) => (
                  <div key={`terminated-${item.id}`}>
                    <span>{item.contractNumber} · {driverMap.get(item.driverId) ?? formatShortId(item.driverId)}</span>
                    <strong>{item.status === "defaulted" ? "Проблемный" : "Расторгнут"}</strong>
                    <div className="row-actions">
                      <Link className="table-link" to={`/contracts/${item.id}`}>
                        Открыть договор
                      </Link>
                      {canOpenDriverDetail ? (
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          Открыть водителя
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!terminatedContracts.length ? (
                  <p className="panel-note">Расторгнутых договоров сейчас нет.</p>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      </AsyncState>
      <Outlet />
    </section>
  );
}
