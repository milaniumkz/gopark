import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { patchJson } from "../lib/api";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { CarIcon, ContractsIcon, DriversIcon, FinanceIcon } from "../ui/CrmIcons";
import {
  downloadCsvTable,
  formatDateOnly,
  formatShortId,
  getIncidentPriorityLabel,
  getStatusLabel,
  getStatusTone,
} from "../lib/utils";
import type { ContractListItem, DriverListItem, ManagerIncidentItem, VehicleListItem } from "@gopark/contracts";

type CreateIncidentInput = {
  title: string;
  incidentType: string;
  status: string;
  priority: string;
  driverId?: string | null;
  carId?: string | null;
  occurredAt?: string | null;
  description?: string | null;
  accidentPhotoUrl?: string | null;
  insuranceNote?: string | null;
  repairNote?: string | null;
  serviceStage?: string | null;
  locationNote?: string | null;
  managerLabel?: string | null;
};

type UpdateIncidentInput = Partial<CreateIncidentInput>;

function getIncidentTypeLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    accident: "ДТП",
    insurance: "Страховка",
    repair: "СТО",
    fine: "Штраф",
    inspection: "Осмотр",
    blacklist: "Чёрный список",
    insurance_gps: "Страховка и ТО",
    finance: "Финансовый риск",
    general: "Инцидент",
  };

  return labels[type ?? "general"] ?? type ?? "Инцидент";
}

function isAccidentIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "accident" || item.title.toLowerCase().includes("дтп");
}

export function IncidentsPage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const api = useApiQuery<ManagerIncidentItem[]>("incidents");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createIncident = useApiMutation<ManagerIncidentItem, CreateIncidentInput>("incidents");
  const canCreateIncident = hasCrmCapability(session.requestUserRole, "create-driver") || ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const canUpdateIncident = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const vehicles = useMemo(() => vehiclesApi.data ?? [], [vehiclesApi.data]);
  const contracts = useMemo(() => contractsApi.data ?? [], [contractsApi.data]);
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
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
  const vehicleModelMap = useMemo(() => new Map(vehicles.map((item) => [item.id, `${item.make} ${item.model}`.trim()])), [vehicles]);
  const contractByCarId = useMemo(() => new Map(contracts.map((item) => [item.carId, item])), [contracts]);
  const canOpenContractDetail = hasCrmAccess(session.requestUserRole, "contract-detail");
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const incidents = useMemo(() => api.data ?? [], [api.data]);
  const accidentIncidents = useMemo(() => incidents.filter(isAccidentIncident), [incidents]);
  const highPriorityCount = incidents.filter((item) => item.priority === "high").length;
  const openCount = incidents.filter((item) => item.status === "open").length;
  const withDriverCount = incidents.filter((item) => item.driverId).length;
  const withVehicleCount = incidents.filter((item) => item.carId).length;
  const [title, setTitle] = useState("ДТП");
  const [incidentType, setIncidentType] = useState("accident");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("high");
  const [driverId, setDriverId] = useState("");
  const [carId, setCarId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [description, setDescription] = useState("");
  const [insuranceNote, setInsuranceNote] = useState("");
  const [repairNote, setRepairNote] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [managerLabel, setManagerLabel] = useState("");
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [bulkPriority, setBulkPriority] = useState("keep");
  const [bulkManagerLabel, setBulkManagerLabel] = useState("keep");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "closed" | "written_off" | "archived">("open");
  const [typeFilter, setTypeFilter] = useState<"all" | string>("all");
  const [managerFilter, setManagerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showHistoricalInList, setShowHistoricalInList] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isIncidentFormOpen, setIsIncidentFormOpen] = useState(false);

  useEffect(() => {
    if (driverId) {
      const matchedVehicle = vehicles.find((item) => item.assignedDriverId === driverId);
      if (matchedVehicle && !carId) {
        setCarId(matchedVehicle.id);
      }
    }
  }, [driverId, carId, vehicles]);

  const filteredIncidents = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const normalizedManager = managerFilter.trim().toLowerCase();

    return incidents.filter((item) => {
      if (!showHistoricalInList && statusFilter !== "closed" && statusFilter !== "written_off" && (item.status === "closed" || item.status === "archived")) {
        return false;
      }
      if (statusFilter === "written_off" && item.serviceStage !== "written_off") {
        return false;
      }
      if (statusFilter !== "all" && statusFilter !== "written_off" && item.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== "all" && item.incidentType !== typeFilter) {
        return false;
      }
      if (searchFilter === "__priority_high__" && item.priority !== "high") {
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

      const vehicleLabel = item.carId ? vehicleMap.get(item.carId) ?? "" : "";
      const driverLabel = item.driverId ? driverMap.get(item.driverId) ?? "" : "";
      const haystack = [
        item.title,
        item.description ?? "",
        item.insuranceNote ?? "",
        item.repairNote ?? "",
        item.locationNote ?? "",
        item.managerLabel ?? "",
        item.incidentType ?? "",
        item.priority ?? "",
        vehicleLabel,
        driverLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [driverMap, incidents, managerFilter, matchesCompany, searchFilter, showHistoricalInList, statusFilter, typeFilter, vehicleMap]);
  const accidentRows = useMemo(
    () =>
      [...filteredIncidents.filter(isAccidentIncident)].sort((left, right) =>
        (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""),
      ),
    [filteredIncidents],
  );
  const selectedCount = selectedIncidentIds.length;
  const allSelected = filteredIncidents.length > 0 && selectedCount === filteredIncidents.length;
  const availableTypes = useMemo(
    () => Array.from(new Set(incidents.map((item) => item.incidentType).filter(Boolean))).sort(),
    [incidents],
  );
  const visibleOpenCount = filteredIncidents.filter((item) => item.status === "open").length;
  const visibleHighPriorityCount = filteredIncidents.filter((item) => item.priority === "high").length;
  const archivedCount = incidents.filter((item) => item.status === "archived").length;

  useEffect(() => {
    setSelectedIncidentIds((current) =>
      current.filter((incidentId) => filteredIncidents.some((item) => item.id === incidentId)),
    );
  }, [filteredIncidents]);

  function resetForm(): void {
    setEditingIncidentId(null);
    setTitle("ДТП");
    setIncidentType("accident");
    setStatus("open");
    setPriority("high");
    setDriverId("");
    setCarId("");
    setOccurredAt("");
    setDescription("");
    setInsuranceNote("");
    setRepairNote("");
    setLocationNote("");
    setManagerLabel("");
    setIsIncidentFormOpen(false);
  }

  function toggleIncidentSelection(incidentId: string): void {
    setSelectedIncidentIds((current) =>
      current.includes(incidentId) ? current.filter((id) => id !== incidentId) : [...current, incidentId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedIncidentIds(allSelected ? [] : filteredIncidents.map((item) => item.id));
  }

  function applyPresetView(view: "operations" | "accidents" | "finance" | "archive"): void {
    if (view === "operations") {
      setStatusFilter("open");
      setTypeFilter("all");
      setManagerFilter("");
      setSearchFilter("");
      setShowHistoricalInList(false);
      return;
    }
    if (view === "accidents") {
      setStatusFilter("open");
      setTypeFilter("accident");
      setManagerFilter("");
      setSearchFilter("");
      setShowHistoricalInList(false);
      return;
    }

    if (view === "finance") {
      setStatusFilter("open");
      setTypeFilter("all");
      setManagerFilter("");
      setSearchFilter("страх");
      setShowHistoricalInList(false);
      return;
    }

    setStatusFilter("archived");
    setTypeFilter("all");
    setManagerFilter("");
    setSearchFilter("");
    setShowHistoricalInList(true);
  }

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "operations" || view === "accidents" || view === "finance" || view === "archive") {
      applyPresetView(view);
    }
  }, [searchParams]);

  function startEditing(item: ManagerIncidentItem): void {
    setEditingIncidentId(item.id);
    setTitle(item.title);
    setIncidentType(item.incidentType || "general");
    setStatus(item.status);
    setPriority(item.priority);
    setDriverId(item.driverId ?? "");
    setCarId(item.carId ?? "");
    setOccurredAt(item.occurredAt ?? "");
    setDescription(item.description ?? "");
    setInsuranceNote(item.insuranceNote ?? "");
    setRepairNote(item.repairNote ?? "");
    setLocationNote(item.locationNote ?? "");
    setManagerLabel(item.managerLabel ?? "");
    setIsIncidentFormOpen(true);
    setFormMessage(`Редактирование кейса ${formatShortId(item.id)}.`);
  }

  function handleExport(): void {
    if (!api.data?.length) {
      return;
    }

    downloadCsvTable(
      "gopark-incidents.csv",
      ["incident", "company", "type", "title", "status", "priority", "driver", "vehicle", "occurred_at", "description", "insurance_note", "repair_note", "location_note", "manager"],
      api.data.map((item) => [
        formatShortId(item.id),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : item.carId ? (vehicleCompanyMap.get(item.carId) ?? "") : "",
        getIncidentTypeLabel(item.incidentType),
        item.title,
        getStatusLabel(item.status),
        getIncidentPriorityLabel(item.priority),
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        item.carId ? (vehicleMap.get(item.carId) ?? formatShortId(item.carId)) : "",
        item.occurredAt ?? "",
        item.description ?? "",
        item.insuranceNote ?? "",
        item.repairNote ?? "",
        item.locationNote ?? "",
        item.managerLabel ?? "",
      ]),
    );
  }

  async function handleCreateIncident(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormMessage(null);

    if (!title.trim() || !incidentType.trim() || !status.trim() || !priority.trim()) {
      setFormMessage("Заполните тип, название, статус и приоритет.");
      return;
    }

    if (!driverId && !carId) {
      setFormMessage("Нужно привязать ДТП хотя бы к водителю или автомобилю.");
      return;
    }

    try {
      const payload: CreateIncidentInput | UpdateIncidentInput = {
        title: title.trim(),
        incidentType,
        status,
        priority,
        driverId: driverId || null,
        carId: carId || null,
        occurredAt: occurredAt || null,
        description: description.trim() || null,
        insuranceNote: insuranceNote.trim() || null,
        repairNote: repairNote.trim() || null,
        locationNote: locationNote.trim() || null,
        managerLabel: managerLabel.trim() || null,
      };

      const incident = editingIncidentId
        ? await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${editingIncidentId}`, payload)
        : await createIncident.mutate(payload as CreateIncidentInput);

      if (!incident) {
        setFormMessage("Инцидент не найден.");
        return;
      }

      setFormMessage(editingIncidentId ? `Кейс обновлён: ${incident.title}.` : `Инцидент зарегистрирован: ${incident.title}.`);
      await api.refetch();
      resetForm();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : editingIncidentId ? "Не удалось обновить инцидент." : "Не удалось зарегистрировать инцидент.");
    }
  }

  function canWriteOffVehicle(item: ManagerIncidentItem): boolean {
    return item.incidentType === "accident" || item.incidentType === "repair";
  }

  async function handleQuickStatusUpdate(item: ManagerIncidentItem, nextStatus: "resolved" | "closed" | "written_off"): Promise<void> {
    setFormMessage(null);
    const incidentStatus = nextStatus === "written_off" ? "closed" : nextStatus;

    try {
      const updated = await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${item.id}`, {
        status: incidentStatus,
        serviceStage: nextStatus === "written_off" ? "written_off" : item.serviceStage,
        repairNote: nextStatus === "written_off" ? (item.repairNote ?? "Не подлежит восстановлению") : item.repairNote,
      });
      if (!updated) {
        setFormMessage("Инцидент не найден.");
        return;
      }
      if (nextStatus === "written_off" && item.carId) {
        await patchJson(`cars/${item.carId}`, { status: "written_off" });
        await vehiclesApi.refetch();
      }

      await api.refetch();
      setFormMessage(`Кейс ${formatShortId(item.id)} переведён в статус «${getStatusLabel(nextStatus)}».`);
      if (editingIncidentId === item.id) {
        setEditingIncidentId(null);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось обновить статус кейса.");
    }
  }

  async function handleBulkStatusUpdate(nextStatus: "resolved" | "closed" | "written_off"): Promise<void> {
    if (!selectedIncidentIds.length) {
      setFormMessage("Выберите хотя бы один кейс для массового действия.");
      return;
    }

    setFormMessage(null);
    let updatedCount = 0;

    try {
      for (const incidentId of selectedIncidentIds) {
        const sourceIncident = filteredIncidents.find((item) => item.id === incidentId);
        const incidentStatus = nextStatus === "written_off" ? "closed" : nextStatus;
        const updated = await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${incidentId}`, {
          status: incidentStatus,
          serviceStage: nextStatus === "written_off" ? "written_off" : sourceIncident?.serviceStage,
          repairNote: nextStatus === "written_off" ? (sourceIncident?.repairNote ?? "Не подлежит восстановлению") : sourceIncident?.repairNote,
        });
        if (updated) {
          updatedCount += 1;
          if (nextStatus === "written_off" && sourceIncident?.carId) {
            await patchJson(`cars/${sourceIncident.carId}`, { status: "written_off" });
          }
        }
      }

      await api.refetch();
      if (nextStatus === "written_off") {
        await vehiclesApi.refetch();
      }
      setSelectedIncidentIds([]);
      setFormMessage(`Массовое действие выполнено: ${updatedCount} кейсов переведены в статус «${getStatusLabel(nextStatus)}».`);
      if (editingIncidentId && !selectedIncidentIds.includes(editingIncidentId)) {
        setEditingIncidentId(null);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое обновление кейсов.");
    }
  }

  async function handleBulkArchive(): Promise<void> {
    if (!selectedIncidentIds.length) {
      setFormMessage("Выберите хотя бы один кейс для архивации.");
      return;
    }

    setFormMessage(null);
    let updatedCount = 0;

    try {
      for (const incidentId of selectedIncidentIds) {
        const updated = await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${incidentId}`, {
          status: "archived",
        });
        if (updated) {
          updatedCount += 1;
        }
      }

      await api.refetch();
      setSelectedIncidentIds([]);
      setFormMessage(`В архив перемещено ${updatedCount} кейсов.`);
      if (editingIncidentId && !selectedIncidentIds.includes(editingIncidentId)) {
        setEditingIncidentId(null);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось отправить кейсы в архив.");
    }
  }

  async function handleBulkPriorityUpdate(): Promise<void> {
    if (!selectedIncidentIds.length) {
      setFormMessage("Выберите хотя бы один кейс для массового обновления приоритета.");
      return;
    }

    if (bulkPriority === "keep") {
      setFormMessage("Выберите новый приоритет.");
      return;
    }

    setFormMessage(null);
    let updatedCount = 0;

    try {
      for (const incidentId of selectedIncidentIds) {
        const updated = await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${incidentId}`, {
          priority: bulkPriority,
        });
        if (updated) {
          updatedCount += 1;
        }
      }

      await api.refetch();
      setSelectedIncidentIds([]);
      setBulkPriority("keep");
      setFormMessage(`Приоритет обновлён для ${updatedCount} кейсов.`);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось массово обновить приоритет кейсов.");
    }
  }

  async function handleBulkManagerLabelUpdate(): Promise<void> {
    if (!selectedIncidentIds.length) {
      setFormMessage("Выберите хотя бы один кейс для массового обновления ответственного.");
      return;
    }

    if (bulkManagerLabel === "keep") {
      setFormMessage("Выберите ответственного бригадира или вариант снятия.");
      return;
    }

    setFormMessage(null);
    let updatedCount = 0;

    try {
      for (const incidentId of selectedIncidentIds) {
        const updated = await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${incidentId}`, {
          managerLabel: bulkManagerLabel === "" ? null : bulkManagerLabel,
        });
        if (updated) {
          updatedCount += 1;
        }
      }

      await api.refetch();
      setSelectedIncidentIds([]);
      setBulkManagerLabel("keep");
      setFormMessage(`Ответственный обновлён для ${updatedCount} кейсов.`);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось массово обновить ответственного по кейсам.");
    }
  }

  async function handleArchiveOne(item: ManagerIncidentItem): Promise<void> {
    setFormMessage(null);

    try {
      const updated = await patchJson<ManagerIncidentItem | null, UpdateIncidentInput>(`incidents/${item.id}`, {
        status: "archived",
      });
      if (!updated) {
        setFormMessage("Инцидент не найден.");
        return;
      }

      await api.refetch();
      setFormMessage(`Кейс ${formatShortId(item.id)} отправлен в архив.`);
      if (editingIncidentId === item.id) {
        setEditingIncidentId(null);
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось отправить кейс в архив.");
    }
  }

  return (
    <>
    <section className="page-stack incidents-page">
      <div className="hero-card">
        <p className="eyebrow">Инциденты</p>
        <h2>Инциденты автопарка</h2>
        <p>ДТП, страховка, СТО, штрафстоянка и другие проблемные случаи с полями как в ручных таблицах.</p>
        <div className="toolbar">
          {incidents.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
          <button type="button" onClick={() => applyPresetView("operations")}>
            Операционный вид
          </button>
          <button type="button" onClick={() => applyPresetView("accidents")}>
            Только ДТП
          </button>
          <button type="button" onClick={() => applyPresetView("finance")}>
            Страховка и СТО
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("archived");
              setTypeFilter("all");
              setManagerFilter("");
              setSearchFilter("");
              setShowHistoricalInList(true);
            }}
          >
            Архив
          </button>
        </div>
        {!canCreateIncident ? <ReadOnlyNotice message="Для этой роли создание инцидентов недоступно." /> : null}
      </div>

      <div className="stats-grid">
        <StatCard
          title="Всего инцидентов"
          value={String(incidents.length)}
          subtitle="Текущий список"
          tone="blue"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("all");
            setTypeFilter("all");
            setShowHistoricalInList(true);
          }}
        />
        <StatCard
          title="Открытые"
          value={String(visibleOpenCount)}
          subtitle="В текущем представлении"
          tone="orange"
          icon={<ContractsIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("open");
            setShowHistoricalInList(false);
          }}
        />
        <StatCard
          title="ДТП"
          value={String(accidentIncidents.length)}
          subtitle="Отдельный контур аварийных кейсов"
          tone="orange"
          icon={<CarIcon width={18} height={18} />}
          onClick={() => {
            setTypeFilter("accident");
            setStatusFilter("all");
            setShowHistoricalInList(true);
          }}
        />
        <StatCard
          title="Высокий приоритет"
          value={String(visibleHighPriorityCount)}
          subtitle={`${withVehicleCount} связаны с машиной, ${withDriverCount} с водителем`}
          tone="purple"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("all");
            setTypeFilter("all");
            setSearchFilter("__priority_high__");
            setShowHistoricalInList(true);
          }}
        />
        <StatCard
          title="В архиве"
          value={String(archivedCount)}
          subtitle="Исторические кейсы"
          tone="purple"
          icon={<ContractsIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("archived");
            setTypeFilter("all");
            setShowHistoricalInList(true);
          }}
        />
      </div>

      <article className="panel">
        <div className="panel__title">
          <ContractsIcon width={18} height={18} />
          <h3>Фильтры и представления</h3>
        </div>
        <div className="toolbar">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="open">Только открытые</option>
            <option value="resolved">Только решённые</option>
            <option value="closed">Только закрытые</option>
            <option value="written_off">Только списанные</option>
            <option value="archived">Только архив</option>
            <option value="all">Все статусы</option>
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Все типы</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {getIncidentTypeLabel(type)}
              </option>
            ))}
          </select>
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Все компании</option>
            {companies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} placeholder="Фильтр по бригадиру" />
          <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Поиск по описанию, водителю, авто" />
          {canCreateIncident ? (
            <button type="button" onClick={() => setIsIncidentFormOpen((current) => !current)}>
              {isIncidentFormOpen ? "Скрыть кейс" : "Добавить кейс"}
            </button>
          ) : null}
          <label className="table-link" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={showHistoricalInList} onChange={(event) => setShowHistoricalInList(event.target.checked)} />
            Показать закрытые и архив
          </label>
        </div>
        <div className="panel-note">
          В выборке сейчас {filteredIncidents.length} кейсов из {incidents.length}.
        </div>
      </article>

      <div className="table-grid">
        {isIncidentFormOpen ? (
        <article className="panel">
          <div className="panel__title">
            <CarIcon width={18} height={18} />
            <h3>{editingIncidentId ? "Редактирование кейса" : "Новый кейс ДТП"}</h3>
          </div>
          {canCreateIncident ? (
            <form className="quick-form" onSubmit={(event) => void handleCreateIncident(event)}>
              <p className="quick-form__meta">
                {editingIncidentId
                  ? "Исправьте детали кейса или переведите его в решённый/закрытый статус без ручных таблиц."
                  : "Бригадир или финансист может сразу зафиксировать ДТП, НСК и СТО, чтобы запись попала в отчёты."}
              </p>
              <select value={incidentType} onChange={(event) => setIncidentType(event.target.value)}>
                <option value="accident">ДТП</option>
                <option value="insurance">Страховка</option>
                <option value="repair">СТО</option>
                <option value="fine">Штраф</option>
                <option value="inspection">Осмотр</option>
                <option value="blacklist">Чёрный список</option>
                <option value="general">Общий инцидент</option>
              </select>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название кейса" />
              <div className="toolbar">
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="open">Открыт</option>
                  <option value="resolved">Решён</option>
                  <option value="closed">Закрыт</option>
                </select>
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  <option value="high">Высокий</option>
                  <option value="medium">Средний</option>
                  <option value="low">Низкий</option>
                </select>
              </div>
              <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                <option value="">Без привязки к водителю</option>
                {visibleDrivers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <select value={carId} onChange={(event) => setCarId(event.target.value)}>
                <option value="">Без привязки к авто</option>
                {visibleVehicles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.plateNumber} · {item.make} {item.model}
                  </option>
                ))}
              </select>
              <input type="date" value={occurredAt} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setOccurredAt(event.target.value)} />
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Описание ДТП / что повреждено / с кем столкнулся" rows={4} />
              <textarea value={insuranceNote} onChange={(event) => setInsuranceNote(event.target.value)} placeholder="НСК / страховой статус / когда заехал и вышел" rows={3} />
              <textarea value={repairNote} onChange={(event) => setRepairNote(event.target.value)} placeholder="СТО / ремонт / детали / сумма" rows={3} />
              <input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} placeholder="ГАИ / штрафстоянка / локация" />
              <input value={managerLabel} onChange={(event) => setManagerLabel(event.target.value)} placeholder="Бригадир / ответственный" />
              {formMessage ? <div className="panel-note">{formMessage}</div> : null}
              {createIncident.error ? <div className="panel-note">Ошибка создания: {createIncident.error}</div> : null}
              <div className="toolbar">
                <button type="submit" disabled={createIncident.loading}>
                  {createIncident.loading ? "Сохраняем..." : editingIncidentId ? "Сохранить кейс" : "Зарегистрировать кейс"}
                </button>
                {editingIncidentId ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      resetForm();
                      setFormMessage("Редактирование отменено.");
                    }}
                  >
                    Отменить редактирование
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <ReadOnlyNotice message="Создание инцидентов для этой роли недоступно." />
          )}
        </article>
        ) : null}

        <article className="panel">
          <div className="panel__title">
            <DriversIcon width={18} height={18} />
            <h3>ДТП в работе</h3>
          </div>
          <AsyncState
            loading={api.loading}
            error={api.error}
            empty={!accidentRows.length}
            emptyContent={
              <EmptyStatePanel
                title="ДТП пока нет"
                message="Новые аварийные кейсы появятся здесь сразу после регистрации."
              />
            }
          >
            <div className="summary-list">
              {accidentRows.slice(0, 6).map((item) => (
                <div key={item.id}>
                  <span>
                    {(item.carId ? vehicleMap.get(item.carId) : "") || "Авто не указано"} ·{" "}
                    {(item.driverId ? driverMap.get(item.driverId) : "") || "Водитель не указан"}
                  </span>
                  <strong>{item.occurredAt ? `ДТП ${formatDateOnly(item.occurredAt)}` : item.title}</strong>
                  <div className="toolbar">
                    <Link className="table-link" to="/reports">
                      Открыть отчёты
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
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!filteredIncidents.length}
        emptyContent={
          <EmptyStatePanel
            title="Кейсов по фильтру нет"
            message="Измените статус, тип или поиск, чтобы увидеть другие кейсы."
          />
        }
      >
        <article className="panel">
          {canUpdateIncident ? (
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <button type="button" onClick={toggleSelectAll}>
                {allSelected ? "Снять выбор" : "Выбрать все"}
              </button>
              <span>Выбрано: {selectedCount}</span>
              {selectedCount ? (
                <>
                  <button type="button" onClick={() => void handleBulkStatusUpdate("resolved")}>
                    Массово решить
                  </button>
	                  <button type="button" onClick={() => void handleBulkStatusUpdate("closed")}>
	                    Массово закрыть
	                  </button>
	                  <button type="button" onClick={() => void handleBulkStatusUpdate("written_off")}>
	                    Массово списать авто
	                  </button>
	                  <button type="button" onClick={() => void handleBulkArchive()}>
	                    Массово в архив
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {canUpdateIncident ? (
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <select value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}>
                <option value="keep">Приоритет без изменений</option>
                <option value="high">Высокий</option>
                <option value="medium">Средний</option>
                <option value="low">Низкий</option>
              </select>
              <button type="button" onClick={() => void handleBulkPriorityUpdate()} disabled={!selectedCount}>
                Массово сменить приоритет
              </button>
              <select value={bulkManagerLabel} onChange={(event) => setBulkManagerLabel(event.target.value)}>
                <option value="keep">Бригадир без изменений</option>
                <option value="">Снять бригадира</option>
                <option value="Бригадир 1">Бригадир 1</option>
                <option value="Бригадир 2">Бригадир 2</option>
                <option value="Финансовый контур">Финансовый контур</option>
                <option value="СТО">СТО</option>
              </select>
              <button type="button" onClick={() => void handleBulkManagerLabelUpdate()} disabled={!selectedCount}>
                Массово сменить ответственного
              </button>
            </div>
          ) : null}
          <table className="data-table incidents-table">
            <thead>
              <tr>
                {canUpdateIncident ? <th>Выбор</th> : null}
                <th>Инцидент</th>
                <th>Тип / дата</th>
                <th>Водитель / авто</th>
                <th>Детали</th>
                <th>Бригадир</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.map((item) => {
                const relatedContract = item.carId ? contractByCarId.get(item.carId) : null;

                return (
                  <tr key={item.id}>
                    {canUpdateIncident ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIncidentIds.includes(item.id)}
                          onChange={() => toggleIncidentSelection(item.id)}
                          aria-label={`Выбрать кейс ${formatShortId(item.id)}`}
                        />
                      </td>
                    ) : null}
                    <td>
                      <div className="amount-stack">
                        <strong>{formatShortId(item.id)}</strong>
                        <div className="row-actions">
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
                          {item.carId && canOpenContractDetail && relatedContract ? (
                            <Link className="table-link" to={`/contracts/${relatedContract.id}`}>
                              Открыть договор
                            </Link>
                          ) : null}
                          {item.carId && canOpenFinancialOps && relatedContract?.currentDebt ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=payment&source=incidents&driverId=${relatedContract.driverId}&contractId=${relatedContract.id}&amount=${relatedContract.nextDueAmount ?? relatedContract.currentDebt}`}
                            >
                              Платёж
                            </Link>
                          ) : null}
                          {canUpdateIncident ? (
                            <button type="button" className="table-link" onClick={() => startEditing(item)}>
                              Редактировать
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="amount-stack">
                        <strong>{getIncidentTypeLabel(item.incidentType)}</strong>
                        <span>{item.title}</span>
                        <span>{item.occurredAt ? formatDateOnly(item.occurredAt) : "Дата не указана"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="amount-stack">
                        {item.driverId && driverMap.get(item.driverId) ? (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            {driverMap.get(item.driverId)}
                          </Link>
                        ) : (
                          <span>Водитель не указан</span>
                        )}
                        {item.carId ? (
                          <strong>
                            <Link className="table-link" to={`/vehicles/${item.carId}`}>
                              {vehicleMap.get(item.carId) ?? formatShortId(item.carId)}
                            </Link>
                          </strong>
                        ) : (
                          <span>Авто не указано</span>
                        )}
                        {item.carId ? (
                          <span>{vehicleModelMap.get(item.carId) ?? "Модель не указана"}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="amount-stack">
                        <strong>{item.description ?? "Описание не указано"}</strong>
                        {item.insuranceNote ? <span>НСК: {item.insuranceNote}</span> : null}
                        {item.repairNote ? <span>СТО: {item.repairNote}</span> : null}
                        {item.locationNote ? <span>Локация: {item.locationNote}</span> : null}
                        {item.accidentPhotoUrl?.startsWith("data:image/") ? (
                          <button type="button" className="photo-preview-button photo-preview-button--small" onClick={() => setPhotoPreviewUrl(item.accidentPhotoUrl ?? null)}>
                            <img src={item.accidentPhotoUrl} alt="Фото ДТП" className="photo-preview-image photo-preview-image--contain" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{item.managerLabel ?? "—"}</td>
                    <td>
                      <div className="amount-stack">
                        <strong><span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span></strong>
                        <span>{getIncidentPriorityLabel(item.priority)}</span>
                        {canUpdateIncident ? (
                          <div className="row-actions">
                            {item.status !== "resolved" ? (
                              <button type="button" className="table-link" onClick={() => void handleQuickStatusUpdate(item, "resolved")}>
                                Решить
                              </button>
                            ) : null}
	                            {item.status !== "closed" ? (
	                              <button type="button" className="table-link" onClick={() => void handleQuickStatusUpdate(item, "closed")}>
	                                Закрыть
	                              </button>
	                            ) : null}
	                            {canWriteOffVehicle(item) && item.serviceStage !== "written_off" ? (
	                              <button type="button" className="table-link" onClick={() => void handleQuickStatusUpdate(item, "written_off")}>
	                                Списать
	                              </button>
	                            ) : null}
	                            {item.status !== "archived" ? (
                              <button type="button" className="table-link" onClick={() => void handleArchiveOne(item)}>
                                В архив
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
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
