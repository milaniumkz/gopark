import { useState } from "react";
import { Link } from "react-router-dom";
import { hasCrmAccess } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, FinanceIcon, PaymentsIcon, ShieldIcon } from "../ui/CrmIcons";
import { postJson } from "../lib/api";
import { downloadCsvTable, formatShortId, getNotificationChannelLabel, getNotificationStatusLabel, getNotificationTemplateLabel, getStatusTone } from "../lib/utils";
import type { DriverListItem, NotificationListItem, UserAdminListItem } from "@gopark/contracts";

export function NotificationsPage() {
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | string>("all");
  const [templateFilter, setTemplateFilter] = useState<"all" | string>("all");
  const [query, setQuery] = useState("");
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const api = useApiQuery<NotificationListItem[]>("notifications");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const companies = settingsApi.data?.companies ?? [];
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const driverCompanyMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const userMap = new Map((usersApi.data ?? []).map((item) => [item.id, item.displayName]));
  const canOpenPayouts = hasCrmAccess(session.requestUserRole, "payouts");
  const notifications = (api.data ?? []).filter((item) => {
    const inCompany = companyFilter === "all" || (item.driverId ? driverCompanyMap.get(item.driverId) : "") === companyFilter;
    const inStatus = statusFilter === "all" || item.status === statusFilter;
    const inChannel = channelFilter === "all" || item.channel === channelFilter;
    const inTemplate = templateFilter === "all" || (templateFilter === "__payout__" ? item.template.startsWith("payout_") : item.template === templateFilter);
    const normalizedQuery = query.trim().toLowerCase();
    const inSearch = !normalizedQuery || [
      item.id,
      item.userId ?? "",
      item.driverId ?? "",
      driverMap.get(item.driverId ?? "") ?? "",
      driverCompanyMap.get(item.driverId ?? "") ?? "",
      userMap.get(item.userId ?? "") ?? "",
      item.channel,
      item.template,
      item.status,
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return inCompany && inStatus && inChannel && inTemplate && inSearch;
  });
  const availableTemplates = Array.from(new Set((api.data ?? []).map((item) => item.template))).sort();
  const pendingCount = notifications.filter((item) => item.status === "pending").length;
  const failedCount = notifications.filter((item) => item.status === "failed").length;
  const payoutTemplateCount = notifications.filter((item) => item.template.startsWith("payout_")).length;
  const linkedDriverCount = notifications.filter((item) => item.driverId).length;
  const retryableNotifications = notifications.filter((item) => item.status === "failed" || item.status === "pending");
  const canRetryNotifications = hasCrmAccess(session.requestUserRole, "notifications") && session.requestUserRole !== "auditor";

  function resetFilters(): void {
    setStatusFilter("all");
    setChannelFilter("all");
    setTemplateFilter("all");
    setQuery("");
  }

  function toggleNotificationSelection(notificationId: string): void {
    setSelectedNotificationIds((current) =>
      current.includes(notificationId)
        ? current.filter((item) => item !== notificationId)
        : [...current, notificationId],
    );
  }

  function selectRetryableNotifications(): void {
    setSelectedNotificationIds(retryableNotifications.map((item) => item.id));
  }

  function clearNotificationSelection(): void {
    setSelectedNotificationIds([]);
  }

  async function handleRetry(notificationIds: string[]): Promise<void> {
    if (!notificationIds.length) {
      return;
    }

    setIsRetrying(true);
    setRetryMessage(null);
    setRetryError(null);

    try {
      for (const notificationId of notificationIds) {
        await postJson<NotificationListItem, Record<string, never>>(`notifications/${notificationId}/retry`, {});
      }
      setRetryMessage(`Переотправка поставлена для ${notificationIds.length} уведомлений.`);
      setSelectedNotificationIds([]);
      api.refetch();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Не удалось поставить уведомления в повторную отправку.");
    } finally {
      setIsRetrying(false);
    }
  }

  function handleExport(): void {
    if (!api.data?.length) {
      return;
    }

    downloadCsvTable(
      "gopark-notifications.csv",
      ["notification", "company", "user", "driver", "channel", "template", "status"],
      notifications.map((item) => [
        formatShortId(item.id),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : "",
        item.userId ? (userMap.get(item.userId) ?? formatShortId(item.userId)) : "",
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        getNotificationChannelLabel(item.channel),
        getNotificationTemplateLabel(item.template),
        getNotificationStatusLabel(item.status),
      ]),
    );
  }

  return (
    <section className="page-stack notifications-page">
      <div className="hero-card">
        <p className="eyebrow">Уведомления</p>
        <h2>Журнал уведомлений</h2>
        <p>Все уведомления по выплатам, напоминаниям и доставке сообщений.</p>
        {retryMessage ? <div className="panel-note">{retryMessage}</div> : null}
        {retryError ? <div className="panel-note">Ошибка повторной отправки: {retryError}</div> : null}
        {notifications.length ? (
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по водителю, пользователю, шаблону" />
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
              <option value="pending">Ожидает</option>
              <option value="published">Отправлено</option>
              <option value="failed">Ошибка</option>
            </select>
            <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
              <option value="all">Все каналы</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
              <option value="in_app">В приложении</option>
            </select>
            <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}>
              <option value="all">Все шаблоны</option>
              <option value="__payout__">Все выплаты</option>
              {availableTemplates.map((item) => (
                <option key={item} value={item}>
                  {getNotificationTemplateLabel(item)}
                </option>
              ))}
            </select>
            {canRetryNotifications ? (
              <>
                <button type="button" className="button-secondary" onClick={selectRetryableNotifications}>
                  Выбрать все проблемные
                </button>
                <button type="button" className="button-secondary" onClick={clearNotificationSelection}>
                  Снять выбор
                </button>
                <span>Выбрано: {selectedNotificationIds.length}</span>
                <button
                  type="button"
                  disabled={!selectedNotificationIds.length || isRetrying}
                  onClick={() => void handleRetry(selectedNotificationIds)}
                >
                  {isRetrying ? "Ставим в очередь..." : "Массово переотправить"}
                </button>
              </>
            ) : null}
            <button onClick={handleExport}>Скачать CSV</button>
          </div>
        ) : null}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Всего уведомлений"
          value={String(notifications.length)}
          subtitle="Текущий журнал"
          tone="blue"
          icon={<PaymentsIcon width={18} height={18} />}
          onClick={resetFilters}
        />
        <StatCard
          title="Ожидают отправки"
          value={String(pendingCount)}
          subtitle="Нужен контроль доставки"
          tone="purple"
          icon={<ShieldIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("pending");
            setQuery("");
          }}
        />
        <StatCard
          title="По выплатам"
          value={String(payoutTemplateCount)}
          subtitle="Связаны с запросами и согласованием"
          tone="orange"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => {
            setTemplateFilter("__payout__");
            setQuery("");
          }}
        />
        <StatCard
          title="Связаны с водителем"
          value={String(linkedDriverCount)}
          subtitle={failedCount > 0 ? `Ошибок доставки: ${failedCount}` : "Ошибок доставки нет"}
          tone="green"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
          }}
        />
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!notifications.length}
        emptyContent={
          <EmptyStatePanel
            title="Уведомлений пока нет"
            message="Журнал уведомлений пока пуст."
          />
        }
      >
        <article className="panel">
          <table className="data-table notifications-table">
            <thead>
              <tr>
                {canRetryNotifications ? <th>Выбор</th> : null}
                <th>Уведомление</th>
                <th>Пользователь</th>
                <th>Водитель</th>
                <th>Канал</th>
                <th>Шаблон</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((item) => (
                <tr key={item.id}>
                  {canRetryNotifications ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedNotificationIds.includes(item.id)}
                        disabled={item.status === "published"}
                        onChange={() => toggleNotificationSelection(item.id)}
                      />
                    </td>
                  ) : null}
                  <td>
                    <div className="amount-stack">
                      <strong title={item.id}>{formatShortId(item.id)}</strong>
                      <div className="row-actions">
                        {canOpenPayouts && item.template.startsWith("payout_") ? (
                          <Link className="table-link" to="/payouts">
                            Открыть выплаты
                          </Link>
                        ) : null}
                        {canRetryNotifications && item.status !== "published" ? (
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={isRetrying}
                            onClick={() => void handleRetry([item.id])}
                          >
                            Переотправить
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td title={item.userId ? (userMap.get(item.userId) ?? item.userId) : ""}>{item.userId ? (userMap.get(item.userId) ?? formatShortId(item.userId)) : "-"}</td>
                  <td>
                    {item.driverId && driverMap.get(item.driverId) ? (
                      <div className="amount-stack">
                        <Link className="table-link" to={`/drivers/${item.driverId}`} title={driverMap.get(item.driverId)}>
                          {driverMap.get(item.driverId)}
                        </Link>
                        {driverCompanyMap.get(item.driverId) ? <span>{driverCompanyMap.get(item.driverId)}</span> : null}
                      </div>
                    ) : (
                      item.driverId ? formatShortId(item.driverId) : "-"
                    )}
                  </td>
                  <td>{getNotificationChannelLabel(item.channel)}</td>
                  <td>{getNotificationTemplateLabel(item.template)}</td>
                  <td><span className={getStatusTone(item.status)}>{getNotificationStatusLabel(item.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>
    </section>
  );
}
