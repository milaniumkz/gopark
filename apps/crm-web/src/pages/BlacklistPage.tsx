import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DriverListItem, ManagerIncidentItem } from "@gopark/contracts";
import { patchJson } from "../lib/api";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../ui/AuthContext";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, IncidentIcon, ShieldIcon } from "../ui/CrmIcons";
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
  occurredAt?: string | null;
  description?: string | null;
  locationNote?: string | null;
  managerLabel?: string | null;
};

function isBlacklistIncident(item: ManagerIncidentItem): boolean {
  return item.incidentType === "blacklist";
}

export function BlacklistPage() {
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createIncident = useApiMutation<ManagerIncidentItem, CreateIncidentInput>("incidents");
  const canCreate = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const [title, setTitle] = useState("");
  const [driverId, setDriverId] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [description, setDescription] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [managerLabel, setManagerLabel] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved" | "closed" | "archived">("open");
  const [managerFilter, setManagerFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [relationFilter, setRelationFilter] = useState<"all" | "linked" | "free">("all");
  const [showHistoricalInList, setShowHistoricalInList] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const incidents = useMemo(() => incidentsApi.data ?? [], [incidentsApi.data]);
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const driverCompanyMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.companyName ?? ""])), [drivers]);
  const matchesCompany = useCallback((driverId?: string | null): boolean => {
    if (companyFilter === "all") {
      return true;
    }

    return (driverId ? driverCompanyMap.get(driverId) : "") === companyFilter;
  }, [companyFilter, driverCompanyMap]);
  const visibleDrivers = useMemo(() => drivers.filter((item) => matchesCompany(item.id)), [drivers, matchesCompany]);
  const driverMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.fullName])), [drivers]);
  const blacklistIncidents = useMemo(() => incidents.filter(isBlacklistIncident), [incidents]);
  const rows = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();
    const normalizedManager = managerFilter.trim().toLowerCase();

    return [...blacklistIncidents]
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
        if (!matchesCompany(item.driverId)) {
          return false;
        }
        if (relationFilter === "linked" && !item.driverId) {
          return false;
        }
        if (relationFilter === "free" && item.driverId) {
          return false;
        }
        if (!normalizedSearch) {
          return true;
        }

        const driverLabel = item.driverId ? driverMap.get(item.driverId) ?? "" : "";
        const haystack = [
          item.title,
          item.description ?? "",
          item.locationNote ?? "",
          item.managerLabel ?? "",
          driverLabel,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => (right.occurredAt ?? right.id).localeCompare(left.occurredAt ?? left.id));
  }, [blacklistIncidents, driverMap, managerFilter, matchesCompany, relationFilter, searchFilter, showHistoricalInList, statusFilter]);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthRows = rows.filter((item) => (item.occurredAt ?? "").slice(0, 7) === currentMonthKey);
  const openCount = rows.filter((item) => item.status === "open").length;
  const archivedCount = blacklistIncidents.filter((item) => item.status === "archived").length;
  const selectedCount = selectedIncidentIds.length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  function applyPresetView(view: "operations" | "currentMonth" | "archive"): void {
    if (view === "operations") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter("");
      setRelationFilter("all");
      setShowHistoricalInList(false);
      return;
    }
    if (view === "currentMonth") {
      setStatusFilter("open");
      setManagerFilter("");
      setSearchFilter(currentMonthKey);
      setRelationFilter("all");
      setShowHistoricalInList(false);
      return;
    }

    setStatusFilter("archived");
    setManagerFilter("");
    setSearchFilter("");
    setRelationFilter("all");
    setShowHistoricalInList(true);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (!title.trim() || !description.trim()) {
      setMessage("Укажите ФИО и причину добавления в чёрный список.");
      return;
    }

    try {
      const created = await createIncident.mutate({
        title: title.trim(),
        incidentType: "blacklist",
        status: "open",
        priority: "high",
        driverId: driverId || null,
        occurredAt: occurredAt || null,
        description: description.trim(),
        locationNote: locationNote.trim() || null,
        managerLabel: managerLabel.trim() || null,
      });
      setMessage(`Запись добавлена: ${created.title}.`);
      await incidentsApi.refetch();
      setTitle("");
      setDescription("");
      setLocationNote("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить запись в чёрный список.");
    }
  }

  async function handleQuickStatusUpdate(item: ManagerIncidentItem, nextStatus: "resolved" | "closed" | "archived"): Promise<void> {
    setMessage(null);

    try {
      const updated = await patchJson<ManagerIncidentItem | null, Partial<CreateIncidentInput>>(`incidents/${item.id}`, {
        status: nextStatus,
      });
      if (!updated) {
        setMessage("Запись чёрного списка не найдена.");
        return;
      }
      setMessage(`Запись ${formatShortId(item.id)} переведена в статус "${getStatusLabel(nextStatus)}".`);
      await incidentsApi.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус записи.");
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
      setMessage("Выберите хотя бы одну запись для массового действия.");
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
      setMessage(`Массово обработано ${updatedCount} записей: статус "${getStatusLabel(nextStatus)}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое действие.");
    }
  }

  function handleExport(): void {
    if (!rows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-blacklist.csv",
      ["case", "company", "driver_name", "driver_id", "date", "reason", "note", "brigadier", "status"],
      rows.map((item) => [
        item.title,
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : "",
        item.driverId ? (driverMap.get(item.driverId) ?? "") : "",
        item.driverId ?? "",
        item.occurredAt ?? "",
        item.description ?? "",
        item.locationNote ?? "",
        item.managerLabel ?? "",
        getStatusLabel(item.status),
      ]),
    );
  }

  return (
    <section className="page-stack blacklist-page">
      <div className="hero-card">
        <p className="eyebrow">Чёрный список</p>
        <h2>Проблемные водители</h2>
        <p>Отдельный реестр ограничений по водителям: кто добавлен, когда, по какой причине и каким бригадиром.</p>
        <div className="toolbar">
          <Link className="button-link" to="/reports">
            Открыть отчёты
          </Link>
          <Link className="button-link" to="/drivers">
            Открыть водителей
          </Link>
          {canCreate ? (
            <button type="button" onClick={() => setShowCreateModal(true)}>
              Добавить запись
            </button>
          ) : null}
          {rows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
        </div>
        {!canCreate ? <ReadOnlyNotice message="Для этой роли доступен только просмотр чёрного списка." /> : null}
      </div>

      <div className="stats-grid">
        <StatCard title="В списке" value={String(rows.length)} subtitle="Строки по текущему фильтру" tone="orange" icon={<ShieldIcon width={18} height={18} />} onClick={() => applyPresetView("operations")} />
        <StatCard title="Открыты" value={String(openCount)} subtitle="Живые ограничения" tone="blue" icon={<IncidentIcon width={18} height={18} />} onClick={() => applyPresetView("operations")} />
        <StatCard title="За месяц" value={String(currentMonthRows.length)} subtitle="Новые записи текущего месяца" tone="blue" icon={<IncidentIcon width={18} height={18} />} onClick={() => applyPresetView("currentMonth")} />
        <StatCard title="С водителем" value={String(rows.filter((item) => item.driverId).length)} subtitle={`Есть привязка к карточке водителя · в архиве ${archivedCount}`} tone="purple" icon={<DriversIcon width={18} height={18} />} onClick={() => setRelationFilter("linked")} />
        <StatCard title="Свободные записи" value={String(rows.filter((item) => !item.driverId).length)} subtitle="Записи без CRM-карточки" tone="green" icon={<DriversIcon width={18} height={18} />} onClick={() => setRelationFilter("free")} />
      </div>

      {showCreateModal ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть добавление записи"
            onClick={() => setShowCreateModal(false)}
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="blacklist-create-title">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Чёрный список</p>
                <h3 id="blacklist-create-title">Новая запись</h3>
                <p>Укажите водителя, дату, причину и ответственного.</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)}>Закрыть</button>
            </div>
            <div className="entity-modal__body">
              {canCreate ? (
                <form className="quick-form" onSubmit={(event) => void handleSubmit(event)}>
                  <p className="quick-form__meta">Фиксируйте запрет на выдачу авто прямо в CRM, чтобы он сразу попадал в отчёты и не терялся в таблицах.</p>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="ФИО / название записи" />
                  <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                    <option value="">Без привязки к карточке водителя</option>
                    {visibleDrivers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Причина / комментарий" rows={5} />
                  <input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} placeholder="Источник / дополнительная заметка" />
                  <input value={managerLabel} onChange={(event) => setManagerLabel(event.target.value)} placeholder="Бригадир" />
                  {message ? <div className="panel-note">{message}</div> : null}
                  {createIncident.error ? <div className="panel-note">Ошибка: {createIncident.error}</div> : null}
                  <button type="submit" disabled={createIncident.loading}>
                    {createIncident.loading ? "Сохраняем..." : "Добавить в чёрный список"}
                  </button>
                </form>
              ) : (
                <ReadOnlyNotice message="Создание записей для этой роли недоступно." />
              )}
            </div>
          </section>
        </>
      ) : null}

      <div className="table-grid table-grid--single">
        <article className="panel">
          <div className="panel__title">
            <IncidentIcon width={18} height={18} />
            <h3>Журнал ограничений</h3>
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
              <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value as typeof relationFilter)}>
                <option value="all">Все привязки</option>
                <option value="linked">С водителем</option>
                <option value="free">Без водителя</option>
              </select>
              <input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Поиск по ФИО, причине, заметке" />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={showHistoricalInList} onChange={(event) => setShowHistoricalInList(event.target.checked)} />
              <span>Показать закрытые и архив</span>
            </label>
            {canCreate ? (
              <div className="toolbar">
                <button type="button" onClick={toggleSelectAll}>
                  {allSelected ? "Снять выбор" : "Выбрать все"}
                </button>
                <span className="panel-note">Выбрано: {selectedCount}</span>
                <button type="button" disabled={!selectedCount} onClick={() => void handleBulkStatusUpdate("resolved")}>
                  Массово решить
                </button>
                <button type="button" disabled={!selectedCount} onClick={() => void handleBulkStatusUpdate("closed")}>
                  Массово закрыть
                </button>
                <button type="button" disabled={!selectedCount} onClick={() => void handleBulkStatusUpdate("archived")}>
                  Массово в архив
                </button>
              </div>
            ) : null}
          </div>
          <AsyncState
            loading={incidentsApi.loading || driversApi.loading}
            error={incidentsApi.error || driversApi.error}
            empty={!rows.length}
            emptyContent={<EmptyStatePanel title="Записей по фильтру нет" message="Измените фильтры или добавьте новую запись, чтобы она попала в рабочую очередь." />}
          >
            <table className="data-table blacklist-table">
              <thead>
                <tr>
                  {canCreate ? <th /> : null}
                  <th>Водитель</th>
                  <th>Дата</th>
                  <th>Причина</th>
                  <th>Бригадир</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
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
                      <div className="amount-stack">
                        <strong title={item.driverId ? (driverMap.get(item.driverId) ?? item.title) : item.title}>
                          {item.driverId ? (driverMap.get(item.driverId) ?? item.title) : item.title}
                        </strong>
                        {item.driverId && driverCompanyMap.get(item.driverId) ? <span>{driverCompanyMap.get(item.driverId)}</span> : null}
                      </div>
                    </td>
                    <td>{item.occurredAt ? formatDateOnly(item.occurredAt) : "-"}</td>
                    <td title={item.description ?? ""}>{item.description ?? "Причина не указана"}</td>
                    <td title={`${item.managerLabel ?? "Бригадир не указан"}${item.locationNote ? ` · ${item.locationNote}` : ""}`}>
                      {item.managerLabel ?? "Бригадир не указан"}
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
                        <Link className="table-link" to="/reports">
                          Отчёты
                        </Link>
                        {item.driverId ? (
                          <Link className="table-link" to={`/drivers/${item.driverId}`}>
                            Водитель
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AsyncState>
        </article>
      </div>
    </section>
  );
}
