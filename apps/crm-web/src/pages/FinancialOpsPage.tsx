import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { useApiMutation } from "../hooks/useApiMutation";
import { AsyncState } from "../ui/AsyncState";
import { useAuth } from "../ui/AuthContext";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { ContractsIcon, DriversIcon, FinanceIcon, WalletIcon } from "../ui/CrmIcons";
import type {
  ContractEarlyPayoffResult,
  ContractListItem,
  DriverCreditWriteoffResult,
  DriverListItem,
  LedgerEntry,
  ManagerAssignedDriverItem,
  PaymentListItem,
  PayoutListItem,
} from "@gopark/contracts";
import { fetchJson, postJson } from "../lib/api";
import {
  formatCurrency,
  formatDateOnly,
  formatDueDateLabel,
  formatShortId,
  getPaymentStatusLabel,
  getPayoutStatusLabel,
  isPastDate,
} from "../lib/utils";

type FinancialDriverOption = DriverListItem & {
  yandexBalance: number;
  overdueDebt: number;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
};

const presetSourceContext: Record<string, string> = {
  driver: "из карточки водителя",
  contract: "из карточки договора",
  vehicle: "из карточки автомобиля",
  dashboard: "с главной",
  reports: "из отчётов",
  "financial-ops": "из финансовых операций",
  drivers: "из реестра водителей",
  contracts: "из реестра договоров",
  vehicles: "из реестра автомобилей",
  incidents: "из инцидентов",
  ledger: "из движения денежных средств",
  payments: "из журнала платежей",
  payouts: "из раздела выводов",
};

function getPresetNotice(action: string, source: string | null): string | null {
  if (action === "payment") {
    return `Платёж подготовлен ${presetSourceContext[source ?? ""] ?? "из карточки водителя"}.`;
  }

  if (action === "payout") {
    return `Заявка на вывод подготовлена ${presetSourceContext[source ?? ""] ?? "из карточки водителя"}.`;
  }

  if (action === "payoff") {
    return `Досрочное погашение подготовлено ${presetSourceContext[source ?? ""] ?? "из карточки договора"}.`;
  }

  if (action === "credit-writeoff") {
    return `Списание переплаты подготовлено ${presetSourceContext[source ?? ""] ?? "из карточки водителя"}.`;
  }

  return null;
}

export function FinancialOpsPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [companyFilter, setCompanyFilter] = useState(session.companyName?.trim() || "all");
  const [paymentDriverId, setPaymentDriverId] = useState("");
  const [paymentContractId, setPaymentContractId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("15000");
  const [paymentForDate, setPaymentForDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentContractQuery, setPaymentContractQuery] = useState("");
  const [paymentProvider, setPaymentProvider] = useState("bakai");
  const [payoutDriverId, setPayoutDriverId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("5000");
  const [payoffDriverId, setPayoffDriverId] = useState("");
  const [payoffContractId, setPayoffContractId] = useState("");
  const [payoffAmount, setPayoffAmount] = useState("10000");
  const [payoffProvider, setPayoffProvider] = useState("bakai");
  const [creditDriverId, setCreditDriverId] = useState("");
  const [creditAmount, setCreditAmount] = useState("1000");
  const [creditReason, setCreditReason] = useState("Ручная корректировка");
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [paymentFormMessage, setPaymentFormMessage] = useState<string | null>(null);
  const [payoutFormMessage, setPayoutFormMessage] = useState<string | null>(null);
  const [payoffFormMessage, setPayoffFormMessage] = useState<string | null>(null);
  const [creditFormMessage, setCreditFormMessage] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  const [bulkPayoutActionLoading, setBulkPayoutActionLoading] = useState(false);
  const [effectiveDrivers, setEffectiveDrivers] = useState<ManagerAssignedDriverItem[] | null>(null);
  const [activeForm, setActiveForm] = useState<"none" | "payoff" | "credit">("none");
  const paymentAmountInputRef = useRef<HTMLInputElement | null>(null);
  const payoutAmountInputRef = useRef<HTMLInputElement | null>(null);
  const payoffAmountInputRef = useRef<HTMLInputElement | null>(null);
  const creditAmountInputRef = useRef<HTMLInputElement | null>(null);
  const lastPresetKeyRef = useRef<string | null>(null);
  const payments = useApiQuery<PaymentListItem[]>("payments");
  const payouts = useApiQuery<PayoutListItem[]>("payouts");
  const ledger = useApiQuery<LedgerEntry[]>("ledger/entries");
  const drivers = useApiQuery<DriverListItem[]>("drivers");
  const contracts = useApiQuery<ContractListItem[]>("contracts");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const createPayment = useApiMutation<
    PaymentListItem,
    { driverId: string; contractId: string; amount: number; provider: string; paymentForDate?: string | null }
  >("payments");
  const createPayout = useApiMutation<PayoutListItem, { driverId: string; amount: number }>("payouts");
  const earlyPayoff = useApiMutation<
    ContractEarlyPayoffResult,
    { driverId: string; contractId: string; amount: number; provider: string }
  >("payments/early-payoff");
  const writeOffCredit = useApiMutation<
    DriverCreditWriteoffResult,
    { driverId: string; amount: number; reason?: string }
  >("payments/credit-writeoff");
  const canCreatePayment = hasCrmCapability(session.requestUserRole, "create-payment");
  const canCreatePayout = hasCrmCapability(session.requestUserRole, "create-payout");
  const canPayOffContractEarly = hasCrmCapability(session.requestUserRole, "early-payoff");
  const canWriteOffCredit = hasCrmCapability(session.requestUserRole, "writeoff-credit");
  const canApprovePayout = hasCrmCapability(session.requestUserRole, "approve-payout");
  const companies = settingsApi.data?.companies ?? [];
  const rawContracts = contracts.data ?? [];
  const canReadEffectiveDriverStates = ["owner", "admin", "finance", "manager"].includes(session.requestUserRole);
  const effectiveDriverMap = new Map((effectiveDrivers ?? []).map((item) => [item.id, item]));
  const rawDrivers: FinancialDriverOption[] = (drivers.data ?? []).map((item) => {
    const effectiveDriver = effectiveDriverMap.get(item.id);

    return {
      ...item,
      status: effectiveDriver?.status ?? item.status,
      activeContractId: effectiveDriver?.contractId ?? item.activeContractId,
      creditBalance: effectiveDriver?.creditBalance ?? item.creditBalance,
      yandexBalance: effectiveDriver?.yandexBalance ?? 0,
      overdueDebt: effectiveDriver?.overdueDebt ?? 0,
      nextPaymentAmount: effectiveDriver?.nextPaymentAmount ?? 0,
      nextPaymentDate: effectiveDriver?.nextPaymentDate ?? null,
      lastPaymentDate: effectiveDriver?.lastPaymentDate ?? null,
    };
  });
  const driverCompanyMap = new Map(rawDrivers.map((item) => [item.id, item.companyName ?? ""]));
  const matchesCompany = (driverId?: string | null, carId?: string | null): boolean => {
    if (companyFilter === "all") {
      return true;
    }

    return (driverId ? driverCompanyMap.get(driverId) : "") === companyFilter
      || (carId ? rawContracts.find((item) => item.carId === carId)?.driverId ? driverCompanyMap.get(rawContracts.find((item) => item.carId === carId)!.driverId) : "" : "") === companyFilter;
  };
  const availableDrivers = rawDrivers.filter((item) => matchesCompany(item.id, null));
  const availableContracts = rawContracts.filter((item) => matchesCompany(item.driverId, item.carId));
  const activeContracts = availableContracts.filter((item) => item.status === "active");
  const activeContractIds = new Set(activeContracts.map((item) => item.id));
  const driverMap = new Map(availableDrivers.map((item) => [item.id, item.fullName]));
  const driverCreditMap = new Map(availableDrivers.map((item) => [item.id, item.creditBalance]));
  const contractMap = new Map(availableContracts.map((item) => [item.id, item.contractNumber]));
  const paymentRows = (payments.data ?? []).filter((item) => matchesCompany(item.driverId, rawContracts.find((contract) => contract.id === item.contractId)?.carId ?? null));
  const creditPaymentRows = paymentRows
    .filter((item) => item.unappliedAmount > 0)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6);
  const payoutRows = (payouts.data ?? []).filter((item) => matchesCompany(item.driverId, null));
  const requestedPayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of payoutRows) {
      if (item.status !== "requested") {
        continue;
      }

      amounts.set(item.driverId, (amounts.get(item.driverId) ?? 0) + item.amount);
    }

    return amounts;
  }, [payoutRows]);
  const availablePayoutAmountByDriverId = useMemo(() => {
    const amounts = new Map<string, number>();

    for (const item of availableDrivers) {
      amounts.set(item.id, Math.max(0, item.yandexBalance - (requestedPayoutAmountByDriverId.get(item.id) ?? 0) - 100));
    }

    return amounts;
  }, [availableDrivers, requestedPayoutAmountByDriverId]);
  const recentlyClosedContracts = availableContracts
    .filter((item) => item.status === "closed")
    .sort((left, right) => right.contractNumber.localeCompare(left.contractNumber))
    .slice(0, 6);
  const overdueContracts = activeContracts
    .filter((item) => item.currentDebt > 0)
    .sort((left, right) => right.currentDebt - left.currentDebt)
    .slice(0, 6);
  const obligationEntries = (ledger.data ?? []).filter(
    (item) => item.type === "obligation" && !!item.contractId && activeContractIds.has(item.contractId),
  );
  const obligationRows = obligationEntries
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt))
    .slice(0, 6);
  const deferredContracts = activeContracts
    .filter((item) => item.hasDeferredPayment)
    .sort((left, right) => {
      if (!left.nextDueDate && !right.nextDueDate) {
        return 0;
      }
      if (!left.nextDueDate) {
        return 1;
      }
      if (!right.nextDueDate) {
        return -1;
      }
      return left.nextDueDate.localeCompare(right.nextDueDate);
    })
    .slice(0, 6);
  const creditRows = (ledger.data ?? [])
    .filter((item) => matchesCompany(item.driverId, item.contractId ? rawContracts.find((contract) => contract.id === item.contractId)?.carId ?? null : null))
    .filter((item) => item.type === "adjustment" || item.type === "refund")
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt));
  const totalIncoming = paymentRows.reduce((sum, item) => sum + item.amount, 0);
  const totalIncomingCredit = paymentRows.reduce((sum, item) => sum + item.unappliedAmount, 0);
  const pendingPayoutAmount = payoutRows
    .filter((item) => item.status === "requested")
    .reduce((sum, item) => sum + item.amount, 0);
  const approvedPayoutAmount = payoutRows
    .filter((item) => item.status === "approved")
    .reduce((sum, item) => sum + item.amount, 0);
  const requestedPayoutRows = payoutRows.filter((item) => item.status === "requested");
  const selectedPayoutCount = selectedPayoutIds.length;
  const allPayoutsSelected = requestedPayoutRows.length > 0 && selectedPayoutCount === requestedPayoutRows.length;

  async function reloadEffectiveDrivers(): Promise<void> {
    if (!canReadEffectiveDriverStates) {
      setEffectiveDrivers(null);
      return;
    }

    try {
      const data = await fetchJson<ManagerAssignedDriverItem[]>("mobile/manager/drivers");
      setEffectiveDrivers(data);
    } catch {
      setEffectiveDrivers(null);
    }
  }

  async function refreshFinancialState(options?: {
    payments?: boolean;
    payouts?: boolean;
    ledger?: boolean;
    drivers?: boolean;
    contracts?: boolean;
    effectiveDrivers?: boolean;
  }): Promise<void> {
    const {
      payments: shouldRefreshPayments = false,
      payouts: shouldRefreshPayouts = false,
      ledger: shouldRefreshLedger = false,
      drivers: shouldRefreshDrivers = false,
      contracts: shouldRefreshContracts = false,
      effectiveDrivers: shouldRefreshEffectiveDrivers = false,
    } = options ?? {};

    await Promise.all([
      shouldRefreshPayments ? payments.refetch() : Promise.resolve(),
      shouldRefreshPayouts ? payouts.refetch() : Promise.resolve(),
      shouldRefreshLedger ? ledger.refetch() : Promise.resolve(),
      shouldRefreshDrivers ? drivers.refetch() : Promise.resolve(),
      shouldRefreshContracts ? contracts.refetch() : Promise.resolve(),
      shouldRefreshEffectiveDrivers ? reloadEffectiveDrivers() : Promise.resolve(),
    ]);
  }

  useEffect(() => {
    if (!canReadEffectiveDriverStates) {
      setEffectiveDrivers(null);
      return;
    }

    let active = true;

    fetchJson<ManagerAssignedDriverItem[]>("mobile/manager/drivers")
      .then((data) => {
        if (active) {
          setEffectiveDrivers(data);
        }
      })
      .catch(() => {
        if (active) {
          setEffectiveDrivers(null);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadEffectiveDriverStates]);

  useEffect(() => {
    if (!availableDrivers.length) {
      return;
    }

    const hasSelectedDriver = availableDrivers.some((item) => item.id === paymentDriverId);
    if (!paymentDriverId || !hasSelectedDriver) {
      setPaymentDriverId(availableDrivers[0].id);
    }
  }, [availableDrivers, paymentDriverId]);

  useEffect(() => {
    if (!availableDrivers.length) {
      return;
    }

    const hasSelectedDriver = availableDrivers.some((item) => item.id === payoutDriverId);
    if (!payoutDriverId || !hasSelectedDriver) {
      setPayoutDriverId(availableDrivers[0].id);
    }
  }, [availableDrivers, payoutDriverId]);

  useEffect(() => {
    if (!availableDrivers.length) {
      return;
    }

    const hasSelectedDriver = availableDrivers.some((item) => item.id === creditDriverId);
    if (!creditDriverId || !hasSelectedDriver) {
      setCreditDriverId(availableDrivers[0].id);
    }
  }, [availableDrivers, creditDriverId]);

  useEffect(() => {
    if (!availableDrivers.length) {
      return;
    }

    const hasSelectedDriver = availableDrivers.some((item) => item.id === payoffDriverId);
    if (!payoffDriverId || !hasSelectedDriver) {
      setPayoffDriverId(availableDrivers[0].id);
    }
  }, [availableDrivers, payoffDriverId]);

  useEffect(() => {
    if (!activeContracts.length) {
      return;
    }

    const hasSelectedContract = activeContracts.some((item) => item.id === paymentContractId);
    if (!paymentContractId || !hasSelectedContract) {
      setPaymentContractId(activeContracts[0].id);
    }
  }, [activeContracts, paymentContractId]);

  const filteredContracts = useMemo(() => {
    const normalizedQuery = paymentContractQuery.trim().toLowerCase();
    const matched = paymentDriverId
      ? activeContracts.filter((item) => item.driverId === paymentDriverId)
      : activeContracts;
    const driverScoped = matched.length ? matched : activeContracts;

    if (!normalizedQuery) {
      return driverScoped;
    }

    return driverScoped.filter((item) => {
      const driverLabel = driverMap.get(item.driverId) ?? "";
      return `${item.contractNumber} ${driverLabel}`.toLowerCase().includes(normalizedQuery);
    });
  }, [activeContracts, driverMap, paymentContractQuery, paymentDriverId]);

  useEffect(() => {
    if (!filteredContracts.length) {
      return;
    }

    const hasSelectedContract = filteredContracts.some((item) => item.id === paymentContractId);
    if (!paymentContractId || !hasSelectedContract) {
      setPaymentContractId(filteredContracts[0].id);
    }
  }, [filteredContracts, paymentContractId]);

  const filteredPayoffContracts = useMemo(() => {
    if (!payoffDriverId) {
      return availableContracts.filter((item) => item.status === "active");
    }

    const matched = availableContracts.filter((item) => item.driverId === payoffDriverId && item.status === "active");
    return matched.length ? matched : availableContracts.filter((item) => item.status === "active");
  }, [availableContracts, payoffDriverId]);

  const selectedPaymentDriver = availableDrivers.find((item) => item.id === paymentDriverId) ?? null;
  const selectedPaymentContract = filteredContracts.find((item) => item.id === paymentContractId) ?? null;
  const selectedPayoutDriver = availableDrivers.find((item) => item.id === payoutDriverId) ?? null;
  const selectedPayoffContract = filteredPayoffContracts.find((item) => item.id === payoffContractId) ?? null;
  const selectedCreditDriver = availableDrivers.find((item) => item.id === creditDriverId) ?? null;
  const reservedPayoutAmountForSelectedDriver = requestedPayoutAmountByDriverId.get(payoutDriverId) ?? 0;
  const selectedPayoutAvailableBalance = selectedPayoutDriver
    ? Math.max(0, selectedPayoutDriver.yandexBalance - reservedPayoutAmountForSelectedDriver)
    : 0;

  useEffect(() => {
    if (!filteredPayoffContracts.length) {
      return;
    }

    const hasSelectedContract = filteredPayoffContracts.some((item) => item.id === payoffContractId);
    if (!payoffContractId || !hasSelectedContract) {
      setPayoffContractId(filteredPayoffContracts[0].id);
    }
  }, [filteredPayoffContracts, payoffContractId]);

  useEffect(() => {
    if (!selectedPayoffContract) {
      return;
    }

    setPayoffAmount(String(selectedPayoffContract.currentDebt));
  }, [selectedPayoffContract?.id, selectedPayoffContract?.currentDebt]);

  useEffect(() => {
    if (!availableDrivers.length && !availableContracts.length) {
      return;
    }

    const presetKey = searchParams.toString();
    if (lastPresetKeyRef.current === presetKey) {
      return;
    }

    const action = searchParams.get("action");
    const source = searchParams.get("source");
    const driverIdParam = searchParams.get("driverId");
    const contractIdParam = searchParams.get("contractId");
    const amountParam = searchParams.get("amount");
    const reasonParam = searchParams.get("reason");
    const contract = contractIdParam
      ? availableContracts.find((item) => item.id === contractIdParam) ?? null
      : null;
    const resolvedDriverId = driverIdParam ?? contract?.driverId ?? "";

    if (!action) {
      setPresetNotice(null);
      setActiveForm("none");
      setPaymentAmount("15000");
      setPaymentForDate(new Date().toISOString().slice(0, 10));
      setPayoutAmount("5000");
      setPayoffAmount("10000");
      setCreditAmount("1000");
      setCreditReason("Ручная корректировка");
      setPaymentContractQuery("");
      lastPresetKeyRef.current = presetKey;
      return;
    }

    if (action === "payment") {
      if (resolvedDriverId) {
        setPaymentDriverId(resolvedDriverId);
      }
      if (contractIdParam) {
        setPaymentContractId(contractIdParam);
      }
      if (amountParam) {
        setPaymentAmount(amountParam);
      }
      setPaymentForDate(searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
      setPresetNotice(getPresetNotice(action, source));
    } else if (action === "payout") {
      if (resolvedDriverId) {
        setPayoutDriverId(resolvedDriverId);
      }
      if (amountParam) {
        setPayoutAmount(amountParam);
      }
      setPresetNotice(getPresetNotice(action, source));
    } else if (action === "payoff") {
      setActiveForm("payoff");
      if (resolvedDriverId) {
        setPayoffDriverId(resolvedDriverId);
      }
      if (contractIdParam) {
        setPayoffContractId(contractIdParam);
      }
      if (amountParam) {
        setPayoffAmount(amountParam);
      }
      setPresetNotice(getPresetNotice(action, source));
    } else if (action === "credit-writeoff") {
      setActiveForm("credit");
      if (resolvedDriverId) {
        setCreditDriverId(resolvedDriverId);
      }
      if (amountParam) {
        setCreditAmount(amountParam);
      }
      if (reasonParam) {
        setCreditReason(reasonParam);
      }
      setPresetNotice(getPresetNotice(action, source));
    }

    lastPresetKeyRef.current = presetKey;
  }, [availableContracts, availableDrivers, searchParams]);

  async function handleCreatePayment(): Promise<void> {
    if (!paymentDriverId || !paymentContractId || Number(paymentAmount) <= 0 || !paymentProvider.trim()) {
      setPaymentFormMessage("Укажите водителя, договор, провайдера и положительную сумму.");
      paymentAmountInputRef.current?.focus();
      return;
    }
    if (!paymentForDate) {
      setPaymentFormMessage("Укажите день, за который проводится платёж.");
      return;
    }
    setPaymentFormMessage(null);
    await createPayment.mutate({
      driverId: paymentDriverId,
      contractId: paymentContractId,
      amount: Number(paymentAmount),
      provider: paymentProvider.trim(),
      paymentForDate,
    });
    await refreshFinancialState({
      payments: true,
      ledger: true,
      drivers: true,
      contracts: true,
      effectiveDrivers: true,
    });
    setPaymentAmount("15000");
    setPaymentForDate(new Date().toISOString().slice(0, 10));
    setPaymentFormMessage("Платёж создан.");
    paymentAmountInputRef.current?.focus();
  }

  async function handleCreatePayout(): Promise<void> {
    if (!payoutDriverId || Number(payoutAmount) <= 0) {
      setPayoutFormMessage("Укажите водителя и положительную сумму вывода.");
      payoutAmountInputRef.current?.focus();
      return;
    }
    if (selectedPayoutAvailableBalance <= 0) {
      setPayoutFormMessage("У водителя сейчас нет доступного остатка для вывода.");
      payoutAmountInputRef.current?.focus();
      return;
    }
    if (Number(payoutAmount) > selectedPayoutAvailableBalance) {
      setPayoutFormMessage(`Сумма вывода превышает доступный остаток: ${formatCurrency(selectedPayoutAvailableBalance)}.`);
      payoutAmountInputRef.current?.focus();
      return;
    }
    setPayoutFormMessage(null);
    await createPayout.mutate({
      driverId: payoutDriverId,
      amount: Number(payoutAmount),
    });
    await refreshFinancialState({
      payouts: true,
      effectiveDrivers: true,
    });
    setPayoutAmount("5000");
    setPayoutFormMessage("Заявка на вывод создана.");
    payoutAmountInputRef.current?.focus();
  }

  async function handleWriteOffCredit(): Promise<void> {
    if (!creditDriverId || Number(creditAmount) <= 0) {
      setCreditFormMessage("Укажите водителя и положительную сумму списания.");
      creditAmountInputRef.current?.focus();
      return;
    }
    setCreditFormMessage(null);
    await writeOffCredit.mutate({
      driverId: creditDriverId,
      amount: Number(creditAmount),
      reason: creditReason.trim() || undefined,
    });
    await refreshFinancialState({
      ledger: true,
      drivers: true,
      contracts: true,
      effectiveDrivers: true,
    });
    setCreditAmount("1000");
    setCreditFormMessage("Свободный остаток списан.");
    creditAmountInputRef.current?.focus();
  }

  async function handleEarlyPayoff(): Promise<void> {
    if (!payoffDriverId || !payoffContractId || Number(payoffAmount) <= 0 || !payoffProvider.trim()) {
      setPayoffFormMessage("Укажите водителя, активный договор, провайдера и положительную сумму.");
      payoffAmountInputRef.current?.focus();
      return;
    }
    if (!selectedPayoffContract) {
      setPayoffFormMessage("Выберите активный договор для полного закрытия.");
      return;
    }
    if (Number(payoffAmount) !== selectedPayoffContract.currentDebt) {
      setPayoffFormMessage(`Для досрочного закрытия нужен полный остаток: ${formatCurrency(selectedPayoffContract.currentDebt)}.`);
      payoffAmountInputRef.current?.focus();
      return;
    }

    setPayoffFormMessage(null);
    await earlyPayoff.mutate({
      driverId: payoffDriverId,
      contractId: payoffContractId,
      amount: Number(payoffAmount),
      provider: payoffProvider.trim(),
    });
    await refreshFinancialState({
      payments: true,
      ledger: true,
      drivers: true,
      contracts: true,
      effectiveDrivers: true,
    });
    setPayoffAmount("10000");
    setPayoffFormMessage("Досрочное погашение выполнено.");
    payoffAmountInputRef.current?.focus();
  }

  function togglePayoutSelection(payoutId: string): void {
    setSelectedPayoutIds((current) =>
      current.includes(payoutId) ? current.filter((id) => id !== payoutId) : [...current, payoutId],
    );
  }

  function toggleSelectAllPayouts(): void {
    setSelectedPayoutIds(allPayoutsSelected ? [] : requestedPayoutRows.map((item) => item.id));
  }

  async function handlePayoutApprovalAction(action: "approve" | "reject", payoutId: string): Promise<void> {
    setApprovalError(null);
    setIsApprovingId(payoutId);
    try {
      const result = await postJson<PayoutListItem, Record<string, never>>(
        `approvals/payouts/${payoutId}/${action}`,
        {},
      );
      setApprovalMessage(
        action === "approve"
          ? `Выплата одобрена: ${formatShortId(result.id)}`
          : `Выплата отклонена: ${formatShortId(result.id)}`,
      );
      await refreshFinancialState({
        payouts: true,
        ledger: true,
        effectiveDrivers: true,
      });
    } catch (error) {
      setApprovalError(
        error instanceof Error
          ? error.message
          : action === "approve"
            ? "Не удалось согласовать выплату."
            : "Не удалось отклонить выплату.",
      );
    } finally {
      setIsApprovingId(null);
    }
  }

  async function handleBulkPayoutAction(action: "approve" | "reject"): Promise<void> {
    if (!selectedPayoutIds.length) {
      setApprovalError("Выберите хотя бы одну заявку на вывод.");
      return;
    }

    setApprovalError(null);
    setBulkPayoutActionLoading(true);
    let processedCount = 0;
    let processedAmount = 0;

    try {
      for (const payoutId of selectedPayoutIds) {
        const result = await postJson<PayoutListItem, Record<string, never>>(
          `approvals/payouts/${payoutId}/${action}`,
          {},
        );
        processedCount += 1;
        processedAmount += result.amount;
      }

      setSelectedPayoutIds([]);
      setApprovalMessage(
        action === "approve"
          ? `Массово одобрено ${processedCount} выплат на ${formatCurrency(processedAmount)}.`
          : `Массово отклонено ${processedCount} выплат на ${formatCurrency(processedAmount)}.`,
      );
      await refreshFinancialState({
        payouts: true,
        ledger: true,
        effectiveDrivers: true,
      });
    } catch (error) {
      setApprovalError(
        error instanceof Error
          ? error.message
          : action === "approve"
            ? "Не удалось массово согласовать выплаты."
            : "Не удалось массово отклонить выплаты.",
      );
    } finally {
      setBulkPayoutActionLoading(false);
    }
  }

  return (
    <section className="page-stack financial-ops-page">
      <div className="hero-card">
        <p className="eyebrow">Финансовые операции</p>
        <h2>Финансовые операции</h2>
        <p>Свободный остаток, досрочное закрытие и согласование заявок.</p>
        <div className="toolbar">
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="all">Все компании</option>
            {companies.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {canPayOffContractEarly ? (
            <button type="button" onClick={() => setActiveForm((current) => current === "payoff" ? "none" : "payoff")}>
              {activeForm === "payoff" ? "Скрыть погашение" : "Досрочное погашение"}
            </button>
          ) : null}
          {canWriteOffCredit ? (
            <button type="button" onClick={() => setActiveForm((current) => current === "credit" ? "none" : "credit")}>
              {activeForm === "credit" ? "Скрыть списание" : "Списать остаток"}
            </button>
          ) : null}
        </div>
        {presetNotice ? <div className="panel-note">{presetNotice}</div> : null}
            <ReadOnlyNotice message="Новый платёж и вывод убраны из финансовых операций. Используйте профильные разделы платежей и выплат." />
        {canPayOffContractEarly && activeForm === "payoff" ? (
          <div className="quick-form">
            <p className="quick-form__title">Досрочное погашение</p>
            <p className="quick-form__meta">Выберите водителя, активный договор и провайдера. Для закрытия используется полный остаток договора.</p>
            <div className="form-grid">
              <select value={payoffDriverId} onChange={(e) => setPayoffDriverId(e.target.value)} disabled={!availableDrivers.length}>
                {availableDrivers.length ? (
                  availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.fullName}
                    </option>
                  ))
                ) : (
                  <option value="">Нет водителей</option>
                )}
              </select>
              <select value={payoffContractId} onChange={(e) => setPayoffContractId(e.target.value)} disabled={!filteredPayoffContracts.length}>
                {filteredPayoffContracts.length ? (
                  filteredPayoffContracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.contractNumber}
                    </option>
                  ))
                ) : (
                  <option value="">Нет активных договоров</option>
                )}
              </select>
              <input
                ref={payoffAmountInputRef}
                value={payoffAmount}
                onChange={(e) => setPayoffAmount(e.target.value)}
                placeholder="Сумма погашения"
                inputMode="numeric"
              />
              <select value={payoffProvider} onChange={(e) => setPayoffProvider(e.target.value)}>
                <option value="bakai">Bakai</option>
                <option value="cash">Наличные</option>
                <option value="bank">Банк</option>
              </select>
            </div>
            <div className="toolbar">
              <button disabled={earlyPayoff.loading} onClick={() => void handleEarlyPayoff()}>
                {earlyPayoff.loading ? "Сохраняем..." : "Закрыть договор"}
              </button>
              {selectedPayoffContract ? (
                <button type="button" className="inline-action" onClick={() => setPayoffAmount(String(selectedPayoffContract.currentDebt))}>
                  Подставить остаток
                </button>
              ) : null}
            </div>
            {selectedPayoffContract ? (
              <p className="panel-note">
                Остаток по договору: {formatCurrency(selectedPayoffContract.currentDebt)}. Частичное досрочное погашение backend не поддерживает.
              </p>
            ) : null}
          </div>
        ) : !canPayOffContractEarly ? (
          <ReadOnlyNotice message="Досрочное погашение доступно ролям owner, admin и finance." />
        ) : null}
        {canWriteOffCredit && activeForm === "credit" ? (
          <div className="quick-form">
            <p className="quick-form__title">Списание свободного остатка</p>
            <p className="quick-form__meta">Укажите водителя, сумму и причину списания.</p>
            <div className="form-grid">
              <select value={creditDriverId} onChange={(e) => setCreditDriverId(e.target.value)} disabled={!availableDrivers.length}>
                {availableDrivers.length ? (
                  availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.fullName}
                    </option>
                  ))
                ) : (
                  <option value="">Нет водителей</option>
                )}
              </select>
              <input
                ref={creditAmountInputRef}
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Сумма списания остатка"
              />
              <input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Причина списания" />
            </div>
            <div className="toolbar">
              <button disabled={writeOffCredit.loading} onClick={() => void handleWriteOffCredit()}>
                {writeOffCredit.loading ? "Сохраняем..." : "Списать остаток"}
              </button>
              {selectedCreditDriver && selectedCreditDriver.creditBalance > 0 ? (
                <button type="button" className="inline-action" onClick={() => setCreditAmount(String(selectedCreditDriver.creditBalance))}>
                  Списать весь остаток
                </button>
              ) : null}
            </div>
            {selectedCreditDriver ? (
              <p className="panel-note">
                Доступный остаток: {formatCurrency(selectedCreditDriver.creditBalance)}
              </p>
            ) : null}
          </div>
        ) : !canWriteOffCredit ? (
          <ReadOnlyNotice message="Списание свободного остатка доступно ролям owner, admin и finance." />
        ) : null}
        {payoffFormMessage ? <div className="panel-note">{payoffFormMessage}</div> : null}
        {earlyPayoff.error ? <div className="panel-note">Ошибка досрочного погашения: {earlyPayoff.error}</div> : null}
        {earlyPayoff.data ? (
          <div className="panel-note">
            Договор {contractMap.get(earlyPayoff.data.contractId) ?? "закрыт"} ·{" "}
            {driverMap.get(earlyPayoff.data.driverId) ?? "водитель"} ·{" "}
            {formatCurrency(earlyPayoff.data.amount)}
            {earlyPayoff.data.unappliedAmount > 0
              ? ` · ${formatCurrency(earlyPayoff.data.unappliedAmount)} сохранено как свободный остаток`
              : ""}
          </div>
        ) : null}
        {creditFormMessage ? <div className="panel-note">{creditFormMessage}</div> : null}
        {writeOffCredit.error ? <div className="panel-note">Ошибка списания остатка: {writeOffCredit.error}</div> : null}
        {writeOffCredit.data ? (
          <div className="panel-note">
            Свободный остаток списан: {formatCurrency(writeOffCredit.data.amountWrittenOff)} · остаток {formatCurrency(writeOffCredit.data.remainingCreditBalance)}
          </div>
        ) : null}
        {approvalMessage ? <div className="panel-note">{approvalMessage}</div> : null}
        {approvalError ? <div className="panel-note">Ошибка согласования: {approvalError}</div> : null}
      </div>
      <div className="stats-grid">
        <StatCard
          title="Входящие платежи"
          value={formatCurrency(totalIncoming)}
          subtitle={`${paymentRows.length} операций в журнале`}
          tone="green"
          icon={<WalletIcon width={18} height={18} />}
          onClick={() => paymentAmountInputRef.current?.focus()}
        />
        <StatCard
          title="Свободный остаток"
          value={formatCurrency(totalIncomingCredit)}
          subtitle="Свободный остаток после платежей"
          tone="blue"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => creditAmountInputRef.current?.focus()}
        />
        <StatCard
          title="Ждут согласования"
          value={formatCurrency(pendingPayoutAmount)}
          subtitle={`${payoutRows.filter((item) => item.status === "requested").length} заявок на вывод`}
          tone="orange"
          icon={<DriversIcon width={18} height={18} />}
          to="/payouts?status=requested"
        />
        <StatCard
          title="Уже одобрено"
          value={formatCurrency(approvedPayoutAmount)}
          subtitle={`${payoutRows.filter((item) => item.status === "approved").length} заявок переведены дальше`}
          tone="purple"
          icon={<ContractsIcon width={18} height={18} />}
          to="/payouts?status=approved"
        />
        <StatCard
          title="Требуют платежа"
          value={String(activeContracts.filter((item) => item.currentDebt > 0).length)}
          subtitle="Договоры с открытым долгом"
          tone="orange"
          icon={<WalletIcon width={18} height={18} />}
          to="/contracts?status=active"
        />
        <StatCard
          title="Платежи со свободным остатком"
          value={String(paymentRows.filter((item) => item.unappliedAmount > 0).length)}
          subtitle="Есть свободный остаток после платежа"
          tone="blue"
          icon={<FinanceIcon width={18} height={18} />}
          to="/payments"
        />
      </div>
      <div className="table-grid">
        <AsyncState
          loading={payments.loading}
          error={payments.error}
          empty={!payments.data?.length}
          emptyContent={
            <EmptyStatePanel
              title="Платежей пока нет"
              message="Журнал входящих платежей пуст. Новые платежи проводятся через профильный раздел платежей."
            />
          }
        >
          <article className="panel">
            <h3>Платежи</h3>
            <div className="summary-list">
              {paymentRows.map((item) => (
                <div key={item.id}>
                  <span>
                    {driverMap.get(item.driverId) ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        {driverMap.get(item.driverId)}
                      </Link>
                    ) : (
                      "Водитель"
                    )}
                    {" · "}
                    {contractMap.get(item.contractId) ? (
                      <Link className="table-link" to={`/contracts/${item.contractId}`}>
                        {contractMap.get(item.contractId)}
                      </Link>
                    ) : (
                      formatShortId(item.contractId)
                    )}
                  </span>
                  <strong>
                    {formatCurrency(item.amount)} · {getPaymentStatusLabel(item.status)}
                    {item.paymentForDate ? ` · за ${formatDateOnly(item.paymentForDate)}` : " · текущий день"}
                    {item.unappliedAmount > 0 ? ` · остаток ${formatCurrency(item.unappliedAmount)}` : ""}
                  </strong>
                  {item.unappliedAmount > 0 && (driverCreditMap.get(item.driverId) ?? 0) > 0 && canWriteOffCredit ? (
                    <Link
                      className="table-link"
                      to={`/financial-ops?action=credit-writeoff&source=financial-ops&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                    >
                      Списать остаток
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </AsyncState>
        <AsyncState
          loading={payouts.loading}
          error={payouts.error}
          empty={!payouts.data?.length}
          emptyContent={
            <EmptyStatePanel
            title="Заявок на вывод пока нет"
            message="Очередь выплат пуста. Новые заявки на вывод создаются через профильный раздел выплат."
            />
          }
        >
          <article className="panel">
            <h3>Выплаты</h3>
            {!canApprovePayout ? (
              <ReadOnlyNotice message="Для этой роли доступен только просмотр выплат." />
            ) : null}
            {canApprovePayout ? (
              <div className="toolbar">
                <button type="button" onClick={toggleSelectAllPayouts}>
                  {allPayoutsSelected ? "Снять выбор" : "Выбрать все заявки"}
                </button>
                <span className="panel-note">Выбрано: {selectedPayoutCount}</span>
                <button
                  type="button"
                  disabled={bulkPayoutActionLoading || !selectedPayoutCount}
                  onClick={() => void handleBulkPayoutAction("approve")}
                >
                  {bulkPayoutActionLoading ? "Обрабатываем..." : "Массово одобрить"}
                </button>
                <button
                  type="button"
                  disabled={bulkPayoutActionLoading || !selectedPayoutCount}
                  onClick={() => void handleBulkPayoutAction("reject")}
                >
                  {bulkPayoutActionLoading ? "Обрабатываем..." : "Массово отклонить"}
                </button>
              </div>
            ) : null}
            <div className="summary-list">
              {payoutRows.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.status === "requested" && canApprovePayout ? (
                      <input
                        type="checkbox"
                        checked={selectedPayoutIds.includes(item.id)}
                        onChange={() => togglePayoutSelection(item.id)}
                        style={{ marginRight: 8 }}
                      />
                    ) : null}
                    {driverMap.get(item.driverId) ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        {driverMap.get(item.driverId)}
                      </Link>
                    ) : (
                      `Заявка ${formatShortId(item.id)}`
                    )}
                  </span>
                  <strong>{formatCurrency(item.amount)} · {getPayoutStatusLabel(item.status)}</strong>
                    {item.status === "requested" && canApprovePayout ? (
                      <div className="toolbar">
                        <button
                          className="inline-action"
                          disabled={isApprovingId === item.id}
                          onClick={() => void handlePayoutApprovalAction("approve", item.id)}
                        >
                        {isApprovingId === item.id ? "Согласуем..." : "Одобрить"}
                      </button>
                      <button
                        className="inline-action"
                        disabled={isApprovingId === item.id}
                        onClick={() => void handlePayoutApprovalAction("reject", item.id)}
                      >
                        {isApprovingId === item.id ? "Сохраняем..." : "Отклонить"}
                      </button>
                      {canCreatePayout && (availablePayoutAmountByDriverId.get(item.driverId) ?? 0) > 0 ? (
                        <Link
                          className="table-link"
                          to={`/financial-ops?action=payout&source=financial-ops&driverId=${item.driverId}&amount=${availablePayoutAmountByDriverId.get(item.driverId) ?? 0}`}
                        >
                          Подготовить вывод
                        </Link>
                      ) : null}
                    </div>
                  ) : canCreatePayout && (availablePayoutAmountByDriverId.get(item.driverId) ?? 0) > 0 ? (
                    <Link
                      className="table-link"
                      to={`/financial-ops?action=payout&source=financial-ops&driverId=${item.driverId}&amount=${availablePayoutAmountByDriverId.get(item.driverId) ?? 0}`}
                    >
                      Подготовить вывод
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </AsyncState>
        <AsyncState
          loading={payments.loading}
          error={payments.error}
          empty={!creditPaymentRows.length}
          emptyContent={
            <EmptyStatePanel
              title="Платежей со свободным остатком пока нет"
              message="Свободный остаток после платежа появится здесь."
            />
          }
        >
          <article className="panel">
            <h3>Платежи со свободным остатком</h3>
            <div className="summary-list">
              {creditPaymentRows.map((item) => (
                <div key={item.id}>
                  <span>
                    {driverMap.get(item.driverId) ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        {driverMap.get(item.driverId)}
                      </Link>
                    ) : (
                      "Водитель"
                    )}
                    {" · "}
                    {contractMap.get(item.contractId) ? (
                      <Link className="table-link" to={`/contracts/${item.contractId}`}>
                        {contractMap.get(item.contractId)}
                      </Link>
                    ) : (
                      "Договор"
                    )}
                  </span>
                  <strong>
                    {formatCurrency(item.unappliedAmount)} остатка · из платежа {formatCurrency(item.amount)}
                  </strong>
                  <div className="toolbar">
                    <Link className="table-link" to={`/contracts/${item.contractId}`}>
                      Открыть договор
                    </Link>
                    {(driverCreditMap.get(item.driverId) ?? 0) > 0 && canWriteOffCredit ? (
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=credit-writeoff&source=financial-ops&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                      >
                            Списать остаток
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </AsyncState>
        <AsyncState
          loading={ledger.loading}
          error={ledger.error}
          empty={!creditRows.length}
          emptyContent={
            <EmptyStatePanel
              title="Операций по свободному остатку пока нет"
              message="Создание и списание свободного остатка появятся здесь."
            />
          }
        >
          <article className="panel">
            <h3>Свободный остаток и корректировки</h3>
            <div className="summary-list">
              {creditRows.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.driverId ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        {driverMap.get(item.driverId) ?? "Водитель"}
                      </Link>
                    ) : (
                      "Без водителя"
                    )}
                  </span>
                  <strong>
                    {item.type === "adjustment" ? "Создан свободный остаток" : "Списан свободный остаток"} · {formatCurrency(Number(item.money.amount))}
                  </strong>
                  <div className="toolbar">
                    <Link className="table-link" to="/ledger">
                      Открыть движение денежных средств
                    </Link>
                    {item.driverId && item.type === "adjustment" && (driverCreditMap.get(item.driverId) ?? 0) > 0 && canWriteOffCredit ? (
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=credit-writeoff&source=financial-ops&driverId=${item.driverId}&amount=${driverCreditMap.get(item.driverId) ?? 0}&reason=${encodeURIComponent("Ручная корректировка")}`}
                      >
                            Списать остаток
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </AsyncState>
        <AsyncState
          loading={contracts.loading}
          error={contracts.error}
          empty={!overdueContracts.length}
          emptyContent={
            <EmptyStatePanel
              title="Открытого долга нет"
              message="Сейчас нет договоров, которые требуют платежа."
            />
          }
        >
          <article className="panel">
            <h3>Требуют платежа</h3>
            <div className="summary-list">
              {overdueContracts.map((item) => (
                <div key={item.id}>
                  <span>
                    <Link className="table-link" to={`/contracts/${item.id}`}>
                      {item.contractNumber}
                    </Link>
                    {" · "}
                    {driverMap.get(item.driverId) ? (
                      <Link className="table-link" to={`/drivers/${item.driverId}`}>
                        {driverMap.get(item.driverId)}
                      </Link>
                    ) : (
                      "Водитель"
                    )}
                  </span>
                  <strong>{formatCurrency(item.currentDebt)}</strong>
                  <div className="toolbar">
                    {canCreatePayment ? (
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=payment&source=financial-ops&driverId=${item.driverId}&contractId=${item.id}&amount=${item.nextDueAmount ?? item.currentDebt}`}
                      >
                        Подготовить платёж
                      </Link>
                    ) : null}
                    {canPayOffContractEarly ? (
                      <Link
                        className="table-link"
                        to={`/financial-ops?action=payoff&source=financial-ops&driverId=${item.driverId}&contractId=${item.id}&amount=${item.currentDebt}`}
                      >
                        Досрочно закрыть
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </AsyncState>
      </div>
    </section>
  );
}
