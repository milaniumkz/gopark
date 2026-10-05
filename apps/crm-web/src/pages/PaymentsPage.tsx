import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { useApiMutation } from "../hooks/useApiMutation";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { downloadCsvTable, formatCurrency, formatDateOnly, formatDateTime, formatShortId, getPaymentProviderLabel, getPaymentStatusLabel, getStatusTone } from "../lib/utils";
import type {
  ClearPaymentCalendarDayOverrideDto,
  ContractListItem,
  DriverListItem,
  PaymentCalendarDayOverrideItem,
  PaymentCalendarDayOverrideStatus,
  PaymentListItem,
  UpsertPaymentCalendarDayOverrideDto,
} from "@gopark/contracts";
import { StatCard } from "../ui/StatCard";
import { ContractsIcon, DriversIcon, FinanceIcon, PaymentsIcon, WalletIcon } from "../ui/CrmIcons";

type CalendarAutoTone = "paid" | "unpaid" | "failed" | "partial" | "dayoff" | "future";
type CalendarManualTone = PaymentCalendarDayOverrideStatus;
type CalendarTone = CalendarAutoTone | CalendarManualTone;
type CalendarOverrideFormStatus = "auto" | PaymentCalendarDayOverrideStatus;

const calendarOverrideOptions: Array<{ value: PaymentCalendarDayOverrideStatus; label: string; tone: CalendarManualTone }> = [
  { value: "day_off", label: "Выходной", tone: "day_off" },
  { value: "asked_leave", label: "Отпросился", tone: "asked_leave" },
  { value: "sick", label: "Больничный", tone: "sick" },
  { value: "repair", label: "Ремонт / СТО", tone: "repair" },
  { value: "accident", label: "ДТП", tone: "accident" },
  { value: "other", label: "Прочее", tone: "other" },
];

const calendarOverrideLabels = Object.fromEntries(calendarOverrideOptions.map((item) => [item.value, item.label])) as Record<PaymentCalendarDayOverrideStatus, string>;

interface SelectedCalendarCell {
  driverId: string;
  driverName: string;
  day: string;
  amount: number;
  autoTone: CalendarAutoTone;
  override: PaymentCalendarDayOverrideItem | null;
}

function getPaymentDateOnly(item: Pick<PaymentListItem, "paymentForDate" | "createdAt">): string {
  return (item.paymentForDate ?? item.createdAt).slice(0, 10);
}

export function PaymentsPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const paymentsView = searchParams.get("view") ?? "all";
  const isActualPaymentsView = paymentsView === "actual";
  const initialPaymentDateFrom = searchParams.get("paymentDateFrom") ?? "";
  const initialPaymentDateTo = searchParams.get("paymentDateTo") ?? initialPaymentDateFrom;
  const [paymentDateFrom, setPaymentDateFrom] = useState(initialPaymentDateFrom);
  const [paymentDateTo, setPaymentDateTo] = useState(initialPaymentDateTo);
  const [companyFilter, setCompanyFilter] = useState(searchParams.get("companyName") ?? session.companyName?.trim() ?? "all");
  const [providerFilter, setProviderFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | string>(searchParams.get("status") ?? "all");
  const [creditOnly, setCreditOnly] = useState(false);
  const [query, setQuery] = useState("");
  const api = useApiQuery<PaymentListItem[]>("payments");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const canOpenFinancialOps = hasCrmAccess(session.requestUserRole, "financial-ops");
  const canWriteOffCredit = hasCrmCapability(session.requestUserRole, "writeoff-credit");
  const canEditPaymentCalendar = ["owner", "admin", "finance", "operator"].includes(session.requestUserRole);
  const companies = settingsApi.data?.companies ?? [];
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const driverCompanyMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.companyName ?? ""]));
  const driverCreditMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.creditBalance]));
  const contractMap = new Map((contractsApi.data ?? []).map((item) => [item.id, item.contractNumber]));
  const activeContractByDriver = new Map(
    (contractsApi.data ?? [])
      .filter((item) => item.status === "active")
      .map((item) => [item.driverId, item]),
  );
  const contractCompanyMap = new Map(
    (contractsApi.data ?? []).map((item) => [item.id, driverCompanyMap.get(item.driverId) ?? ""]),
  );
  const basePayments = (api.data ?? []).filter((item) => {
    const inCompany = companyFilter === "all"
      || (driverCompanyMap.get(item.driverId) ?? contractCompanyMap.get(item.contractId) ?? "") === companyFilter;
    const inProvider = providerFilter === "all" || item.provider === providerFilter;
    const inStatus = statusFilter === "all" || item.status === statusFilter;
    const inCredit = !creditOnly || item.unappliedAmount > 0;
    const normalizedQuery = query.trim().toLowerCase();
    const inSearch = !normalizedQuery || [
      item.id,
      item.driverId,
      item.contractId,
      driverMap.get(item.driverId) ?? "",
      contractMap.get(item.contractId) ?? "",
      driverCompanyMap.get(item.driverId) ?? "",
      item.provider,
      item.status,
      item.paymentForDate ?? "",
    ].join(" ").toLowerCase().includes(normalizedQuery);

    return inCompany && inProvider && inStatus && inCredit && inSearch;
  });
  const payments = basePayments.filter((item) => {
    const paymentDate = getPaymentDateOnly(item);
    return !paymentDateFrom || (paymentDate >= paymentDateFrom && paymentDate <= (paymentDateTo || paymentDateFrom));
  });
  const calendarMonth = (paymentDateFrom || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const calendarOverridesApi = useApiQuery<PaymentCalendarDayOverrideItem[]>(`payments/calendar-overrides?month=${calendarMonth}`);
  const upsertCalendarOverride = useApiMutation<PaymentCalendarDayOverrideItem, UpsertPaymentCalendarDayOverrideDto>("payments/calendar-overrides");
  const clearCalendarOverride = useApiMutation<{ ok: true }, ClearPaymentCalendarDayOverrideDto>("payments/calendar-overrides/clear");
  const [selectedCalendarCell, setSelectedCalendarCell] = useState<SelectedCalendarCell | null>(null);
  const [calendarOverrideStatus, setCalendarOverrideStatus] = useState<CalendarOverrideFormStatus>("auto");
  const [calendarOverrideNote, setCalendarOverrideNote] = useState("");
  const [calendarOverrideMessage, setCalendarOverrideMessage] = useState<string | null>(null);

  useEffect(() => {
    setPaymentDateFrom(searchParams.get("paymentDateFrom") ?? "");
    setPaymentDateTo(searchParams.get("paymentDateTo") ?? searchParams.get("paymentDateFrom") ?? "");
    setCompanyFilter(searchParams.get("companyName") ?? session.companyName?.trim() ?? "all");
    setStatusFilter(searchParams.get("status") ?? "all");
  }, [searchParams, session.companyName]);
  const calendarOverrideMap = useMemo(() => {
    return new Map((calendarOverridesApi.data ?? []).map((item) => [`${item.driverId}:${item.date}`, item]));
  }, [calendarOverridesApi.data]);
  const today = new Date().toISOString().slice(0, 10);
  const calendarDayHeaders = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = `${calendarMonth}-${String(index + 1).padStart(2, "0")}`;
      return { day };
    });
  }, [calendarMonth]);
  const calendarRows = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, index) => `${calendarMonth}-${String(index + 1).padStart(2, "0")}`);
    const paymentsByDriverDay = new Map<string, { amount: number; failed: number; count: number }>();
    for (const item of basePayments) {
      const day = getPaymentDateOnly(item);
      if (!day.startsWith(calendarMonth)) {
        continue;
      }
      const key = `${item.driverId}:${day}`;
      const current = paymentsByDriverDay.get(key) ?? { amount: 0, failed: 0, count: 0 };
      current.amount += item.appliedAmount || item.amount;
      current.failed += item.status === "failed" ? 1 : 0;
      current.count += 1;
      paymentsByDriverDay.set(key, current);
    }

    return (driversApi.data ?? [])
      .filter((driver) => {
        const inCompany = companyFilter === "all" || (driver.companyName ?? "") === companyFilter;
        const normalizedQuery = query.trim().toLowerCase();
        const contract = activeContractByDriver.get(driver.id);
        const inSearch = !normalizedQuery || [
          driver.fullName,
          driver.phone,
          driver.companyName ?? "",
          contract?.contractNumber ?? "",
        ].join(" ").toLowerCase().includes(normalizedQuery);
        return inCompany && inSearch && (contract || basePayments.some((payment) => payment.driverId === driver.id));
      })
      .map((driver) => {
        const contract = activeContractByDriver.get(driver.id);
        const rate = contract?.installmentAmount ?? 0;
        const paid = days.reduce((sum, day) => sum + (paymentsByDriverDay.get(`${driver.id}:${day}`)?.amount ?? 0), 0);
        const expected = days.reduce((sum, day) => {
          if (!contract || day > today || (contract.startDate && day < contract.startDate) || (contract.endDate && day > contract.endDate)) {
            return sum;
          }
          const weekday = new Date(`${day}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "long" }).toLowerCase();
          return driver.weeklyDayOff && weekday.includes(driver.weeklyDayOff.toLowerCase()) ? sum : sum + rate;
        }, 0);
        return {
          driver,
          contract,
          rate,
          paid,
          expected,
          debt: Math.max(expected - paid, 0),
          days: days.map((day) => {
            const payment = paymentsByDriverDay.get(`${driver.id}:${day}`);
            const weekday = new Date(`${day}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "long" }).toLowerCase();
            const isDayOff = Boolean(driver.weeklyDayOff && weekday.includes(driver.weeklyDayOff.toLowerCase()));
            const isFuture = day > today;
            const isOutside = !contract || (contract.startDate && day < contract.startDate) || (contract.endDate && day > contract.endDate);
            const autoTone: CalendarAutoTone = payment?.failed
              ? "failed"
              : payment?.amount && rate > 0 && payment.amount < rate
                ? "partial"
                : payment?.amount
                  ? "paid"
                  : isDayOff
                    ? "dayoff"
                    : isFuture || isOutside
                      ? "future"
                      : "unpaid";
            const override = calendarOverrideMap.get(`${driver.id}:${day}`) ?? null;
            const tone: CalendarTone = override?.status ?? autoTone;
            return { day, tone, autoTone, override, amount: payment?.amount ?? 0 };
          }),
        };
      })
      .sort((left, right) => right.debt - left.debt || left.driver.fullName.localeCompare(right.driver.fullName, "ru"))
      .slice(0, 80);
  }, [activeContractByDriver, basePayments, calendarMonth, calendarOverrideMap, companyFilter, driversApi.data, query, today]);
  const availableProviders = Array.from(new Set((api.data ?? []).map((item) => item.provider))).sort();
  const totalAmount = payments.reduce((sum, item) => sum + item.amount, 0);
  const totalApplied = payments.reduce((sum, item) => sum + item.appliedAmount, 0);
  const totalUnapplied = payments.reduce((sum, item) => sum + item.unappliedAmount, 0);
  const withCredit = payments.filter((item) => item.unappliedAmount > 0).length;

  function handleExport(): void {
    if (!payments.length) {
      return;
    }

    downloadCsvTable(
      "gopark-payments.csv",
      ["payment", "company", "driver", "contract", "provider", "amount", "applied_amount", "unapplied_amount", "payment_for_date", "status", "created_at"],
      payments.map((item) => [
        formatShortId(item.id),
        driverCompanyMap.get(item.driverId) ?? contractCompanyMap.get(item.contractId) ?? "",
        driverMap.get(item.driverId) ?? formatShortId(item.driverId),
        contractMap.get(item.contractId) ?? formatShortId(item.contractId),
        getPaymentProviderLabel(item.provider),
        item.amount,
        item.appliedAmount,
        item.unappliedAmount,
        item.paymentForDate ?? "",
        getPaymentStatusLabel(item.status),
        item.createdAt,
      ]),
    );
  }

  function setCalendarMonthOffset(offset: number): void {
    const [year, month] = calendarMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setPaymentDateFrom(`${nextMonth}-01`);
    setPaymentDateTo(`${nextMonth}-${String(new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()).padStart(2, "0")}`);
  }

  function openCalendarCell(row: (typeof calendarRows)[number], item: (typeof calendarRows)[number]["days"][number]): void {
    setPaymentDateFrom(item.day);
    setPaymentDateTo(item.day);
    setQuery(row.driver.fullName);

    if (!canEditPaymentCalendar) {
      return;
    }

    setSelectedCalendarCell({
      driverId: row.driver.id,
      driverName: row.driver.fullName,
      day: item.day,
      amount: item.amount,
      autoTone: item.autoTone,
      override: item.override,
    });
    setCalendarOverrideStatus(item.override?.status ?? "auto");
    setCalendarOverrideNote(item.override?.note ?? "");
    setCalendarOverrideMessage(null);
  }

  async function saveCalendarOverride(): Promise<void> {
    if (!selectedCalendarCell) {
      return;
    }

    try {
      if (calendarOverrideStatus === "auto") {
        await clearCalendarOverride.mutate({
          driverId: selectedCalendarCell.driverId,
          date: selectedCalendarCell.day,
        });
      } else {
        await upsertCalendarOverride.mutate({
          driverId: selectedCalendarCell.driverId,
          date: selectedCalendarCell.day,
          status: calendarOverrideStatus,
          note: calendarOverrideNote,
        });
      }
      await calendarOverridesApi.refetch();
      setSelectedCalendarCell(null);
    } catch (error) {
      setCalendarOverrideMessage(error instanceof Error ? error.message : "Не удалось сохранить статус дня");
    }
  }

  return (
    <section className="page-stack payments-page">
      <div className="hero-card">
        <p className="eyebrow">Платежи</p>
        <h2>{isActualPaymentsView ? "Фактические выплаты" : "Платежи"}</h2>
          <p>
            {paymentDateFrom
              ? `${isActualPaymentsView ? "Фактические выплаты" : "Входящие платежи"} за период ${formatDateOnly(paymentDateFrom)}${paymentDateTo && paymentDateTo !== paymentDateFrom ? ` - ${formatDateOnly(paymentDateTo)}` : ""}.`
              : "Входящие платежи и их текущие статусы."}
          </p>
        {canOpenFinancialOps ? (
          <div className="toolbar">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по водителю, договору, ID" />
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
              <option value="all">Все провайдеры</option>
              {availableProviders.map((item) => (
                <option key={item} value={item}>
                  {getPaymentProviderLabel(item)}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Все статусы</option>
              <option value="pending">Ожидает</option>
              <option value="succeeded">Проведён</option>
              <option value="failed">Ошибка</option>
            </select>
            <input type="date" value={paymentDateFrom} onChange={(event) => setPaymentDateFrom(event.target.value)} />
            <input type="date" value={paymentDateTo} onChange={(event) => setPaymentDateTo(event.target.value)} />
            {creditOnly ? (
              <button type="button" className="button-secondary" onClick={() => setCreditOnly(false)}>
                Снять фильтр остатка
              </button>
            ) : null}
            <Link className="button-link" to="/financial-ops">
              Открыть финансовые операции
            </Link>
            {api.data?.length ? <button onClick={handleExport}>Скачать CSV</button> : null}
          </div>
        ) : (
          <ReadOnlyNotice message="Для этой роли доступен только просмотр платежей." />
        )}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Всего платежей"
          value={String(payments.length)}
          subtitle="Все входящие операции"
          tone="blue"
          icon={<WalletIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("all");
            setProviderFilter("all");
            setCreditOnly(false);
            setQuery("");
          }}
        />
        <StatCard
          title="Сумма входящих"
          value={formatCurrency(totalAmount)}
          subtitle="Общий объём поступлений"
          tone="green"
          icon={<FinanceIcon width={18} height={18} />}
          to="/financial-ops"
        />
        <StatCard
          title="Оплачено"
          value={formatCurrency(totalApplied)}
          subtitle="Ушло в погашение обязательств"
          tone="purple"
          icon={<ContractsIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("succeeded");
            setCreditOnly(false);
          }}
        />
        <StatCard
          title="Остаток"
          value={formatCurrency(totalUnapplied)}
          subtitle={`${withCredit} платежей оставили свободный остаток`}
          tone="orange"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => {
            setStatusFilter("all");
            setCreditOnly(true);
            setQuery("");
          }}
        />
      </div>

      <article className="panel payments-calendar payments-calendar--matrix">
        <div className="payments-calendar__bar">
          <button type="button" className="button-secondary" onClick={() => setCalendarMonthOffset(-1)}>
            Назад
          </button>
          <strong>
            {new Date(`${calendarMonth}-01T00:00:00`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
          </strong>
          <button type="button" className="button-secondary" onClick={() => setCalendarMonthOffset(1)}>
            Вперёд
          </button>
          <div className="payments-calendar__legend">
            {(["paid", "unpaid", "partial", "dayoff", "asked_leave", "sick", "repair", "accident", "failed", "future"] as CalendarTone[]).map((tone) => (
              <span key={tone}>
                <i className={`payments-calendar__dot payments-calendar__dot--${tone}`} />
                {tone in calendarOverrideLabels ? calendarOverrideLabels[tone as PaymentCalendarDayOverrideStatus] : getCalendarAutoToneLabel(tone as CalendarAutoTone)}
              </span>
            ))}
          </div>
        </div>
        <div className="payments-calendar__scroll">
        <div
          className="payments-calendar__matrix"
          style={{ gridTemplateColumns: `220px repeat(${calendarDayHeaders.length}, 24px) 96px 132px` }}
        >
          <div className="payments-calendar__head payments-calendar__driver-head">Водитель</div>
          {calendarDayHeaders.map((item) => (
            <div key={`head-${item.day}`} className="payments-calendar__head">
              <strong>{item.day.slice(-2)}</strong>
              <span>{new Date(`${item.day}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "short" })}</span>
            </div>
          ))}
          <div className="payments-calendar__head payments-calendar__rate-head">Ставка</div>
          <div className="payments-calendar__head payments-calendar__total-head">Итог</div>
          {calendarRows.map((row) => (
            <div key={row.driver.id} className="payments-calendar__row" style={{ display: "contents" }}>
              <div className="payments-calendar__driver">
                <strong>{row.driver.fullName}</strong>
                <span>{row.contract?.contractNumber ?? row.driver.phone}</span>
              </div>
              {row.days.map((item) => (
                <button
                  key={`${row.driver.id}-${item.day}`}
                  type="button"
                  className={`payments-calendar__cell payments-calendar__cell--${item.tone}${selectedCalendarCell?.driverId === row.driver.id && selectedCalendarCell.day === item.day ? " payments-calendar__cell--selected" : ""}`}
                  title={`${row.driver.fullName}: ${item.day} · ${item.override ? calendarOverrideLabels[item.override.status] : getCalendarAutoToneLabel(item.autoTone)} · ${formatCurrency(item.amount)}`}
                  onClick={() => openCalendarCell(row, item)}
                />
              ))}
              <div className="payments-calendar__rate">{formatCurrency(row.rate)}</div>
              <div className="payments-calendar__total">
                <strong>{formatCurrency(row.paid)}</strong>
                <span>долг {formatCurrency(row.debt)}</span>
              </div>
            </div>
          ))}
        </div>
        </div>
        {!calendarRows.length ? <p className="panel-note">Нет водителей для календаря за выбранный месяц.</p> : null}
      </article>

      {selectedCalendarCell ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true">
            <h3>Статус дня</h3>
            <p className="panel-note">
              {selectedCalendarCell.driverName} · {formatDateOnly(selectedCalendarCell.day)} · автоматически: {getCalendarAutoToneLabel(selectedCalendarCell.autoTone)}
            </p>
            <select value={calendarOverrideStatus} onChange={(event) => setCalendarOverrideStatus(event.target.value as CalendarOverrideFormStatus)}>
              <option value="auto">Автоматически</option>
              {calendarOverrideOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <textarea value={calendarOverrideNote} onChange={(event) => setCalendarOverrideNote(event.target.value)} placeholder="Комментарий" />
            {calendarOverrideMessage ? <p className="form-error">{calendarOverrideMessage}</p> : null}
            <div className="toolbar">
              <button type="button" onClick={() => void saveCalendarOverride()}>Сохранить</button>
              <button type="button" className="button-secondary" onClick={() => setSelectedCalendarCell(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!payments.length}
        emptyContent={
          <EmptyStatePanel
            title="Платежей пока нет"
            message="Входящих платежей пока нет. Новые платежи проводятся через профильный финансовый контур."
          />
        }
      >
        <article className="panel">
          <table className="data-table payments-table">
            <thead>
              <tr>
                <th>Платёж</th>
                <th>Водитель</th>
                <th>Договор / провайдер</th>
                <th>Суммы</th>
                <th>Дата</th>
                <th>Результат</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="amount-stack">
                      <strong>Платёж {formatShortId(item.id)}</strong>
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
                  <td>
                    {contractMap.get(item.contractId) ? (
                      <Link className="table-link" to={`/contracts/${item.contractId}`}>
                        {contractMap.get(item.contractId)}
                      </Link>
                    ) : (
                      formatShortId(item.contractId)
                    )}
                    <p className="table-meta">{getPaymentProviderLabel(item.provider)}</p>
                  </td>
                  <td>
                    <div className="amount-stack">
                      <strong>{formatCurrency(item.amount)}</strong>
                      <span>Оплачено: {formatCurrency(item.appliedAmount)}</span>
                      <span>Остаток: {formatCurrency(item.unappliedAmount)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="amount-stack">
                      <strong>{item.paymentForDate ? formatDateOnly(item.paymentForDate) : "Текущий день"}</strong>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="amount-stack">
                      <strong>
                        {item.unappliedAmount > 0
                          ? `Свободный остаток ${formatCurrency(item.unappliedAmount)}`
                          : item.appliedAmount > 0
                            ? `Оплачено ${formatCurrency(item.appliedAmount)}`
                            : "Без движения по начислениям"}
                      </strong>
                      <span>
                        {item.unappliedAmount > 0
                          ? "Остаток доступен для следующих начислений"
                          : "Свободного остатка не осталось"}
                      </span>
                      {item.unappliedAmount > 0 && (driverCreditMap.get(item.driverId) ?? 0) > 0 && canOpenFinancialOps && canWriteOffCredit ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=credit-writeoff&source=payments&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                        >
                          Списать остаток
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td><span className={getStatusTone(item.status)}>{getPaymentStatusLabel(item.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>
    </section>
  );
}

function getCalendarAutoToneLabel(tone: CalendarAutoTone): string {
  switch (tone) {
    case "paid":
      return "оплачено";
    case "partial":
      return "частично";
    case "failed":
      return "ошибка";
    case "dayoff":
      return "выходной по графику";
    case "future":
      return "будущее / вне договора";
    case "unpaid":
    default:
      return "не оплачено";
  }
}
