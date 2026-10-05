import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { hasCrmCapability, hasCrmAccess } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { downloadCsvTable, formatCurrency, formatDateTime, formatShortId, getPayoutStatusLabel, getStatusTone } from "../lib/utils";
import type { DriverListItem, ManagerAssignedDriverItem, PayoutListItem, UserAdminListItem } from "@gopark/contracts";
import { postJson } from "../lib/api";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, FinanceIcon, ShieldIcon, WalletIcon } from "../ui/CrmIcons";

export function PayoutsPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | string>(searchParams.get("status") ?? "all");
  const [query, setQuery] = useState("");
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const api = useApiQuery<PayoutListItem[]>("payouts");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const effectiveDriversApi = useApiQuery<ManagerAssignedDriverItem[]>("mobile/manager/drivers");
  const usersApi = useApiQuery<UserAdminListItem[]>("users");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canApprovePayout = hasCrmCapability(session.requestUserRole, "approve-payout");
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const canCreatePayout = hasCrmCapability(session.requestUserRole, "create-payout");
  const companies = settingsApi.data?.companies ?? [];
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const driverCompanyMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const userMap = new Map((usersApi.data ?? []).map((item) => [item.id, item.displayName]));
  const payouts = (api.data ?? []).filter((item) => {
    const inCompany = companyFilter === "all" || (driverCompanyMap.get(item.driverId) ?? "") === companyFilter;
    const inStatus = statusFilter === "all" || item.status === statusFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const inSearch = !normalizedQuery || [
      item.id,
      item.driverId,
      item.approvedByUserId ?? "",
      driverMap.get(item.driverId) ?? "",
      driverCompanyMap.get(item.driverId) ?? "",
      userMap.get(item.approvedByUserId ?? "") ?? "",
      item.status,
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return inCompany && inStatus && inSearch;
  });
  const requestedPayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of payouts) {
      if (item.status !== "requested") {
        continue;
      }

      amounts.set(item.driverId, (amounts.get(item.driverId) ?? 0) + item.amount);
    }

    return amounts;
  }, [payouts]);
  const yandexBalanceByDriverId = new Map((effectiveDriversApi.data ?? []).map((item) => [item.id, item.yandexBalance]));
  const availablePayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of driversApi.data ?? []) {
      amounts.set(
        item.id,
        Math.max(
          0,
          (yandexBalanceByDriverId.get(item.id) ?? 0) - (requestedPayoutAmountByDriverId.get(item.id) ?? 0) - 100,
        ),
      );
    }

    return amounts;
  }, [driversApi.data, requestedPayoutAmountByDriverId, yandexBalanceByDriverId]);
  const totalRequested = payouts.reduce((sum, item) => sum + item.amount, 0);
  const requestedCount = payouts.filter((item) => item.status === "requested").length;
  const approvedCount = payouts.filter((item) => item.status === "approved").length;
  const approvedTotal = payouts
    .filter((item) => item.status === "approved")
    .reduce((sum, item) => sum + item.amount, 0);
  const requestedPayouts = payouts.filter((item) => item.status === "requested");
  const selectedCount = selectedPayoutIds.length;
  const allSelected = requestedPayouts.length > 0 && selectedCount === requestedPayouts.length;

  useEffect(() => {
    setStatusFilter(searchParams.get("status") ?? "all");
  }, [searchParams]);

  function togglePayoutSelection(payoutId: string): void {
    setSelectedPayoutIds((current) =>
      current.includes(payoutId) ? current.filter((id) => id !== payoutId) : [...current, payoutId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedPayoutIds(allSelected ? [] : requestedPayouts.map((item) => item.id));
  }

  async function handleBulkApprove(): Promise<void> {
    if (!selectedPayoutIds.length) {
      setApprovalError("Выберите хотя бы одну заявку на вывод.");
      return;
    }

    setApprovalMessage(null);
    setApprovalError(null);
    setBulkApproving(true);
    let approvedItems = 0;
    let approvedAmount = 0;

    try {
      for (const payoutId of selectedPayoutIds) {
        const result = await postJson<PayoutListItem, Record<string, never>>(
          `approvals/payouts/${payoutId}/approve`,
          {},
        );
        approvedItems += 1;
        approvedAmount += result.amount;
      }

      await api.refetch();
      setSelectedPayoutIds([]);
      setApprovalMessage(`Массово одобрено ${approvedItems} выплат на ${formatCurrency(approvedAmount)}.`);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Не удалось массово согласовать выплаты.");
    } finally {
      setBulkApproving(false);
    }
  }

  async function handleBulkReject(): Promise<void> {
    if (!selectedPayoutIds.length) {
      setApprovalError("Выберите хотя бы одну заявку на вывод.");
      return;
    }

    setApprovalMessage(null);
    setApprovalError(null);
    setBulkApproving(true);
    let rejectedItems = 0;
    let rejectedAmount = 0;

    try {
      for (const payoutId of selectedPayoutIds) {
        const result = await postJson<PayoutListItem, Record<string, never>>(
          `approvals/payouts/${payoutId}/reject`,
          {},
        );
        rejectedItems += 1;
        rejectedAmount += result.amount;
      }

      await api.refetch();
      setSelectedPayoutIds([]);
      setApprovalMessage(`Массово отклонено ${rejectedItems} выплат на ${formatCurrency(rejectedAmount)}.`);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Не удалось массово отклонить выплаты.");
    } finally {
      setBulkApproving(false);
    }
  }

  function handleExport(): void {
    if (!payouts.length) {
      return;
    }

    downloadCsvTable(
      "gopark-payouts.csv",
      ["request", "company", "driver", "amount", "status", "created_at", "approved_by"],
      payouts.map((item) => [
        formatShortId(item.id),
        driverCompanyMap.get(item.driverId) ?? "",
        driverMap.get(item.driverId) ?? formatShortId(item.driverId),
        item.amount,
        getPayoutStatusLabel(item.status),
        item.createdAt,
        item.approvedByUserId ? (userMap.get(item.approvedByUserId) ?? formatShortId(item.approvedByUserId)) : "",
      ]),
    );
  }

  return (
    <section className="page-stack payouts-page">
      <div className="hero-card">
        <p className="eyebrow">Выводы средств</p>
        <h2>Выплаты</h2>
        <p>Заявки на вывод и их статусы. После вывода на балансе водителя должно остаться минимум 100 сом.</p>
        {canOpenFinancialOps ? (
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по водителю, компании, ID" />
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
              <option value="requested">На согласовании</option>
              <option value="approved">Одобрено</option>
              <option value="rejected">Отклонено</option>
            </select>
            <Link className="button-link" to="/financial-ops">
              Открыть финансовые операции
            </Link>
            {api.data?.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
          </div>
        ) : (
          <ReadOnlyNotice message="Для этой роли доступен только просмотр выплат." />
        )}
        {approvalMessage ? <div className="panel-note">{approvalMessage}</div> : null}
        {approvalError ? <div className="panel-note">Ошибка согласования: {approvalError}</div> : null}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Всего заявок"
          value={String(payouts.length)}
          subtitle="Все запросы на вывод"
          tone="blue"
          icon={<WalletIcon width={18} height={18} />}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          title="На согласовании"
          value={String(requestedCount)}
          subtitle="Нужны действия бригадира или финансов"
          tone="orange"
          icon={<ShieldIcon width={18} height={18} />}
          onClick={() => setStatusFilter("requested")}
        />
        <StatCard
          title="Сумма запросов"
          value={formatCurrency(totalRequested)}
          subtitle="Общий объём заявок"
          tone="purple"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          title="Одобрено"
          value={String(approvedCount)}
          subtitle={approvedTotal > 0 ? `На ${formatCurrency(approvedTotal)}` : "Пока без одобренных сумм"}
          tone="green"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => setStatusFilter("approved")}
        />
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!payouts.length}
        emptyContent={
          <EmptyStatePanel
            title="Выплат пока нет"
            message="Заявок на вывод пока нет. Новые заявки создаются через профильный раздел выплат."
          />
        }
      >
        <article className="panel">
          {!canApprovePayout ? (
            <ReadOnlyNotice message="Для этой роли согласование выплат недоступно." />
          ) : null}
          {canApprovePayout ? (
            <div className="toolbar">
              <button type="button" onClick={toggleSelectAll}>
                {allSelected ? "Снять выбор" : "Выбрать все заявки"}
              </button>
              <span className="panel-note">Выбрано: {selectedCount}</span>
              <button type="button" disabled={bulkApproving || !selectedCount} onClick={() => void handleBulkApprove()}>
                {bulkApproving ? "Согласуем..." : "Массово одобрить"}
              </button>
              <button type="button" disabled={bulkApproving || !selectedCount} onClick={() => void handleBulkReject()}>
                {bulkApproving ? "Согласуем..." : "Массово отклонить"}
              </button>
            </div>
          ) : null}
          <table className="data-table payouts-table">
            <thead>
              <tr>
                <th />
                <th>Заявка / дата</th>
                <th>Водитель</th>
                <th>Сумма</th>
                <th>Статус / согласовал</th>
                <th>Итог</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((item) => (
                <tr key={item.id}>
                  {(() => {
                    const availablePayoutAmount = availablePayoutAmountByDriverId.get(item.driverId) ?? 0;

                    return (
                      <>
                  <td>
                    {item.status === "requested" && canApprovePayout ? (
                      <input
                        type="checkbox"
                        checked={selectedPayoutIds.includes(item.id)}
                        onChange={() => togglePayoutSelection(item.id)}
                      />
                    ) : null}
                  </td>
                  <td>
                    <div className="amount-stack">
                      <strong>Заявка {formatShortId(item.id)}</strong>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    {driverMap.get(item.driverId) ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        {driverMap.get(item.driverId)}
                      </Link>
                    ) : (
                      formatShortId(item.driverId)
                    )}
                    {driverCompanyMap.get(item.driverId) ? <p className="table-meta">{driverCompanyMap.get(item.driverId)}</p> : null}
                  </td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td>
                    <div className="amount-stack">
                      <span className={getStatusTone(item.status)}>{getPayoutStatusLabel(item.status)}</span>
                      <span>{item.approvedByUserId ? (userMap.get(item.approvedByUserId) ?? formatShortId(item.approvedByUserId)) : "Не согласовано"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="amount-stack">
                      <strong>
                        {item.status === "approved"
                          ? `Вывод согласован на ${formatCurrency(item.amount)}`
                          : item.status === "requested"
                            ? "Ожидает согласования"
                            : `Статус: ${getPayoutStatusLabel(item.status)}`}
                      </strong>
                      <span>
                        {item.status === "approved"
                          ? "Можно отслеживать исполнение по водителю"
                          : "Запрос ещё не завершён"}
                      </span>
                    </div>
                  </td>
                  <td>
                    {item.status === "requested" && canApprovePayout ? (
                      <div className="row-actions">
                        <button
                          className="inline-action"
                          disabled={isApprovingId === item.id}
                          onClick={async () => {
                            setApprovalError(null);
                            setIsApprovingId(item.id);
                            try {
                              const result = await postJson<PayoutListItem, Record<string, never>>(
                                `approvals/payouts/${item.id}/approve`,
                                {},
                              );
                              setApprovalMessage(
                                `Выплата одобрена для ${driverMap.get(result.driverId) ?? "водителя"} · ${formatCurrency(result.amount)}`,
                              );
                              api.refetch();
                            } catch (error) {
                              setApprovalError(error instanceof Error ? error.message : "Не удалось согласовать выплату.");
                            } finally {
                              setIsApprovingId(null);
                            }
                          }}
                        >
                          {isApprovingId === item.id ? "Согласуем..." : "Одобрить"}
                        </button>
                        <button
                          className="inline-action"
                          disabled={isApprovingId === item.id}
                          onClick={async () => {
                            setApprovalError(null);
                            setIsApprovingId(item.id);
                            try {
                              const result = await postJson<PayoutListItem, Record<string, never>>(
                                `approvals/payouts/${item.id}/reject`,
                                {},
                              );
                              setApprovalMessage(
                                `Выплата отклонена для ${driverMap.get(result.driverId) ?? "водителя"} · ${formatCurrency(result.amount)}`,
                              );
                              api.refetch();
                            } catch (error) {
                              setApprovalError(error instanceof Error ? error.message : "Не удалось отклонить выплату.");
                            } finally {
                              setIsApprovingId(null);
                            }
                          }}
                        >
                          {isApprovingId === item.id ? "Сохраняем..." : "Отклонить"}
                        </button>
                        {canOpenFinancialOps && canCreatePayout && availablePayoutAmount > 0 ? (
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=payout&source=payouts&driverId=${item.driverId}&amount=${availablePayoutAmount}`}
                          >
                            Подготовить вывод
                          </Link>
                        ) : null}
                      </div>
                    ) : canOpenFinancialOps && canCreatePayout && availablePayoutAmount > 0 ? (
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=payout&source=payouts&driverId=${item.driverId}&amount=${availablePayoutAmount}`}
                      >
                        Подготовить вывод
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>
    </section>
  );
}
