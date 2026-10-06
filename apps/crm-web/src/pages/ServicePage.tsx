import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DriverListItem, ManagerIncidentItem, VehicleListItem } from "@gopark/contracts";
import { patchJson } from "../lib/api";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../ui/AuthContext";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { CarIcon, DriversIcon, FinanceIcon, LedgerIcon } from "../ui/CrmIcons";
import {
  downloadCsvTable,
  formatCurrency,
  formatDateOnly,
  formatRepairPeriodLabel,
  formatShortId,
  getIncidentPriorityLabel,
  getStatusLabel,
  getStatusTone,
} from "../lib/utils";

type CreateIncidentInput = {
  title: string;
  incidentType: string;
  status: string;
  priority: string;
  serviceStage?: string | null;
  serviceCaseType?: string | null;
  servicePaymentStatus?: string | null;
  servicePayer?: string | null;
  driverId?: string | null;
  carId?: string | null;
  occurredAt?: string | null;
  amount?: number | null;
  insuranceCompensationAmount?: number | null;
  writeoffAmount?: number | null;
  description?: string | null;
  repairNote?: string | null;
  periodLabel?: string | null;
  managerLabel?: string | null;
};

function isServiceIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "repair";
}

function getServiceStage(item: ManagerIncidentItem): string {
  return item.serviceStage
    ?? (item.status === "open"
      ? "awaiting_repair"
      : item.status === "resolved"
        ? "in_repair"
        : item.status === "closed" || item.status === "archived"
          ? "completed"
          : item.status);
}

function getServiceWorkflowLabel(item: ManagerIncidentItem): string {
  const stage = getServiceStage(item);
  if (stage === "awaiting_repair") {
    return "Ожидает ремонт";
  }
  if (stage === "in_repair") {
    return "В ремонте";
  }
  if (stage === "completed") {
    return "Завершён";
  }
  if (stage === "written_off") {
    return "Списан";
  }
  if (item.status === "archived") {
    return "Архив";
  }
  return getStatusLabel(stage);
}

function getServiceCaseType(item: ManagerIncidentItem): string {
  const type = item.serviceCaseType ?? ((item.insuranceCompensationAmount ?? 0) > 0 ? "insurance" : "non_insurance");
  return type === "insurance" ? "Страховой случай" : "Нестраховой случай";
}

function getServicePaymentStatus(item: ManagerIncidentItem): string {
  if (item.servicePaymentStatus === "paid") {
    return "Оплачен";
  }
  if (item.servicePaymentStatus === "unpaid") {
    return "Не оплачен";
  }
  if (item.servicePaymentStatus === "not_required") {
    return "Оплата не требуется";
  }
  const coveredAmount = (item.insuranceCompensationAmount ?? 0) + (item.writeoffAmount ?? 0);
  if ((item.amount ?? 0) <= 0) {
    return "Оплата не требуется";
  }
  return coveredAmount >= (item.amount ?? 0) ? "Оплачен" : "Не оплачен";
}

function getServicePayer(item: ManagerIncidentItem): string {
  if (item.servicePayer === "insurance") {
    return "Оплачивает страховая";
  }
  if (item.servicePayer === "driver") {
    return "Оплачивает водитель";
  }
  if (item.servicePayer === "company") {
    return "Оплачивает компания";
  }
  if ((item.insuranceCompensationAmount ?? 0) > 0) {
    return "Оплачивает страховая";
  }
  if ((item.writeoffAmount ?? 0) > 0) {
    return "Оплачивает водитель";
  }
  if ((item.amount ?? 0) > 0) {
    return "Оплачивает компания";
  }
  return "Плательщик не указан";
}

function buildCompletedRepairPeriod(item: ManagerIncidentItem): string {
  if (item.periodLabel?.includes("..")) {
    return item.periodLabel;
  }

  const startedAt = (item.periodLabel || item.occurredAt || new Date().toISOString()).slice(0, 10);
  return `${startedAt}..${new Date().toISOString().slice(0, 10)}`;
}

export function ServicePage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createIncident = useApiMutation<ManagerIncidentItem, CreateIncidentInput>("incidents");
  const canCreate = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const [title, setTitle] = useState("Ремонт на СТО");
  const [driverId, setDriverId] = useState("");
  const [carId, setCarId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [description, setDescription] = useState("");
  const [repairNote, setRepairNote] = useState("");
  const [managerLabel, setManagerLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [insuranceCompensationAmount, setInsuranceCompensationAmount] = useState("");
  const [writeoffAmount, setWriteoffAmount] = useState("");
  const [serviceCaseType, setServiceCaseType] = useState<"insurance" | "non_insurance">("non_insurance");
  const [servicePaymentStatus, setServicePaymentStatus] = useState<"paid" | "unpaid" | "not_required">("unpaid");
  const [servicePayer, setServicePayer] = useState<"insurance" | "driver" | "company" | "not_set">("company");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "awaiting_repair" | "in_repair" | "completed" | "written_off" | "archived">("active");
  const [caseTypeFilter, setCaseTypeFilter] = useState<"all" | "insurance" | "non_insurance">("all");
  const [paymentStateFilter, setPaymentStateFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [payerFilter, setPayerFilter] = useState<"all" | "insurance" | "driver" | "company">("all");
  const [managerFilter, setManagerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showHistoricalInList, setShowHistoricalInList] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);

  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const vehicles = useMemo(() => vehiclesApi.data ?? [], [vehiclesApi.data]);
  const incidents = useMemo(() => incidentsApi.data ?? [], [incidentsApi.data]);
  const driverCompanyMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.companyName ?? ""])), [drivers]);
  const vehicleCompanyMap = useMemo(() => new Map(vehicles.map((item) => [item.id, item.companyName ?? ""])), [vehicles]);
  const matchesCompany = useCallback((driverId?: string | null, carId?: string | null): boolean => {
    if (companyFilter === "all") {
      return true;
    }

    return (driverId ? driverCompanyMap.get(driverId) : "") === companyFilter
      || (carId ? vehicleCompanyMap.get(carId) : "") === companyFilter;
  }, [companyFilter, driverCompanyMap, vehicleCompanyMap]);
  const visibleDrivers = useMemo(() => drivers.filter((item) => matchesCompany(item.id, null)), [drivers, matchesCompany]);
  const visibleVehicles = useMemo(() => vehicles.filter((item) => matchesCompany(item.assignedDriverId, item.id)), [matchesCompany, vehicles]);
  const driverMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.fullName])), [drivers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((item) => [item.id, item.plateNumber])), [vehicles]);
  const vehicleLabelMap = useMemo(() => new Map(vehicles.map((item) => [item.id, `${item.plateNumber} · ${item.make} ${item.model}`])), [vehicles]);
  const serviceIncidents = useMemo(() => incidents.filter(isServiceIncident), [incidents]);
  const serviceRows = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const normalizedManager = managerFilter.trim().toLowerCase();

    return [...serviceIncidents]
      .filter((item) => {
        const stage = getServiceStage(item);
        if (!showHistoricalInList && statusFilter !== "completed" && statusFilter !== "written_off" && (item.status === "closed" || item.status === "archived")) {
          return false;
        }
        if (statusFilter === "archived" && item.status !== "archived") {
          return false;
        }
        if (statusFilter === "active" && !["awaiting_repair", "in_repair"].includes(stage)) {
          return false;
        }
        if (statusFilter !== "active" && statusFilter !== "all" && statusFilter !== "archived" && stage !== statusFilter) {
          return false;
        }
        if (caseTypeFilter === "insurance" && (item.insuranceCompensationAmount ?? 0) <= 0) {
          if (getServiceCaseType(item) !== "Страховой случай") {
            return false;
          }
        }
        if (caseTypeFilter === "non_insurance" && getServiceCaseType(item) !== "Нестраховой случай") {
          return false;
        }
        if (paymentStateFilter === "paid" && getServicePaymentStatus(item) !== "Оплачен") {
          return false;
        }
        if (paymentStateFilter === "unpaid" && getServicePaymentStatus(item) !== "Не оплачен") {
          return false;
        }
        if (payerFilter === "insurance" && getServicePayer(item) !== "Оплачивает страховая") {
          return false;
        }
        if (payerFilter === "driver" && getServicePayer(item) !== "Оплачивает водитель") {
          return false;
        }
        if (payerFilter === "company" && getServicePayer(item) !== "Оплачивает компания") {
          return false;
        }
        if (normalizedManager && !(item.managerLabel ?? "").toLowerCase().includes(normalizedManager)) {
          return false;
        }
        if (!matchesCompany(item.driverId, item.carId)) {
          return false;
        }
        if (!normalizedSearch) {
          return true;
        }

        const vehicleLabel = item.carId ? vehicleLabelMap.get(item.carId) ?? "" : "";
        const driverLabel = item.driverId ? driverMap.get(item.driverId) ?? "" : "";
        const haystack = [
          item.title,
          item.description ?? "",
          item.repairNote ?? "",
          item.managerLabel ?? "",
          vehicleLabel,
          driverLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => (right.occurredAt ?? right.id).localeCompare(left.occurredAt ?? left.id));
  }, [caseTypeFilter, driverMap, managerFilter, matchesCompany, payerFilter, paymentStateFilter, searchFilter, serviceIncidents, showHistoricalInList, statusFilter, vehicleLabelMap]);

  const totalExpense = serviceRows.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const totalInsurance = serviceRows.reduce((sum, item) => sum + (item.insuranceCompensationAmount ?? 0), 0);
  const totalWriteoff = serviceRows.reduce((sum, item) => sum + (item.writeoffAmount ?? 0), 0);
  const openCount = serviceRows.filter((item) => getServiceStage(item) === "awaiting_repair").length;
  const archivedCount = serviceIncidents.filter((item) => item.status === "archived").length;
  const selectedCount = selectedIncidentIds.length;
  const allSelected = serviceRows.length > 0 && selectedCount === serviceRows.length;

  function applyPresetView(view: "operations" | "insurance" | "archive"): void {
    if (view === "operations") {
      setStatusFilter("active");
      setCaseTypeFilter("all");
      setPaymentStateFilter("all");
      setPayerFilter("all");
      setManagerFilter("");
      setSearchFilter("");
      setShowHistoricalInList(false);
      return;
    }
    if (view === "insurance") {
      setStatusFilter("active");
      setCaseTypeFilter("insurance");
      setPaymentStateFilter("all");
      setPayerFilter("insurance");
      setManagerFilter("");
      setSearchFilter("страх");
      setShowHistoricalInList(false);
      return;
    }

    setStatusFilter("archived");
    setCaseTypeFilter("all");
    setPaymentStateFilter("all");
    setPayerFilter("all");
    setManagerFilter("");
    setSearchFilter("");
    setShowHistoricalInList(true);
  }

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "operations" || view === "insurance" || view === "archive") {
      applyPresetView(view);
    }
  }, [searchParams]);

  useEffect(() => {
    setSelectedIncidentIds((current) => current.filter((incidentId) => serviceRows.some((item) => item.id === incidentId)));
  }, [serviceRows]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (!carId || !description.trim()) {
      setMessage("Укажите автомобиль и деталь/описание ремонта.");
      return;
    }

    try {
      const created = await createIncident.mutate({
        title: title.trim() || "Ремонт на СТО",
        incidentType: "repair",
        status: "open",
        priority: "medium",
        driverId: driverId || null,
        carId,
        occurredAt: occurredAt || null,
        amount: amount ? Number(amount) : null,
        insuranceCompensationAmount: insuranceCompensationAmount ? Number(insuranceCompensationAmount) : null,
        writeoffAmount: writeoffAmount ? Number(writeoffAmount) : null,
        description: description.trim(),
        repairNote: repairNote.trim() || null,
        managerLabel: managerLabel.trim() || null,
        serviceStage: "awaiting_repair",
        serviceCaseType,
        servicePaymentStatus,
        servicePayer: servicePayer === "not_set" ? null : servicePayer,
      });
      setMessage(`СТО-кейс создан: ${created.title}.`);
      await incidentsApi.refetch();
      setDescription("");
      setRepairNote("");
      setAmount("");
      setInsuranceCompensationAmount("");
      setWriteoffAmount("");
      setServiceCaseType("non_insurance");
      setServicePaymentStatus("unpaid");
      setServicePayer("company");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать кейс СТО.");
    }
  }

  async function handleQuickStatusUpdate(item: ManagerIncidentItem, nextStage: "in_repair" | "completed" | "written_off" | "archived"): Promise<void> {
    setMessage(null);
    const nextStatus = nextStage === "in_repair" ? "resolved" : nextStage === "archived" ? "archived" : "closed";
    const nextWorkflowLabel = nextStage === "in_repair" ? "В ремонте" : nextStage === "completed" ? "Завершён" : nextStage === "written_off" ? "Списан" : "Архив";

    try {
      const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${item.id}`, {
        status: nextStatus,
        serviceStage: nextStage,
        periodLabel: ["completed", "written_off", "archived"].includes(nextStage) ? buildCompletedRepairPeriod(item) : item.periodLabel,
        repairNote: nextStage === "written_off" ? (item.repairNote ?? "Не подлежит восстановлению") : item.repairNote,
      });
      if (!updated) {
        setMessage("СТО-кейс не найден.");
        return;
      }
      if (nextStage === "written_off" && item.carId) {
        await patchJson(`cars/${item.carId}`, { status: "written_off" });
        await vehiclesApi.refetch();
      }
      setMessage(`Кейс ${formatShortId(item.id)} переведён в статус "${nextWorkflowLabel}".`);
      await incidentsApi.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус СТО-кейса.");
    }
  }

  function toggleIncidentSelection(incidentId: string): void {
    setSelectedIncidentIds((current) =>
      current.includes(incidentId) ? current.filter((id) => id !== incidentId) : [...current, incidentId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedIncidentIds(allSelected ? [] : serviceRows.map((item) => item.id));
  }

  async function handleBulkStatusUpdate(nextStage: "in_repair" | "completed" | "written_off" | "archived"): Promise<void> {
    if (!selectedIncidentIds.length) {
      setMessage("Выберите хотя бы один кейс СТО для массового действия.");
      return;
    }

    setMessage(null);
    let updatedCount = 0;
    const nextStatus = nextStage === "in_repair" ? "resolved" : nextStage === "archived" ? "archived" : "closed";
    const nextWorkflowLabel = nextStage === "in_repair" ? "В ремонте" : nextStage === "completed" ? "Завершён" : nextStage === "written_off" ? "Списан" : "Архив";

    try {
      for (const incidentId of selectedIncidentIds) {
        const sourceIncident = serviceRows.find((item) => item.id === incidentId);
        const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${incidentId}`, {
          status: nextStatus,
          serviceStage: nextStage,
          repairNote: nextStage === "written_off" ? (sourceIncident?.repairNote ?? "Не подлежит восстановлению") : sourceIncident?.repairNote,
        });
        if (updated) {
          updatedCount += 1;
          if (nextStage === "written_off" && sourceIncident?.carId) {
            await patchJson(`cars/${sourceIncident.carId}`, { status: "written_off" });
          }
        }
      }

      await incidentsApi.refetch();
      if (nextStage === "written_off") {
        await vehiclesApi.refetch();
      }
      setSelectedIncidentIds([]);
      setMessage(`Массово обработано ${updatedCount} кейсов СТО: статус "${nextWorkflowLabel}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое действие по СТО.");
    }
  }

  function handleExport(): void {
    if (!serviceRows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-service.csv",
      ["case", "company", "plate", "driver", "occurred_at", "detail", "repair_note", "case_type", "payment_state", "payer", "expense", "insurance_compensation", "writeoff", "brigadier", "status"],
      serviceRows.map((item) => [
        formatShortId(item.id),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : item.carId ? (vehicleCompanyMap.get(item.carId) ?? "") : "",
        item.carId ? (vehicleMap.get(item.carId) ?? formatShortId(item.carId)) : "",
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        item.occurredAt ?? "",
        item.description ?? "",
        item.repairNote ?? "",
        getServiceCaseType(item),
        getServicePaymentStatus(item),
        getServicePayer(item),
        item.amount ?? 0,
        item.insuranceCompensationAmount ?? 0,
        item.writeoffAmount ?? 0,
        item.managerLabel ?? "",
        getServiceWorkflowLabel(item),
      ]),
    );
  }

  return (
    <section className="page-stack service-page">
      <div className="hero-card">
        <p className="eyebrow">Ремонт</p>
        <h2>Журнал ремонта</h2>
        <p>Отдельный реестр ремонтов по машинам: деталь, тип случая, расход, оплата и ответственный бригадир.</p>
        <div className="toolbar">
          <Link className="button-link" to="/incidents?view=operations">
            Открыть инциденты
          </Link>
          <Link className="button-link" to="/reports">
            Открыть отчёты
          </Link>
          <Link className="button-link" to="/parts">
            Запчасти
          </Link>
          {serviceRows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
        </div>
        <ReadOnlyNotice message="Новый кейс ремонта в этом разделе убран. Здесь остаются только журнал, фильтры и архив." />
      </div>

      <div className="stats-grid">
        <StatCard title="Кейсы СТО" value={String(serviceRows.length)} subtitle="Строки по текущему фильтру" tone="blue" icon={<CarIcon width={18} height={18} />} onClick={() => applyPresetView("operations")} />
        <StatCard title="Ожидают ремонт" value={String(openCount)} subtitle="Живая очередь ремонта" tone="orange" icon={<LedgerIcon width={18} height={18} />} onClick={() => setStatusFilter("awaiting_repair")} />
        <StatCard title="Расход" value={formatCurrency(totalExpense)} subtitle="Сумма работ и запчастей" tone="orange" icon={<FinanceIcon width={18} height={18} />} onClick={() => setPaymentStateFilter("unpaid")} />
        <StatCard title="Страховка" value={formatCurrency(totalInsurance)} subtitle="Покрытие от страховой" tone="green" icon={<LedgerIcon width={18} height={18} />} onClick={() => applyPresetView("insurance")} />
        <StatCard title="Вычет" value={formatCurrency(totalWriteoff)} subtitle={`Сумма удержаний и вычетов · в архиве ${archivedCount}`} tone="purple" icon={<DriversIcon width={18} height={18} />} onClick={() => setPayerFilter("driver")} />
      </div>

      <div className="table-grid table-grid--single">
        <article className="panel">
          <div className="panel__title">
            <LedgerIcon width={18} height={18} />
            <h3>Журнал СТО</h3>
          </div>
          <div className="quick-form">
            <p className="quick-form__meta">Фильтры и представления</p>
            <div className="toolbar">
              <button type="button" onClick={() => applyPresetView("operations")}>
                Операционный вид
              </button>
              <button type="button" onClick={() => applyPresetView("insurance")}>
                Страховой контур
              </button>
              <button type="button" onClick={() => applyPresetView("archive")}>
                Архив
              </button>
            </div>
            <div className="toolbar">
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
                <option value="all">Все компании</option>
                {companies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="active">Активные ремонты</option>
                <option value="all">Все статусы</option>
                <option value="awaiting_repair">Ожидает ремонт</option>
                <option value="in_repair">В ремонте</option>
                <option value="completed">Завершённые</option>
                <option value="written_off">Списанные</option>
                <option value="archived">Архив</option>
              </select>
              <select value={caseTypeFilter} onChange={(event) => setCaseTypeFilter(event.target.value as typeof caseTypeFilter)}>
                <option value="all">Все случаи</option>
                <option value="insurance">Страховой случай</option>
                <option value="non_insurance">Нестраховой случай</option>
              </select>
              <select value={paymentStateFilter} onChange={(event) => setPaymentStateFilter(event.target.value as typeof paymentStateFilter)}>
                <option value="all">Оплата: все</option>
                <option value="paid">Оплачен</option>
                <option value="unpaid">Не оплачен</option>
              </select>
              <select value={payerFilter} onChange={(event) => setPayerFilter(event.target.value as typeof payerFilter)}>
                <option value="all">Все плательщики</option>
                <option value="insurance">Страховая</option>
                <option value="driver">Водитель</option>
                <option value="company">Компания</option>
              </select>
              <input value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} placeholder="Фильтр по бригадиру" />
              <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Поиск по авто, водителю и СТО" />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={showHistoricalInList} onChange={(event) => setShowHistoricalInList(event.target.checked)} />
              <span>Показать закрытые и архив</span>
            </label>
            {canCreate && serviceRows.length ? (
              <div className="toolbar">
                <button type="button" onClick={toggleSelectAll}>
                  {allSelected ? "Снять выбор" : "Выбрать все"}
                </button>
                <span className="panel-note">Выбрано: {selectedCount}</span>
                <button type="button" onClick={() => void handleBulkStatusUpdate("in_repair")} disabled={!selectedCount}>
                  Массово в ремонт
                </button>
                <button type="button" onClick={() => void handleBulkStatusUpdate("completed")} disabled={!selectedCount}>
                  Массово завершить
                </button>
                <button type="button" onClick={() => void handleBulkStatusUpdate("written_off")} disabled={!selectedCount}>
                  Массово списать
                </button>
                <button type="button" onClick={() => void handleBulkStatusUpdate("archived")} disabled={!selectedCount}>
                  Массово в архив
                </button>
              </div>
            ) : null}
          </div>
          <AsyncState
            loading={incidentsApi.loading || driversApi.loading || vehiclesApi.loading}
            error={incidentsApi.error || driversApi.error || vehiclesApi.error}
            empty={!serviceRows.length}
            emptyContent={
              <EmptyStatePanel
                title="Кейсов СТО по фильтру нет"
                message="Измените фильтры или откройте инциденты, чтобы увидеть нужный ремонт в живой очереди."
              />
            }
          >
            <div className="table-scroll">
              <table className="data-table service-table">
                <thead>
                  <tr>
                    <th />
                    <th>Авто и водитель</th>
                    <th>Кейс</th>
                    <th>Расходы</th>
                    <th>Оплата</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceRows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {canCreate ? (
                          <input
                            type="checkbox"
                            checked={selectedIncidentIds.includes(item.id)}
                            onChange={() => toggleIncidentSelection(item.id)}
                          />
                        ) : null}
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{item.carId ? (vehicleLabelMap.get(item.carId) ?? formatShortId(item.carId)) : "Авто не указано"}</strong>
                          <span>{item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "Водитель не указан"}</span>
                          <span>{item.driverId ? driverCompanyMap.get(item.driverId) : item.carId ? vehicleCompanyMap.get(item.carId) : ""}</span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong title={item.description ?? item.title}>{item.description ?? item.title}</strong>
                          <span>{formatRepairPeriodLabel(item.occurredAt, item.periodLabel)}</span>
                          <span title={item.repairNote ?? ""}>{item.repairNote ?? "СТО не указано"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{formatCurrency(item.amount ?? 0)}</strong>
                          <span>Страховка {formatCurrency(item.insuranceCompensationAmount ?? 0)}</span>
                          <span>Вычет {formatCurrency(item.writeoffAmount ?? 0)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{getServiceCaseType(item)}</strong>
                          <span>{getServicePaymentStatus(item)}</span>
                          <span>{getServicePayer(item)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <span className={getStatusTone(item.status)}>{getServiceWorkflowLabel(item)}</span>
                          <span className={getStatusTone(item.priority)}>{getIncidentPriorityLabel(item.priority)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions row-actions--vertical">
                          {canCreate && getServiceStage(item) === "awaiting_repair" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "in_repair")}>В ремонт</button> : null}
                          {canCreate && getServiceStage(item) !== "completed" && item.status !== "archived" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "completed")}>Завершить</button> : null}
                          {canCreate && getServiceStage(item) !== "written_off" && item.status !== "archived" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "written_off")}>Списать</button> : null}
                          {canCreate && item.status !== "archived" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "archived")}>В архив</button> : null}
                          <Link className="table-link" to="/incidents?view=operations">Инциденты</Link>
                          {item.carId ? <Link className="table-link" to={`/vehicles/${item.carId}`}>Авто</Link> : null}
                          {item.driverId ? <Link className="table-link" to={`/drivers/${item.driverId}`}>Водитель</Link> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncState>
        </article>
      </div>
    </section>
  );
}
