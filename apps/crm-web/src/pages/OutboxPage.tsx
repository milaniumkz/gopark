import { useState } from "react";
import { Link } from "react-router-dom";
import { hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { postJson } from "../lib/api";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { ContractsIcon, DriversIcon, PaymentsIcon, ShieldIcon } from "../ui/CrmIcons";
import { downloadCsvTable, formatDateTime, formatShortId, getAggregateTypeLabel, getOutboxStatusLabel, getOutboxTopicLabel, getStatusTone } from "../lib/utils";
import type { ContractListItem, DriverListItem, PaymentListItem, PayoutListItem, VehicleListItem } from "@gopark/contracts";

type OutboxEvent = {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  status: string;
  createdAt: string;
};

function getOutboxTarget(item: OutboxEvent): { to: string; label: string } | null {
  if (item.aggregateType === "driver") {
    return { to: `/drivers/${item.aggregateId}`, label: "Открыть водителя" };
  }

  if (item.aggregateType === "contract") {
    return { to: `/contracts/${item.aggregateId}`, label: "Открыть договор" };
  }

  if (item.aggregateType === "car") {
    return { to: `/vehicles/${item.aggregateId}`, label: "Открыть авто" };
  }

  if (item.aggregateType === "payment") {
    return { to: "/payments", label: "Открыть платежи" };
  }

  if (item.aggregateType === "payout") {
    return { to: "/payouts", label: "Открыть выплаты" };
  }

  return null;
}

function getOutboxFollowUp(item: OutboxEvent): { to: string; label: string } | null {
  if (item.topic.startsWith("payment.")) {
    return { to: "/payments", label: "Открыть платежи" };
  }

  if (item.topic.startsWith("payout.")) {
    return { to: "/payouts", label: "Открыть выплаты" };
  }

  if (item.topic.startsWith("driver.")) {
    return { to: "/drivers", label: "Открыть водителей" };
  }

  if (item.topic.startsWith("contract.")) {
    return { to: "/contracts", label: "Открыть договоры" };
  }

  return null;
}

function getOutboxLinks(item: OutboxEvent): Array<{ to: string; label: string }> {
  const target = getOutboxTarget(item);
  const followUp = getOutboxFollowUp(item);

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

export function OutboxPage() {
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");
  const [aggregateFilter, setAggregateFilter] = useState<"all" | string>("all");
  const [topicFilter, setTopicFilter] = useState<"all" | string>("all");
  const [query, setQuery] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const api = useApiQuery<OutboxEvent[]>("outbox");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const canProcessOutbox = hasCrmCapability(session.requestUserRole, "process-outbox") && !session.companyName;
  const companies = settingsApi.data?.companies ?? [];
  const driverCompanyMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const contractDriverMap = new Map((contractsApi.data ?? []).map((item) => [item.id, item.driverId]));
  const vehicleCompanyMap = new Map((vehiclesApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const paymentDriverMap = new Map((paymentsApi.data ?? []).map((item) => [item.id, item.driverId]));
  const payoutDriverMap = new Map((payoutsApi.data ?? []).map((item) => [item.id, item.driverId]));
  const resolveCompany = (item: OutboxEvent): string => {
    if (item.aggregateType === "driver") {
      return driverCompanyMap.get(item.aggregateId) ?? "";
    }
    if (item.aggregateType === "contract") {
      return driverCompanyMap.get(contractDriverMap.get(item.aggregateId) ?? "") ?? "";
    }
    if (item.aggregateType === "car") {
      return vehicleCompanyMap.get(item.aggregateId) ?? "";
    }
    if (item.aggregateType === "payment") {
      return driverCompanyMap.get(paymentDriverMap.get(item.aggregateId) ?? "") ?? "";
    }
    if (item.aggregateType === "payout") {
      return driverCompanyMap.get(payoutDriverMap.get(item.aggregateId) ?? "") ?? "";
    }
    return "";
  };
  const availableTopics = Array.from(new Set((api.data ?? []).map((item) => item.topic))).sort();
  const availableAggregateTypes = Array.from(new Set((api.data ?? []).map((item) => item.aggregateType))).sort();
  const events = (api.data ?? []).filter((item) => {
    const inCompany = companyFilter === "all" || resolveCompany(item) === companyFilter;
    const inStatus = statusFilter === "all" || (statusFilter === "__pending__" ? item.status === "pending" || item.status === "queued" : item.status === statusFilter);
    const inAggregate = aggregateFilter === "all" || item.aggregateType === aggregateFilter;
    const inTopic = topicFilter === "all" || item.topic === topicFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const inSearch = !normalizedQuery || [
      item.id,
      item.topic,
      item.aggregateType,
      item.aggregateId,
      resolveCompany(item),
      getOutboxTopicLabel(item.topic),
      getAggregateTypeLabel(item.aggregateType),
      getOutboxStatusLabel(item.status),
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return inCompany && inStatus && inAggregate && inTopic && inSearch;
  });
  const publishedCount = events.filter((item) => item.status === "published").length;
  const pendingCount = events.filter((item) => item.status === "pending" || item.status === "queued").length;
  const paymentTopics = events.filter((item) => item.topic.startsWith("payment.")).length;
  const payoutTopics = events.filter((item) => item.topic.startsWith("payout.")).length;
  const retryableEvents = events.filter((item) => item.status === "failed" || item.status === "pending" || item.status === "queued");

  function toggleEventSelection(eventId: string): void {
    setSelectedEventIds((current) =>
      current.includes(eventId)
        ? current.filter((item) => item !== eventId)
        : [...current, eventId],
    );
  }

  function selectRetryableEvents(): void {
    setSelectedEventIds(retryableEvents.map((item) => item.id));
  }

  function clearSelectedEvents(): void {
    setSelectedEventIds([]);
  }

  async function handleRetry(eventIds: string[]): Promise<void> {
    if (!eventIds.length) {
      return;
    }

    setProcessError(null);
    setResultMessage(null);
    setIsRetrying(true);
    try {
      for (const eventId of eventIds) {
        await postJson<OutboxEvent, Record<string, never>>(`outbox/${eventId}/retry`, {});
      }
      setSelectedEventIds([]);
      setResultMessage(`Переочередь поставлена для ${eventIds.length} событий.`);
      api.refetch();
    } catch (error) {
      setProcessError(error instanceof Error ? error.message : "Не удалось поставить события в повторную обработку.");
    } finally {
      setIsRetrying(false);
    }
  }

  function handleExport(): void {
    if (!api.data?.length) {
      return;
    }

    downloadCsvTable(
      "gopark-outbox-events.csv",
      ["event", "company", "topic", "aggregate_type", "aggregate_id", "status", "created_at"],
      events.map((item) => [
        formatShortId(item.id),
        resolveCompany(item),
        getOutboxTopicLabel(item.topic),
        getAggregateTypeLabel(item.aggregateType),
        formatShortId(item.aggregateId),
        getOutboxStatusLabel(item.status),
        formatDateTime(item.createdAt),
      ]),
    );
  }

  return (
    <section className="page-stack outbox-page">
      <div className="hero-card">
        <p className="eyebrow">События</p>
        <h2>Очередь событий</h2>
        <p>События для уведомлений, аналитики и синхронизации.</p>
        {canProcessOutbox ? (
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по топику, агрегату, компании" />
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Все статусы</option>
              <option value="__pending__">Ожидает/в очереди</option>
              <option value="pending">Ожидает</option>
              <option value="queued">В очереди</option>
              <option value="published">Отправлено</option>
              <option value="failed">Ошибка</option>
            </select>
            <select value={aggregateFilter} onChange={(event) => setAggregateFilter(event.target.value)}>
              <option value="all">Все агрегаты</option>
              {availableAggregateTypes.map((item) => (
                <option key={item} value={item}>
                  {getAggregateTypeLabel(item)}
                </option>
              ))}
            </select>
            <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
              <option value="all">Все топики</option>
              {availableTopics.map((item) => (
                <option key={item} value={item}>
                  {getOutboxTopicLabel(item)}
                </option>
              ))}
            </select>
            <button type="button" className="button-secondary" onClick={selectRetryableEvents}>
              Выбрать все проблемные
            </button>
            <button type="button" className="button-secondary" onClick={clearSelectedEvents}>
              Снять выбор
            </button>
            <span>Выбрано: {selectedEventIds.length}</span>
            {api.data?.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
            <button
              type="button"
              disabled={!selectedEventIds.length || isRetrying}
              onClick={() => void handleRetry(selectedEventIds)}
            >
              {isRetrying ? "Ставим в очередь..." : "Массово переочередить"}
            </button>
            <button
              disabled={isProcessing || isRetrying}
              onClick={async () => {
                setProcessError(null);
                setIsProcessing(true);
                try {
                  const result = await postJson<{
                    mode: "inline" | "queued";
                    processedCount: number;
                    processed: string[];
                    queuedCount: number;
                    queued: string[];
                  }, Record<string, never>>(
                    "workers/outbox/process",
                    {},
                  );
                  setResultMessage(
                    result.mode === "queued"
                      ? `Добавлено в очередь: ${result.queuedCount}`
                      : `Обработано событий: ${result.processedCount}`,
                  );
                  api.refetch();
                } catch (error) {
                  setProcessError(error instanceof Error ? error.message : "Не удалось запустить обработку.");
                } finally {
                  setIsProcessing(false);
                }
              }}
            >
              {isProcessing ? "Запускаем..." : "Запустить обработку"}
            </button>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по топику, агрегату, компании" />
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
                <option value="all">Все компании</option>
                {companies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Все статусы</option>
                <option value="__pending__">Ожидает/в очереди</option>
                <option value="pending">Ожидает</option>
                <option value="queued">В очереди</option>
                <option value="published">Отправлено</option>
                <option value="failed">Ошибка</option>
              </select>
              <select value={aggregateFilter} onChange={(event) => setAggregateFilter(event.target.value)}>
                <option value="all">Все агрегаты</option>
                {availableAggregateTypes.map((item) => (
                  <option key={item} value={item}>
                    {getAggregateTypeLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <ReadOnlyNotice message={session.companyName ? "Для пользователей компании доступен только просмотр своей очереди." : "Для этой роли доступен только просмотр очереди."} />
          </>
        )}
        {resultMessage ? <div className="panel-note">{resultMessage}</div> : null}
        {processError ? <div className="panel-note">Ошибка обработки: {processError}</div> : null}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Всего событий"
          value={String(events.length)}
          subtitle="Текущая очередь"
          tone="blue"
          icon={<ShieldIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("all");
            setAggregateFilter("all");
            setTopicFilter("all");
            setQuery("");
          }}
        />
        <StatCard
          title="Ожидают обработку"
          value={String(pendingCount)}
          subtitle="Ещё не обработаны"
          tone="purple"
          icon={<ContractsIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("__pending__");
            setQuery("");
          }}
        />
        <StatCard
          title="Платёжные"
          value={String(paymentTopics)}
          subtitle="Связаны с приёмом оплат"
          tone="green"
          icon={<PaymentsIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("all");
            setTopicFilter("all");
            setQuery("payment.");
          }}
        />
        <StatCard
          title="Отправлены"
          value={String(publishedCount)}
          subtitle={publishedCount > 0 ? "Успешно опубликованы" : "Пока без отправленных событий"}
          tone="orange"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("published");
            setQuery("");
          }}
        />
      </div>
      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!api.data?.length}
        emptyContent={
          <EmptyStatePanel
            title="Очередь пуста"
            message={canProcessOutbox
              ? "Сейчас нет ожидающих событий."
              : "Сейчас нет ожидающих событий."}
          />
        }
      >
        <article className="panel">
          <div className="table-scroll">
            <table className="data-table outbox-table">
            <thead>
              <tr>
                {canProcessOutbox ? <th>Выбор</th> : null}
                <th>Топик</th>
                <th>Агрегат</th>
                <th>Статус</th>
                <th>Создано</th>
              </tr>
            </thead>
            <tbody>
              {events.map((item) => (
                <tr key={item.id}>
                  {canProcessOutbox ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEventIds.includes(item.id)}
                        disabled={item.status === "published"}
                        onChange={() => toggleEventSelection(item.id)}
                      />
                    </td>
                  ) : null}
                  <td title={item.topic}>{getOutboxTopicLabel(item.topic)}</td>
                  <td>
                    <div className="identity-cell">
                      <strong title={item.aggregateId}>{getAggregateTypeLabel(item.aggregateType)} / {formatShortId(item.aggregateId)}</strong>
                      {getOutboxLinks(item).map((link) => (
                        <Link key={`${link.to}:${link.label}`} className="table-link" to={link.to}>
                          {link.label}
                        </Link>
                      ))}
                      {canProcessOutbox && item.status !== "published" ? (
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={isRetrying}
                          onClick={() => void handleRetry([item.id])}
                        >
                          Переочередить
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td><span className={getStatusTone(item.status)}>{getOutboxStatusLabel(item.status)}</span></td>
                  <td>{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </article>
      </AsyncState>
    </section>
  );
}
