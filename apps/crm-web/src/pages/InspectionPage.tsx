import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DriverListItem, ManagerIncidentItem, UserAdminListItem, VehicleListItem } from "@gopark/contracts";
import { patchJson } from "../lib/api";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../ui/AuthContext";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { CarIcon, DriversIcon, IncidentIcon, ReportsIcon } from "../ui/CrmIcons";
import {
  downloadCsvTable,
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
  description?: string | null;
  managerLabel?: string | null;
  notifyDriverText?: string | null;
  notifyDriverDate?: string | null;
};

function isInspectionIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "inspection";
}

function getTodayInputDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function InspectionPage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createIncident = useApiMutation<ManagerIncidentItem, CreateIncidentInput>("incidents");
  const canCreate = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const [title, setTitle] = useState("Плановый осмотр");
  const [driverId, setDriverId] = useState("");
  const [carId, setCarId] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [occurredAt, setOccurredAt] = useState(getTodayInputDate);
  const [periodLabel, setPeriodLabel] = useState("");
  const [description, setDescription] = useState("");
  const [managerLabel, setManagerLabel] = useState("");
  const [notifyDriverText, setNotifyDriverText] = useState("");
  const [notifyDriverDate, setNotifyDriverDate] = useState(getTodayInputDate);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "closed" | "archived">("open");
  const [managerFilter, setManagerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showHistoricalInList, setShowHistoricalInList] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showActionHub, setShowActionHub] = useState(false);

  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const vehicles = useMemo(() => vehiclesApi.data ?? [], [vehiclesApi.data]);
  const users = useMemo(() => usersApi.data ?? [], [usersApi.data]);
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
  const filteredVisibleDrivers = visibleDrivers.filter((item) => {
    const normalizedSearch = driverSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return true;
    }
    return [item.fullName, item.phone, item.companyName ?? ""].join(" ").toLowerCase().includes(normalizedSearch);
  });
  const filteredVisibleVehicles = visibleVehicles.filter((item) => {
    const normalizedSearch = vehicleSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return true;
    }
    return [item.plateNumber, item.vin, item.make ?? "", item.model ?? "", item.companyName ?? ""].join(" ").toLowerCase().includes(normalizedSearch);
  });
  const driverMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.fullName])), [drivers]);
  const managerNameMap = useMemo(() => {
    const result = new Map<string, string>();
    for (const manager of users.filter((item) => item.role === "manager")) {
      result.set(manager.id, manager.displayName);
      if (manager.managerProfileId) {
        result.set(manager.managerProfileId, manager.displayName);
      }
    }
    return result;
  }, [users]);
  const vehicleLabelMap = useMemo(() => new Map(vehicles.map((item) => [item.id, `${item.plateNumber} · ${item.make} ${item.model}`])), [vehicles]);
  const inspectionIncidents = useMemo(() => (incidentsApi.data ?? []).filter(isInspectionIncident), [incidentsApi.data]);
  const inspectionRows = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const normalizedManager = managerFilter.trim().toLowerCase();

    return [...inspectionIncidents]
      .filter((item) => {
        if (!showHistoricalInList && (item.status === "closed" || item.status === "archived")) {
          return false;
        }
        if (statusFilter !== "all" && item.status !== statusFilter) {
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
          item.managerLabel ?? "",
          vehicleLabel,
          driverLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => (right.occurredAt ?? right.id).localeCompare(left.occurredAt ?? left.id));
  }, [driverMap, inspectionIncidents, managerFilter, matchesCompany, searchFilter, showHistoricalInList, statusFilter, vehicleLabelMap]);
  const currentMonthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date());
  const currentMonthRows = inspectionRows.filter((item) => (item.periodLabel ?? "").toLowerCase() === currentMonthLabel.toLowerCase());
  const uniqueBrigadiers = new Set(inspectionRows.map((item) => item.managerLabel).filter(Boolean));
  const openCount = inspectionRows.filter((item) => item.status === "open").length;
  const archivedCount = inspectionIncidents.filter((item) => item.status === "archived").length;
  const selectedCount = selectedIncidentIds.length;
  const allSelected = inspectionRows.length > 0 && selectedCount === inspectionRows.length;

  function applyPresetView(view: "operations" | "currentMonth" | "archive"): void {
    if (view === "operations") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter("");
      setShowHistoricalInList(false);
      return;
    }
    if (view === "currentMonth") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter(currentMonthLabel);
      setShowHistoricalInList(false);
      return;
    }

    setStatusFilter("archived");
    setManagerFilter("");
    setSearchFilter("");
    setShowHistoricalInList(true);
  }

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "operations" || view === "currentMonth" || view === "archive") {
      applyPresetView(view);
    }
  }, [searchParams]);

  useEffect(() => {
    setSelectedIncidentIds((current) => current.filter((incidentId) => inspectionRows.some((item) => item.id === incidentId)));
  }, [inspectionRows]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (!carId || !periodLabel.trim()) {
      setMessage("Укажите автомобиль и период осмотра.");
      return;
    }

    try {
      const created = await createIncident.mutate({
        title: title.trim() || "Плановый осмотр",
        incidentType: "inspection",
        status: "open",
        priority: "low",
        driverId: driverId || null,
        carId,
        occurredAt: occurredAt || null,
        periodLabel: periodLabel.trim(),
        description: description.trim() || null,
        managerLabel: managerLabel.trim() || null,
        notifyDriverText: notifyDriverText.trim() || null,
        notifyDriverDate: notifyDriverText.trim() ? notifyDriverDate || getTodayInputDate() : null,
      });
      setMessage(`Осмотр зарегистрирован: ${created.title}.`);
      await incidentsApi.refetch();
      setDescription("");
      setNotifyDriverText("");
      setNotifyDriverDate(getTodayInputDate());
      setShowCreateModal(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось зарегистрировать осмотр.");
    }
  }

  async function handleQuickStatusUpdate(item: ManagerIncidentItem, nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    setMessage(null);

    try {
      const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${item.id}`, {
        status: nextStatus,
      });
      if (!updated) {
        setMessage("Осмотр не найден.");
        return;
      }
      setMessage(`Осмотр ${formatShortId(item.id)} переведён в статус "${getStatusLabel(nextStatus)}".`);
      await incidentsApi.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус осмотра.");
    }
  }

  function toggleIncidentSelection(incidentId: string): void {
    setSelectedIncidentIds((current) =>
      current.includes(incidentId) ? current.filter((id) => id !== incidentId) : [...current, incidentId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedIncidentIds(allSelected ? [] : inspectionRows.map((item) => item.id));
  }

  async function handleBulkStatusUpdate(nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    if (!selectedIncidentIds.length) {
      setMessage("Выберите хотя бы один осмотр для массового действия.");
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
      setMessage(`Массово обработано ${updatedCount} осмотров: статус "${getStatusLabel(nextStatus)}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое действие по осмотрам.");
    }
  }

  function handleExport(): void {
    if (!inspectionRows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-inspections.csv",
      ["case", "company", "period", "plate", "driver", "checked_at", "note", "brigadier", "status"],
      inspectionRows.map((item) => [
        formatShortId(item.id),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : item.carId ? (vehicleCompanyMap.get(item.carId) ?? "") : "",
        item.periodLabel ?? "",
        item.carId ? (vehicleLabelMap.get(item.carId)?.split(" · ")[0] ?? formatShortId(item.carId)) : "",
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        item.occurredAt ?? "",
        item.description ?? "",
        item.managerLabel ?? "",
        getStatusLabel(item.status),
      ]),
    );
  }

  return (
    <section className="page-stack inspections-page">
      <div className="hero-card">
        <p className="eyebrow">Осмотр</p>
        <h2>Плановые осмотры</h2>
        <p>Месячный журнал осмотров по машинам и водителям с периодом, датой отметки и бригадиром, как в текущих таблицах.</p>
        <button type="button" className="action-hub-trigger" onClick={() => setShowActionHub((current) => !current)}>
          <ReportsIcon width={18} height={18} />
          <span>{showActionHub ? "Скрыть действия" : "Добавить осмотр"}</span>
        </button>
        {showActionHub ? (
          <div className="action-hub">
            <Link className="action-hub__item" to="/reports">
              <ReportsIcon width={18} height={18} />
              <span>Отчёты</span>
            </Link>
            <Link className="action-hub__item" to="/incidents?view=operations">
              <IncidentIcon width={18} height={18} />
              <span>Инциденты</span>
            </Link>
            {canCreate ? (
              <button
                type="button"
                className="action-hub__item"
                onClick={() => {
                  setOccurredAt((current) => current || getTodayInputDate());
                  setShowCreateModal(true);
                }}
              >
                <CarIcon width={18} height={18} />
                <span>Добавить осмотр</span>
              </button>
            ) : null}
            {inspectionRows.length ? (
              <button type="button" className="action-hub__item" onClick={handleExport}>
                <ReportsIcon width={18} height={18} />
                <span>Скачать CSV</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {!canCreate ? <ReadOnlyNotice message="Для этой роли доступен только просмотр журнала осмотров." /> : null}
      </div>

      <div className="stats-grid">
        <StatCard
          title="Осмотры"
          value={String(inspectionRows.length)}
          subtitle="Строки по текущему фильтру"
          tone="blue"
          icon={<IncidentIcon width={18} height={18} />}
          onClick={() => applyPresetView("operations")}
        />
        <StatCard
          title="Открыты"
          value={String(openCount)}
          subtitle="Живая очередь осмотров"
          tone="orange"
          icon={<IncidentIcon width={18} height={18} />}
          onClick={() => applyPresetView("operations")}
        />
        <StatCard
          title="Текущий месяц"
          value={String(currentMonthRows.length)}
          subtitle={currentMonthLabel}
          tone="green"
          icon={<ReportsIcon width={18} height={18} />}
          onClick={() => applyPresetView("currentMonth")}
        />
        <StatCard
          title="С водителем"
          value={String(inspectionRows.filter((item) => item.driverId).length)}
          subtitle="Есть привязка к водителю"
          tone="orange"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setSearchFilter("");
            setStatusFilter("all");
            setShowHistoricalInList(true);
          }}
        />
        <StatCard
          title="Бригадиры"
          value={String(uniqueBrigadiers.size)}
          subtitle={`Кто вёл осмотры · в архиве ${archivedCount}`}
          tone="purple"
          icon={<CarIcon width={18} height={18} />}
          onClick={() => applyPresetView("archive")}
        />
      </div>

      {showCreateModal ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть добавление осмотра"
            onClick={() => setShowCreateModal(false)}
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="inspection-create-title">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Осмотр</p>
                <h3 id="inspection-create-title">Добавить осмотр</h3>
                <p>Заполните автомобиль, период, дату и комментарий.</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)}>Закрыть</button>
            </div>
            <form className="quick-form entity-modal__body" onSubmit={(event) => void handleSubmit(event)}>
              <p className="quick-form__meta">Фиксируйте ежемесячный осмотр сразу в CRM, чтобы машина и водитель попадали в отчёты без ручной таблицы.</p>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название осмотра" />
              <input
                value={vehicleSearch}
                onChange={(event) => setVehicleSearch(event.target.value)}
                placeholder="Поиск авто: госномер, VIN, марка или модель"
              />
              <select value={carId} onChange={(event) => setCarId(event.target.value)}>
                <option value="">Выберите автомобиль</option>
                {filteredVisibleVehicles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.plateNumber} · {item.make} {item.model}
                  </option>
                ))}
              </select>
              <input
                value={driverSearch}
                onChange={(event) => setDriverSearch(event.target.value)}
                placeholder="Поиск водителя: имя, телефон или компания"
              />
              <select
                value={driverId}
                onChange={(event) => {
                  const nextDriverId = event.target.value;
                  setDriverId(nextDriverId);
                  const driver = visibleDrivers.find((item) => item.id === nextDriverId);
                  setManagerLabel(driver?.managerId ? (managerNameMap.get(driver.managerId) ?? "") : "");
                }}
              >
                <option value="">Без привязки к водителю</option>
                {filteredVisibleDrivers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <div className="toolbar">
                <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
                <input value={periodLabel} onChange={(event) => setPeriodLabel(event.target.value)} placeholder="Период, например Май 2026" />
              </div>
              <input value={managerLabel} onChange={(event) => setManagerLabel(event.target.value)} placeholder="Бригадир" />
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Комментарий по осмотру" rows={4} />
              <div className="quick-form">
                <p className="quick-form__title">Уведомление водителю</p>
                <p className="quick-form__meta">Укажите, о чем уведомить водителя и дату, когда уведомление должно прийти.</p>
                <textarea
                  value={notifyDriverText}
                  onChange={(event) => setNotifyDriverText(event.target.value)}
                  placeholder="Текст уведомления водителю"
                  rows={3}
                />
                <input
                  type="date"
                  value={notifyDriverDate}
                  onChange={(event) => setNotifyDriverDate(event.target.value)}
                />
              </div>
              {message ? <div className="panel-note">{message}</div> : null}
              {createIncident.error ? <div className="panel-note">Ошибка: {createIncident.error}</div> : null}
              <button type="submit" disabled={createIncident.loading}>
                {createIncident.loading ? "Сохраняем..." : "Зарегистрировать осмотр"}
              </button>
            </form>
          </section>
        </>
      ) : null}

      <article className="panel">
          <div className="panel__title">
            <ReportsIcon width={18} height={18} />
            <h3>Журнал осмотров</h3>
          </div>
          <div className="quick-form">
            <p className="quick-form__meta">Фильтры и представления</p>
            <div className="toolbar">
              <button type="button" onClick={() => applyPresetView("operations")}>
                Операционный вид
              </button>
              <button type="button" onClick={() => applyPresetView("currentMonth")}>
                Текущий месяц
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
                <option value="all">Все статусы</option>
                <option value="open">Открытые</option>
                <option value="resolved">Решённые</option>
                <option value="closed">Закрытые</option>
                <option value="archived">Архив</option>
              </select>
              <input value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} placeholder="Фильтр по бригадиру" />
              <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Поиск по периоду, авто, водителю, комментарию" />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={showHistoricalInList} onChange={(event) => setShowHistoricalInList(event.target.checked)} />
              <span>Показать закрытые и архив</span>
            </label>
            {canCreate && inspectionRows.length ? (
              <div className="toolbar">
                <button type="button" onClick={toggleSelectAll}>
                  {allSelected ? "Снять выбор" : "Выбрать все"}
                </button>
                <span className="panel-note">Выбрано: {selectedCount}</span>
                <button type="button" onClick={() => void handleBulkStatusUpdate("resolved")} disabled={!selectedCount}>
                  Массово решить
                </button>
                <button type="button" onClick={() => void handleBulkStatusUpdate("closed")} disabled={!selectedCount}>
                  Массово закрыть
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
            empty={!inspectionRows.length}
            emptyContent={<EmptyStatePanel title="Осмотров по фильтру нет" message="Измените фильтры или зарегистрируйте новый осмотр, чтобы он попал в рабочую очередь." />}
          >
            <div className="table-scroll">
              <table className="data-table inspections-table">
                <thead>
                  <tr>
                    <th />
                    <th>Авто и водитель</th>
                    <th>Период</th>
                    <th>Дата и бригадир</th>
                    <th>Комментарий</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectionRows.map((item) => (
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
                      <td><strong>{item.periodLabel ?? "Период не указан"}</strong></td>
                      <td>
                        <div className="amount-stack">
                          <strong>{item.occurredAt ? formatDateOnly(item.occurredAt) : "Дата не указана"}</strong>
                          <span>{item.managerLabel ?? "Бригадир не указан"}</span>
                        </div>
                      </td>
                      <td><span className="table-text" title={item.description ?? ""}>{item.description ?? "Комментарий не добавлен"}</span></td>
                      <td>
                        <div className="amount-stack">
                          <span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span>
                          <span className={getStatusTone(item.priority)}>{getIncidentPriorityLabel(item.priority)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions row-actions--vertical">
                          {canCreate && item.status === "open" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "resolved")}>Решить</button> : null}
                          {canCreate && item.status !== "closed" && item.status !== "archived" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "closed")}>Закрыть</button> : null}
                          {canCreate && item.status !== "archived" ? <button type="button" onClick={() => void handleQuickStatusUpdate(item, "archived")}>В архив</button> : null}
                          <Link className="table-link" to="/reports">Отчёты</Link>
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
    </section>
  );
}
