import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useSearchParams } from "react-router-dom";
import { formatCurrency, formatDateOnly, getStatusLabel, getStatusTone } from "../lib/utils";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { useApiMutation } from "../hooks/useApiMutation";
import { fetchJson, patchJson } from "../lib/api";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { downloadCsvTable } from "../lib/utils";
import { DriversIcon, FinanceIcon, ShieldIcon } from "../ui/CrmIcons";
import type { ContractListItem, DriverListItem, ManagerAssignedDriverItem, PayoutListItem, UserAdminListItem } from "@gopark/contracts";

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

function getLocalDateOnly(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDuePeriodAmount(driver: { duePeriodAmount?: number | null; nextPaymentAmount?: number | null }): number {
  return driver.duePeriodAmount ?? driver.nextPaymentAmount ?? 0;
}

function getDebtViewAmount(
  status: string,
  driver: { overdueDebt?: number | null; duePeriodAmount?: number | null; nextPaymentAmount?: number | null },
): number {
  if (status === "overdue") {
    return driver.overdueDebt ?? 0;
  }

  return (driver.overdueDebt ?? 0) > 0 ? driver.overdueDebt ?? 0 : getDuePeriodAmount(driver);
}

function formatDriverNextPayment(driver: DriverListItem & {
  nextPaymentAmount?: number | null;
  nextPaymentDate?: string | null;
}, contract?: ContractListItem): string {
  if (!driver.nextPaymentDate) {
    return "Ближайший платёж пока не задан";
  }

  const contractPayment = contract?.installmentAmount ?? driver.nextPaymentAmount ?? 0;
  const gpsPayment = contract?.gpsBillingMode === "daily" ? contract.monthlyGpsAmount ?? 0 : 0;
  const insurancePayment = contract?.insuranceBillingMode === "daily" ? contract.monthlyInsuranceAmount ?? 0 : 0;
  const parts = [
    `платёж ${formatCurrency(contractPayment)}`,
    gpsPayment > 0 ? `GPS ${formatCurrency(gpsPayment)}` : null,
    insurancePayment > 0 ? `Страховка ${formatCurrency(insurancePayment)}` : null,
  ].filter(Boolean);
  const datePrefix = (driver.nextPaymentAmount ?? 0) > 0 && driver.nextPaymentDate.slice(0, 10) < getLocalDateOnly()
    ? "просрочен с"
    : "до";

  return `Следующий: ${parts.join(" · ")} · ${datePrefix} ${formatDateOnly(driver.nextPaymentDate)}`;
}

const defaultDriverStatusFilter = "active";

export function DriversPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") ?? defaultDriverStatusFilter);
  const [managerFilter, setManagerFilter] = useState(searchParams.get("managerId") ?? "all");
  const [dueDateFrom, setDueDateFrom] = useState(searchParams.get("dueDateFrom") ?? "");
  const [dueDateTo, setDueDateTo] = useState(searchParams.get("dueDateTo") ?? searchParams.get("dueDateFrom") ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [nearestRelativePhone, setNearestRelativePhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [weeklyDayOff, setWeeklyDayOff] = useState("");
  const [managerId, setManagerId] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [bulkManagerId, setBulkManagerId] = useState("keep");
  const [bulkCompanyName, setBulkCompanyName] = useState("keep");
  const [bulkStatus, setBulkStatus] = useState("keep");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState(searchParams.get("companyName") ?? session.companyName?.trim() ?? "all");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [effectiveDrivers, setEffectiveDrivers] = useState<ManagerAssignedDriverItem[] | null>(null);
  const firstNameInputRef = useRef<HTMLInputElement | null>(null);
  const quickFormRef = useRef<HTMLDivElement | null>(null);
  const api = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createDriver = useApiMutation<DriverListItem, { firstName: string; lastName: string; phone: string; nearestRelativePhone?: string; licenseNumber?: string; passportNumber?: string; companyName?: string; weeklyDayOff?: string; managerId?: string }>("drivers");
  const canCreateDriver = hasCrmCapability(session.requestUserRole, "create-driver", session.managerLevel);
  const canCreateContract = hasCrmCapability(session.requestUserRole, "create-contract", session.managerLevel);
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const canReadEffectiveDriverStates = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const drivers = useMemo(() => api.data ?? [], [api.data]);
  const contracts = useMemo(() => contractsApi.data ?? [], [contractsApi.data]);
  const payouts = useMemo(() => payoutsApi.data ?? [], [payoutsApi.data]);
  const users = useMemo(() => usersApi.data ?? [], [usersApi.data]);
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const effectiveDriverRows = useMemo(() => effectiveDrivers ?? [], [effectiveDrivers]);
  const contractMap = useMemo(() => new Map(contracts.map((item) => [item.id, item.contractNumber])), [contracts]);
  const activeContractMap = useMemo(() => new Map(contracts.map((item) => [item.id, item])), [contracts]);
  const effectiveDriverMap = useMemo(() => new Map(effectiveDriverRows.map((item) => [item.id, item])), [effectiveDriverRows]);
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

  useEffect(() => {
    const nextStatus = searchParams.get("status");
    setStatus(nextStatus ?? defaultDriverStatusFilter);
    const nextManagerId = searchParams.get("managerId");
    setManagerFilter(nextManagerId ?? "all");
    setDueDateFrom(searchParams.get("dueDateFrom") ?? "");
    setDueDateTo(searchParams.get("dueDateTo") ?? searchParams.get("dueDateFrom") ?? "");
    setCompanyFilter(searchParams.get("companyName") ?? session.companyName?.trim() ?? "all");
  }, [searchParams, session.companyName]);

  useEffect(() => {
    if (!canReadEffectiveDriverStates) {
      setEffectiveDrivers(null);
      return;
    }

    let active = true;

    const today = getLocalDateOnly();
    const query = new URLSearchParams({
      dueDateFrom: dueDateFrom || today,
      dueDateTo: dueDateTo || dueDateFrom || today,
    });

    fetchJson<ManagerAssignedDriverItem[]>(`mobile/manager/drivers?${query.toString()}`)
      .then((data) => {
        if (!active) {
          return;
        }

        setEffectiveDrivers(data);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setEffectiveDrivers(null);
      });

    return () => {
      active = false;
    };
  }, [canReadEffectiveDriverStates, dueDateFrom, dueDateTo, session.requestUserRole]);

  const statusBaseRows = useMemo(
    () =>
      drivers
        .map((driver) => {
          const effectiveDriver = effectiveDriverMap.get(driver.id);
          return {
            ...driver,
            status: effectiveDriver?.status ?? driver.status,
            creditBalance: effectiveDriver?.creditBalance ?? driver.creditBalance,
            activeContractId: effectiveDriver?.contractId ?? driver.activeContractId,
            overdueDebt: effectiveDriver?.overdueDebt ?? 0,
            duePeriodAmount: effectiveDriver?.duePeriodAmount ?? 0,
            yandexBalance: effectiveDriver?.yandexBalance ?? 0,
            nextPaymentAmount: effectiveDriver?.nextPaymentAmount ?? 0,
            nextPaymentDate: effectiveDriver?.nextPaymentDate ?? null,
            lastPaymentDate: effectiveDriver?.lastPaymentDate ?? null,
          };
        })
        .filter((driver) => {
          const inSearch =
            driver.fullName.toLowerCase().includes(query.toLowerCase()) ||
            driver.phone.includes(query);
          const inCompany = companyFilter === "all" || (driver.companyName ?? "") === companyFilter;
          const inManager = managerFilter === "all" || (driver.managerId ?? "") === managerFilter;
          return inSearch && inCompany && inManager;
        }),
    [companyFilter, drivers, effectiveDriverMap, managerFilter, query],
  );
  const rows = useMemo(
    () =>
      statusBaseRows.filter((driver) => {
        return status === "all"
          || (status === "overdue" ? driver.overdueDebt > 0
            : status === "payment_due" ? getDebtViewAmount(status, driver) > 0
              : status === "with_contract" ? Boolean(driver.activeContractId)
                : status === "without_contract" ? !driver.activeContractId
              : driver.status === status);
      }),
    [status, statusBaseRows],
  );
  const requestedPayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of payouts) {
      if (item.status !== "requested") {
        continue;
      }

      amounts.set(item.driverId, (amounts.get(item.driverId) ?? 0) + item.amount);
    }

    return amounts;
  }, [payouts]);
  const activeDrivers = statusBaseRows.filter((driver) => driver.status === "active").length;
  const paymentDueDrivers = statusBaseRows.filter((driver) => getDebtViewAmount("payment_due", driver) > 0).length;
  const withManager = statusBaseRows.filter((driver) => driver.managerId).length;
  const withContract = statusBaseRows.filter((driver) => driver.activeContractId).length;
  const withoutContract = statusBaseRows.length - withContract;
  const overdueDrivers = statusBaseRows.filter((driver) => driver.overdueDebt > 0).length;
  const dayOffDrivers = statusBaseRows.filter((driver) => driver.status === "day_off").length;
  const vacationDrivers = statusBaseRows.filter((driver) => driver.status === "vacation").length;
  const forceMajeureDrivers = statusBaseRows.filter((driver) => driver.status === "force_majeure").length;
  const accidentDrivers = statusBaseRows.filter((driver) => driver.status === "accident").length;
  const idleDrivers = statusBaseRows.filter((driver) => driver.status === "idle").length;
  const terminatedDrivers = statusBaseRows.filter((driver) => driver.status === "terminated").length;
  const selectedCount = selectedDriverIds.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const isDebtView = status === "payment_due" || status === "overdue";
  const managerDebtCards = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const baseRows = drivers
      .map((driver) => {
        const effectiveDriver = effectiveDriverMap.get(driver.id);
        return {
          ...driver,
          status: effectiveDriver?.status ?? driver.status,
          overdueDebt: effectiveDriver?.overdueDebt ?? 0,
          duePeriodAmount: effectiveDriver?.duePeriodAmount ?? 0,
          nextPaymentAmount: effectiveDriver?.nextPaymentAmount ?? 0,
          nextPaymentDate: effectiveDriver?.nextPaymentDate ?? null,
        };
      })
      .filter((driver) => {
        const inSearch = driver.fullName.toLowerCase().includes(normalizedQuery) || driver.phone.includes(query);
        const inStatus = getDebtViewAmount(status, driver) > 0;
        const inCompany = companyFilter === "all" || (driver.companyName ?? "") === companyFilter;
        return inSearch && inStatus && inCompany;
      });

    return managerOptions.map((manager) => {
      const managerProfileId = manager.managerProfileId ?? "";
      const managerRows = baseRows.filter((driver) => (driver.managerId ?? "") === managerProfileId);
      const amount = managerRows.reduce(
        (sum, driver) => sum + getDebtViewAmount(status, driver),
        0,
      );

      return {
        id: managerProfileId || manager.id,
        managerProfileId,
        name: manager.displayName,
        count: managerRows.length,
        amount,
      };
    }).filter((item) => item.count > 0 || item.amount > 0);
  }, [companyFilter, dueDateFrom, dueDateTo, drivers, effectiveDriverMap, managerOptions, query, status]);

  useEffect(() => {
    setSelectedDriverIds((current) => current.filter((driverId) => rows.some((item) => item.id === driverId)));
  }, [rows]);

  function toggleDriverSelection(driverId: string): void {
    setSelectedDriverIds((current) =>
      current.includes(driverId) ? current.filter((id) => id !== driverId) : [...current, driverId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedDriverIds(allSelected ? [] : rows.map((item) => item.id));
  }

  function handleExport(): void {
    if (!rows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-drivers.csv",
      ["driver", "full_name", "phone", "status", "manager", "weekly_day_off", "contract", "overdue_debt", "credit_balance", "next_payment_amount", "next_payment_date", "last_payment_date"],
      rows.map((driver) => [
        driver.fullName,
        driver.fullName,
        driver.phone,
        getStatusLabel(driver.status),
        driver.managerId ? "Привязан" : "Не привязан",
        getWeeklyDayOffLabel(driver.weeklyDayOff),
        driver.activeContractId ? (contractMap.get(driver.activeContractId) ?? "Привязан") : "Без договора",
        driver.overdueDebt,
        driver.creditBalance,
        driver.nextPaymentAmount,
        driver.nextPaymentDate ?? "",
        driver.lastPaymentDate ?? "",
      ]),
    );
  }

  async function handleCreateDriver(): Promise<void> {
    if (!firstName || !lastName || !phone) {
      setFormMessage("Заполните имя, фамилию и телефон.");
      quickFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstNameInputRef.current?.focus();
      return;
    }

    setFormMessage(null);
    await createDriver.mutate({
      firstName,
      lastName,
      phone,
      nearestRelativePhone: nearestRelativePhone || undefined,
      licenseNumber: licenseNumber || undefined,
      passportNumber: passportNumber || undefined,
      companyName: companyName || undefined,
      weeklyDayOff: weeklyDayOff || undefined,
      managerId: managerId || undefined,
    });
    await api.refetch();
    setFirstName("");
    setLastName("");
    setPhone("");
    setNearestRelativePhone("");
    setLicenseNumber("");
    setPassportNumber("");
    setCompanyName("");
    setWeeklyDayOff("");
    setManagerId("");
    setFormMessage("Водитель добавлен.");
    setIsCreatePanelOpen(false);
  }

  async function handleBulkManagerUpdate(): Promise<void> {
    if (!selectedDriverIds.length) {
      setBulkMessage("Выберите хотя бы одного водителя.");
      return;
    }

    if (bulkManagerId === "keep") {
      setBulkMessage("Выберите бригадира или вариант снятия привязки.");
      return;
    }

    setBulkMessage(null);
    setBulkSaving(true);
    let updatedCount = 0;

    try {
      for (const driverId of selectedDriverIds) {
        await patchJson(`drivers/${driverId}/manager`, {
          managerId: bulkManagerId === "" ? null : bulkManagerId,
        });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedDriverIds([]);
      setBulkManagerId("keep");
      setBulkMessage(`Бригадир обновлён для ${updatedCount} водителей.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось массово обновить бригадира.");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkCompanyUpdate(): Promise<void> {
    if (!selectedDriverIds.length) {
      setBulkMessage("Выберите хотя бы одного водителя.");
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
      for (const driverId of selectedDriverIds) {
        await patchJson(`drivers/${driverId}`, {
          companyName: bulkCompanyName === "" ? null : bulkCompanyName,
        });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedDriverIds([]);
      setBulkCompanyName("keep");
      setBulkMessage(`Компания обновлена для ${updatedCount} водителей.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось массово обновить компанию.");
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkStatusUpdate(): Promise<void> {
    if (!selectedDriverIds.length) {
      setBulkMessage("Выберите хотя бы одного водителя.");
      return;
    }

    if (bulkStatus === "keep") {
      setBulkMessage("Выберите новый статус для водителей.");
      return;
    }

    setBulkMessage(null);
    setBulkSaving(true);
    let updatedCount = 0;

    try {
      for (const driverId of selectedDriverIds) {
        await patchJson(`drivers/${driverId}`, {
          status: bulkStatus,
        });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedDriverIds([]);
      setBulkStatus("keep");
      setBulkMessage(`Статус обновлён для ${updatedCount} водителей.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось массово обновить статус водителей.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <section className="page-stack drivers-page">
      <div className="hero-card hero-card--dashboard">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <DriversIcon width={18} height={18} />
            <span>Водители</span>
          </div>
          <h2>Водители</h2>
          <p>Список водителей, их статусы, договоры и закреплённые бригадиры.</p>
        </div>
        <div className="hero-card__actions">
          <div className="toolbar toolbar--hero">
            {rows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
            {canCreateDriver ? (
              <button
                onClick={() => {
                  setIsCreatePanelOpen(true);
                  window.setTimeout(() => {
                    firstNameInputRef.current?.focus();
                  }, 0);
                }}
              >
                Добавить водителя
              </button>
            ) : null}
          </div>
          {!canCreateDriver ? (
            <ReadOnlyNotice message="Для этой роли доступен только просмотр водителей." />
          ) : null}
        </div>
      </div>
      <div className="stats-grid driver-status-grid--parkpro">
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "active" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("active")}
        >
          <span>Активные</span>
          <strong>{activeDrivers}</strong>
          <p>Работают сейчас</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "payment_due" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("payment_due")}
        >
          <span>К оплате</span>
          <strong>{paymentDueDrivers}</strong>
          <p>Есть платёж к закрытию</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "overdue" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("overdue")}
        >
          <span>Просрочка</span>
          <strong>{overdueDrivers}</strong>
          <p>Долг открыт</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "without_contract" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("without_contract")}
        >
          <span>Без договора</span>
          <strong>{withoutContract}</strong>
          <p>Нет активного договора</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "day_off" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("day_off")}
        >
          <span>Выходной</span>
          <strong>{dayOffDrivers}</strong>
          <p>По графику</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "vacation" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("vacation")}
        >
          <span>Отпросились</span>
          <strong>{vacationDrivers}</strong>
          <p>Временно отсутствуют</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "force_majeure" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("force_majeure")}
        >
          <span>Форс-мажор</span>
          <strong>{forceMajeureDrivers}</strong>
          <p>Особые случаи</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "accident" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("accident")}
        >
          <span>ДТП</span>
          <strong>{accidentDrivers}</strong>
          <p>Активные ДТП</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "idle" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("idle")}
        >
          <span>Простой</span>
          <strong>{idleDrivers}</strong>
          <p>Не на линии</p>
        </button>
        <button
          type="button"
          className={`hero-inline-metric hero-inline-metric--button${status === "terminated" ? " hero-inline-metric--active" : ""}`}
          onClick={() => setStatus("terminated")}
        >
          <span>Архив</span>
          <strong>{terminatedDrivers}</strong>
          <p>Расторгнутые</p>
        </button>
      </div>
      <article className="panel filter-panel">
        <div className="panel__title">
          <DriversIcon width={18} height={18} />
          <h3>Поиск и быстрый онбординг</h3>
        </div>
        <div className="filter-panel__grid">
          <div className="filter-panel__stack">
            <div className="toolbar">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени или телефону" />
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">Все статусы</option>
                  <option value="active">Активен</option>
                  <option value="payment_due">К оплате сегодня</option>
                  <option value="with_contract">С активным договором</option>
                  <option value="without_contract">Без договора</option>
                  <option value="overdue">С просрочкой</option>
                  <option value="day_off">Выходной</option>
                  <option value="vacation">Отпросился</option>
                  <option value="force_majeure">Форс-мажор</option>
                  <option value="accident">ДТП</option>
                  <option value="idle">Простой</option>
                  <option value="terminated">Расторгнутые / архив</option>
              </select>
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                <option value="all">Все компании</option>
                {companies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
                <option value="all">Все бригадиры</option>
                <option value="">Без бригадира</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.managerProfileId ?? ""}>
                    {manager.displayName}
                  </option>
                ))}
              </select>
            </div>
            <p className="panel-note">
              Поиск и статус фильтруют текущую рабочую выдачу, а выгрузка сохраняет именно её.
            </p>
            {isDebtView ? (
              <div className="debt-manager-panel">
                <div className="panel__title">
                  <FinanceIcon width={18} height={18} />
                  <h3>{status === "overdue" ? "Просрочка по бригадирам" : "К оплате сегодня по бригадирам"}</h3>
                </div>
                <div className="debt-manager-strip">
                  <button
                    type="button"
                    className={`debt-manager-card${managerFilter === "all" ? " debt-manager-card--active" : ""}`}
                    onClick={() => setManagerFilter("all")}
                  >
                    <span>Все бригадиры</span>
                    <strong>{rows.length}</strong>
                    <p>{formatCurrency(rows.reduce(
                      (sum, driver) => sum + getDebtViewAmount(status, driver),
                      0,
                    ))}</p>
                  </button>
                  {managerDebtCards.map((manager) => (
                    <button
                      key={manager.id}
                      type="button"
                      className={`debt-manager-card${managerFilter === manager.managerProfileId ? " debt-manager-card--active" : ""}`}
                      onClick={() => setManagerFilter(manager.managerProfileId)}
                    >
                      <span>{manager.name}</span>
                      <strong>{manager.count}</strong>
                      <p>{formatCurrency(manager.amount)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {canCreateDriver && managerOptions.length ? (
              <div className="toolbar">
                <button type="button" className="button-secondary" onClick={() => setIsBulkPanelOpen((value) => !value)}>
                  {isBulkPanelOpen ? "Скрыть массовые действия" : "Массовые действия"}
                </button>
              </div>
            ) : null}
            {canCreateDriver && managerOptions.length && isBulkPanelOpen ? (
              <div className="quick-form">
                <p className="quick-form__title">Массовая привязка бригадира</p>
                <div className="toolbar">
                  <button type="button" onClick={toggleSelectAll}>
                    {allSelected ? "Снять выбор" : "Выбрать всех"}
                  </button>
                  <span className="panel-note">Выбрано: {selectedCount}</span>
                </div>
                <div className="toolbar">
                  <select value={bulkManagerId} onChange={(e) => setBulkManagerId(e.target.value)}>
                    <option value="keep">Бригадир без изменений</option>
                    <option value="">Снять привязку</option>
                    {managerOptions.map((manager) => (
                      <option key={manager.id} value={manager.managerProfileId ?? ""}>
                        {manager.displayName}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkManagerUpdate()}>
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
                <div className="toolbar">
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                    <option value="keep">Статус без изменений</option>
                    <option value="active">Активен</option>
                    <option value="day_off">Выходной</option>
                    <option value="vacation">Отпросился</option>
                    <option value="force_majeure">Форс-мажор</option>
                    <option value="accident">ДТП</option>
                    <option value="idle">Простой</option>
                    <option value="terminated">Расторгнут</option>
                  </select>
                  <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkStatusUpdate()}>
                    {bulkSaving ? "Сохраняем..." : "Массово сменить статус"}
                  </button>
                </div>
                {bulkMessage ? <p className="panel-note">{bulkMessage}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
      {canCreateDriver && isCreatePanelOpen ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть добавление водителя"
            onClick={() => setIsCreatePanelOpen(false)}
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="driver-create-title">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Водители</p>
                <h3 id="driver-create-title">Быстрое добавление водителя</h3>
                <p>Заполните данные и при необходимости сразу назначьте бригадира.</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => setIsCreatePanelOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="quick-form entity-modal__body" ref={quickFormRef}>
              <div className="form-grid">
                <input ref={firstNameInputRef} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Имя" />
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Фамилия" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
                <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="Вод. удостоверение" />
                <input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder="Удостоверение личности" />
                <input
                  value={nearestRelativePhone}
                  onChange={(e) => setNearestRelativePhone(e.target.value)}
                  placeholder="Телефон ближайшего родственника"
                />
                <select value={companyName} onChange={(e) => setCompanyName(e.target.value)}>
                  <option value="">Компания не выбрана</option>
                  {companies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <select value={weeklyDayOff} onChange={(e) => setWeeklyDayOff(e.target.value)}>
                  {weeklyDayOffOptions.map((option) => (
                    <option key={option.value || "none"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                  <option value="">Бригадир не привязан</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.managerProfileId ?? ""}>
                      {manager.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="toolbar">
                <button disabled={createDriver.loading} onClick={() => void handleCreateDriver()}>
                  {createDriver.loading ? "Сохраняем..." : "Сохранить водителя"}
                </button>
              </div>
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
            title="Водители не найдены"
            message={canCreateDriver
              ? "Реестр пока пуст. Добавьте первого водителя через форму выше."
              : "Реестр пока пуст. Для текущей роли доступен только просмотр, создание водителей недоступно."}
          />
        }
      >
        <div className="registry-layout">
          <article className="panel">
            {createDriver.error ? <div className="panel-note">Ошибка создания: {createDriver.error}</div> : null}
            {createDriver.data ? <div className="panel-note">Создан водитель: {createDriver.data.fullName}</div> : null}
            <div className="table-scroll">
              <table className="data-table drivers-table">
                <thead>
                  <tr>
                    <th />
                    <th>Водитель</th>
                    <th>Контур</th>
                    <th>Телефон</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((driver) => (
                    <tr key={driver.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedDriverIds.includes(driver.id)}
                          onChange={() => toggleDriverSelection(driver.id)}
                        />
                      </td>
                      <td>
                        <div className="identity-cell">
                          <div className="identity-avatar identity-avatar--green">
                            {driver.fullName
                              .split(" ")
                              .slice(0, 2)
                              .map((part) => part[0] ?? "")
                              .join("")}
                          </div>
                          <div className="identity-meta">
                            <Link className="table-link table-strong" to={`/drivers/${driver.id}`}>
                              {driver.fullName}
                            </Link>
                            {driver.companyName ? <p className="table-meta">{driver.companyName}</p> : null}
                            <div className="inline-pills">
                              <span className={`inline-pill${driver.managerId ? " inline-pill--accent" : ""}`}>
                                {driver.managerId ? (managerNameMap.get(driver.managerId) ?? driver.managerId) : "Бригадир не привязан"}
                              </span>
                              {driver.weeklyDayOff ? (
                                <span className="inline-pill">{getWeeklyDayOffLabel(driver.weeklyDayOff)}</span>
                              ) : null}
                              {driver.creditBalance > 0 ? (
                                <span className="inline-pill inline-pill--accent">
                                  Остаток {formatCurrency(driver.creditBalance)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{driver.activeContractId ? (contractMap.get(driver.activeContractId) ?? "Договор привязан") : "Нет активного договора"}</strong>
                          <span>
                            {driver.overdueDebt > 0
                              ? `Просрочка ${formatCurrency(driver.overdueDebt)}`
                              : `Баланс ${formatCurrency(driver.yandexBalance)}`}
                          </span>
                          <span>
                            {formatDriverNextPayment(
                              driver,
                              driver.activeContractId ? activeContractMap.get(driver.activeContractId) : undefined,
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{driver.phone}</strong>
                          <span>
                            {driver.lastPaymentDate
                              ? `Последний платёж ${formatDateOnly(driver.lastPaymentDate)}`
                              : "Платежей пока не было"}
                          </span>
                        </div>
                      </td>
                      <td><span className={getStatusTone(driver.status)}>{getStatusLabel(driver.status)}</span></td>
                      <td>
                        <div className="row-actions row-actions--vertical">
                          {driver.activeContractId && canOpenFinancialOps && (driver.overdueDebt > 0 || driver.nextPaymentAmount > 0) ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=payment&source=drivers&driverId=${driver.id}&contractId=${driver.activeContractId}&amount=${
                                driver.overdueDebt > 0 ? driver.overdueDebt : driver.nextPaymentAmount
                              }`}
                            >
                              Платёж
                            </Link>
                          ) : null}
                          {canOpenFinancialOps && Math.max(0, driver.yandexBalance - (requestedPayoutAmountByDriverId.get(driver.id) ?? 0) - 100) > 0 ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=payout&source=drivers&driverId=${driver.id}&amount=${Math.max(0, driver.yandexBalance - (requestedPayoutAmountByDriverId.get(driver.id) ?? 0) - 100)}`}
                            >
                              Вывод
                            </Link>
                          ) : null}
                          {hasCrmAccess(session.requestUserRole, "vehicles") ? (
                            <Link className="table-link" to={`/vehicles?driverId=${driver.id}`}>
                              Авто
                            </Link>
                          ) : null}
                          {canCreateContract ? (
                            <Link className="table-link" to={`/contracts?driverId=${driver.id}`}>
                              Договор
                            </Link>
                          ) : null}
                          {canOpenFinancialOps && driver.creditBalance > 0 ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=credit-writeoff&source=drivers&driverId=${driver.id}&amount=${driver.creditBalance}&reason=${encodeURIComponent("Ручная корректировка")}`}
                            >
                              Списать
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <div className="registry-side">
            <article className="panel">
              <div className="panel__title">
                <ShieldIcon width={18} height={18} />
                <h3>Контур покрытия</h3>
              </div>
              <div className="stack-list">
                <button type="button" className="stack-list__item stack-list__item--button" onClick={() => setManagerFilter("all")}>
                  <span className="stack-list__eyebrow">Покрытие бригадирами</span>
                  <strong className="stack-list__value">{withManager}</strong>
                  <p className="stack-list__meta">{statusBaseRows.length - withManager} без закреплённого бригадира</p>
                </button>
                <button type="button" className="stack-list__item stack-list__item--button" onClick={() => setStatus("with_contract")}>
                  <span className="stack-list__eyebrow">Покрытие договорами</span>
                  <strong className="stack-list__value">{withContract}</strong>
                  <p className="stack-list__meta">{withoutContract} без активного договора</p>
                </button>
              </div>
            </article>
            <article className="panel">
              <div className="panel__title">
                <FinanceIcon width={18} height={18} />
                <h3>Под наблюдением</h3>
              </div>
              <div className="summary-list">
                <button type="button" className="summary-list__button" onClick={() => setStatus("overdue")}><span>С просрочкой</span><strong>{overdueDrivers}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("accident")}><span>ДТП</span><strong>{accidentDrivers}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("force_majeure")}><span>Форс-мажор</span><strong>{forceMajeureDrivers}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("idle")}><span>Простой</span><strong>{idleDrivers}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("day_off")}><span>Выходной</span><strong>{dayOffDrivers}</strong></button>
                <button type="button" className="summary-list__button" onClick={() => setStatus("vacation")}><span>Отпросился</span><strong>{vacationDrivers}</strong></button>
              </div>
            </article>
          </div>
        </div>
      </AsyncState>
      <Outlet />
    </section>
  );
}
