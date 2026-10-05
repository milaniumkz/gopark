import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { crmAccessBlocks, crmWebRoles, getDefaultRoleAccess, hasCrmCapability, type CrmRouteKey } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, FinanceIcon, PaymentsIcon, ShieldIcon } from "../ui/CrmIcons";
import { formatCurrency, getNotificationChannelLabel, getStatusLabel } from "../lib/utils";
import { patchJson, postJson } from "../lib/api";
import {
  notificationChannels,
  statusRequestTypes,
  type NotificationChannel,
  type NotificationListItem,
  type OutboxEventItem,
  type PayoutListItem,
  type SettingsOverview,
  type StatusRequestType,
  type UpdateSettingsRequest,
} from "@gopark/contracts";

export function SettingsPage() {
  const { session } = useAuth();
  const api = useApiQuery<SettingsOverview>("settings/overview");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const notificationsApi = useApiQuery<NotificationListItem[]>("notifications");
  const outboxApi = useApiQuery<OutboxEventItem[]>("outbox");
  const [form, setForm] = useState<UpdateSettingsRequest | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryRetrying, setDeliveryRetrying] = useState(false);
  const [deliveryProcessing, setDeliveryProcessing] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const canRetryNotifications = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);
  const canProcessOutbox = hasCrmCapability(session.requestUserRole, "process-outbox");
  const pendingPayouts = (payoutsApi.data ?? []).filter((item) => item.status === "requested").length;
  const pendingNotifications = (notificationsApi.data ?? []).filter((item) => item.status === "pending").length;
  const pendingOutboxEvents = (outboxApi.data ?? []).filter(
    (item) => item.status === "pending" || item.status === "queued",
  ).length;
  const deliveryErrors =
    (notificationsApi.data ?? []).filter((item) => item.status === "failed").length +
    (outboxApi.data ?? []).filter((item) => item.status === "failed").length;
  const deliveryIssues = deliveryErrors + pendingNotifications + pendingOutboxEvents;
  const retryableNotificationIds = (notificationsApi.data ?? [])
    .filter((item) => item.status === "failed" || item.status === "pending")
    .map((item) => item.id);
  const retryableOutboxIds = (outboxApi.data ?? [])
    .filter((item) => item.status === "failed" || item.status === "pending" || item.status === "queued")
    .map((item) => item.id);
  const roleAccessCards = [
    ...crmWebRoles.map((role) => ({
      key: role,
      label:
        role === "owner"
          ? "Владелец"
          : role === "admin"
            ? "Администратор"
            : role === "finance"
              ? "Финансы"
              : role === "manager"
                ? "Бригадир"
                : role === "operator"
                  ? "Оператор"
                  : "Аудитор",
      custom: false,
    })),
    ...((form?.customCrmRoles ?? []).map((role) => ({ key: role.key, label: role.label, custom: true }))),
  ];

  useEffect(() => {
    if (!api.data) {
      return;
    }

    setForm({
      payoutApprovalThreshold: api.data.payoutApprovalThreshold,
      defaultInstallmentDay: api.data.defaultInstallmentDay,
      yandexSyncIntervalMinutes: api.data.yandexSyncIntervalMinutes,
      bakaiWebhookEnabled: api.data.bakaiWebhookEnabled,
      allowedStatusRequestTypes: [...api.data.allowedStatusRequestTypes],
      notificationChannels: [...api.data.notificationChannels],
      companies: [...api.data.companies],
      customCrmRoles: [...(api.data.customCrmRoles ?? [])],
      crmRoleAccess: {
        ...getDefaultRoleAccess(),
        ...(api.data.crmRoleAccess ?? {}),
      },
    });
  }, [api.data]);

  function toggleStatusType(type: StatusRequestType): void {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        allowedStatusRequestTypes: current.allowedStatusRequestTypes.includes(type)
          ? current.allowedStatusRequestTypes.filter((item) => item !== type)
          : [...current.allowedStatusRequestTypes, type],
      };
    });
  }

  function toggleNotificationChannel(channel: NotificationChannel): void {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        notificationChannels: current.notificationChannels.includes(channel)
          ? current.notificationChannels.filter((item) => item !== channel)
          : [...current.notificationChannels, channel],
      };
    });
  }

  function toggleRoleBlock(role: string, blockKey: CrmRouteKey): void {
    setForm((current) => {
      if (!current) {
        return current;
      }

      const defaultAccess = getDefaultRoleAccess()[role as (typeof crmWebRoles)[number]] ?? [];
      const currentAccess = current.crmRoleAccess?.[role] ?? defaultAccess;
      const nextAccess = currentAccess.includes(blockKey)
        ? currentAccess.filter((item) => item !== blockKey)
        : [...currentAccess, blockKey];

      return {
        ...current,
        crmRoleAccess: {
          ...(current.crmRoleAccess ?? {}),
          [role]: nextAccess,
        },
      };
    });
  }

  function normalizeCompanies(companies: string[]): string[] {
    const seen = new Set<string>();
    return companies
      .map((item) => item.trim().replace(/\s+/g, " "))
      .filter((item) => {
        if (!item) {
          return false;
        }
        const key = item.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function addCompany(): void {
    const companyName = newCompanyName.trim().replace(/\s+/g, " ");
    if (!companyName) {
      return;
    }

    setForm((current) => current
      ? {
          ...current,
          companies: normalizeCompanies([...(current.companies ?? []), companyName]),
        }
      : current);
    setNewCompanyName("");
  }

  function removeCompany(companyName: string): void {
    setForm((current) => current
      ? {
          ...current,
          companies: (current.companies ?? []).filter((item) => item !== companyName),
        }
      : current);
  }

  function makeRoleKey(label: string): string {
    return `custom_${label.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "_").replace(/^_+|_+$/g, "")}`;
  }

  function addCustomRole(): void {
    const label = newRoleLabel.trim().replace(/\s+/g, " ");
    if (!label) {
      return;
    }
    const key = makeRoleKey(label);
    setForm((current) => {
      if (!current || current.customCrmRoles?.some((role) => role.key === key)) {
        return current;
      }
      return {
        ...current,
        customCrmRoles: [...(current.customCrmRoles ?? []), { key, label, baseRole: "operator" }],
        crmRoleAccess: {
          ...(current.crmRoleAccess ?? {}),
          [key]: [],
        },
      };
    });
    setNewRoleLabel("");
  }

  function removeCustomRole(roleKey: string): void {
    setForm((current) => {
      if (!current) {
        return current;
      }
      const nextAccess = { ...(current.crmRoleAccess ?? {}) };
      delete nextAccess[roleKey];
      return {
        ...current,
        customCrmRoles: (current.customCrmRoles ?? []).filter((role) => role.key !== roleKey),
        crmRoleAccess: nextAccess,
      };
    });
  }

  async function handleSave(): Promise<void> {
    if (!form) {
      return;
    }

    setSaveMessage(null);
    setSaveError(null);
    setIsSaving(true);

    try {
      const saved = await patchJson<SettingsOverview, UpdateSettingsRequest>("settings/overview", {
        ...form,
        companies: normalizeCompanies(form.companies ?? []),
      });
      setForm({
        payoutApprovalThreshold: saved.payoutApprovalThreshold,
        defaultInstallmentDay: saved.defaultInstallmentDay,
        yandexSyncIntervalMinutes: saved.yandexSyncIntervalMinutes,
        bakaiWebhookEnabled: saved.bakaiWebhookEnabled,
        allowedStatusRequestTypes: [...saved.allowedStatusRequestTypes],
        notificationChannels: [...saved.notificationChannels],
        companies: [...saved.companies],
        customCrmRoles: [...(saved.customCrmRoles ?? [])],
        crmRoleAccess: {
          ...getDefaultRoleAccess(),
          ...(saved.crmRoleAccess ?? {}),
        },
      });
      setSaveMessage("Настройки сохранены.");
      api.refetch();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить настройки.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRetryNotifications(notificationIds: string[]): Promise<void> {
    if (!notificationIds.length) {
      return;
    }

    setDeliveryMessage(null);
    setDeliveryError(null);
    setDeliveryRetrying(true);

    try {
      for (const notificationId of notificationIds) {
        await postJson<NotificationListItem, Record<string, never>>(`notifications/${notificationId}/retry`, {});
      }
      setDeliveryMessage(`Переотправка поставлена для ${notificationIds.length} уведомлений.`);
      notificationsApi.refetch();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Не удалось поставить уведомления в повторную отправку.");
    } finally {
      setDeliveryRetrying(false);
    }
  }

  async function handleRetryOutbox(outboxIds: string[]): Promise<void> {
    if (!outboxIds.length) {
      return;
    }

    setDeliveryMessage(null);
    setDeliveryError(null);
    setDeliveryRetrying(true);

    try {
      for (const eventId of outboxIds) {
        await postJson<OutboxEventItem, Record<string, never>>(`outbox/${eventId}/retry`, {});
      }
      setDeliveryMessage(`Переочередь поставлена для ${outboxIds.length} событий.`);
      outboxApi.refetch();
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Не удалось поставить события в повторную обработку.");
    } finally {
      setDeliveryRetrying(false);
    }
  }

  return (
    <section className="page-stack settings-page">
      <div className="hero-card">
        <p className="eyebrow">Настройки</p>
        <h2>Настройки системы</h2>
        <p>Основные правила работы, уведомления и параметры интеграций.</p>
        {saveMessage ? <div className="panel-note">{saveMessage}</div> : null}
        {saveError ? <div className="panel-note">Ошибка сохранения: {saveError}</div> : null}
      </div>

      <AsyncState loading={api.loading} error={api.error} empty={!api.data}>
        <div className="settings-save-bar">
          <div>
            {saveMessage ? <span className="panel-note">{saveMessage}</span> : null}
            {saveError ? <span className="panel-note">Ошибка сохранения: {saveError}</span> : null}
          </div>
          <button disabled={!form || isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </div>
        <article className="panel">
          <h3>Редактирование правил</h3>
          <div className="form-grid">
            <label className="field-group">
              <span>Порог согласования выплаты</span>
              <input
                type="number"
                value={form?.payoutApprovalThreshold ?? 0}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, payoutApprovalThreshold: Number(event.target.value) }
                      : current,
                  )
                }
              />
            </label>
            <label className="field-group">
              <span>День списания по умолчанию</span>
              <input
                type="number"
                value={form?.defaultInstallmentDay ?? 0}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, defaultInstallmentDay: Number(event.target.value) }
                      : current,
                  )
                }
              />
            </label>
            <label className="field-group">
              <span>Интервал синхронизации с Яндексом</span>
              <input
                type="number"
                value={form?.yandexSyncIntervalMinutes ?? 0}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, yandexSyncIntervalMinutes: Number(event.target.value) }
                      : current,
                  )
                }
              />
            </label>
            <label className="field-group checkbox-row">
              <input
                type="checkbox"
                checked={form?.bakaiWebhookEnabled ?? false}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, bakaiWebhookEnabled: event.target.checked }
                      : current,
                  )
                }
              />
              <span>Принимать события Bakai</span>
            </label>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <span>Компании</span>
              <div className="toolbar">
                <input
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCompany();
                    }
                  }}
                  placeholder="Название новой компании"
                />
                <button type="button" onClick={addCompany} disabled={!newCompanyName.trim()}>
                  Добавить компанию
                </button>
              </div>
              <div className="stack-list">
                {(form?.companies ?? []).length ? (
                  (form?.companies ?? []).map((companyName) => (
                    <div key={companyName} className="checkbox-row">
                      <span>{companyName}</span>
                      <button type="button" onClick={() => removeCompany(companyName)}>
                        Удалить
                      </button>
                    </div>
                  ))
                ) : (
                  <span>Компании пока не добавлены.</span>
                )}
              </div>
            </div>
          </div>
          <div className="table-grid">
            <article className="panel panel--nested">
              <h3>Подтверждения на снятие баланса с Яндекса</h3>
              <div className="stack-list">
                {statusRequestTypes.map((item) => (
                  <label key={item} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form?.allowedStatusRequestTypes.includes(item) ?? false}
                      onChange={() => toggleStatusType(item)}
                    />
                    <span>{getStatusLabel(item)}</span>
                  </label>
                ))}
              </div>
            </article>
            <article className="panel panel--nested">
              <h3>Каналы уведомлений</h3>
              <div className="stack-list">
                {notificationChannels.map((item) => (
                  <label key={item} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form?.notificationChannels.includes(item) ?? false}
                      onChange={() => toggleNotificationChannel(item)}
                    />
                    <span>{getNotificationChannelLabel(item)}</span>
                  </label>
                ))}
              </div>
            </article>
          </div>
          <article className="panel panel--nested">
            <h3>Роли и доступ к блокам</h3>
            <div className="toolbar">
              <button type="button" onClick={() => setIsRolesModalOpen(true)}>
                Открыть роли
              </button>
              <span className="panel-note">
                Системных: {crmWebRoles.length} · созданных: {form?.customCrmRoles?.length ?? 0}
              </span>
            </div>
          </article>
        </article>
        {isRolesModalOpen ? (
          <>
            <button
              type="button"
              className="entity-modal__backdrop"
              aria-label="Закрыть роли"
              onClick={() => setIsRolesModalOpen(false)}
            />
            <section className="entity-modal" aria-modal="true" role="dialog" aria-labelledby="settings-roles-title">
              <div className="entity-modal__header">
                <div>
                  <p className="eyebrow">Настройки</p>
                  <h3 id="settings-roles-title">Роли и доступ</h3>
                  <p>Создайте роль, выберите базовые права API и отметьте доступные блоки.</p>
                </div>
                <button type="button" onClick={() => setIsRolesModalOpen(false)}>
                  Закрыть
                </button>
              </div>
              <div className="entity-modal__body">
                <div className="quick-form">
                  <input
                    value={newRoleLabel}
                    onChange={(event) => setNewRoleLabel(event.target.value)}
                    placeholder="Название роли"
                  />
                  <button type="button" onClick={addCustomRole} disabled={!newRoleLabel.trim()}>
                    Создать роль
                  </button>
                </div>
                <div className="table-grid">
                  {roleAccessCards.map((role) => (
                    <article key={role.key} className="panel panel--nested">
                      <h3>{role.label}</h3>
                      {role.custom ? (
                        <button type="button" onClick={() => removeCustomRole(role.key)}>
                          Удалить роль
                        </button>
                      ) : null}
                      <div className="stack-list">
                        {crmAccessBlocks.map((block) => {
                          const roleAccess = form?.crmRoleAccess?.[role.key] ?? getDefaultRoleAccess()[role.key as (typeof crmWebRoles)[number]] ?? [];
                          return (
                            <label key={`${role.key}-${block.key}`} className="checkbox-row">
                              <input
                                type="checkbox"
                                checked={roleAccess.includes(block.key)}
                                onChange={() => toggleRoleBlock(role.key, block.key)}
                              />
                              <span>{block.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
        <div className="stats-grid">
          <StatCard
            title="Порог согласования выплаты"
            value={formatCurrency(api.data?.payoutApprovalThreshold ?? 0)}
            subtitle="Сумма для обязательного согласования"
            tone="orange"
            icon={<FinanceIcon width={18} height={18} />}
            to="/payouts?status=requested"
          />
            <StatCard
              title="День списания по графику"
              value={String(api.data?.defaultInstallmentDay ?? 0)}
              subtitle="День списания по умолчанию"
              tone="blue"
              icon={<PaymentsIcon width={18} height={18} />}
              to="/contracts?status=active"
            />
          <StatCard
            title="Синхронизация с Яндексом"
            value={`${api.data?.yandexSyncIntervalMinutes ?? 0} мин`}
            subtitle="Интервал синхронизации"
            tone="green"
            icon={<DriversIcon width={18} height={18} />}
            to="/payments"
          />
          <StatCard
            title="Приём событий Bakai"
            value={api.data?.bakaiWebhookEnabled ? "Включён" : "Выключен"}
            subtitle="Статус входящих событий"
            tone="purple"
            icon={<ShieldIcon width={18} height={18} />}
            to="/notifications"
          />
          <StatCard
            title="Компании"
            value={String(api.data?.companies.length ?? 0)}
            subtitle="Доступны для разделения данных"
            tone="blue"
            icon={<DriversIcon width={18} height={18} />}
            to="/users"
          />
        </div>
        <article className="panel">
          <h3>Как это влияет сейчас</h3>
          {deliveryMessage ? <div className="panel-note">{deliveryMessage}</div> : null}
          {deliveryError ? <div className="panel-note">Ошибка доставки: {deliveryError}</div> : null}
          <div className="stats-grid">
            <StatCard
              title="Ждут согласования"
              value={String(pendingPayouts)}
              subtitle="Выплаты упираются в текущие правила"
              tone="orange"
              icon={<FinanceIcon width={18} height={18} />}
              to="/payouts?status=requested"
            />
            <StatCard
              title="Ожидают отправки"
              value={String(pendingNotifications)}
              subtitle="Уведомления по выбранным каналам"
              tone="purple"
              icon={<ShieldIcon width={18} height={18} />}
              to="/notifications"
            />
            <StatCard
              title="События в очереди"
              value={String(pendingOutboxEvents)}
              subtitle="Интеграции ждут обработку"
              tone="blue"
              icon={<PaymentsIcon width={18} height={18} />}
              to="/outbox"
            />
            <StatCard
              title="Проблемы доставки"
              value={String(deliveryIssues)}
              subtitle={
                deliveryIssues > 0
                  ? `Ошибки: ${deliveryErrors} · ожидание: ${pendingNotifications + pendingOutboxEvents}`
                  : "Ошибок и ожиданий сейчас нет"
              }
              tone={deliveryIssues > 0 ? "orange" : "green"}
              icon={<DriversIcon width={18} height={18} />}
              to={deliveryErrors > 0 ? "/notifications" : "/outbox"}
            />
          </div>
          <div className="toolbar">
            <Link className="table-link" to="/payouts">
              Открыть выплаты
            </Link>
            <Link className="table-link" to="/notifications">
              Открыть уведомления
            </Link>
            <Link className="table-link" to="/outbox">
              Открыть события
            </Link>
            {canRetryNotifications && retryableNotificationIds.length > 0 ? (
              <button
                type="button"
                className="button-secondary"
                disabled={deliveryRetrying}
                onClick={() => void handleRetryNotifications(retryableNotificationIds)}
              >
                {deliveryRetrying ? "Переотправляем..." : "Переотправить уведомления"}
              </button>
            ) : null}
            {canProcessOutbox && retryableOutboxIds.length > 0 ? (
              <button
                type="button"
                className="button-secondary"
                disabled={deliveryRetrying}
                onClick={() => void handleRetryOutbox(retryableOutboxIds)}
              >
                {deliveryRetrying ? "Переочередим..." : "Переочередить события"}
              </button>
            ) : null}
            {canProcessOutbox && pendingOutboxEvents > 0 ? (
              <button
                type="button"
                disabled={deliveryProcessing || deliveryRetrying}
                onClick={async () => {
                  setDeliveryMessage(null);
                  setDeliveryError(null);
                  setDeliveryProcessing(true);
                  try {
                    const result = await postJson<{
                      mode: "inline" | "queued";
                      processedCount: number;
                      queuedCount: number;
                    }, Record<string, never>>("workers/outbox/process", {});
                    setDeliveryMessage(
                      result.mode === "queued"
                        ? `События добавлены в очередь: ${result.queuedCount}`
                        : `События обработаны: ${result.processedCount}`,
                    );
                    outboxApi.refetch();
                  } catch (error) {
                    setDeliveryError(error instanceof Error ? error.message : "Не удалось запустить обработку.");
                  } finally {
                    setDeliveryProcessing(false);
                  }
                }}
              >
                {deliveryProcessing ? "Запускаем..." : "Запустить обработку"}
              </button>
            ) : null}
          </div>
        </article>
        <article className="panel">
          <h3>Где эти правила используются</h3>
          <div className="stack-list">
            <Link className="table-link" to="/financial-ops">
              Финансовые операции используют порог согласования и правила выплат
            </Link>
            <Link className="table-link" to="/drivers">
              Водители и бригадиры используют разрешённые типы статусов
            </Link>
            <Link className="table-link" to="/notifications">
              Уведомления используют выбранные каналы доставки
            </Link>
            <Link className="table-link" to="/dashboard">
              Главная показывает влияние этих правил на текущую очередь
            </Link>
          </div>
        </article>
        <div className="table-grid">
          <article className="panel">
            <h3>Разрешённые статусы</h3>
            <div className="summary-list">
              {api.data?.allowedStatusRequestTypes.map((item) => (
                <div key={item}>
                  <span>Тип</span>
                  <strong>{getStatusLabel(item)}</strong>
                  <div className="toolbar">
                    <Link className="table-link" to="/drivers">
                      Открыть водителей
                    </Link>
                    <Link className="table-link" to="/dashboard">
                      Открыть главную
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article className="panel">
            <h3>Каналы уведомлений</h3>
            <div className="summary-list">
              {api.data?.notificationChannels.map((item) => (
                <div key={item}>
                  <span>Канал</span>
                  <strong>{getNotificationChannelLabel(item)}</strong>
                  <div className="toolbar">
                    <Link className="table-link" to="/notifications">
                      Открыть уведомления
                    </Link>
                    <Link className="table-link" to="/outbox">
                      Открыть события
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </AsyncState>
    </section>
  );
}
