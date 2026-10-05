import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DriverCreditWriteoffResult, DriverListItem, OutboxEventItem } from "@gopark/contracts";
import { hasCrmCapability } from "../lib/crm-access";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, FinanceIcon, LedgerIcon, WalletIcon } from "../ui/CrmIcons";
import {
  downloadCsvTable,
  formatCurrency,
  formatDateTime,
  formatShortId,
  getOutboxStatusLabel,
  getStatusTone,
} from "../lib/utils";

type WriteoffRow = {
  id: string;
  writeoffId: string;
  driverId: string;
  amount: number;
  reason: string | null;
  remainingCreditBalance: number;
  status: OutboxEventItem["status"];
  createdAt: string;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function WriteoffsPage() {
  const { session } = useAuth();
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const outboxApi = useApiQuery<OutboxEventItem[]>("outbox");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const writeOffCredit = useApiMutation<
    DriverCreditWriteoffResult,
    { driverId: string; amount: number; reason?: string }
  >("payments/credit-writeoff");
  const canWriteOffCredit = hasCrmCapability(session.requestUserRole, "writeoff-credit");
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [query, setQuery] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("Ручная корректировка");
  const [bulkSaving, setBulkSaving] = useState(false);
  const creditDrivers = useMemo(
    () =>
      [...(driversApi.data ?? [])]
        .filter((item) => item.creditBalance > 0)
        .filter((item) => companyFilter === "all" || (item.companyName ?? "") === companyFilter)
        .filter((item) => {
          const normalizedQuery = query.trim().toLowerCase();
          if (!normalizedQuery) {
            return true;
          }

          return [item.fullName, item.phone, item.companyName ?? ""].join(" ").toLowerCase().includes(normalizedQuery);
        })
        .sort((left, right) => right.creditBalance - left.creditBalance),
    [companyFilter, driversApi.data, query],
  );
  const [driverId, setDriverId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Ручная корректировка");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isWriteoffFormOpen, setIsWriteoffFormOpen] = useState(false);
  const companies = settingsApi.data?.companies ?? [];

  useEffect(() => {
    if (!creditDrivers.length) {
      setDriverId("");
      return;
    }

    if (!creditDrivers.some((item) => item.id === driverId)) {
      setDriverId(creditDrivers[0].id);
    }
  }, [creditDrivers, driverId]);

  const selectedDriver = creditDrivers.find((item) => item.id === driverId) ?? null;
  const selectedDriverCredit = selectedDriver?.creditBalance ?? 0;

  useEffect(() => {
    if (!selectedDriver) {
      setAmount("");
      return;
    }

    if (!amount || Number(amount) > selectedDriver.creditBalance) {
      setAmount(String(selectedDriver.creditBalance));
    }
  }, [selectedDriver, amount]);

  useEffect(() => {
    setSelectedDriverIds((current) => current.filter((id) => creditDrivers.some((item) => item.id === id)));
  }, [creditDrivers]);

  const writeoffRows: WriteoffRow[] = useMemo(
    () =>
      (outboxApi.data ?? [])
        .filter((item) => item.topic === "driver.credit.written_off")
        .map((item) => ({
          id: item.id,
          writeoffId: toNullableString(item.payload.writeoffId) ?? item.id,
          driverId: toNullableString(item.payload.driverId) ?? item.aggregateId,
          amount: toNumber(item.payload.amount),
          reason: toNullableString(item.payload.reason),
          remainingCreditBalance: toNumber(item.payload.remainingCreditBalance),
          status: item.status,
          createdAt: item.createdAt,
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [outboxApi.data],
  );

  const totalCreditBalance = creditDrivers.reduce((sum, item) => sum + item.creditBalance, 0);
  const totalWriteoffs = writeoffRows.reduce((sum, item) => sum + item.amount, 0);
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const selectedCount = selectedDriverIds.length;
  const allSelected = creditDrivers.length > 0 && selectedCount === creditDrivers.length;

  function toggleDriverSelection(driverIdToToggle: string): void {
    setSelectedDriverIds((current) =>
      current.includes(driverIdToToggle)
        ? current.filter((item) => item !== driverIdToToggle)
        : [...current, driverIdToToggle],
    );
  }

  function toggleSelectAllDrivers(): void {
    setSelectedDriverIds(allSelected ? [] : creditDrivers.map((item) => item.id));
  }

  function handleExport(): void {
    if (!writeoffRows.length) {
      return;
    }

    downloadCsvTable(
      "gopark-writeoffs.csv",
      ["writeoff", "driver", "amount", "reason", "remaining_credit_balance", "status", "created_at"],
      writeoffRows.map((item) => [
        formatShortId(item.writeoffId),
        driverMap.get(item.driverId) ?? formatShortId(item.driverId),
        item.amount,
        item.reason ?? "",
        item.remainingCreditBalance,
        getOutboxStatusLabel(item.status),
        item.createdAt,
      ]),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormMessage(null);

    const numericAmount = Number(amount);
    if (!driverId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormMessage("Укажите водителя и положительную сумму списания.");
      return;
    }

    if (selectedDriverCredit > 0 && numericAmount > selectedDriverCredit) {
      setFormMessage(`Сумма списания превышает доступную переплату: ${formatCurrency(selectedDriverCredit)}.`);
      return;
    }

    try {
      const result = await writeOffCredit.mutate({
        driverId,
        amount: numericAmount,
        reason: reason.trim() || undefined,
      });

      setFormMessage(
        `Списание зарегистрировано: ${formatCurrency(result.amountWrittenOff)} · остаток ${formatCurrency(result.remainingCreditBalance)}.`,
      );
      setIsWriteoffFormOpen(false);
      await Promise.all([driversApi.refetch(), outboxApi.refetch()]);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось зарегистрировать списание.");
    }
  }

  async function handleBulkWriteoff(): Promise<void> {
    if (!selectedDriverIds.length) {
      setFormMessage("Выберите хотя бы одного водителя для массового списания.");
      return;
    }

    setFormMessage(null);
    setBulkSaving(true);
    let processedCount = 0;
    let processedAmount = 0;

    try {
      for (const selectedId of selectedDriverIds) {
        const driver = creditDrivers.find((item) => item.id === selectedId);
        if (!driver || driver.creditBalance <= 0) {
          continue;
        }

        const result = await writeOffCredit.mutate({
          driverId: selectedId,
          amount: driver.creditBalance,
          reason: bulkReason.trim() || undefined,
        });

        processedCount += 1;
        processedAmount += result.amountWrittenOff;
      }

      await Promise.all([driversApi.refetch(), outboxApi.refetch()]);
      setSelectedDriverIds([]);
      setFormMessage(`Массово списано: ${processedCount} водителей · ${formatCurrency(processedAmount)}.`);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое списание.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <section className="page-stack writeoffs-page">
      <div className="hero-card">
        <p className="eyebrow">Списания</p>
        <h2>Списания и удержания</h2>
        <p>Отдельный реестр списаний свободной переплаты по водителям с журналом, причиной и текущим остатком.</p>
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по водителю, телефону, компании" />
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Все компании</option>
            {companies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Link className="button-link" to="/financial-ops">
            Открыть финансы
          </Link>
          <Link className="button-link" to="/ledger">
            Открыть движение денежных средств
          </Link>
          {writeoffRows.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
          {canWriteOffCredit ? (
            <button type="button" onClick={() => setIsWriteoffFormOpen((current) => !current)}>
              {isWriteoffFormOpen ? "Скрыть списание" : "Новое списание"}
            </button>
          ) : null}
        </div>
        {!canWriteOffCredit ? <ReadOnlyNotice message="Для этой роли доступен только просмотр списаний." /> : null}
      </div>

      <div className="stats-grid">
        <StatCard
          title="Водители с остатком"
          value={String(creditDrivers.length)}
          subtitle="Есть доступный остаток для списания"
          tone="blue"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => setQuery("")}
        />
        <StatCard
          title="Доступный остаток"
          value={formatCurrency(totalCreditBalance)}
          subtitle="Текущий свободный остаток по водителям"
          tone="green"
          icon={<WalletIcon width={18} height={18} />}
          onClick={() => setQuery("")}
        />
        <StatCard
          title="Списаний"
          value={String(writeoffRows.length)}
          subtitle="Журнал зарегистрированных удержаний"
          tone="purple"
          icon={<LedgerIcon width={18} height={18} />}
          to="/ledger"
        />
        <StatCard
          title="Списано"
          value={formatCurrency(totalWriteoffs)}
          subtitle="Сумма всех списаний из журнала"
          tone="orange"
          icon={<FinanceIcon width={18} height={18} />}
          to="/ledger"
        />
      </div>

      <div className="table-grid">
        {isWriteoffFormOpen ? (
        <article className="panel">
          <div className="panel__title">
            <FinanceIcon width={18} height={18} />
            <h3>Новое списание</h3>
          </div>
          {canWriteOffCredit ? (
            <form className="quick-form" onSubmit={(event) => void handleSubmit(event)}>
              <p className="quick-form__meta">Укажите водителя, сумму и причину. Списание работает по текущему доступному остатку.</p>
              <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
                {creditDrivers.length ? (
                  creditDrivers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fullName} · {formatCurrency(item.creditBalance)}
                    </option>
                  ))
                ) : (
                  <option value="">Нет водителей с доступным остатком</option>
                )}
              </select>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Сумма списания" />
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина списания" />
              {selectedDriver ? (
                <div className="panel-note">
                  Доступный остаток: {formatCurrency(selectedDriver.creditBalance)} · водитель{" "}
                  <Link className="table-link" to={`/drivers/${selectedDriver.id}`}>
                    {selectedDriver.fullName}
                  </Link>
                </div>
              ) : (
                <div className="panel-note">Нет водителей с доступным свободным остатком.</div>
              )}
              {formMessage ? <div className="panel-note">{formMessage}</div> : null}
              {writeOffCredit.error ? <div className="panel-note">Ошибка списания: {writeOffCredit.error}</div> : null}
              <button type="submit" disabled={writeOffCredit.loading || !selectedDriver}>
                {writeOffCredit.loading ? "Сохраняем..." : "Зарегистрировать списание"}
              </button>
            </form>
          ) : (
            <ReadOnlyNotice message="Создание списаний для этой роли недоступно." />
          )}
        </article>
        ) : null}

        <article className="panel">
          <div className="panel__title">
            <DriversIcon width={18} height={18} />
            <h3>Доступный остаток по водителям</h3>
          </div>
          <AsyncState
            loading={driversApi.loading}
            error={driversApi.error}
            empty={!creditDrivers.length}
            emptyContent={
              <EmptyStatePanel
                title="Свободной переплаты нет"
                message="У водителей сейчас нет доступного остатка для списания."
              />
            }
          >
            {canWriteOffCredit ? (
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <button type="button" onClick={toggleSelectAllDrivers}>
                  {allSelected ? "Снять выбор" : "Выбрать всех"}
                </button>
                <span className="panel-note">Выбрано: {selectedCount}</span>
                <input value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} placeholder="Причина массового списания" />
                <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkWriteoff()}>
                  {bulkSaving ? "Списываем..." : "Списать всё выбранное"}
                </button>
              </div>
            ) : null}
            <div className="summary-list">
              {creditDrivers.slice(0, 12).map((item) => (
                <div key={item.id}>
                  <span className="toolbar">
                    {canWriteOffCredit ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedDriverIds.includes(item.id)}
                          onChange={() => toggleDriverSelection(item.id)}
                        />
                      </label>
                    ) : null}
                    <Link className="table-link" to={`/drivers/${item.id}`}>
                      {item.fullName}
                    </Link>
                    {item.companyName ? <span>{item.companyName}</span> : null}
                  </span>
                  <strong>{formatCurrency(item.creditBalance)}</strong>
                </div>
              ))}
            </div>
          </AsyncState>
        </article>
      </div>

      <AsyncState
        loading={outboxApi.loading}
        error={outboxApi.error}
        empty={!writeoffRows.length}
        emptyContent={
          <EmptyStatePanel
            title="Списаний пока нет"
            message="После первого зарегистрированного списания здесь появится отдельный журнал удержаний."
          />
        }
      >
        <article className="panel">
          <table className="data-table writeoffs-table">
            <thead>
              <tr>
                <th>Списание</th>
                <th>Водитель</th>
                <th>Сумма</th>
                <th>Причина</th>
                <th>Остаток</th>
                <th>Когда</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {writeoffRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="amount-stack">
                      <strong title={item.writeoffId}>Списание {formatShortId(item.writeoffId)}</strong>
                    </div>
                  </td>
                  <td>
                    {driverMap.get(item.driverId) ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`} title={driverMap.get(item.driverId)}>
                        {driverMap.get(item.driverId)}
                      </Link>
                    ) : (
                      formatShortId(item.driverId)
                    )}
                  </td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td title={item.reason ?? ""}>{item.reason ?? "Причина не указана"}</td>
                  <td>{formatCurrency(item.remainingCreditBalance)}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <span className={getStatusTone(item.status)}>{getOutboxStatusLabel(item.status)}</span>
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
