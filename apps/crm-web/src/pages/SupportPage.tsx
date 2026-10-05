import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  DriverListItem,
  ManagerAssignedDriverItem,
  ManagerDriverDetail,
  UserAdminListItem,
} from "@gopark/contracts";
import { downloadCsvTable, formatDateOnly, getStatusLabel, getStatusTone } from "../lib/utils";
import { fetchJson, postJson } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { hasCrmCapability } from "../lib/crm-access";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, ShieldIcon } from "../ui/CrmIcons";

type SupportRow = {
  driverId: string;
  driverName: string;
  requestId: string;
  type: string;
  status: string;
  period: string;
  startDate: string | null;
  managerId: string | null;
  managerLabel: string;
};

function extractPeriodStart(period: string): string | null {
  const match = period.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function getSupportThemeLabel(type: string): string {
  if (type === "day_off") {
    return "Выходной";
  }

  if (type === "vacation") {
    return "Отпросился";
  }

  if (type === "force_majeure") {
    return "Форс-мажор";
  }

  return getStatusLabel(type);
}

const SUPPORT_THEME_OPTIONS = [
  { value: "all", label: "Все темы" },
  { value: "day_off", label: "Выходной" },
  { value: "vacation", label: "Отпросился" },
  { value: "force_majeure", label: "Форс-мажор" },
] as const;

export function SupportPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const urlTheme = searchParams.get("theme");
  const initialTheme = SUPPORT_THEME_OPTIONS.some((item) => item.value === urlTheme) ? urlTheme ?? "all" : "all";
  const [theme, setTheme] = useState(initialTheme);
  const [status, setStatus] = useState("all");
  const [managerId, setManagerId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canApproveStatusRequest = hasCrmCapability(session.requestUserRole, "approve-status-request");
  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const users = useMemo(() => usersApi.data ?? [], [usersApi.data]);
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const driverCompanyMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.companyName ?? ""])), [drivers]);
  const managerMap = useMemo(() => new Map(
    users
      .filter((item) => item.managerProfileId)
      .map((item) => [item.managerProfileId as string, item.displayName]),
  ), [users]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchJson<ManagerAssignedDriverItem[]>("mobile/manager/drivers")
      .then(async (drivers) => {
        const details = await Promise.all(
          drivers.map((driver) =>
            fetchJson<ManagerDriverDetail>(`mobile/manager/drivers/${driver.id}`).catch(() => null),
          ),
        );

        if (cancelled) {
          return;
        }

        const nextRows = details
          .filter((item): item is ManagerDriverDetail => item !== null)
          .flatMap((detail) =>
            detail.recentStatusRequests.map((request) => ({
              driverId: detail.id,
              driverName: detail.fullName,
              requestId: request.id,
              type: request.type,
              status: request.status,
              period: request.period,
              startDate: extractPeriodStart(request.period),
              managerId: detail.managerId,
              managerLabel: detail.managerId ? (managerMap.get(detail.managerId) ?? "Бригадир не указан") : "Бригадир не указан",
            })),
          )
          .sort((left, right) => {
            const leftDate = left.startDate ?? "";
            const rightDate = right.startDate ?? "";
            return rightDate.localeCompare(leftDate);
          });

        setRows(nextRows);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить обращения.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [managerMap]);

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        `${item.driverName} ${item.period} ${item.managerLabel}`.toLowerCase().includes(normalizedQuery);
      const matchesTheme = theme === "all" || item.type === theme;
      const matchesStatus = status === "all" || item.status === status;
      const matchesManager = managerId === "all" || item.managerId === managerId;
      const matchesCompany = companyFilter === "all" || (driverCompanyMap.get(item.driverId) ?? "") === companyFilter;
      const matchesFrom = !dateFrom || ((item.startDate ?? "") >= dateFrom);
      const matchesTo = !dateTo || ((item.startDate ?? "") <= dateTo);

      return matchesQuery && matchesTheme && matchesStatus && matchesManager && matchesCompany && matchesFrom && matchesTo;
    });
  }, [companyFilter, dateFrom, dateTo, driverCompanyMap, managerId, query, rows, status, theme]);

  const pendingCount = rows.filter((item) => item.status === "pending").length;
  const approvedCount = rows.filter((item) => item.status === "approved").length;
  const rejectedCount = rows.filter((item) => item.status === "rejected").length;
  const managerOptions = useMemo(() => [...managerMap.entries()].sort((left, right) => left[1].localeCompare(right[1])), [managerMap]);
  const selectedCount = selectedRequestIds.length;
  const allSelected = filteredRows.length > 0 && selectedCount === filteredRows.length;

  useEffect(() => {
    setSelectedRequestIds((current) =>
      current.filter((requestId) => filteredRows.some((item) => item.requestId === requestId)),
    );
  }, [filteredRows]);

  function applyTheme(nextTheme: string): void {
    setTheme(nextTheme);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTheme === "all") {
      nextParams.delete("theme");
    } else {
      nextParams.set("theme", nextTheme);
    }
    setSearchParams(nextParams, { replace: true });
  }

  function handleExport(): void {
    if (!filteredRows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-support.csv",
      ["company", "driver", "theme", "status", "period", "date", "manager"],
      filteredRows.map((item) => [
        driverCompanyMap.get(item.driverId) ?? "",
        item.driverName,
        getSupportThemeLabel(item.type),
        getStatusLabel(item.status),
        item.period,
        item.startDate ?? "",
        item.managerLabel,
      ]),
    );
  }

  async function handleAction(requestId: string, driverName: string, action: "approve" | "reject"): Promise<void> {
    setActionMessage(null);
    setActionError(null);
    setPendingActionId(requestId);

    try {
      await postJson(`approvals/status-requests/${requestId}/${action}`, {});
      setRows((current) =>
        current.map((item) => (item.requestId === requestId ? { ...item, status: action === "approve" ? "approved" : "rejected" } : item)),
      );
      setActionMessage(
        action === "approve"
          ? `Обращение водителя ${driverName} подтверждено.`
          : `Обращение водителя ${driverName} отклонено.`,
      );
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Не удалось обработать обращение.");
    } finally {
      setPendingActionId(null);
    }
  }

  function toggleRequestSelection(requestId: string): void {
    setSelectedRequestIds((current) =>
      current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedRequestIds(allSelected ? [] : filteredRows.map((item) => item.requestId));
  }

  async function handleBulkAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedRequestIds.length) {
      setActionError("Выберите хотя бы одно обращение.");
      return;
    }

    setActionMessage(null);
    setActionError(null);
    setBulkActionLoading(true);
    let processedCount = 0;

    try {
      for (const requestId of selectedRequestIds) {
        await postJson(`approvals/status-requests/${requestId}/${action}`, {});
        processedCount += 1;
      }

      setRows((current) =>
        current.map((item) =>
          selectedRequestIds.includes(item.requestId)
            ? { ...item, status: action === "approve" ? "approved" : "rejected" }
            : item,
        ),
      );
      setSelectedRequestIds([]);
      setActionMessage(
        action === "approve"
          ? `Подтверждено ${processedCount} обращений.`
          : `Отклонено ${processedCount} обращений.`,
      );
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Не удалось выполнить массовую обработку.");
    } finally {
      setBulkActionLoading(false);
    }
  }

  return (
    <section className="page-stack support-page">
      <div className="hero-card">
        <p className="eyebrow">Служба поддержки</p>
        <h2>Служба поддержки</h2>
        <p>Обращения водителей, темы запросов, периоды и ручная обработка по бригадирам.</p>
        <div className="toolbar">
          {filteredRows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
          <Link className="table-link" to="/drivers">
            Открыть водителей
          </Link>
        </div>
        {actionMessage ? <div className="panel-note">{actionMessage}</div> : null}
        {actionError ? <div className="panel-note">Ошибка: {actionError}</div> : null}
      </div>

      <div className="stats-grid">
        <StatCard
          title="Всего обращений"
          value={String(rows.length)}
          subtitle="Все темы в журнале"
          tone="blue"
          icon={<ShieldIcon width={18} height={18} />}
          onClick={() => {
            applyTheme("all");
            setStatus("all");
            setQuery("");
          }}
        />
        <StatCard
          title="Ожидают решения"
          value={String(pendingCount)}
          subtitle="Нужна ручная обработка"
          tone="orange"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setStatus("pending");
            setQuery("");
          }}
        />
        <StatCard
          title="Подтверждено"
          value={String(approvedCount)}
          subtitle="Уже принято"
          tone="green"
          icon={<ShieldIcon width={18} height={18} />}
          onClick={() => {
            setStatus("approved");
            setQuery("");
          }}
        />
        <StatCard
          title="Отклонено"
          value={String(rejectedCount)}
          subtitle="Не прошло согласование"
          tone="purple"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setStatus("rejected");
            setQuery("");
          }}
        />
      </div>

      <article className="panel filter-panel">
        <div className="panel__title">
          <ShieldIcon width={18} height={18} />
          <h3>Фильтры поддержки</h3>
        </div>
        <div className="toolbar">
          {SUPPORT_THEME_OPTIONS.map((item) => (
            <button
              key={item.value}
              className={theme === item.value ? "inline-action" : undefined}
              onClick={() => applyTheme(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {canApproveStatusRequest ? (
          <div className="toolbar">
            <button type="button" onClick={toggleSelectAll}>
              {allSelected ? "Снять выбор" : "Выбрать все"}
            </button>
            <span className="panel-note">Выбрано: {selectedCount}</span>
            <button type="button" disabled={bulkActionLoading || !selectedCount} onClick={() => void handleBulkAction("approve")}>
              {bulkActionLoading ? "Обрабатываем..." : "Массово подтвердить"}
            </button>
            <button type="button" disabled={bulkActionLoading || !selectedCount} onClick={() => void handleBulkAction("reject")}>
              {bulkActionLoading ? "Обрабатываем..." : "Массово отклонить"}
            </button>
          </div>
        ) : null}
        <div className="form-grid">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по водителю, периоду или бригадиру" />
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Все компании</option>
            {companies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={theme} onChange={(event) => applyTheme(event.target.value)}>
            {SUPPORT_THEME_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Все статусы</option>
            <option value="pending">Ожидает</option>
            <option value="approved">Одобрено</option>
            <option value="rejected">Отклонено</option>
          </select>
          <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
            <option value="all">Все бригадиры</option>
            {managerOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </article>

      {!canApproveStatusRequest ? (
        <ReadOnlyNotice message="Для этой роли доступен просмотр обращений без подтверждения и отклонения." />
      ) : null}

      <AsyncState
        loading={loading || driversApi.loading || usersApi.loading}
        error={error ?? driversApi.error ?? usersApi.error}
        empty={!filteredRows.length}
        emptyContent={
          <EmptyStatePanel
            title="Обращений по фильтру нет"
            message="Измените тему, даты или бригадира, чтобы увидеть другие обращения."
          />
        }
      >
        <article className="panel">
          <table className="data-table support-table">
            <thead>
              <tr>
                <th />
                <th>Водитель</th>
                <th>Тема</th>
                <th>Период</th>
                <th>Дата</th>
                <th>Бригадир</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => (
                <tr key={item.requestId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedRequestIds.includes(item.requestId)}
                      onChange={() => toggleRequestSelection(item.requestId)}
                    />
                  </td>
                  <td>
                    <div className="amount-stack">
                      <Link className="table-link" to={`/drivers/${item.driverId}`} title={item.driverName}>
                        {item.driverName}
                      </Link>
                      {driverCompanyMap.get(item.driverId) ? <span>{driverCompanyMap.get(item.driverId)}</span> : null}
                    </div>
                  </td>
                  <td>{getSupportThemeLabel(item.type)}</td>
                  <td title={item.period}>{item.period}</td>
                  <td>{formatDateOnly(item.startDate)}</td>
                  <td title={item.managerLabel}>{item.managerLabel}</td>
                  <td>
                    <span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        Открыть водителя
                      </Link>
                      {item.status === "pending" && canApproveStatusRequest ? (
                        <>
                          <button
                            className="inline-action"
                            disabled={pendingActionId === item.requestId}
                            onClick={() => void handleAction(item.requestId, item.driverName, "approve")}
                          >
                            {pendingActionId === item.requestId ? "Сохраняем..." : "Одобрить"}
                          </button>
                          <button
                            className="inline-action"
                            disabled={pendingActionId === item.requestId}
                            onClick={() => void handleAction(item.requestId, item.driverName, "reject")}
                          >
                            {pendingActionId === item.requestId ? "Сохраняем..." : "Отклонить"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>
    </section>
  );
}
