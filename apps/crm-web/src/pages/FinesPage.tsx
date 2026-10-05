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
import { CarIcon, DriversIcon, FinanceIcon, IncidentIcon } from "../ui/CrmIcons";
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
  referenceNumber?: string | null;
  amount?: number | null;
  description?: string | null;
  locationNote?: string | null;
  managerLabel?: string | null;
};

function isFineIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "fine";
}

export function FinesPage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createIncident = useApiMutation<ManagerIncidentItem, CreateIncidentInput>("incidents");
  const canCreate = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const [title, setTitle] = useState("Штраф");
  const [driverId, setDriverId] = useState("");
  const [carId, setCarId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [managerLabel, setManagerLabel] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "closed" | "archived">("open");
  const [managerFilter, setManagerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [showHistoricalInList, setShowHistoricalInList] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const vehicles = useMemo(() => vehiclesApi.data ?? [], [vehiclesApi.data]);
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
  const vehicleLabelMap = useMemo(() => new Map(vehicles.map((item) => [item.id, `${item.plateNumber} · ${item.make} ${item.model}`])), [vehicles]);
  const fineIncidents = useMemo(() => (incidentsApi.data ?? []).filter(isFineIncident), [incidentsApi.data]);
  const fineRows = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const normalizedManager = managerFilter.trim().toLowerCase();

    return [...fineIncidents]
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
          item.description ?? "",
          item.locationNote ?? "",
          item.referenceNumber ?? "",
          item.managerLabel ?? "",
          vehicleLabel,
          driverLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => (right.occurredAt ?? right.id).localeCompare(left.occurredAt ?? left.id));
  }, [driverMap, fineIncidents, managerFilter, matchesCompany, searchFilter, showHistoricalInList, statusFilter, vehicleLabelMap]);
  const totalFineAmount = fineRows.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const impoundRows = fineRows.filter((item) => (item.locationNote ?? "").toLowerCase().includes("штрафстоян"));
  const openCount = fineRows.filter((item) => item.status === "open").length;
  const archivedCount = fineIncidents.filter((item) => item.status === "archived").length;
  const selectedCount = selectedIncidentIds.length;
  const allSelected = fineRows.length > 0 && selectedCount === fineRows.length;

  function applyPresetView(view: "operations" | "impound" | "archive"): void {
    if (view === "operations") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter("");
      setShowHistoricalInList(false);
      return;
    }
    if (view === "impound") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter("штрафстоян");
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
    if (view === "operations" || view === "impound" || view === "archive") {
      applyPresetView(view);
    }
  }, [searchParams]);

  useEffect(() => {
    setSelectedIncidentIds((current) => current.filter((incidentId) => fineRows.some((item) => item.id === incidentId)));
  }, [fineRows]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (!carId || !amount || !description.trim()) {
      setMessage("Укажите автомобиль, сумму и описание штрафа.");
      return;
    }

    try {
      const created = await createIncident.mutate({
        title: title.trim() || "Штраф",
        incidentType: "fine",
        status: "open",
        priority: "medium",
        driverId: driverId || null,
        carId,
        occurredAt: occurredAt || null,
        referenceNumber: referenceNumber.trim() || null,
        amount: Number(amount),
        description: description.trim(),
        locationNote: locationNote.trim() || null,
        managerLabel: managerLabel.trim() || null,
      });
      setMessage(`Штраф зарегистрирован: ${created.title}.`);
      await incidentsApi.refetch();
      setReferenceNumber("");
      setAmount("");
      setDescription("");
      setLocationNote("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось зарегистрировать штраф.");
    }
  }

  async function handleQuickStatusUpdate(item: ManagerIncidentItem, nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    setMessage(null);

    try {
      const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${item.id}`, {
        status: nextStatus,
      });
      if (!updated) {
        setMessage("Штрафной кейс не найден.");
        return;
      }
      setMessage(`Кейс ${formatShortId(item.id)} переведён в статус "${getStatusLabel(nextStatus)}".`);
      await incidentsApi.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус штрафного кейса.");
    }
  }

  function toggleIncidentSelection(incidentId: string): void {
    setSelectedIncidentIds((current) =>
      current.includes(incidentId) ? current.filter((id) => id !== incidentId) : [...current, incidentId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedIncidentIds(allSelected ? [] : fineRows.map((item) => item.id));
  }

  async function handleBulkStatusUpdate(nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    if (!selectedIncidentIds.length) {
      setMessage("Выберите хотя бы один штрафной кейс для массового действия.");
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
      setMessage(`Массово обработано ${updatedCount} штрафных кейсов: статус "${getStatusLabel(nextStatus)}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое действие по штрафам.");
    }
  }

  function handleExport(): void {
    if (!fineRows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-fines.csv",
      ["case", "company", "plate", "driver", "occurred_at", "reference", "amount", "description", "location", "brigadier", "status"],
      fineRows.map((item) => [
        formatShortId(item.id),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : item.carId ? (vehicleCompanyMap.get(item.carId) ?? "") : "",
        item.carId ? (vehicleMap.get(item.carId) ?? formatShortId(item.carId)) : "",
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        item.occurredAt ?? "",
        item.referenceNumber ?? "",
        item.amount ?? 0,
        item.description ?? "",
        item.locationNote ?? "",
        item.managerLabel ?? "",
        getStatusLabel(item.status),
      ]),
    );
  }

  return (
    <section className="page-stack fines-page">
      <div className="hero-card">
        <p className="eyebrow">Штрафы</p>
        <h2>Штрафы и штрафстоянка</h2>
        <p>Реестр штрафов по машинам и водителям с номером постановления, суммой и привязкой к бригадиру.</p>
        <div className="toolbar">
          <Link className="button-link" to="/incidents?view=operations">
            Открыть инциденты
          </Link>
          <Link className="button-link" to="/reports">
            Открыть отчёты
          </Link>
          {canCreate ? (
            <button type="button" onClick={() => setShowCreateModal(true)}>
              Добавить штраф
            </button>
          ) : null}
          {fineRows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
        </div>
        {!canCreate ? <ReadOnlyNotice message="Для этой роли доступен только просмотр штрафов." /> : null}
      </div>

      <div className="stats-grid">
        <StatCard title="Штрафы" value={String(fineRows.length)} subtitle="Строки по текущему фильтру" tone="blue" icon={<IncidentIcon width={18} height={18} />} onClick={() => applyPresetView("operations")} />
        <StatCard title="Открыты" value={String(openCount)} subtitle="Живая очередь штрафов" tone="orange" icon={<IncidentIcon width={18} height={18} />} onClick={() => applyPresetView("operations")} />
        <StatCard title="Сумма штрафов" value={formatCurrency(totalFineAmount)} subtitle="Текущий денежный контур" tone="orange" icon={<FinanceIcon width={18} height={18} />} to="/payments" />
        <StatCard title="Штрафстоянка" value={String(impoundRows.length)} subtitle={`Кейсы с помещением авто на стоянку · в архиве ${archivedCount}`} tone="purple" icon={<CarIcon width={18} height={18} />} onClick={() => applyPresetView("impound")} />
        <StatCard title="С водителем" value={String(fineRows.filter((item) => item.driverId).length)} subtitle="Штрафы с прямой привязкой к водителю" tone="green" icon={<DriversIcon width={18} height={18} />} onClick={() => setSearchFilter("водитель")} />
      </div>

      {showCreateModal ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть добавление штрафа"
            onClick={() => setShowCreateModal(false)}
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="fine-create-title">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Штрафы</p>
                <h3 id="fine-create-title">Новый штраф</h3>
                <p>Зафиксируйте авто, водителя, сумму и основание.</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)}>Закрыть</button>
            </div>
            <div className="entity-modal__body">
              {canCreate ? (
                <form className="quick-form" onSubmit={(event) => void handleSubmit(event)}>
                  <p className="quick-form__meta">Фиксируйте штрафы и штрафстоянку в одном месте, чтобы они сразу попадали в отчётный слой.</p>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название штрафа" />
                  <select value={carId} onChange={(event) => setCarId(event.target.value)}>
                    <option value="">Выберите автомобиль</option>
                    {visibleVehicles.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.plateNumber} · {item.make} {item.model}
                      </option>
                    ))}
                  </select>
                  <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                    <option value="">Без привязки к водителю</option>
                    {visibleDrivers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                  </select>
                  <div className="toolbar">
                    <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
                    <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Номер постановления" />
                  </div>
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Сумма штрафа, сом" />
                  <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Описание штрафа / причина" />
                  <input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} placeholder="Локация / штрафстоянка / комментарий" />
                  <input value={managerLabel} onChange={(event) => setManagerLabel(event.target.value)} placeholder="Бригадир" />
                  {message ? <div className="panel-note">{message}</div> : null}
                  {createIncident.error ? <div className="panel-note">Ошибка: {createIncident.error}</div> : null}
                  <button type="submit" disabled={createIncident.loading}>
                    {createIncident.loading ? "Сохраняем..." : "Зарегистрировать штраф"}
                  </button>
                </form>
              ) : (
                <ReadOnlyNotice message="Создание штрафов для этой роли недоступно." />
              )}
            </div>
          </section>
        </>
      ) : null}

      <div className="table-grid table-grid--single">
        <article className="panel">
          <div className="panel__title">
            <IncidentIcon width={18} height={18} />
            <h3>Журнал штрафов</h3>
          </div>
          <div className="quick-form">
            <p className="quick-form__meta">Фильтры и представления</p>
            <div className="toolbar">
              <button type="button" onClick={() => applyPresetView("operations")}>
                Операционный вид
              </button>
              <button type="button" onClick={() => applyPresetView("impound")}>
                Штрафстоянка
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
              <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Поиск по авто, водителю, описанию, № постановления" />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={showHistoricalInList} onChange={(event) => setShowHistoricalInList(event.target.checked)} />
              <span>Показать закрытые и архив</span>
            </label>
            {canCreate && fineRows.length ? (
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
            empty={!fineRows.length}
            emptyContent={<EmptyStatePanel title="Штрафов по фильтру нет" message="Измените фильтры или зарегистрируйте новый штраф, чтобы он попал в рабочую очередь." />}
          >
            <table className="data-table fines-table">
              <thead>
                <tr>
                  {canCreate ? <th /> : null}
                  <th>Авто</th>
                  <th>Водитель</th>
                  <th>Дата</th>
                  <th>Сумма</th>
                  <th>Описание</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {fineRows.map((item) => {
                  const companyLabel = item.driverId ? driverCompanyMap.get(item.driverId) : item.carId ? vehicleCompanyMap.get(item.carId) : "";

                  return (
                    <tr key={item.id}>
                      {canCreate ? (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIncidentIds.includes(item.id)}
                            onChange={() => toggleIncidentSelection(item.id)}
                          />
                        </td>
                      ) : null}
                      <td>
                        {item.carId ? (
                          <Link className="table-link" to={`/vehicles/${item.carId}`} title={vehicleLabelMap.get(item.carId)}>
                            {vehicleMap.get(item.carId) ?? formatShortId(item.carId)}
                          </Link>
                        ) : "Авто не указано"}
                      </td>
                      <td>
                        <div className="amount-stack">
                          {item.driverId ? (
                            <Link className="table-link" to={`/drivers/${item.driverId}`} title={driverMap.get(item.driverId)}>
                              {driverMap.get(item.driverId) ?? formatShortId(item.driverId)}
                            </Link>
                          ) : <span>-</span>}
                          {companyLabel ? <span>{companyLabel}</span> : null}
                        </div>
                      </td>
                      <td>
                        <div className="amount-stack">
                          <strong>{item.occurredAt ? formatDateOnly(item.occurredAt) : "-"}</strong>
                          {item.referenceNumber ? <span title={item.referenceNumber}>№ {item.referenceNumber}</span> : null}
                        </div>
                      </td>
                      <td>{item.amount ? formatCurrency(item.amount) : "-"}</td>
                      <td title={`${item.description ?? item.title}${item.locationNote ? ` · ${item.locationNote}` : ""}${item.managerLabel ? ` · ${item.managerLabel}` : ""}`}>
                        {item.description ?? item.title}
                      </td>
                      <td>
                        <div className="amount-stack">
                          <span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span>
                          <span className={getStatusTone(item.priority)}>{getIncidentPriorityLabel(item.priority)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          {canCreate && item.status === "open" ? (
                            <button type="button" onClick={() => void handleQuickStatusUpdate(item, "resolved")}>
                              Решить
                            </button>
                          ) : null}
                          {canCreate && item.status !== "closed" && item.status !== "archived" ? (
                            <button type="button" onClick={() => void handleQuickStatusUpdate(item, "closed")}>
                              Закрыть
                            </button>
                          ) : null}
                          {canCreate && item.status !== "archived" ? (
                            <button type="button" onClick={() => void handleQuickStatusUpdate(item, "archived")}>
                              В архив
                            </button>
                          ) : null}
                          <Link className="table-link" to="/incidents?view=operations">
                            Инциденты
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AsyncState>
        </article>
      </div>
    </section>
  );
}
