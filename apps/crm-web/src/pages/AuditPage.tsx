import { Link } from "react-router-dom";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { StatCard } from "../ui/StatCard";
import { ContractsIcon, FinanceIcon, PaymentsIcon, ShieldIcon } from "../ui/CrmIcons";
import { downloadCsvTable, formatDateTime, formatShortId, getAggregateTypeLabel, getAuditActionLabel, getUserRoleLabel } from "../lib/utils";
import type { AuditLogItem, ContractListItem, DriverListItem, PaymentListItem, PayoutListItem, VehicleListItem } from "@gopark/contracts";
import { useState } from "react";

function getAuditTarget(item: AuditLogItem): { to: string; label: string } | null {
  if (!item.entityId) {
    return null;
  }

  if (item.entityType === "driver") {
    return { to: `/drivers/${item.entityId}`, label: "Открыть водителя" };
  }

  if (item.entityType === "contract") {
    return { to: `/contracts/${item.entityId}`, label: "Открыть договор" };
  }

  if (item.entityType === "car") {
    return { to: `/vehicles/${item.entityId}`, label: "Открыть авто" };
  }

  if (item.entityType === "payment") {
    return { to: "/payments", label: "Открыть платежи" };
  }

  if (item.entityType === "payout") {
    return { to: "/payouts", label: "Открыть выплаты" };
  }

  if (item.entityType === "outbox_event") {
    return { to: "/outbox", label: "Открыть события" };
  }

  return null;
}

function getAuditFollowUp(item: AuditLogItem): { to: string; label: string } | null {
  if (item.action.startsWith("payment.")) {
    return { to: "/payments", label: "Открыть платежи" };
  }

  if (item.action.startsWith("payout.")) {
    return { to: "/payouts", label: "Открыть выплаты" };
  }

  if (item.action.startsWith("outbox.")) {
    return { to: "/outbox", label: "Открыть события" };
  }

  if (item.action.startsWith("driver.")) {
    return { to: "/drivers", label: "Открыть водителей" };
  }

  return null;
}

function getAuditLinks(item: AuditLogItem): Array<{ to: string; label: string }> {
  const target = getAuditTarget(item);
  const followUp = getAuditFollowUp(item);

  return [target, followUp].filter((link, index, links): link is { to: string; label: string } => {
    if (!link) {
      return false;
    }

    if (target && followUp && target.to.startsWith("/drivers/") && followUp.to === "/drivers") {
      return link.to !== "/drivers";
    }

    if (target && followUp && target.to.startsWith("/contracts/") && followUp.to === "/contracts") {
      return link.to !== "/contracts";
    }

    return links.findIndex((candidate) => candidate?.to === link.to && candidate?.label === link.label) === index;
  });
}

function getAuditActor(item: AuditLogItem): string {
  const actor = item.afterData?.actor;
  if (actor && typeof actor === "object" && !Array.isArray(actor)) {
    const actorData = actor as Record<string, unknown>;
    const role = typeof actorData.role === "string" ? getUserRoleLabel(actorData.role) : "Пользователь";
    const name = [actorData.firstName, actorData.lastName, actorData.displayName, actorData.phone]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .trim();
    const id = typeof actorData.id === "string" ? formatShortId(actorData.id) : "";
    const company = typeof actorData.companyName === "string" && actorData.companyName.trim()
      ? ` · ${actorData.companyName}`
      : "";
    return `${role}${name ? ` · ${name}` : ""}${id ? ` · ${id}` : ""}${company}`;
  }

  const actorUserId = item.afterData?.actorUserId;
  if (typeof actorUserId === "string" && actorUserId.trim()) {
    return `Пользователь · ${formatShortId(actorUserId)}`;
  }

  return "Система";
}

function getNestedString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const data = value as Record<string, unknown>;
  for (const key of keys) {
    const current = data[key];
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
    if (typeof current === "number" && Number.isFinite(current)) {
      return String(current);
    }
  }

  return null;
}

function getAuditObjectLabel(item: AuditLogItem): string {
  const after = item.afterData ?? {};
  const before = item.beforeData ?? {};
  const source = getNestedString(after.driver, ["fullName", "phone"])
    ?? getNestedString(before.driver, ["fullName", "phone"])
    ?? getNestedString(after.contract, ["contractNumber"])
    ?? getNestedString(before.contract, ["contractNumber"])
    ?? getNestedString(after.car, ["plateNumber", "vin"])
    ?? getNestedString(before.car, ["plateNumber", "vin"])
    ?? getNestedString(after.payment, ["amount", "provider"])
    ?? getNestedString(after.payout, ["amount", "destination"])
    ?? getNestedString(after, ["phone", "contractNumber", "driverName", "carLabel", "amount"])
    ?? getNestedString(before, ["phone", "contractNumber", "driverName", "carLabel", "amount"]);

  return `${getAggregateTypeLabel(item.entityType)}${source ? ` · ${source}` : item.entityId ? ` · ${formatShortId(item.entityId)}` : ""}`;
}

function getAuditActionText(item: AuditLogItem): string {
  const objectType = getAggregateTypeLabel(item.entityType);
  if (item.action === "system.post") {
    return `${objectType} создан`;
  }
  if (item.action === "system.patch") {
    return `${objectType} изменён`;
  }
  if (item.action === "system.delete") {
    return `${objectType} удалён`;
  }

  return getAuditActionLabel(item.action);
}

function getAuditActionOptionLabel(action: string): string {
  if (action === "system.post") {
    return "Создание объекта";
  }
  if (action === "system.patch") {
    return "Изменение объекта";
  }
  if (action === "system.delete") {
    return "Удаление объекта";
  }

  return getAuditActionLabel(action);
}

function getAuditSummary(item: AuditLogItem): string {
  const action = getAuditActionText(item);
  const object = getAuditObjectLabel(item);
  const actor = getAuditActor(item);
  return `${actor} сделал: ${action}. Объект: ${object}.`;
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function getAuditFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    action: "Действие",
    actor: "Кто сделал",
    actorUserId: "ID пользователя",
    amount: "Сумма",
    appliedAmount: "Зачислено",
    carId: "Автомобиль",
    companyName: "Компания",
    contractId: "Договор",
    contractNumber: "Номер договора",
    createdAt: "Создано",
    driverId: "Водитель",
    entityId: "ID объекта",
    entityType: "Тип объекта",
    id: "ID",
    note: "Комментарий",
    phone: "Телефон",
    previousManagerId: "Прошлый бригадир",
    nextManagerId: "Новый бригадир",
    reason: "Причина",
    role: "Роль",
    status: "Статус",
    userId: "Пользователь",
  };

  return labels[key] ?? key;
}

function getAuditRows(data: Record<string, unknown> | null | undefined): Array<[string, unknown]> {
  if (!data) {
    return [];
  }

  return Object.entries(data).filter(([, value]) => value !== undefined);
}

export function AuditPage() {
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [actionFilter, setActionFilter] = useState<"all" | string>("all");
  const [entityFilter, setEntityFilter] = useState<"all" | string>("all");
  const [query, setQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const api = useApiQuery<AuditLogItem[]>("audit/logs");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const companies = settingsApi.data?.companies ?? [];
  const driverCompanyMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const contractDriverMap = new Map((contractsApi.data ?? []).map((item) => [item.id, item.driverId]));
  const vehicleCompanyMap = new Map((vehiclesApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const paymentDriverMap = new Map((paymentsApi.data ?? []).map((item) => [item.id, item.driverId]));
  const payoutDriverMap = new Map((payoutsApi.data ?? []).map((item) => [item.id, item.driverId]));
  const resolveCompany = (item: AuditLogItem): string => {
    if (!item.entityId) {
      return "";
    }
    if (item.entityType === "driver") {
      return driverCompanyMap.get(item.entityId) ?? "";
    }
    if (item.entityType === "contract") {
      return driverCompanyMap.get(contractDriverMap.get(item.entityId) ?? "") ?? "";
    }
    if (item.entityType === "car") {
      return vehicleCompanyMap.get(item.entityId) ?? "";
    }
    if (item.entityType === "payment") {
      return driverCompanyMap.get(paymentDriverMap.get(item.entityId) ?? "") ?? "";
    }
    if (item.entityType === "payout") {
      return driverCompanyMap.get(payoutDriverMap.get(item.entityId) ?? "") ?? "";
    }
    return "";
  };
  const availableActions = Array.from(new Set((api.data ?? []).map((item) => item.action))).sort();
  const availableEntityTypes = Array.from(new Set((api.data ?? []).map((item) => item.entityType))).sort();
  const logs = (api.data ?? []).filter((item) => {
    const inCompany = companyFilter === "all" || resolveCompany(item) === companyFilter;
    const inAction = actionFilter === "all" || item.action === actionFilter;
    const inEntity = entityFilter === "all" || item.entityType === entityFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const inSearch = !normalizedQuery || [
      item.id,
      item.action,
      item.entityType,
      item.entityId ?? "",
      item.correlationId,
      getAuditActor(item),
      getAuditObjectLabel(item),
      getAuditSummary(item),
      resolveCompany(item),
      getAuditActionText(item),
      getAggregateTypeLabel(item.entityType),
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return inCompany && inAction && inEntity && inSearch;
  });
  const paymentActions = logs.filter((item) => item.action.startsWith("payment.")).length;
  const payoutActions = logs.filter((item) => item.action.startsWith("payout.")).length;
  const outboxActions = logs.filter((item) => item.action.startsWith("outbox.")).length;
  const driverActions = logs.filter((item) => item.action.startsWith("driver.")).length;

  function handleExport(): void {
    if (!api.data?.length) {
      return;
    }

    downloadCsvTable(
      "gopark-audit-log.csv",
      ["entry", "company", "action", "entity_type", "entity_id", "correlation", "created_at"],
      logs.map((item) => [
        formatShortId(item.id),
        resolveCompany(item),
        getAuditActionText(item),
        getAggregateTypeLabel(item.entityType),
        item.entityId ? formatShortId(item.entityId) : "",
        formatShortId(item.correlationId),
        formatDateTime(item.createdAt),
      ]),
    );
  }

  return (
    <section className="page-stack audit-page">
      <div className="hero-card">
        <p className="eyebrow">События</p>
        <h2>События системы</h2>
        <p>Все действия: пароли, водители, авто, договоры, платежи, выплаты и системные изменения.</p>
        {logs.length ? (
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по действию, объекту, correlation" />
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="all">Все действия</option>
              {availableActions.map((item) => (
                <option key={item} value={item}>
                  {getAuditActionOptionLabel(item)}
                </option>
              ))}
            </select>
            <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
              <option value="all">Все объекты</option>
              {availableEntityTypes.map((item) => (
                <option key={item} value={item}>
                  {getAggregateTypeLabel(item)}
                </option>
              ))}
            </select>
            <button onClick={handleExport}>Скачать CSV</button>
          </div>
        ) : null}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Всего событий"
          value={String(logs.length)}
          subtitle="Текущий журнал"
          tone="blue"
          icon={<ShieldIcon width={18} height={18} />}
          onClick={() => {
            setActionFilter("all");
            setEntityFilter("all");
            setQuery("");
          }}
        />
        <StatCard
          title="Платежи"
          value={String(paymentActions)}
          subtitle="Финансовые действия по приёму оплат"
          tone="green"
          icon={<PaymentsIcon width={18} height={18} />}
          onClick={() => {
            setActionFilter("all");
            setEntityFilter("payment");
            setQuery("");
          }}
        />
        <StatCard
          title="Выплаты"
          value={String(payoutActions)}
          subtitle="Согласование и вывод"
          tone="orange"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => {
            setActionFilter("all");
            setEntityFilter("payout");
            setQuery("");
          }}
        />
        <StatCard
          title="Очередь и водители"
          value={String(outboxActions + driverActions)}
          subtitle={`${outboxActions} событий и ${driverActions} действий по водителям`}
          tone="purple"
          icon={<ContractsIcon width={18} height={18} />}
          onClick={() => {
            setActionFilter("all");
            setEntityFilter("all");
            setQuery("водитель");
          }}
        />
      </div>
      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!logs.length}
        emptyContent={
          <EmptyStatePanel
            title="Журнал пока пуст"
            message="История пока пуста."
          />
        }
      >
        <article className="panel">
          <table className="data-table audit-table">
            <thead>
              <tr>
                <th>Действие</th>
                <th>Объект</th>
                <th>Кто сделал</th>
                <th>Что произошло</th>
                <th>Создано</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((item) => (
                <tr key={item.id} onClick={() => setSelectedLog(item)} style={{ cursor: "pointer" }}>
                  <td className="audit-table__action" title={getAuditActionText(item)}>{getAuditActionText(item)}</td>
                  <td className="audit-table__object">
                    <div className="audit-table__object-stack">
                      <strong>{getAuditObjectLabel(item)}</strong>
                      {getAuditLinks(item).map((link) => (
                        <Link
                          key={`${link.to}:${link.label}`}
                          className="table-link"
                          to={link.to}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="audit-table__actor" title={getAuditActor(item)}>{getAuditActor(item)}</td>
                  <td className="audit-table__summary" title={getAuditSummary(item)}>
                    <div className="audit-summary">
                      <span><b>Кто:</b> {getAuditActor(item)}</span>
                      <span><b>Что:</b> {getAuditActionText(item)}</span>
                      <span><b>Объект:</b> {getAuditObjectLabel(item)}</span>
                    </div>
                  </td>
                  <td className="audit-table__date">{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>
      {selectedLog ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть событие"
            onClick={() => setSelectedLog(null)}
          />
          <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="audit-event-title">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Событие</p>
      <h3 id="audit-event-title">{getAuditActionText(selectedLog)}</h3>
                <p>
                  {getAuditObjectLabel(selectedLog)} · {formatDateTime(selectedLog.createdAt)}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)}>Закрыть</button>
            </div>
            <div className="entity-modal__body">
              <div className="table-grid audit-modal-grid">
                <article className="panel panel--nested">
                  <h3>Основное</h3>
                  <div className="summary-list">
                    <div><span>Кто сделал</span><strong>{getAuditActor(selectedLog)}</strong></div>
                    <div><span>Действие</span><strong>{getAuditActionText(selectedLog)}</strong></div>
                    <div><span>Что произошло</span><strong>{getAuditSummary(selectedLog)}</strong></div>
                    <div><span>Объект</span><strong>{getAggregateTypeLabel(selectedLog.entityType)}</strong></div>
                    <div><span>ID объекта</span><strong>{selectedLog.entityId ?? "—"}</strong></div>
                    <div><span>Связка</span><strong>{selectedLog.correlationId}</strong></div>
                    <div><span>Дата</span><strong>{formatDateTime(selectedLog.createdAt)}</strong></div>
                  </div>
                </article>
                <article className="panel panel--nested">
                  <h3>После действия</h3>
                  <div className="summary-list">
                    {getAuditRows(selectedLog.afterData).length ? getAuditRows(selectedLog.afterData).map(([key, value]) => (
                      <div key={key}>
                        <span>{getAuditFieldLabel(key)}</span>
                        <strong><pre>{formatAuditValue(value)}</pre></strong>
                      </div>
                    )) : <span>Нет данных.</span>}
                  </div>
                </article>
                <article className="panel panel--nested">
                  <h3>До действия</h3>
                  <div className="summary-list">
                    {getAuditRows(selectedLog.beforeData).length ? getAuditRows(selectedLog.beforeData).map(([key, value]) => (
                      <div key={key}>
                        <span>{getAuditFieldLabel(key)}</span>
                        <strong><pre>{formatAuditValue(value)}</pre></strong>
                      </div>
                    )) : <span>Нет данных.</span>}
                  </div>
                </article>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
