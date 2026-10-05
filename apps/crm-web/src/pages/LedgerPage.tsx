import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { hasCrmAccess } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { StatCard } from "../ui/StatCard";
import { ContractsIcon, FinanceIcon, PaymentsIcon, WalletIcon } from "../ui/CrmIcons";
import { downloadCsvTable, formatCurrency, formatDateTime, formatShortId, getCurrencyLabel, getLedgerTypeLabel } from "../lib/utils";
import type { ContractListItem, DriverListItem, LedgerEntry, ManagerAssignedDriverItem, PayoutListItem } from "@gopark/contracts";

export function LedgerPage() {
  const { session } = useAuth();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [typeFilter, setTypeFilter] = useState<"all" | string>("all");
  const [query, setQuery] = useState("");
  const api = useApiQuery<LedgerEntry[]>("ledger/entries");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const payoutsApi = useApiQuery<PayoutListItem[]>("payouts");
  const effectiveDriversApi = useApiQuery<ManagerAssignedDriverItem[]>("mobile/manager/drivers");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const ledgerEntries = useMemo(() => api.data ?? [], [api.data]);
  const drivers = useMemo(() => driversApi.data ?? [], [driversApi.data]);
  const contracts = useMemo(() => contractsApi.data ?? [], [contractsApi.data]);
  const payouts = useMemo(() => payoutsApi.data ?? [], [payoutsApi.data]);
  const effectiveDrivers = useMemo(() => effectiveDriversApi.data ?? [], [effectiveDriversApi.data]);
  const companies = useMemo(() => settingsApi.data?.companies ?? [], [settingsApi.data?.companies]);
  const driverMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.fullName])), [drivers]);
  const driverCompanyMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.companyName ?? ""])), [drivers]);
  const driverCreditMap = useMemo(() => new Map(drivers.map((item) => [item.id, item.creditBalance])), [drivers]);
  const contractMap = useMemo(() => new Map(contracts.map((item) => [item.id, item.contractNumber])), [contracts]);
  const contractCompanyMap = useMemo(() => new Map(
    contracts.map((item) => [item.id, driverCompanyMap.get(item.driverId) ?? ""]),
  ), [contracts, driverCompanyMap]);
  const activeContractMap = useMemo(() => new Map(
    contracts
      .filter((item) => item.status === "active")
      .map((item) => [item.id, item]),
  ), [contracts]);
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

  const yandexBalanceByDriverId = useMemo(() => new Map(effectiveDrivers.map((item) => [item.id, item.yandexBalance])), [effectiveDrivers]);
  const availablePayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of drivers) {
      amounts.set(
        item.id,
        Math.max(0, (yandexBalanceByDriverId.get(item.id) ?? 0) - (requestedPayoutAmountByDriverId.get(item.id) ?? 0) - 100),
      );
    }

    return amounts;
  }, [drivers, requestedPayoutAmountByDriverId, yandexBalanceByDriverId]);
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const entries = ledgerEntries.filter((item) => {
    const inCompany = companyFilter === "all"
      || (item.driverId ? driverCompanyMap.get(item.driverId) : "") === companyFilter
      || (item.contractId ? contractCompanyMap.get(item.contractId) : "") === companyFilter;
    const inType = typeFilter === "all" || item.type === typeFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const inSearch = !normalizedQuery || [
      item.id,
      item.accountId,
      item.driverId ?? "",
      item.contractId ?? "",
      item.externalReference ?? "",
      driverMap.get(item.driverId ?? "") ?? "",
      contractMap.get(item.contractId ?? "") ?? "",
      item.type,
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return inCompany && inType && inSearch;
  });
  const availableTypes = Array.from(new Set(ledgerEntries.map((item) => item.type))).sort();
  const paymentCount = entries.filter((item) => item.type === "payment").length;
  const payoutCount = entries.filter((item) => item.type === "payout").length;
  const obligationCount = entries.filter((item) => item.type === "obligation").length;
  const adjustmentCount = entries.filter((item) => item.type === "adjustment").length;
  const paymentTotal = entries
    .filter((item) => item.type === "payment")
    .reduce((sum, item) => sum + Number(item.money.amount), 0);
  const payoutTotal = entries
    .filter((item) => item.type === "payout")
    .reduce((sum, item) => sum + Number(item.money.amount), 0);

  function handleExport(): void {
    if (!entries.length) {
      return;
    }

    downloadCsvTable(
      "gopark-ledger-entries.csv",
      ["entry", "type", "account", "company", "driver", "contract", "amount", "currency", "posted_at", "external_reference"],
      entries.map((item) => [
        formatShortId(item.id),
        getLedgerTypeLabel(item.type),
        formatShortId(item.accountId),
        item.driverId ? (driverCompanyMap.get(item.driverId) ?? "") : item.contractId ? (contractCompanyMap.get(item.contractId) ?? "") : "",
        item.driverId ? (driverMap.get(item.driverId) ?? formatShortId(item.driverId)) : "",
        item.contractId ? (contractMap.get(item.contractId) ?? formatShortId(item.contractId)) : "",
        item.money.amount,
        getCurrencyLabel(item.money.currency),
        formatDateTime(item.postedAt),
        item.externalReference ?? "",
      ]),
    );
  }

  return (
    <section className="page-stack ledger-page">
      <div className="hero-card">
        <p className="eyebrow">Движение денежных средств</p>
        <h2>Движение денежных средств</h2>
        <p>Обязательства, платежи, выплаты и корректировки.</p>
        {entries.length ? (
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по водителю, договору, счёту, ID" />
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Все типы</option>
              {availableTypes.map((item) => (
                <option key={item} value={item}>
                  {getLedgerTypeLabel(item)}
                </option>
              ))}
            </select>
            <button onClick={handleExport}>Скачать CSV</button>
          </div>
        ) : null}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Платежи"
          value={String(paymentCount)}
          subtitle={`Сумма ${formatCurrency(paymentTotal)}`}
          tone="green"
          icon={<PaymentsIcon width={18} height={18} />}
          onClick={() => {
            setTypeFilter("payment");
            setQuery("");
          }}
        />
        <StatCard
          title="Выплаты"
          value={String(payoutCount)}
          subtitle={`Сумма ${formatCurrency(payoutTotal)}`}
          tone="orange"
          icon={<WalletIcon width={18} height={18} />}
          onClick={() => {
            setTypeFilter("payout");
            setQuery("");
          }}
        />
        <StatCard
          title="Начисления"
          value={String(obligationCount)}
          subtitle="Плановые обязательства"
          tone="blue"
          icon={<ContractsIcon width={18} height={18} />}
          onClick={() => {
            setTypeFilter("obligation");
            setQuery("");
          }}
        />
        <StatCard
          title="Корректировки"
          value={String(adjustmentCount)}
          subtitle="Ручные и credit-операции"
          tone="purple"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => {
            setTypeFilter("adjustment");
            setQuery("");
          }}
        />
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!entries.length}
        emptyContent={
          <EmptyStatePanel
            title="Движения денежных средств пока нет"
            message="Записей пока нет."
          />
        }
      >
        <article className="panel">
          <table className="data-table ledger-table">
            <thead>
              <tr>
                <th>Запись</th>
                <th>Операция</th>
                <th>Счёт</th>
                <th>Водитель</th>
                <th>Договор</th>
                <th>Сумма</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((item) => (
                (() => {
                  const activeContract = item.contractId ? activeContractMap.get(item.contractId) : undefined;
                  const paymentAmount = activeContract ? (activeContract.nextDueAmount ?? activeContract.currentDebt) : null;
                  const payoutAmount = item.driverId ? (availablePayoutAmountByDriverId.get(item.driverId) ?? 0) : 0;

                  return (
                <tr key={item.id}>
                  <td>
                    <div className="identity-cell">
                      <strong title={item.id}>{formatShortId(item.id)}</strong>
                      {item.externalReference ? <span>{item.externalReference}</span> : null}
                    </div>
                  </td>
                  <td>{getLedgerTypeLabel(item.type)}</td>
                  <td title={item.accountId}>{formatShortId(item.accountId)}</td>
                  <td>
                    {item.driverId ? (
                      <>
                        <Link className="table-link" to={`/drivers/${item.driverId}`}>
                          {driverMap.get(item.driverId) ?? formatShortId(item.driverId)}
                        </Link>
                        {driverCompanyMap.get(item.driverId) ? <p className="table-meta">{driverCompanyMap.get(item.driverId)}</p> : null}
                      </>
                    ) : "-"}
                  </td>
                  <td>
                    {item.contractId ? (
                      <Link className="table-link" to={`/contracts/${item.contractId}`}>
                        {contractMap.get(item.contractId) ?? formatShortId(item.contractId)}
                      </Link>
                    ) : "-"}
                  </td>
                  <td>{formatCurrency(Number(item.money.amount))}</td>
                  <td>
                    <div className="identity-cell">
                      <strong>{formatDateTime(item.postedAt)}</strong>
                      {canOpenFinancialOps && item.driverId ? (
                        <div className="row-actions">
                          {(item.type === "payment" || item.type === "obligation") && item.contractId && paymentAmount && paymentAmount > 0 ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=payment&source=ledger&driverId=${item.driverId}&contractId=${item.contractId}&amount=${paymentAmount}`}
                            >
                              Платёж
                            </Link>
                          ) : null}
                          {item.type === "payout" && payoutAmount > 0 ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=payout&source=ledger&driverId=${item.driverId}&amount=${payoutAmount}`}
                            >
                              Вывод
                            </Link>
                          ) : null}
                          {item.type === "adjustment" && (driverCreditMap.get(item.driverId) ?? 0) > 0 ? (
                            <Link
                              className="table-link"
                              to={`/financial-ops?action=credit-writeoff&source=ledger&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                            >
                              Списать остаток
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>
    </section>
  );
}
