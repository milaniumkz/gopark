import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { patchJson, postJson } from "../lib/api";
import {
  downloadCsv,
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  getPaymentProviderLabel,
  getPaymentStatusLabel,
  getStatusLabel,
  getStatusTone,
} from "../lib/utils";
import { StatCard } from "../ui/StatCard";
import { CarIcon, ContractsIcon, DriversIcon, FinanceIcon, ShieldIcon, WalletIcon } from "../ui/CrmIcons";
import type { ContractDetail, DriverListItem, ManagerIncidentItem, PaymentListItem, VehicleListItem } from "@gopark/contracts";

function formatObligationBreakdown(item: ContractDetail["schedule"][number]): string | null {
  if (item.type !== "installment") {
    return null;
  }

  const parts = [
    (item.installmentAmount ?? 0) > 0 ? `Договор: ${formatCurrency(item.installmentAmount ?? 0)}` : null,
    (item.gpsAmount ?? 0) > 0 ? `GPS: ${formatCurrency(item.gpsAmount ?? 0)}` : null,
    (item.insuranceAmount ?? 0) > 0 ? `Страховка: ${formatCurrency(item.insuranceAmount ?? 0)}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : null;
}

export function ContractDetailPage() {
  const { session } = useAuth();
  const { contractId } = useParams<{ contractId: string }>();
  const [editContractNumber, setEditContractNumber] = useState("");
  const [editPrincipalAmount, setEditPrincipalAmount] = useState("");
  const [editFinancedAmount, setEditFinancedAmount] = useState("");
  const [editInstallmentAmount, setEditInstallmentAmount] = useState("");
  const [editMonthlyInsuranceAmount, setEditMonthlyInsuranceAmount] = useState("");
  const [editMonthlyGpsAmount, setEditMonthlyGpsAmount] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editStatus, setEditStatus] = useState("draft");
  const [contractMessage, setContractMessage] = useState<string | null>(null);
  const [contractSaving, setContractSaving] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const api = useApiQuery<ContractDetail>(`contracts/${contractId}`);
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const financedCovered = api.data
    ? api.data.status === "active"
      ? Math.max(api.data.financedAmount - api.data.currentDebt, 0)
      : api.data.status === "closed"
        ? api.data.financedAmount
        : 0
    : 0;
  const financedCoveragePercent = api.data
    ? Math.round((financedCovered / Math.max(api.data.financedAmount, 1)) * 100)
    : 0;
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const vehicleMap = new Map((vehiclesApi.data ?? []).map((item) => [item.id, item.plateNumber]));
  const driverRecord = (driversApi.data ?? []).find((item) => item.id === api.data?.driverId);
  const driverCreditBalance = driverRecord?.creditBalance ?? 0;
  const driverLabel = api.data?.driverId
    ? (driverMap.get(api.data.driverId) ?? "Водитель привязан")
    : "—";
  const vehicleLabel = api.data?.carId
    ? (vehicleMap.get(api.data.carId) ?? "Авто привязано")
    : "—";
  const contractPayments = (paymentsApi.data ?? []).filter((item) => item.contractId === api.data?.id);
  const canEditContract = hasCrmCapability(session.requestUserRole, "create-contract", session.managerLevel);
  const canWriteOffCredit = hasCrmCapability(session.requestUserRole, "writeoff-credit");
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const contractLifecycleLabel =
    api.data?.status === "closed"
      ? "Договор выкуплен"
      : api.data?.status === "terminated"
        ? "Договор расторгнут"
        : api.data?.status === "defaulted"
          ? "Договор проблемный"
          : "Договор в работе";

  function handleExport(): void {
    if (!api.data) {
      return;
    }

    downloadCsv(`gopark-contract-${api.data.id}.csv`, [
      ["id", api.data.id],
      ["contract_number", api.data.contractNumber],
      ["driver_id", api.data.driverId],
      ["car_id", api.data.carId],
      ["status", api.data.status],
      ["principal_amount", api.data.principalAmount],
      ["financed_amount", api.data.financedAmount],
      ["installment_amount", api.data.installmentAmount],
      ["start_date", api.data.startDate ?? ""],
      ["end_date", api.data.endDate ?? ""],
      ["current_debt", api.data.currentDebt],
      ["schedule_size", api.data.schedule.length],
    ]);
  }

  useEffect(() => {
    setEditContractNumber(api.data?.contractNumber ?? "");
    setEditPrincipalAmount(api.data?.principalAmount?.toString() ?? "");
    setEditFinancedAmount(api.data?.financedAmount?.toString() ?? "");
    setEditInstallmentAmount("2300");
    setEditMonthlyInsuranceAmount(api.data?.monthlyInsuranceAmount?.toString() ?? "");
    setEditMonthlyGpsAmount(api.data?.monthlyGpsAmount?.toString() ?? "");
    setEditStartDate(api.data?.startDate ?? "");
    setEditEndDate(api.data?.endDate ?? "");
    setEditStatus(api.data?.status ?? "draft");
  }, [
    api.data?.contractNumber,
    api.data?.principalAmount,
    api.data?.financedAmount,
    api.data?.installmentAmount,
    api.data?.monthlyInsuranceAmount,
    api.data?.monthlyGpsAmount,
    api.data?.startDate,
    api.data?.endDate,
    api.data?.status,
  ]);

  async function handleSaveContract(): Promise<void> {
    if (!api.data?.id) {
      return;
    }

    setContractMessage(null);
    setContractSaving(true);
    try {
      await patchJson(`contracts/${api.data.id}`, {
        contractNumber: editContractNumber.trim(),
        principalAmount: editPrincipalAmount.trim() ? Number(editPrincipalAmount) : undefined,
        financedAmount: editFinancedAmount.trim() ? Number(editFinancedAmount) : undefined,
        installmentAmount: editInstallmentAmount.trim() ? Number(editInstallmentAmount) : undefined,
        monthlyInsuranceAmount: editMonthlyInsuranceAmount.trim() ? Number(editMonthlyInsuranceAmount) : null,
        monthlyGpsAmount: editMonthlyGpsAmount.trim() ? Number(editMonthlyGpsAmount) : null,
        startDate: editStartDate || undefined,
        endDate: editEndDate || undefined,
        status: editStatus,
      });
      await api.refetch();
      setContractMessage("Карточка договора обновлена.");
    } catch (error) {
      setContractMessage(error instanceof Error ? error.message : "Не удалось обновить договор.");
    } finally {
      setContractSaving(false);
    }
  }

  async function handleLifecycleAction(nextStatus: ContractDetail["status"]): Promise<void> {
    if (!api.data?.id) {
      return;
    }
    const addToBlacklist = nextStatus === "terminated"
      ? window.confirm("Добавить водителя в чёрный список перед архивом?")
      : false;
    const blacklistReason = addToBlacklist
      ? window.prompt("Укажите причину для чёрного списка", "Расторжение договора")?.trim()
      : "";

    setContractMessage(null);
    setContractSaving(true);
    try {
      await patchJson(`contracts/${api.data.id}`, {
        status: nextStatus,
      });
      if (addToBlacklist && api.data.driverId) {
        await postJson<ManagerIncidentItem, Record<string, unknown>>("incidents", {
          title: `Чёрный список: ${driverLabel}`,
          incidentType: "blacklist",
          status: "open",
          priority: "high",
          driverId: api.data.driverId,
          occurredAt: new Date().toISOString(),
          description: [
            blacklistReason || "Причина не указана",
            `Договор: ${api.data.contractNumber}`,
            `Долг на момент расторжения: ${api.data.currentDebt} сом`,
            `Авто: ${vehicleLabel}`,
          ].filter(Boolean).join(". "),
          managerLabel: session.requestUserRole,
        });
      }
      await api.refetch();
      setEditStatus(nextStatus);
      setContractMessage(
        nextStatus === "active"
          ? "Договор возвращён в работу."
          : nextStatus === "closed"
            ? "Договор отмечен как выкупленный."
            : nextStatus === "defaulted"
              ? "Договор отмечен как проблемный."
              : addToBlacklist
                ? "Договор расторгнут. Водитель добавлен в чёрный список."
                : "Договор отмечен как расторгнутый.",
      );
    } catch (error) {
      setContractMessage(error instanceof Error ? error.message : "Не удалось обновить статус договора.");
    } finally {
      setContractSaving(false);
    }
  }

  return (
    <section className="page-stack contract-detail-page">
      <div className="hero-card hero-card--dashboard">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <ContractsIcon width={18} height={18} />
            <span>Карточка договора</span>
          </div>
          <div className="detail-identity">
            <div className="identity-avatar">
              <ContractsIcon width={20} height={20} />
            </div>
            <div className="detail-identity__meta">
              <h2>{api.data?.contractNumber ?? `Карточка договора ${contractId}`}</h2>
              <p>Водитель, автомобиль, график и текущий долг по договору.</p>
              {api.data ? (
                <div className="detail-badges">
                  <span className={getStatusTone(api.data.status)}>{getStatusLabel(api.data.status)}</span>
                  <span className="inline-pill inline-pill--accent">{driverLabel}</span>
                  <span className="inline-pill">{vehicleLabel}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="hero-card__actions">
          <div className="toolbar toolbar--hero">
            <Link className="button-link" to="/contracts">
              К договорам
            </Link>
            {api.data ? <button onClick={handleExport}>Скачать CSV</button> : null}
          </div>
        </div>
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!api.data}
        emptyContent={
          <EmptyStatePanel
            title="Договор не найден"
            message={`Карточка ${contractId ?? "договора"} недоступна или ещё не создана.`}
            extra={
              <Link className="button-link" to="/contracts">
                Вернуться к договорам
              </Link>
            }
          />
        }
      >
        <div className="stats-grid">
          <StatCard
            title="Номер договора"
            value={api.data?.contractNumber ?? "—"}
            subtitle={contractLifecycleLabel}
            tone="blue"
            icon={<ContractsIcon width={18} height={18} />}
          />
          <StatCard
            title="Текущий долг"
            value={formatCurrency(api.data?.currentDebt ?? 0)}
            subtitle="Активная задолженность по договору"
            tone="orange"
            icon={<FinanceIcon width={18} height={18} />}
          />
          <StatCard
            title="Начисление"
            value={formatCurrency(api.data?.installmentAmount ?? 0)}
            subtitle={`Дата выплаты: ${formatDateOnly(api.data?.endDate)}`}
            tone="purple"
            icon={<WalletIcon width={18} height={18} />}
          />
          <StatCard
            title="Покрытие договора"
            value={`${financedCoveragePercent}%`}
            subtitle={
              api.data?.status === "draft"
                ? "Рабочий контур начнётся после активации договора"
                : `${formatCurrency(financedCovered)} уже закрыто`
            }
            tone="green"
            icon={<ShieldIcon width={18} height={18} />}
          />
        </div>

        <div className="table-grid">
          <article className="panel">
            <div className="panel__title">
              <DriversIcon width={18} height={18} />
              <h3>Связи договора</h3>
            </div>
            <div className="summary-list">
              <div>
                <span>Водитель</span>
                {api.data?.driverId ? (
                  <Link className="table-link table-strong" to={`/drivers/${api.data.driverId}`}>
                    {driverLabel}
                  </Link>
                ) : (
                  <strong>{driverLabel}</strong>
                )}
              </div>
              <div>
                <span>Автомобиль</span>
                <strong>{vehicleLabel}</strong>
              </div>
              <div>
                <span>Сумма договора</span>
                <strong>{formatCurrency(api.data?.principalAmount ?? 0)}</strong>
              </div>
              <div>
                <span>Сумма начислений</span>
                <strong>{formatCurrency(api.data?.financedAmount ?? 0)}</strong>
              </div>
              <div>
                <span>Страховка и ТО</span>
                <strong>{formatCurrency((api.data?.monthlyInsuranceAmount ?? 0) + (api.data?.monthlyGpsAmount ?? 0))}</strong>
              </div>
            </div>
            {canEditContract ? (
              <div className="detail-list">
                <div className="detail-list__item">
                  <strong>Lifecycle договора</strong>
                  <p>Явные действия меняют рабочий статус договора без ручного поиска нужного значения в форме.</p>
                </div>
                <div className="toolbar">
                  {api.data?.status !== "active" ? (
                    <button disabled={contractSaving} onClick={() => void handleLifecycleAction("active")}>
                      Вернуть в работу
                    </button>
                  ) : null}
                  {api.data?.status !== "closed" ? (
                    <button disabled={contractSaving} onClick={() => void handleLifecycleAction("closed")}>
                      Отметить как выкупленный
                    </button>
                  ) : null}
                  {api.data?.status !== "defaulted" ? (
                    <button disabled={contractSaving} onClick={() => void handleLifecycleAction("defaulted")}>
                      Отметить как проблемный
                    </button>
                  ) : null}
                  {api.data?.status !== "terminated" ? (
                    <button disabled={contractSaving} onClick={() => void handleLifecycleAction("terminated")}>
                      Расторгнуть договор
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {canEditContract ? (
              <div className="toolbar">
                <button type="button" className="button-secondary" onClick={() => setIsEditFormOpen((current) => !current)}>
                  {isEditFormOpen ? "Скрыть редактор" : "Редактировать договор"}
                </button>
              </div>
            ) : null}
            {canEditContract && isEditFormOpen ? (
              <div className="quick-form">
                <p className="quick-form__title">Редактировать договор</p>
                <div className="form-grid">
                  <input value={editContractNumber} onChange={(event) => setEditContractNumber(event.target.value)} placeholder="Номер договора" />
                  <input value={editPrincipalAmount} onChange={(event) => setEditPrincipalAmount(event.target.value)} placeholder="Сумма договора" inputMode="numeric" />
                  <input value={editFinancedAmount} onChange={(event) => setEditFinancedAmount(event.target.value)} placeholder="Рабочий контур" inputMode="numeric" />
                  <input value={editInstallmentAmount} onChange={(event) => setEditInstallmentAmount(event.target.value)} placeholder="Ежедневный платёж" inputMode="numeric" readOnly />
                  <input value={editMonthlyInsuranceAmount} onChange={(event) => setEditMonthlyInsuranceAmount(event.target.value)} placeholder="Ежемесячная страховка" inputMode="numeric" />
                  <input value={editMonthlyGpsAmount} onChange={(event) => setEditMonthlyGpsAmount(event.target.value)} placeholder="Ежемесячный GPS" inputMode="numeric" />
                  <input value={editStartDate} onChange={(event) => setEditStartDate(event.target.value)} type="date" />
                  <input value={editEndDate} onChange={(event) => setEditEndDate(event.target.value)} type="date" />
                  <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
                    <option value="draft">Черновик</option>
                    <option value="active">Активный</option>
                    <option value="closed">Выкуплен</option>
                    <option value="defaulted">Проблемный</option>
                    <option value="terminated">Расторгнут</option>
                  </select>
                </div>
                <p className="panel-note">
                  Если по графику уже были оплаты или подтверждённые переносы, CRM не даст перестроить график и вернёт понятную ошибку.
                </p>
                <div className="toolbar">
                  <button disabled={contractSaving} onClick={() => void handleSaveContract()}>
                    {contractSaving ? "Сохраняем..." : "Сохранить договор"}
                  </button>
                </div>
                {contractMessage ? <div className="panel-note">{contractMessage}</div> : null}
              </div>
            ) : null}
          </article>

          <article className="panel">
            <div className="panel__title">
              <FinanceIcon width={18} height={18} />
              <h3>Платежи</h3>
            </div>
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>График</strong>
                <p>{formatCurrency(api.data?.installmentAmount ?? 0)} каждый рабочий день с {formatDateOnly(api.data?.startDate)} до {formatDateOnly(api.data?.endDate)}.</p>
              </div>
              <div className="detail-list__item">
                <strong>Ежемесячные начисления</strong>
                <p>
                  Страховка: {formatCurrency(api.data?.monthlyInsuranceAmount ?? 0)} · GPS: {formatCurrency(api.data?.monthlyGpsAmount ?? 0)}.
                </p>
              </div>
              <div className="detail-list__item">
                <strong>
                  {api.data?.status === "draft"
                    ? "Долг пока не начислен"
                    : api.data?.status === "terminated"
                      ? "Договор расторгнут"
                      : api.data?.status === "defaulted"
                        ? "Договор требует разбора"
                    : (api.data?.currentDebt ?? 0) > 0
                      ? "Есть открытый долг"
                      : "Долг закрыт"}
                </strong>
                <p>
                  {api.data?.status === "draft"
                    ? "Договор ещё в черновике. Обязательства начнутся после активации."
                    : api.data?.status === "terminated"
                      ? "Этот договор завершён расторжением и больше не участвует в рабочем контуре."
                      : api.data?.status === "defaulted"
                        ? "По договору нужен отдельный разбор, он не относится к выкупленным."
                    : (api.data?.currentDebt ?? 0) > 0
                      ? "По договору есть открытый долг."
                      : "Просроченного долга нет."}
                </p>
              </div>
              <div className="detail-list__item">
                <strong>{driverCreditBalance > 0 ? "Есть свободный остаток" : "Свободного остатка нет"}</strong>
                <p>
                  {driverCreditBalance > 0
                    ? `У водителя доступно ${formatCurrency(driverCreditBalance)} свободного остатка для следующих операций.`
                    : "Свободного остатка по водителю сейчас нет."}
                </p>
              </div>
              {api.data?.status === "closed" ? (
                <div className="detail-list__item">
                  <strong>Договор выкуплен</strong>
                  <p>Рабочий контур по договору закрыт полностью.</p>
                </div>
              ) : null}
              {api.data?.status === "terminated" ? (
                <div className="detail-list__item">
                  <strong>Договор расторгнут</strong>
                  <p>Рабочий контур по этому договору завершён через расторжение.</p>
                </div>
              ) : null}
            </div>
            {canOpenFinancialOps ? (
              <div className="toolbar">
                {(api.data?.currentDebt ?? 0) > 0 ? (
                  <>
                    <Link
                      className="button-link"
                      to={`/financial-ops?action=payment&source=contract&driverId=${api.data?.driverId ?? ""}&contractId=${api.data?.id ?? ""}&amount=${api.data?.nextDueAmount ?? api.data?.currentDebt ?? 0}`}
                    >
                      Подготовить платёж
                    </Link>
                    <Link
                      className="button-link"
                      to={`/financial-ops?action=payoff&source=contract&driverId=${api.data?.driverId ?? ""}&contractId=${api.data?.id ?? ""}&amount=${api.data?.currentDebt ?? 0}`}
                    >
                      Досрочно закрыть
                    </Link>
                  </>
                ) : null}
                {driverCreditBalance > 0 ? (
                  <Link
                    className="button-link"
                    to={`/financial-ops?action=credit-writeoff&source=contract&driverId=${api.data?.driverId ?? ""}&amount=${driverCreditBalance}&reason=${encodeURIComponent("Ручная корректировка")}`}
                  >
                    Списать остаток
                  </Link>
                ) : null}
              </div>
            ) : null}
          </article>
          <article className="panel">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>История платежей</h3>
            </div>
            <AsyncState
              loading={paymentsApi.loading}
              error={paymentsApi.error}
              empty={!contractPayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="Платежей пока нет"
                  message="По этому договору ещё нет зарегистрированных платежей."
                />
              }
            >
              <div className="summary-list schedule-summary-list">
                {contractPayments.map((item) => (
                  <div key={item.id}>
                    <span>
                      {formatDateTime(item.createdAt)} · {getPaymentProviderLabel(item.provider)}
                    </span>
                    <strong>
                      {formatCurrency(item.amount)} · {getPaymentStatusLabel(item.status)}
                      {item.appliedAmount > 0 ? ` · оплачено ${formatCurrency(item.appliedAmount)}` : ""}
                      {item.unappliedAmount > 0 ? ` · остаток ${formatCurrency(item.unappliedAmount)}` : ""}
                    </strong>
                    {item.unappliedAmount > 0 && canWriteOffCredit ? (
                      <div className="toolbar">
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=credit-writeoff&source=contract-payment&driverId=${item.driverId}&amount=${item.unappliedAmount}&reason=${encodeURIComponent(`Списание переплаты по договору ${api.data?.contractNumber ?? api.data?.id ?? ""}`)}`}
                        >
                          Списать остаток
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <div className="panel__title">
              <FinanceIcon width={18} height={18} />
              <h3>График обязательств</h3>
            </div>
            <AsyncState
              loading={api.loading}
              error={api.error}
              empty={!api.data?.schedule.length}
              emptyContent={
                <EmptyStatePanel
                  title="График пока пуст"
                  message="По этому договору ещё нет начислений по графику."
                />
              }
            >
              <div className="summary-list">
                {api.data?.schedule.map((item) => {
                  const breakdown = formatObligationBreakdown(item);
                  const displayPaidAmount = api.data?.status === "closed" ? item.amount : item.paidAmount;
                  const remainingAmount = api.data?.status === "closed" ? 0 : Math.max(item.amount - item.paidAmount, 0);
                  const isOverdue =
                    !item.deferredUntil &&
                    remainingAmount > 0 &&
                    new Date(item.dueDate).getTime() < Date.now();
                  const scheduleStatus =
                    isOverdue
                      ? "overdue"
                      : item.deferredUntil && remainingAmount > 0
                      ? "deferred"
                      : remainingAmount <= 0
                        ? "paid"
                        : item.paidAmount > 0
                          ? "partial"
                          : "planned";

                  return (
                    <div key={item.id}>
                      <span>
                        {isOverdue ? "Просрочено с" : "До"} {formatDateOnly(item.deferredUntil ?? item.dueDate)} · {formatCurrency(item.amount)}
                      </span>
                      {breakdown ? <span>{breakdown}</span> : null}
                      <strong>
                        {getStatusLabel(scheduleStatus)}
                        {displayPaidAmount > 0 ? ` · оплачено ${formatCurrency(displayPaidAmount)}` : ""}
                        {remainingAmount > 0 && displayPaidAmount > 0 ? ` · остаток ${formatCurrency(remainingAmount)}` : ""}
                        {item.deferredByStatusRequestId ? " · по подтверждению" : ""}
                      </strong>
                      {remainingAmount > 0 && canOpenFinancialOps ? (
                        <div className="toolbar">
                          <Link
                            className="table-link"
                            to={`/financial-ops?action=payment&source=contract-schedule&driverId=${api.data?.driverId ?? ""}&contractId=${api.data?.id ?? ""}&amount=${remainingAmount}`}
                          >
                            Подготовить платёж
                          </Link>
                        </div>
                      ) : null}
                      {item.deferredByStatusRequestId && hasCrmAccess(session.requestUserRole, "driver-detail") ? (
                        <div className="toolbar">
                          <Link className="table-link" to={`/drivers/${api.data?.driverId ?? ""}`}>
                            Открыть водителя
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </AsyncState>
          </article>
          <article className="panel">
            <div className="panel__title">
              <CarIcon width={18} height={18} />
              <h3>Связанные переходы</h3>
            </div>
            <div className="summary-list">
              {api.data?.driverId && hasCrmAccess(session.requestUserRole, "driver-detail") ? (
                <div>
                  <span>Карточка водителя</span>
                  <strong>
                    <Link className="table-link" to={`/drivers/${api.data.driverId}`}>
                      Открыть водителя
                    </Link>
                  </strong>
                </div>
              ) : null}
              {api.data?.carId && hasCrmAccess(session.requestUserRole, "vehicle-detail") ? (
                <div>
                  <span>Карточка автомобиля</span>
                  <strong>
                    <Link className="table-link" to={`/vehicles/${api.data.carId}`}>
                      Открыть автомобиль
                    </Link>
                  </strong>
                </div>
              ) : null}
            </div>
          </article>
          <article className="panel">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>Параметры рассрочки</h3>
            </div>
            <div className="summary-list">
              <div><span>Сумма договора</span><strong>{formatCurrency(api.data?.principalAmount ?? 0)}</strong></div>
              <div><span>Сумма начислений</span><strong>{formatCurrency(api.data?.financedAmount ?? 0)}</strong></div>
              <div><span>Дата старта</span><strong>{formatDateOnly(api.data?.startDate)}</strong></div>
              <div><span>Дата выплаты</span><strong>{formatDateOnly(api.data?.endDate)}</strong></div>
            </div>
          </article>
        </div>
      </AsyncState>
    </section>
  );
}
