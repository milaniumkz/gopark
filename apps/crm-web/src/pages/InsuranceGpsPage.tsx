import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DriverListItem, ManagerIncidentItem, VehicleListItem } from "@gopark/contracts";
import { patchJson } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../ui/AuthContext";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { CarIcon, DriversIcon, FinanceIcon, ReportsIcon, ShieldIcon } from "../ui/CrmIcons";
import {
  downloadCsvTable,
  formatCurrency,
  formatDateOnly,
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
  driverId?: string | null;
  carId?: string | null;
  occurredAt?: string | null;
  periodLabel?: string | null;
  amount?: number | null;
  description?: string | null;
  insuranceNote?: string | null;
  locationNote?: string | null;
  managerLabel?: string | null;
};

function isInsuranceGpsIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "insurance_gps";
}

function isExemptInsuranceGpsIncident(item: ManagerIncidentItem): boolean {
  const haystack = [item.description, item.insuranceNote, item.locationNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("осв") || haystack.includes("освоб");
}

function getInsuranceGpsBreakdown(item: ManagerIncidentItem): string {
  const parts = [item.insuranceNote, item.locationNote].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Разбивка не указана";
}

type InsuranceToFilter = "all" | "expired" | "soon" | "missing" | "oil" | "mileage";
type InsuranceToChip = "osago" | "casco" | "inspection" | "engine" | "gearbox";
type DocumentStatus = "missing" | "active" | "soon" | "expired";
type InsuranceToEditForm = {
  mileage: string;
  hasOsago: boolean;
  osagoStartDate: string;
  osagoEndDate: string;
  hasCasco: boolean;
  cascoStartDate: string;
  cascoEndDate: string;
  hasInspection: boolean;
  technicalInspectionStartDate: string;
  technicalInspectionEndDate: string;
  engineOilReplacementKm: string;
  gearboxOilReplacementKm: string;
};

function addDaysDateOnly(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addOneYearDateOnly(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function getDocumentStatus(endDate?: string | null): DocumentStatus {
  if (!endDate) {
    return "missing";
  }

  const today = new Date().toISOString().slice(0, 10);
  if (endDate < today) {
    return "expired";
  }

  return endDate <= addDaysDateOnly(today, 14) ? "soon" : "active";
}

function getDocumentStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case "active":
      return "Активно";
    case "soon":
      return "Истекает";
    case "expired":
      return "Просрочено";
    default:
      return "Нет";
  }
}

export function InsuranceGpsPage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canCreate = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "closed" | "archived">("open");
  const [managerFilter, setManagerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showHistoricalInList, setShowHistoricalInList] = useState(false);
  const [showOnlyExempt, setShowOnlyExempt] = useState(false);
  const [activeFilter, setActiveFilter] = useState<InsuranceToFilter>("all");
  const [activeChip, setActiveChip] = useState<InsuranceToChip>("osago");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [editingVehicle, setEditingVehicle] = useState<VehicleListItem | null>(null);
  const [editForm, setEditForm] = useState<InsuranceToEditForm>({
    mileage: "",
    hasOsago: false,
    osagoStartDate: "",
    osagoEndDate: "",
    hasCasco: false,
    cascoStartDate: "",
    cascoEndDate: "",
    hasInspection: false,
    technicalInspectionStartDate: "",
    technicalInspectionEndDate: "",
    engineOilReplacementKm: "",
    gearboxOilReplacementKm: "",
  });
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);

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
  const driverMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.fullName])), [drivers]);
  const vehicleLabelMap = useMemo(() => new Map(vehicles.map((item) => [item.id, `${item.plateNumber} · ${item.make} ${item.model}`])), [vehicles]);
  const insuranceGpsIncidents = useMemo(() => incidents.filter(isInsuranceGpsIncident), [incidents]);
  const rows = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const normalizedManager = managerFilter.trim().toLowerCase();

    return [...insuranceGpsIncidents]
      .filter((item) => {
        if (!showHistoricalInList && (item.status === "closed" || item.status === "archived")) {
          return false;
        }
        if (statusFilter !== "all" && item.status !== statusFilter) {
          return false;
        }
        if (showOnlyExempt && !isExemptInsuranceGpsIncident(item)) {
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
          item.periodLabel ?? "",
          item.description ?? "",
          item.insuranceNote ?? "",
          item.locationNote ?? "",
          item.managerLabel ?? "",
          vehicleLabel,
          driverLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => {
        const leftKey = left.periodLabel ?? left.occurredAt ?? left.id;
        const rightKey = right.periodLabel ?? right.occurredAt ?? right.id;
        return rightKey.localeCompare(leftKey);
      });
  }, [driverMap, insuranceGpsIncidents, managerFilter, matchesCompany, searchFilter, showHistoricalInList, showOnlyExempt, statusFilter, vehicleLabelMap]);
  const currentMonthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date());
  const currentMonthRows = rows.filter((item) => (item.periodLabel ?? "").toLowerCase() === currentMonthLabel.toLowerCase());
  const exemptRows = rows.filter(isExemptInsuranceGpsIncident);
  const totalAmount = rows.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const openCount = rows.filter((item) => item.status === "open").length;
  const archivedCount = insuranceGpsIncidents.filter((item) => item.status === "archived").length;
  const selectedCount = selectedIncidentIds.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const vehicleRows = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();

    return vehicles
      .filter((vehicle) => companyFilter === "all" || (vehicle.companyName ?? "") === companyFilter)
      .map((vehicle) => {
        const driverName = vehicle.assignedDriverId ? driverMap.get(vehicle.assignedDriverId) ?? "" : "";
        const osagoStatus = getDocumentStatus(vehicle.osagoEndDate);
        const cascoStatus = getDocumentStatus(vehicle.cascoEndDate);
        const inspectionStatus = getDocumentStatus(vehicle.technicalInspectionEndDate);
        const missingDocument = osagoStatus === "missing" || cascoStatus === "missing" || inspectionStatus === "missing";
        const expired = osagoStatus === "expired" || cascoStatus === "expired" || inspectionStatus === "expired";
        const soon = osagoStatus === "soon" || cascoStatus === "soon" || inspectionStatus === "soon";
        const needsOil = Boolean(vehicle.mileage && (
          !vehicle.engineOilReplacementKm
          || !vehicle.gearboxOilReplacementKm
          || vehicle.mileage >= vehicle.engineOilReplacementKm
          || vehicle.mileage >= vehicle.gearboxOilReplacementKm
        ));
        const haystack = [
          vehicle.plateNumber,
          vehicle.vin,
          vehicle.make ?? "",
          vehicle.model ?? "",
          vehicle.companyName ?? "",
          driverName,
          vehicle.managerName ?? "",
        ].join(" ").toLowerCase();

        return {
          vehicle,
          driverName,
          osagoStatus,
          cascoStatus,
          inspectionStatus,
          missingDocument,
          expired,
          soon,
          needsOil,
          matchesSearch: !normalizedSearch || haystack.includes(normalizedSearch),
        };
      })
      .filter((row) => row.matchesSearch)
      .filter((row) => {
        if (activeFilter === "expired") return row.expired;
        if (activeFilter === "soon") return row.soon;
        if (activeFilter === "missing") return row.missingDocument;
        if (activeFilter === "oil") return row.needsOil;
        if (activeFilter === "mileage") return !row.vehicle.mileage;
        return true;
      })
      .sort((left, right) => {
        const statusRank: Record<DocumentStatus, number> = { expired: 0, soon: 1, missing: 2, active: 3 };
        if (activeChip === "osago") return statusRank[left.osagoStatus] - statusRank[right.osagoStatus];
        if (activeChip === "casco") return statusRank[left.cascoStatus] - statusRank[right.cascoStatus];
        if (activeChip === "inspection") return statusRank[left.inspectionStatus] - statusRank[right.inspectionStatus];
        if (activeChip === "engine") return Number(right.needsOil) - Number(left.needsOil);
        if (activeChip === "gearbox") return Number(right.needsOil) - Number(left.needsOil);
        return left.vehicle.plateNumber.localeCompare(right.vehicle.plateNumber);
      });
  }, [activeChip, activeFilter, companyFilter, driverMap, searchFilter, vehicles]);
  const expiredVehiclesCount = vehicleRows.filter((row) => row.expired).length;
  const soonVehiclesCount = vehicleRows.filter((row) => row.soon).length;
  const missingDocumentCount = vehicleRows.filter((row) => row.missingDocument).length;
  const oilChangeCount = vehicleRows.filter((row) => row.needsOil).length;
  const missingMileageCount = vehicleRows.filter((row) => !row.vehicle.mileage).length;

  function applyPresetView(view: "operations" | "currentMonth" | "archive"): void {
    if (view === "operations") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter("");
      setShowHistoricalInList(false);
      setShowOnlyExempt(false);
      return;
    }
    if (view === "currentMonth") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter(currentMonthLabel);
      setShowHistoricalInList(false);
      setShowOnlyExempt(false);
      return;
    }

    setStatusFilter("archived");
    setManagerFilter("");
    setSearchFilter("");
    setShowHistoricalInList(true);
    setShowOnlyExempt(false);
  }

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "operations" || view === "currentMonth" || view === "archive") {
      applyPresetView(view);
    }
  }, [searchParams]);

  useEffect(() => {
    setSelectedIncidentIds((current) => current.filter((incidentId) => rows.some((item) => item.id === incidentId)));
  }, [rows]);

  async function handleQuickStatusUpdate(item: ManagerIncidentItem, nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    setMessage(null);

    try {
      const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${item.id}`, {
        status: nextStatus,
      });
      if (!updated) {
        setMessage("Начисление не найдено.");
        return;
      }
      setMessage(`Начисление ${formatShortId(item.id)} переведено в статус "${getStatusLabel(nextStatus)}".`);
      await incidentsApi.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус начисления.");
    }
  }

  function toggleIncidentSelection(incidentId: string): void {
    setSelectedIncidentIds((current) =>
      current.includes(incidentId) ? current.filter((id) => id !== incidentId) : [...current, incidentId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedIncidentIds(allSelected ? [] : rows.map((item) => item.id));
  }

  async function handleBulkStatusUpdate(nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    if (!selectedIncidentIds.length) {
      setMessage("Выберите хотя бы одно начисление для массового действия.");
      return;
    }

    setMessage(null);
    let updatedCount = 0;

    try {
      for (const incidentId of selectedIncidentIds) {
        const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${incidentId}`, {
          status: nextStatus,
        });
        if (updated) {
          updatedCount += 1;
        }
      }

      await incidentsApi.refetch();
      setSelectedIncidentIds([]);
      setMessage(`Массово обработано ${updatedCount} начислений: статус "${getStatusLabel(nextStatus)}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое действие по начислениям.");
    }
  }

  function numberOrNull(value: string): number | null {
    const normalized = value.trim().replace(/\s/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function openVehicleEdit(vehicle: VehicleListItem): void {
    setEditingVehicle(vehicle);
    setEditForm({
      mileage: vehicle.mileage ? String(vehicle.mileage) : "",
      hasOsago: Boolean(vehicle.osagoStartDate || vehicle.osagoEndDate),
      osagoStartDate: vehicle.osagoStartDate ?? "",
      osagoEndDate: vehicle.osagoEndDate ?? "",
      hasCasco: Boolean(vehicle.cascoStartDate || vehicle.cascoEndDate),
      cascoStartDate: vehicle.cascoStartDate ?? "",
      cascoEndDate: vehicle.cascoEndDate ?? "",
      hasInspection: Boolean(vehicle.technicalInspectionStartDate || vehicle.technicalInspectionEndDate),
      technicalInspectionStartDate: vehicle.technicalInspectionStartDate ?? "",
      technicalInspectionEndDate: vehicle.technicalInspectionEndDate ?? "",
      engineOilReplacementKm: vehicle.engineOilReplacementKm ? String(vehicle.engineOilReplacementKm) : "",
      gearboxOilReplacementKm: vehicle.gearboxOilReplacementKm ? String(vehicle.gearboxOilReplacementKm) : "",
    });
    setMessage(null);
  }

  async function handleSaveVehicleDocuments(): Promise<void> {
    if (!editingVehicle) {
      return;
    }

    setIsSavingVehicle(true);
    setMessage(null);
    try {
      await patchJson<VehicleListItem | null, Record<string, unknown>>(`cars/${editingVehicle.id}`, {
        mileage: numberOrNull(editForm.mileage),
        osagoStartDate: editForm.hasOsago ? editForm.osagoStartDate || null : null,
        osagoEndDate: editForm.hasOsago ? editForm.osagoEndDate || null : null,
        cascoStartDate: editForm.hasCasco ? editForm.cascoStartDate || null : null,
        cascoEndDate: editForm.hasCasco ? editForm.cascoEndDate || null : null,
        technicalInspectionStartDate: editForm.hasInspection ? editForm.technicalInspectionStartDate || null : null,
        technicalInspectionEndDate: editForm.hasInspection ? editForm.technicalInspectionEndDate || null : null,
        engineOilReplacementKm: numberOrNull(editForm.engineOilReplacementKm),
        gearboxOilReplacementKm: numberOrNull(editForm.gearboxOilReplacementKm),
      });
      await vehiclesApi.refetch();
      setEditingVehicle(null);
      setMessage(`Данные авто ${editingVehicle.plateNumber} сохранены.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить данные авто.");
    } finally {
      setIsSavingVehicle(false);
    }
  }

  function handleExport(): void {
    if (!rows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-insurance-gps.csv",
      ["case", "company", "period", "plate", "driver", "date", "amount", "note", "breakdown", "gps_or_exemption", "brigadier", "status"],
      rows.map((item) => [
        formatShortId(item.id),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : item.carId ? (vehicleCompanyMap.get(item.carId) ?? "") : "",
        item.periodLabel ?? "",
        item.carId ? (vehicleLabelMap.get(item.carId)?.split(" · ")[0] ?? formatShortId(item.carId)) : "",
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        item.occurredAt ?? "",
        item.amount ?? 0,
        item.description ?? "",
        getInsuranceGpsBreakdown(item),
        [item.insuranceNote, item.locationNote].filter(Boolean).join(" · "),
        item.managerLabel ?? "",
        getStatusLabel(item.status),
      ]),
    );
  }

  const renderDocumentBadge = (status: DocumentStatus, endDate?: string | null) => (
    <span className={`insurance-status insurance-status--${status}`}>
      {getDocumentStatusLabel(status)}
      {endDate && status !== "missing" ? ` · ${formatDateOnly(endDate)}` : ""}
    </span>
  );

  return (
    <section className="page-stack insurance-to-page">
      <div className="hero-card insurance-to-hero">
        <h2>Страховка и техосмотр</h2>
        <p>ОСАГО, КАСКО и техосмотр по всему парку</p>
      </div>

      <div className="stats-grid insurance-to-stats">
        <StatCard title="Просрочено" value={String(expiredVehiclesCount)} subtitle="Документы требуют замены" tone="orange" icon={<ShieldIcon width={18} height={18} />} onClick={() => setActiveFilter("expired")} />
        <StatCard title="Истекает < 14 дней" value={String(soonVehiclesCount)} subtitle="Нужно продлить заранее" tone="orange" icon={<ReportsIcon width={18} height={18} />} onClick={() => setActiveFilter("soon")} />
        <StatCard title="Нет документа" value={String(missingDocumentCount)} subtitle="ОСАГО, КАСКО или ТО не указаны" tone="purple" icon={<ShieldIcon width={18} height={18} />} onClick={() => setActiveFilter("missing")} />
        <StatCard title="Пора менять масло" value={String(oilChangeCount)} subtitle="ДВС или КПП по пробегу" tone="green" icon={<CarIcon width={18} height={18} />} onClick={() => setActiveFilter("oil")} />
        <StatCard title="Не отмечен пробег" value={String(missingMileageCount)} subtitle="Нужно внести пробег авто" tone="blue" icon={<DriversIcon width={18} height={18} />} onClick={() => setActiveFilter("mileage")} />
      </div>

      <article className="panel insurance-to-panel">
        <div className="insurance-to-toolbar">
          <div className="insurance-to-chips">
            {[
              ["osago", "ОСАГО"],
              ["casco", "КАСКО"],
              ["inspection", "Техосмотр"],
              ["engine", "Замена ДВС"],
              ["gearbox", "Замена КПП"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${activeChip === value ? "filter-chip--active" : ""}`}
                onClick={() => setActiveChip(value as InsuranceToChip)}
              >
                {label}
              </button>
            ))}
            <button type="button" className="filter-chip" onClick={() => setActiveFilter("all")}>Все</button>
          </div>
          <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Поиск по номеру авто..." />
        </div>
        <AsyncState
          loading={vehiclesApi.loading || driversApi.loading}
          error={vehiclesApi.error || driversApi.error}
          empty={!vehicleRows.length}
          emptyContent={<EmptyStatePanel title="Авто по фильтру нет" message="Измените фильтр, компанию или поисковый запрос." />}
        >
          <div className="table-scroll">
            <table className="data-table insurance-to-table">
              <thead>
                <tr>
                  <th>Авто / Группа</th>
                  <th>ОСАГО</th>
                  <th>КАСКО</th>
                  <th>Техосмотр</th>
                  <th>Пробег</th>
                  <th>До замены масла</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vehicleRows.map(({ vehicle, driverName, osagoStatus, cascoStatus, inspectionStatus }) => (
                  <tr key={vehicle.id}>
                    <td>
                      <div className="identity-cell">
                        <div className="identity-meta">
                          <strong>{vehicle.plateNumber}</strong>
                          <span className="inline-pill inline-pill--accent">
                            {driverName || vehicle.managerName || vehicle.companyName || "Без группы"}
                          </span>
                          <p className="table-meta">{vehicle.make} {vehicle.model}</p>
                        </div>
                      </div>
                    </td>
                    <td>{renderDocumentBadge(osagoStatus, vehicle.osagoEndDate)}</td>
                    <td>{renderDocumentBadge(cascoStatus, vehicle.cascoEndDate)}</td>
                    <td>{renderDocumentBadge(inspectionStatus, vehicle.technicalInspectionEndDate)}</td>
                    <td>{vehicle.mileage ? `${vehicle.mileage.toLocaleString("ru-RU")} км` : "—"}</td>
                    <td>
                      <div className="insurance-oil-stack">
                        <span>ДВС {vehicle.engineOilReplacementKm ? `${vehicle.engineOilReplacementKm.toLocaleString("ru-RU")} км` : "нет замены"}</span>
                        <span>КПП {vehicle.gearboxOilReplacementKm ? `${vehicle.gearboxOilReplacementKm.toLocaleString("ru-RU")} км` : "нет замены"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="row-actions">
                        {canCreate ? (
                          <button type="button" className="table-link" onClick={() => openVehicleEdit(vehicle)}>
                            Редактировать
                          </button>
                        ) : null}
                        <Link className="table-link" to={`/vehicles/${vehicle.id}`}>Открыть</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AsyncState>
      </article>
      {message ? <p className="panel-note">{message}</p> : null}
      {editingVehicle ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть редактирование страховки и ТО"
            onClick={() => setEditingVehicle(null)}
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="insurance-to-edit-title">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Страховка и ТО</p>
                <h3 id="insurance-to-edit-title">{editingVehicle.plateNumber}</h3>
                <p>{editingVehicle.make} {editingVehicle.model}</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => setEditingVehicle(null)}>
                Закрыть
              </button>
            </div>
            <div className="entity-modal__body quick-form">
              <div className="form-grid form-grid--two">
                <label>
                  <span>Пробег автомобиля</span>
                  <input
                    value={editForm.mileage}
                    onChange={(event) => setEditForm((current) => ({ ...current, mileage: event.target.value }))}
                    placeholder="Пробег, км"
                    inputMode="numeric"
                  />
                </label>
                <label>
                  <span>Замена ДВС, км</span>
                  <input
                    value={editForm.engineOilReplacementKm}
                    onChange={(event) => setEditForm((current) => ({ ...current, engineOilReplacementKm: event.target.value }))}
                    placeholder="Следующая замена"
                    inputMode="numeric"
                  />
                </label>
                <label>
                  <span>Замена КПП, км</span>
                  <input
                    value={editForm.gearboxOilReplacementKm}
                    onChange={(event) => setEditForm((current) => ({ ...current, gearboxOilReplacementKm: event.target.value }))}
                    placeholder="Следующая замена"
                    inputMode="numeric"
                  />
                </label>
              </div>

              <div className="table-grid">
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={editForm.hasOsago}
                    onChange={(event) => setEditForm((current) => ({ ...current, hasOsago: event.target.checked }))}
                  />
                  <span>ОСАГО</span>
                </label>
                <input
                  type="date"
                  value={editForm.osagoStartDate}
                  disabled={!editForm.hasOsago}
                  onChange={(event) => {
                    const nextStartDate = event.target.value;
                    setEditForm((current) => ({
                      ...current,
                      osagoStartDate: nextStartDate,
                      osagoEndDate: addOneYearDateOnly(nextStartDate),
                    }));
                  }}
                />
                <input
                  type="date"
                  value={editForm.osagoEndDate}
                  disabled={!editForm.hasOsago}
                  onChange={(event) => setEditForm((current) => ({ ...current, osagoEndDate: event.target.value }))}
                />

                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={editForm.hasCasco}
                    onChange={(event) => setEditForm((current) => ({ ...current, hasCasco: event.target.checked }))}
                  />
                  <span>КАСКО</span>
                </label>
                <input
                  type="date"
                  value={editForm.cascoStartDate}
                  disabled={!editForm.hasCasco}
                  onChange={(event) => {
                    const nextStartDate = event.target.value;
                    setEditForm((current) => ({
                      ...current,
                      cascoStartDate: nextStartDate,
                      cascoEndDate: addOneYearDateOnly(nextStartDate),
                    }));
                  }}
                />
                <input
                  type="date"
                  value={editForm.cascoEndDate}
                  disabled={!editForm.hasCasco}
                  onChange={(event) => setEditForm((current) => ({ ...current, cascoEndDate: event.target.value }))}
                />

                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={editForm.hasInspection}
                    onChange={(event) => setEditForm((current) => ({ ...current, hasInspection: event.target.checked }))}
                  />
                  <span>Техосмотр</span>
                </label>
                <input
                  type="date"
                  value={editForm.technicalInspectionStartDate}
                  disabled={!editForm.hasInspection}
                  onChange={(event) => {
                    const nextStartDate = event.target.value;
                    setEditForm((current) => ({
                      ...current,
                      technicalInspectionStartDate: nextStartDate,
                      technicalInspectionEndDate: addOneYearDateOnly(nextStartDate),
                    }));
                  }}
                />
                <input
                  type="date"
                  value={editForm.technicalInspectionEndDate}
                  disabled={!editForm.hasInspection}
                  onChange={(event) => setEditForm((current) => ({ ...current, technicalInspectionEndDate: event.target.value }))}
                />
              </div>
              <p className="panel-note">В строках документов: галочка, дата начала, дата окончания.</p>
              <div className="toolbar">
                <button type="button" disabled={isSavingVehicle} onClick={() => void handleSaveVehicleDocuments()}>
                  {isSavingVehicle ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
