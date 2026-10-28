import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AccidentDetails,
  DriverListItem,
  ManagerIncidentItem,
  ServiceRepairDetails,
  ServicePaymentEntry,
  VehicleListItem,
} from "@gopark/contracts";
import {
  normalizeServicePayments,
  recalculateServiceCosts,
  billableServiceExpenses,
  serviceFeeBase,
} from "@gopark/contracts";
import { patchJson, postJson } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../ui/AuthContext";
import { downloadCsvTable, formatCurrency, formatDateOnly } from "../lib/utils";
import { workshopFinance, workshopPayment } from "./service-workshop";
import "./service-workflow.css";
const stages = ["sent_to_service", "in_repair", "completed"];
const labels: Record<string, string> = {
  sent_to_service: "Отправлен на СТО",
  awaiting_repair: "На СТО",
  in_repair: "В ремонте",
  completed: "Завершён",
  written_off: "Списан",
  writeoff_requested: "Запрошено списание",
  accident: "ДТП",
  inspection: "Осмотр",
  impound: "Штрафстоянка",
};
const insurerLabels = { nsk: "НСК", alma: "Альма", gosstrakh: "Госстрах" };
const workshopLabels = {
  body: "Малярный цех",
  main: "Основной цех",
  both: "Основной и малярный цеха",
};
const categoryLabels = {
  repair: "Ремонт",
  accident: "ДТП",
  accident_repair: "ДТП и ремонт",
};
const faultLabels = {
  driver: "Наш водитель виновен",
  other: "Наш водитель не виновен",
  both: "Обоюдная вина",
  unknown: "Виновность не установлена",
};
const faultOf = (i: ManagerIncidentItem) =>
  i.accidentDetails?.fault ?? i.serviceDetails?.accidentFault ?? "unknown";
const categoryLabel = (i: ManagerIncidentItem) =>
  categoryLabels[
    i.serviceDetails?.repairCategory ??
      (i.incidentType === "accident" ? "accident" : "repair")
  ];
const payerLabels = {
  company: "GoPark",
  driver: "Водитель",
  insurance: "Страховая компания",
};
function repairReason(
  item: ManagerIncidentItem,
  fallback = "Причина не указана",
) {
  return (
    [item.serviceDetails?.reason, item.repairNote, item.description]
      .find((value) => value?.trim())
      ?.trim() ?? fallback
  );
}
function paid(item: ManagerIncidentItem) {
  return (item.serviceDetails?.payments ?? []).reduce(
    (sum, p) => sum + p.amount,
    0,
  );
}
function cost(item: ManagerIncidentItem) {
  return item.serviceDetails?.serviceCost ?? 0;
}
function closed(item: ManagerIncidentItem) {
  return ["resolved", "closed", "archived"].includes(item.status);
}
// getRandomValues is available on HTTP as well; randomUUID requires HTTPS.
function paymentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function waitingLate(i: ManagerIncidentItem) {
  const d = i.serviceDetails;
  if (!d?.plannedRepairDate || (!d.repairStartedAt && closed(i))) return false;
  const actual = d.repairStartedAt
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
        new Date(d.repairStartedAt),
      )
    : today();
  return actual > d.plannedRepairDate;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  );
const stamp = (date?: string) =>
  date
    ? new Date(date).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })
    : "Дата не указана";
export function ServicePage() {
  const [revision, setRevision] = useState(0);
  return (
    <div className="sto-departments" aria-label="Цеха СТО">
      {(["main", "body"] as const).map((shop) => (
        <ServiceWorkshopPage
          key={shop}
          shop={shop}
          revision={revision}
          onChanged={() => setRevision((v) => v + 1)}
        />
      ))}
    </div>
  );
}
function ServiceWorkshopPage({
  shop,
  revision,
  onChanged,
}: {
  shop: "main" | "body";
  revision: number;
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const incidents = useApiQuery<ManagerIncidentItem[]>("incidents");
  const cars = useApiQuery<VehicleListItem[]>("cars");
  const drivers = useApiQuery<DriverListItem[]>("drivers");
  const parts = useApiQuery<{
    parts: {
      id: string;
      name: string;
      quantity: number;
      unitPrice: number | null;
      unit: string;
    }[];
  }>("parts?catalogOnly=true");
  const canEdit = ["owner", "admin", "finance", "operator"].includes(
    session.requestUserRole,
  );
  const canSend = canEdit || session.requestUserRole === "manager";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [metricScope, setMetricScope] = useState("all");
  const [faultFilter, setFaultFilter] = useState("all");
  const [periodBasis, setPeriodBasis] = useState("cost");
  const [activeMetric, setActiveMetric] = useState("");
  const [metricVersion, setMetricVersion] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (metricVersion) {
      resultsRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      resultsRef.current?.focus({ preventScroll: true });
    }
  }, [metricVersion]);
  const [company, setCompany] = useState(session.companyName || "all");
  const [caseType, setCaseType] = useState("all");
  const [kind, setKind] = useState("all");
  const [managerFilter, setManagerFilter] = useState("");
  const [carFilter, setCarFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payer, setPayer] = useState("all");
  const detailRef = useRef<HTMLElement>(null);
  const [accidentDraft, setAccidentDraft] = useState<AccidentDetails>({
    location: "",
    occurredAt: "",
    fault: "unknown",
    insurer: "gosstrakh",
    otherPlate: "",
    otherMake: "",
    otherModel: "",
  });
  const [openVersion, setOpenVersion] = useState(0);
  const [selected, setSelected] = useState<ManagerIncidentItem | null>(null);
  useEffect(() => {
    if (selected) {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      detailRef.current?.focus({ preventScroll: true });
    }
  }, [openVersion]);
  const [details, setDetails] = useState<ServiceRepairDetails>({ reason: "" });
  const [payment, setPayment] = useState({
    amount: "",
    paidAt: today(),
    payer: "company" as ServicePaymentEntry["payer"],
  });
  const [message, setMessage] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const paymentAttemptRef = useRef<{ key: string; id: string } | null>(null);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchFault, setDispatchFault] = useState<
    "" | "driver" | "other" | "both" | "unknown"
  >("");
  const [dispatchPayer, setDispatchPayer] = useState<
    "" | "company" | "driver" | "insurance"
  >("");
  const [dispatchInsurer, setDispatchInsurer] = useState<
    "" | "nsk" | "alma" | "gosstrakh"
  >("");
  const [workshop, setWorkshop] = useState<"" | "body" | "main" | "both">(shop);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualPlate, setManualPlate] = useState("");
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [repairCategory, setRepairCategory] = useState<
    "repair" | "accident" | "accident_repair"
  >("repair");
  const [sendCar, setSendCar] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!showDispatch) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setShowDispatch(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showDispatch, busy]);
  const allRecords = (incidents.data ?? [])
    .map((i) => ({
      ...i,
      serviceDetails: i.serviceDetails
        ? normalizeServicePayments(i.serviceDetails)
        : i.serviceDetails,
    }))
    .filter(
      (i) =>
        i.incidentType === "repair" ||
        i.serviceStage === "awaiting_repair" ||
        stages.includes(i.serviceStage ?? ""),
    );
  const records = allRecords.filter(
    (i) =>
      i.serviceDetails?.workshop === shop ||
      i.serviceDetails?.workshop === "both",
  );
  const lane = (i: ManagerIncidentItem) =>
    workshopFinance(i.serviceDetails, shop);
  const laneCost = (i: ManagerIncidentItem) => lane(i).cost;
  const lanePaid = (i: ManagerIncidentItem) => lane(i).paid;
  const laneProfit = (i: ManagerIncidentItem) => lane(i).profit;
  useEffect(() => {
    if (!revision) return;
    void Promise.allSettled([
      incidents.refetch({ silent: true }),
      cars.refetch({ silent: true }),
      drivers.refetch({ silent: true }),
      parts.refetch({ silent: true }),
    ]);
  }, [
    revision,
    incidents.refetch,
    cars.refetch,
    drivers.refetch,
    parts.refetch,
  ]);
  const carById = new Map((cars.data ?? []).map((c) => [c.id, c]));
  const driverById = new Map((drivers.data ?? []).map((d) => [d.id, d]));
  const vehicleLabel = (i: ManagerIncidentItem) =>
    i.carId
      ? (carById.get(i.carId)?.plateNumber ?? i.title)
      : (i.serviceDetails?.manualVehicle?.plateNumber ?? i.title);
  const vehicleKey = (i: ManagerIncidentItem) => i.carId ?? `manual:${i.id}`;
  const recordCompany = (i: ManagerIncidentItem) =>
    (i.carId ? carById.get(i.carId)?.companyName : null) ??
    driverById.get(i.driverId ?? "")?.companyName ??
    i.serviceDetails?.manualVehicle?.companyName;
  const matchesKind = (i: ManagerIncidentItem) => {
    if (kind === "all") return true;
    if (kind === "accident_all") return i.incidentType === "accident";
    if (kind === "accident_repair")
      return i.serviceDetails?.repairCategory === "accident_repair";
    if (kind === "accident")
      return (
        i.incidentType === "accident" &&
        i.serviceDetails?.repairCategory !== "accident_repair"
      );
    return i.incidentType !== "accident";
  };
  const periodRecords = records.filter((i) => {
    const day = (
      periodBasis === "incident"
        ? (i.accidentDetails?.occurredAt ?? i.occurredAt ?? "")
        : (i.serviceDetails?.costDate ?? i.occurredAt ?? "")
    ).slice(0, 10);
    const companyName =
      (i.carId ? carById.get(i.carId)?.companyName : null) ??
      (i.driverId ? driverById.get(i.driverId)?.companyName : null) ??
      i.serviceDetails?.manualVehicle?.companyName;
    return (
      (company === "all" || companyName === company) &&
      (!carFilter || vehicleKey(i) === carFilter) &&
      (caseType === "all" || i.serviceCaseType === caseType) &&
      matchesKind(i) &&
      (!managerFilter ||
        (i.managerLabel ??
          (i.carId ? carById.get(i.carId)?.managerName : null)) ===
          managerFilter) &&
      (!from || day >= from) &&
      (!to || (!!day && day <= to)) &&
      (payer === "all" ||
        (i.serviceDetails?.payments ?? []).some((p) => p.payer === payer) ||
        i.serviceDetails?.expectedPayer === payer)
    );
  });
  const matchesPayment = (i: ManagerIncidentItem) =>
    paymentFilter === "all" ||
    (paymentFilter === "with_payments" && lanePaid(i) > 0) ||
    (paymentFilter === "unpaid" && laneCost(i) > lanePaid(i)) ||
    (paymentFilter === "paid" && lane(i).known && lanePaid(i) >= laneCost(i)) ||
    (paymentFilter === "partial" &&
      lanePaid(i) > 0 &&
      lanePaid(i) < laneCost(i));
  const matchesMetric = (i: ManagerIncidentItem) =>
    (metricScope === "all" ||
      (metricScope === "cost" && lane(i).known) ||
      (metricScope === "profit" && lane(i).base > 0) ||
      (metricScope === "painting" &&
        (i.serviceDetails?.paintingCost ?? 0) > 0) ||
      (metricScope === "repair" && (i.serviceDetails?.repairCost ?? 0) > 0) ||
      (metricScope === "unallocated" &&
        serviceFeeBase(i.serviceDetails) > 0 &&
        i.serviceDetails?.paintingCost === undefined &&
        i.serviceDetails?.repairCost === undefined)) &&
    (faultFilter === "all" ||
      (faultFilter === "guilty" && ["driver", "both"].includes(faultOf(i))) ||
      (faultFilter === "innocent" && faultOf(i) === "other") ||
      (faultFilter === "unknown" && faultOf(i) === "unknown"));
  const rows = periodRecords.filter(
    (i) =>
      matchesPayment(i) &&
      matchesMetric(i) &&
      (filter === "all" ||
        (filter === "active" && !closed(i)) ||
        (filter === "archived" && closed(i)) ||
        (filter === "overdue_start" && waitingLate(i)) ||
        (filter === "sent_to_service" &&
          i.serviceStage === "awaiting_repair") ||
        i.serviceStage === filter) &&
      [
        vehicleLabel(i),
        i.title,
        i.description,
        i.serviceDetails?.reason,
        i.driverId ? driverById.get(i.driverId)?.fullName : "",
        i.managerLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const untracked = (shop === "main" ? (cars.data ?? []) : []).filter(
    (c) =>
      paymentFilter === "all" &&
      (company === "all" || c.companyName === company) &&
      (!carFilter || c.id === carFilter) &&
      caseType === "all" &&
      kind !== "accident" &&
      kind !== "accident_all" &&
      kind !== "accident_repair" &&
      payer === "all" &&
      (!managerFilter || c.managerName === managerFilter) &&
      c.status === "maintenance" &&
      !allRecords.some((i) => i.carId === c.id && !closed(i)) &&
      ["active", "all", "in_repair"].includes(filter) &&
      [c.plateNumber, c.make, c.model]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sums = useMemo(
    () =>
      periodRecords.reduce(
        (s, i) => ({
          cost: s.cost + laneCost(i),
          paid: s.paid + lanePaid(i),
          painting: s.painting + (shop === "body" ? lane(i).base : 0),
          repair: s.repair + (shop === "main" ? lane(i).base : 0),
          unallocated: s.unallocated,
        }),
        { cost: 0, paid: 0, painting: 0, repair: 0, unallocated: 0 },
      ),
    [periodRecords],
  );
  const receipts = records
    .filter((i) => {
      const name =
        (i.carId ? carById.get(i.carId)?.companyName : null) ??
        (i.driverId ? driverById.get(i.driverId)?.companyName : null) ??
        i.serviceDetails?.manualVehicle?.companyName;
      return (
        (company === "all" || name === company) &&
        (!carFilter || vehicleKey(i) === carFilter) &&
        (caseType === "all" || i.serviceCaseType === caseType) &&
        matchesKind(i) &&
        (!managerFilter ||
          (i.managerLabel ?? carById.get(i.carId ?? "")?.managerName) ===
            managerFilter)
      );
    })
    .flatMap((i) =>
      (i.serviceDetails?.payments ?? []).map((p) => ({
        ...p,
        amount: workshopPayment(i.serviceDetails, shop, p.amount),
      })),
    )
    .filter(
      (p) =>
        (payer === "all" || p.payer === payer) &&
        (!from || p.paidAt.slice(0, 10) >= from) &&
        (!to || p.paidAt.slice(0, 10) <= to),
    )
    .reduce((sum, p) => sum + p.amount, 0);
  async function refresh() {
    await Promise.all([incidents.refetch(), cars.refetch(), drivers.refetch()]);
    onChanged();
  }
  function open(i: ManagerIncidentItem) {
    setSelected(i);
    paymentAttemptRef.current = null;
    setOpenVersion((v) => v + 1);
    setAccidentDraft(
      i.accidentDetails ?? {
        location: "",
        occurredAt: i.occurredAt ?? "",
        fault: i.serviceDetails?.accidentFault ?? "unknown",
        insurer: "gosstrakh",
        otherPlate: "",
        otherMake: "",
        otherModel: "",
      },
    );
    setPayment({
      amount: "",
      paidAt: today(),
      payer:
        i.serviceDetails?.expectedPayer ??
        (i.serviceDetails?.insurance?.paid ? "insurance" : "company"),
    });
    setDetails({ ...i.serviceDetails, reason: repairReason(i, "") });
    setMessage("");
  }
  async function save(stage?: string, draft = details, includeAccident = true) {
    if (!selected || busy || savingRef.current) return false;
    if (
      draft.orderItems?.some(incompletePrice) ||
      draft.expenses?.some(
        (e) => !e.description.trim() || e.amount === undefined,
      )
    ) {
      setMessage("Заполните наименование и все суммы работ и расходов");
      return false;
    }
    savingRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const next = await patchJson<ManagerIncidentItem, unknown>(
        `incidents/${selected.id}`,
        {
          serviceDetails:
            selected.incidentType === "accident"
              ? { ...draft, accidentFault: accidentDraft.fault }
              : draft,
          ...(includeAccident &&
          selected.incidentType === "accident" &&
          (selected.accidentDetails ||
            [
              accidentDraft.location,
              accidentDraft.occurredAt,
              accidentDraft.otherPlate,
              accidentDraft.otherMake,
              accidentDraft.otherModel,
            ].every((v) => v?.trim()))
            ? { accidentDetails: accidentDraft }
            : {}),
          ...(stage
            ? {
                serviceStage: stage,
                status: stage === "completed" ? "closed" : "open",
              }
            : {}),
          repairNote: draft.reason,
        },
      );
      onChanged();
      setSelected(next);
      setDetails(next.serviceDetails ?? draft);
      await Promise.allSettled([
        incidents.refetch({ silent: true }),
        cars.refetch({ silent: true }),
        drivers.refetch({ silent: true }),
        parts.refetch({ silent: true }),
      ]);
      setMessage(
        stage === "completed"
          ? "Ремонт завершён. Бригадир получит уведомление."
          : "Данные сохранены. Бригадир получит уведомление.",
      );
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось сохранить ремонт",
      );
      return false;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }
  async function send() {
    if ((!sendCar && !manualEntry) || !reason.trim() || busy) return;
    if (!workshop) {
      setMessage("Выберите цех");
      return;
    }
    if (
      repairCategory !== "repair" &&
      (!dispatchFault ||
        !dispatchPayer ||
        (dispatchPayer === "insurance" && !dispatchInsurer))
    ) {
      setMessage(
        "Для ДТП укажите виновность, плательщика и страховую компанию при страховой оплате",
      );
      return;
    }
    const accidentChoices =
      repairCategory === "repair"
        ? {}
        : {
            accidentFault: dispatchFault,
            expectedPayer: dispatchPayer,
            ...(dispatchPayer === "insurance"
              ? { insurance: { insurer: dispatchInsurer, paid: false } }
              : {}),
          };
    setBusy(true);
    setMessage("");
    try {
      let car = carById.get(sendCar);
      if (manualEntry) {
        if (![manualPlate, manualMake, manualModel].every((v) => v.trim()))
          throw new Error("Укажите госномер, марку и модель");
        const plate = manualPlate.replace(/\s+/g, "").toUpperCase();
        car = (cars.data ?? []).find(
          (c) => c.plateNumber.replace(/\s+/g, "").toUpperCase() === plate,
        );
        if (!car) {
          const result = await postJson<ManagerIncidentItem, unknown>(
            "incidents",
            {
              title: `${categoryLabels[repairCategory]}: ${plate}`,
              incidentType: repairCategory === "repair" ? "repair" : "accident",
              status: "open",
              priority: "high",
              serviceStage: "sent_to_service",
              description: reason.trim(),
              repairNote: reason.trim(),
              serviceDetails: {
                reason: reason.trim(),
                repairCategory,
                workshop,
                ...accidentChoices,
                manualVehicle: {
                  plateNumber: plate,
                  make: manualMake.trim(),
                  model: manualModel.trim(),
                },
              },
            },
          );
          setShowDispatch(false);
          setReason("");
          await refresh();
          open(result);
          return;
        }
      }
      if (!car) throw new Error("Выберите автомобиль");
      const existing = allRecords.find((i) => i.carId === car.id && !closed(i));
      if (existing)
        throw new Error(
          "У машины уже есть открытый ремонт. Откройте его карточку.",
        );
      const legacy = car.status === "maintenance";
      const accident = (incidents.data ?? []).find(
        (i) =>
          i.carId === car.id && i.incidentType === "accident" && !closed(i),
      );
      const result = accident
        ? await patchJson<ManagerIncidentItem, unknown>(
            `incidents/${accident.id}`,
            {
              serviceStage: "sent_to_service",
              serviceDetails: {
                reason: reason.trim(),
                repairCategory:
                  repairCategory === "repair" ? "accident" : repairCategory,
                workshop,
                ...accidentChoices,
              },
              repairNote: reason.trim(),
            },
          )
        : await postJson<ManagerIncidentItem, unknown>("incidents", {
            title: `Ремонт: ${car.plateNumber}`,
            incidentType: repairCategory === "repair" ? "repair" : "accident",
            status: "open",
            priority: "high",
            carId: car.id,
            driverId: car.assignedDriverId ?? null,
            description: reason.trim(),
            repairNote: reason.trim(),
            serviceStage: legacy ? "in_repair" : "sent_to_service",
            serviceDetails: {
              reason: reason.trim(),
              repairCategory,
              workshop,
              ...accidentChoices,
            },
            occurredAt:
              legacy || repairCategory !== "repair"
                ? null
                : new Date().toISOString(),
            managerLabel: car.managerName ?? null,
          });
      setSendCar("");
      setReason("");
      setShowDispatch(false);
      await refresh();
      open(result);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось отправить машину",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addPayment() {
    if (busy || savingRef.current || !selected) return;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Укажите сумму оплаты больше нуля");
      return;
    }
    if (payment.payer === "insurance" && !details.insurance?.insurer) {
      setMessage("Выберите страховую и укажите дату оплаты");
      return;
    }
    if (
      details.serviceCost === undefined ||
      amount + paid({ ...selected, serviceDetails: details }) >
        details.serviceCost + 0.001
    ) {
      setMessage(
        "Укажите стоимость услуг. Сумма оплат не должна превышать её.",
      );
      return;
    }
    const attemptKey = JSON.stringify([
      selected.id,
      payment,
      details.insurance?.insurer,
    ]);
    if (paymentAttemptRef.current?.key !== attemptKey)
      paymentAttemptRef.current = { key: attemptKey, id: paymentId() };
    const draft: ServiceRepairDetails = {
      ...details,
      payments: [
        ...(details.payments ?? []),
        {
          id: paymentAttemptRef.current.id,
          amount,
          paidAt: payment.paidAt,
          payer: payment.payer,
          ...(payment.payer === "insurance"
            ? { insurer: details.insurance!.insurer }
            : {}),
        },
      ],
    };
    if (await save(undefined, draft, false)) {
      paymentAttemptRef.current = null;
      setPayment({ ...payment, amount: "" });
      setMessage("Оплата сохранена. Оплаченная сумма и остаток обновлены.");
    }
  }
  function setOrderItems(
    items: NonNullable<ServiceRepairDetails["orderItems"]>,
  ) {
    setDetails(
      recalculateServiceCosts({
        ...details,
        orderItems: items,
        costDate: details.costDate ?? today(),
      }),
    );
  }
  function addOrderItem() {
    const previous =
      details.orderItems ??
      (details.works ?? [])
        .filter((w) => w.trim())
        .map((description) => ({
          id: paymentId(),
          description,
          category:
            details.workshop === "body"
              ? ("painting" as const)
              : ("repair" as const),
          amount: undefined,
          serviceAmount: undefined,
          laborAmount: undefined,
        }));
    setOrderItems([
      ...previous,
      {
        id: paymentId(),
        description: "",
        category: details.workshop === "body" ? "painting" : "repair",
        serviceAmount: undefined,
        laborAmount: undefined,
      },
    ]);
  }
  function setExpenses(
    expenses: NonNullable<ServiceRepairDetails["expenses"]>,
  ) {
    setDetails(
      recalculateServiceCosts({
        ...details,
        expenses,
        serviceBaseCost:
          details.serviceBaseCost ??
          Math.max(
            0,
            (details.serviceCost ?? 0) - billableServiceExpenses(details),
          ),
        costDate: details.costDate ?? today(),
      }),
    );
  }
  const incompletePrice = (
    w: NonNullable<ServiceRepairDetails["orderItems"]>[number],
  ) =>
    !w.description.trim() ||
    (w.serviceAmount !== undefined || w.laborAmount !== undefined
      ? w.serviceAmount === undefined || w.laborAmount === undefined
      : w.amount === undefined);
  async function confirmFullPayment() {
    if (!selected || busy || savingRef.current) return;
    const remaining =
      Math.round(
        ((details.serviceCost ?? 0) -
          paid({ ...selected, serviceDetails: details })) *
          100,
      ) / 100;
    if (details.serviceCost === undefined || remaining <= 0) {
      setMessage(
        "Укажите стоимость услуг. Уже сохранённые оплаты учитываются автоматически.",
      );
      return;
    }
    if (!payment.paidAt) {
      setMessage("Укажите дату оплаты");
      return;
    }
    if (payment.payer === "insurance" && !details.insurance?.insurer) {
      setMessage("Выберите страховую компанию");
      return;
    }
    const key = JSON.stringify([
      selected.id,
      payment.payer,
      payment.paidAt,
      remaining,
      details.insurance?.insurer,
    ]);
    if (paymentAttemptRef.current?.key !== key)
      paymentAttemptRef.current = { key, id: paymentId() };
    const draft: ServiceRepairDetails = {
      ...details,
      payments: [
        ...(details.payments ?? []),
        {
          id: paymentAttemptRef.current.id,
          amount: remaining,
          paidAt: payment.paidAt,
          payer: payment.payer,
          ...(payment.payer === "insurance"
            ? { insurer: details.insurance!.insurer }
            : {}),
        },
      ],
    };
    if (payment.payer === "insurance")
      draft.insurance = {
        insurer: details.insurance!.insurer,
        paid: true,
        paidAt: payment.paidAt,
        confirmedAmount: draft
          .payments!.filter((p) => p.payer === "insurance")
          .reduce((sum, p) => sum + p.amount, 0),
      };
    if (await save(undefined, draft, false)) {
      paymentAttemptRef.current = null;
      setPayment({ ...payment, amount: "" });
      setMessage("Полная оплата сохранена. Дашборд и остаток обновлены.");
    }
  }
  async function loadPhoto(
    file: File | undefined,
    key: "beforePhoto" | "afterPhoto",
  ) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 1024 * 1024
    ) {
      setMessage("Выберите JPEG, PNG или WebP до 1 МБ");
      return;
    }
    try {
      const photo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setDetails((current) => ({ ...current, [key]: photo }));
    } catch {
      setMessage("Не удалось прочитать фотографию");
    }
  }
  const accidents = records.filter(
    (i) =>
      i.incidentType === "accident" &&
      (company === "all" ||
        (i.carId
          ? carById.get(i.carId)?.companyName
          : driverById.get(i.driverId ?? "")?.companyName) === company) &&
      (!from ||
        (i.accidentDetails?.occurredAt ?? i.occurredAt ?? "").slice(0, 10) >=
          from) &&
      (!to ||
        (!!(i.accidentDetails?.occurredAt ?? i.occurredAt) &&
          (i.accidentDetails?.occurredAt ?? i.occurredAt ?? "").slice(0, 10) <=
            to)),
  );
  const guilty = accidents.filter((i) =>
    ["driver", "both"].includes(faultOf(i)),
  ).length;
  const innocent = accidents.filter((i) => faultOf(i) === "other").length;
  const knownFault = guilty + innocent;
  const percent = (n: number) =>
    knownFault ? `${((n / knownFault) * 100).toFixed(1)}%` : "—";
  async function exportExcel() {
    if (from && to && from > to) {
      setMessage("Дата «с» должна быть не позже даты «по»");
      return;
    }
    try {
      const x = await import("xlsx");
      const book = x.utils.book_new();
      const cases = [
        [
          "Автомобиль",
          "Водитель",
          "Бригадир",
          "Тип",
          "Этап",
          "Причина",
          "Стоимость услуг",
          "Оплачено по цеху",
          "К оплате",
          "Оплата",
          "Плательщики",
          "Дата стоимости",
          "План начала ремонта",
          "Начало фактически",
          "Нарушен срок",
          "Малярные работы",
          "Прибыль малярных работ",
          "Ремонт",
          "Прибыль ремонта",
          "Стоимость без разбивки",
          "Цех",
          "Номер заказ-наряда",
        ],
        ...rows.map((i) => [
          vehicleLabel(i),
          driverById.get(i.driverId ?? "")?.fullName ?? "",
          i.managerLabel ?? "",
          categoryLabel(i),
          labels[i.serviceStage ?? ""] ?? i.status,
          i.serviceDetails?.reason ?? "",
          lane(i).known ? laneCost(i) : "",
          lanePaid(i),
          !lane(i).known
            ? "Сумма по цеху не распределена"
            : Math.max(0, laneCost(i) - lanePaid(i)),
          !lanePaid(i)
            ? "Не оплачено"
            : lanePaid(i) >= laneCost(i)
              ? "Оплачено"
              : "Частично",
          (i.serviceDetails?.payments ?? [])
            .map(
              (p) =>
                payerLabels[p.payer] +
                (p.insurer ? ` · ${insurerLabels[p.insurer]}` : ""),
            )
            .join("; "),
          i.serviceDetails?.costDate ?? "",
          i.serviceDetails?.plannedRepairDate ?? "",
          i.serviceDetails?.repairStartedAt ?? "",
          waitingLate(i) ? "Да" : "Нет",
          shop === "body" ? lane(i).base : 0,
          shop === "body" ? laneProfit(i) : 0,
          shop === "main" ? lane(i).base : 0,
          shop === "main" ? laneProfit(i) : 0,
          lane(i).known ? 0 : "Не распределена",
          i.serviceDetails?.workshop
            ? workshopLabels[i.serviceDetails.workshop]
            : "Не указан",
          i.serviceDetails?.orderNumber ?? "",
        ]),
      ];
      const cash: Array<Array<string | number>> = [
        [
          "Автомобиль",
          "Водитель",
          "Бригадир",
          "Плательщик",
          "Страховая",
          "Дата оплаты",
          "Сумма",
          "Номер оплаты",
        ],
      ];
      for (const i of records) {
        const name =
          (i.carId ? carById.get(i.carId)?.companyName : null) ??
          driverById.get(i.driverId ?? "")?.companyName ??
          i.serviceDetails?.manualVehicle?.companyName;
        if (
          (company !== "all" && company !== name) ||
          (carFilter && vehicleKey(i) !== carFilter) ||
          (managerFilter &&
            (i.managerLabel ?? carById.get(i.carId ?? "")?.managerName) !==
              managerFilter) ||
          !matchesKind(i) ||
          (caseType !== "all" && i.serviceCaseType !== caseType)
        )
          continue;
        for (const p of i.serviceDetails?.payments ?? [])
          if (
            (!from || p.paidAt.slice(0, 10) >= from) &&
            (!to || p.paidAt.slice(0, 10) <= to) &&
            (payer === "all" || p.payer === payer)
          )
            cash.push([
              vehicleLabel(i),
              driverById.get(i.driverId ?? "")?.fullName ?? "",
              i.managerLabel ?? "",
              payerLabels[p.payer],
              p.insurer ? insurerLabels[p.insurer] : "",
              p.paidAt,
              workshopPayment(i.serviceDetails, shop, p.amount),
              p.id,
            ]);
      }
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet(cases),
        "Ремонты и задолженность",
      );
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet(cash),
        "Поступления за период",
      );
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet([
          ["Цех", workshopLabels[shop]],
          [
            "Распределение",
            "Общие оплаты и расходы двух цехов распределены пропорционально стоимости услуг и работ. Без разбивки суммы не распределяются.",
          ],
          ["Период с", from || "Все даты"],
          ["Период по", to || "Все даты"],
          [
            "Прибыль малярных работ 30%",
            rows.reduce(
              (sum, i) => sum + (shop === "body" ? laneProfit(i) : 0),
              0,
            ),
          ],
          [
            "Прибыль ремонта 30%",
            rows.reduce(
              (sum, i) => sum + (shop === "main" ? laneProfit(i) : 0),
              0,
            ),
          ],
          [
            "Прибыль без разбивки",
            rows.reduce(
              (sum, i) =>
                sum +
                (i.serviceDetails?.paintingCost === undefined &&
                i.serviceDetails?.repairCost === undefined
                  ? laneProfit(i)
                  : 0),
              0,
            ),
          ],
          ["Стоимость услуг", rows.reduce((sum, i) => sum + laneCost(i), 0)],
          [
            "Оплачено по ремонтам",
            rows.reduce((sum, i) => sum + lanePaid(i), 0),
          ],
          [
            "К оплате",
            rows.reduce(
              (sum, i) => sum + Math.max(0, laneCost(i) - lanePaid(i)),
              0,
            ),
          ],
          ["Прибыль СТО 30%", rows.reduce((sum, i) => sum + laneProfit(i), 0)],
          [
            "Пояснение",
            "Ремонты отобраны по дате стоимости; поступления — по дате оплаты. Пустая стоимость не равна нулевому обязательству.",
          ],
        ]),
        "Итоги",
      );
      const workRows: Array<Array<string | number>> = [
        [
          "Заказ-наряд",
          "Автомобиль",
          "Цех",
          "Работа",
          "Направление",
          "Стоимость услуги",
          "Стоимость работы",
          "Итого",
          "Прибыль 30%",
        ],
      ];
      for (const i of rows) {
        const shop = i.serviceDetails?.workshop
          ? workshopLabels[i.serviceDetails.workshop]
          : "Не указан";
        if (i.serviceDetails?.orderItems)
          for (const w of i.serviceDetails.orderItems.filter(
            (w) =>
              i.serviceDetails?.workshop !== "both" ||
              w.category === (shop === "body" ? "painting" : "repair"),
          ))
            workRows.push([
              i.serviceDetails.orderNumber ?? "",
              vehicleLabel(i),
              shop,
              w.description,
              w.category === "painting" ? "Малярные работы" : "Ремонт",
              w.serviceAmount ?? "",
              w.laborAmount ?? "",
              w.amount ?? "",
              w.amount == null ? "" : w.amount * 0.3,
            ]);
        else
          for (const w of i.serviceDetails?.works ?? [])
            workRows.push([
              i.serviceDetails?.orderNumber ?? "",
              vehicleLabel(i),
              shop,
              w,
              "Направление не указано",
              "",
              "",
              "",
              "",
            ]);
      }
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet(workRows),
        "Работы заказ-нарядов",
      );
      const expenseRows: Array<Array<string | number>> = [
        [
          "Заказ-наряд",
          "Автомобиль",
          "Расход",
          "Стоимость",
          "Кто приобрёл",
          "Включён в счёт",
          "Склад",
        ],
      ];
      for (const i of rows)
        for (const e of i.serviceDetails?.expenses ?? [])
          expenseRows.push([
            i.serviceDetails?.orderNumber ?? "",
            vehicleLabel(i),
            e.description,
            e.amount ?? "",
            e.purchaser === "sto"
              ? "СТО"
              : e.purchaser === "company"
                ? "GoPark"
                : "Водитель",
            e.purchaser === "sto" ? "Да" : "Нет",
            e.inventoryMode === "purchase"
              ? "Приход и списание"
              : e.inventoryMode === "stock"
                ? "Списание"
                : "Нет",
          ]);
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet(expenseRows),
        "Расходы",
      );
      x.writeFile(
        book,
        `gopark-sto-${shop}-${from || "all"}-${to || "all"}.xlsx`,
      );
    } catch {
      setMessage("Не удалось подготовить Excel. Повторите выгрузку.");
    }
  }
  const incompleteOrder =
    (details.orderItems?.some(incompletePrice) ?? false) ||
    (details.expenses?.some(
      (e) => !e.description.trim() || e.amount === undefined,
    ) ??
      false);
  function activateMetric(label: string, group: string) {
    setActiveMetric(label);
    setSearch("");
    setFilter("all");
    setPaymentFilter("all");
    setFaultFilter("all");
    setMetricScope("all");
    if (group === "accident") {
      setKind("accident_all");
      setPeriodBasis("incident");
      setCarFilter("");
      setManagerFilter("");
      setCaseType("all");
      setPayer("all");
      if (label.includes("не виновен")) setFaultFilter("innocent");
      else if (label.includes("Водитель виновен")) setFaultFilter("guilty");
      else if (label.includes("не установлена")) setFaultFilter("unknown");
      if (label === "Стоимость ДТП") setMetricScope("cost");
    } else {
      setPeriodBasis("cost");
      setKind("all");
      if (group === "profit")
        setMetricScope(
          label.startsWith("Малярные")
            ? "painting"
            : label.startsWith("Ремонт")
              ? "repair"
              : "unallocated",
        );
      else if (label === "Не оплачено") setPaymentFilter("unpaid");
      else if (label === "Оплачено") setPaymentFilter("with_payments");
      else if (label === "Стоимость услуг") setMetricScope("cost");
      else if (label.startsWith("Прибыль СТО")) setMetricScope("profit");
      else {
        setFilter("active");
        setCarFilter("");
        setManagerFilter("");
        setCaseType("all");
        setKind("all");
        setPayer("all");
        setFrom("");
        setTo("");
      }
    }
    setMetricVersion((v) => v + 1);
  }
  const renderMetric = (
    label: string,
    value: string | number,
    group: string,
  ) => (
    <button
      type="button"
      className={`sto-stat sto-stat--filter ${activeMetric === label ? "sto-stat--selected" : ""}`}
      key={label}
      aria-pressed={activeMetric === label}
      onClick={() => activateMetric(label, group)}
    >
      <span>{label}</span>
      <strong>
        {typeof value === "number" ? formatCurrency(value) : value}
      </strong>
    </button>
  );
  const renderRepairCard = (i: ManagerIncidentItem) => (
    <article className="sto-card" key={i.id}>
      <div className="sto-card-heading">
        <h3>
          {vehicleLabel(i)}{" "}
          <small
            className={
              i.incidentType === "accident"
                ? "sto-kind sto-kind--accident"
                : "sto-kind"
            }
          >
            {categoryLabel(i)}
          </small>
        </h3>
        <span className={`sto-badge ${closed(i) ? "sto-badge--done" : ""}`}>
          {labels[i.serviceStage ?? ""] ?? i.status}
        </span>
      </div>
      <p className="muted">
        {i.driverId
          ? (driverById.get(i.driverId)?.fullName ?? "Водитель не указан")
          : "Без водителя"}{" "}
        · {i.managerLabel ?? "Бригадир не указан"}
      </p>
      <div className="sto-reason" title={repairReason(i)}>
        <strong>Причина: </strong>
        {repairReason(i)}
      </div>
      {waitingLate(i) && (
        <span className="sto-late">
          {i.serviceDetails?.repairStartedAt
            ? "Начат с опозданием"
            : "Начало ремонта просрочено"}
        </span>
      )}
      <button className="button button--secondary" onClick={() => open(i)}>
        Открыть карточку
      </button>
    </article>
  );
  const error = incidents.error || cars.error || drivers.error;
  return (
    <section
      className={`page-stack service-page sto-department sto-department--${shop}`}
      aria-label={workshopLabels[shop]}
    >
      {photoPreview && (
        <button
          type="button"
          className="photo-lightbox"
          aria-label="Закрыть фото"
          onClick={() => setPhotoPreview(null)}
        >
          <img src={photoPreview} alt="Фото ремонта" />
        </button>
      )}
      {!selected && (
        <>
          <div className="hero-card hero-card--dashboard">
            <div className="hero-card__main">
              <p className="eyebrow">Ремонт и услуги</p>
              <h2>{workshopLabels[shop]}</h2>
              <p>
                Показатели, автомобили и заказ-наряды цеха.
              </p>
            </div>
            <div className="hero-card__actions">
              {canSend && (
                <button
                  className="button"
                  onClick={() => {
                    setSelected(null);
                    setSendCar("");
                    setReason("");
                    setManualEntry(false);
                    setRepairCategory("repair");
                    setDispatchFault("");
                    setDispatchPayer("");
                    setDispatchInsurer("");
                    setWorkshop(shop);
                    setManualPlate("");
                    setManualMake("");
                    setManualModel("");
                    setShowDispatch(true);
                  }}
                >
                  Добавить на СТО
                </button>
              )}
              <button
                className="button button--secondary"
                onClick={() => void exportExcel()}
              >
                Скачать Excel
              </button>
              <Link className="button button--secondary" to="/incidents">
                Инциденты
              </Link>
              <button
                className="button button--secondary"
                onClick={() =>
                  downloadCsvTable(
                    `gopark-service-${shop}.csv`,
                    [
                      "Автомобиль",
                      "Статус",
                      "Причина",
                      "Отправлен",
                      "Прибыл",
                      "Начало ремонта",
                      "Завершён",
                      "Заказ-наряд",
                      "Работы",
                      "Стоимость услуг",
                      "Дата стоимости",
                      "Оплачено",
                      "Остаток",
                      "Прибыль СТО",
                      "Оплаты с датами и плательщиками",
                    ],
                    rows.map((i) => [
                      vehicleLabel(i),
                      labels[i.serviceStage ?? ""] ?? i.status,
                      i.serviceDetails?.reason ?? i.repairNote ?? "",
                      i.serviceDetails?.sentAt ?? "",
                      i.serviceDetails?.arrivedAt ?? "",
                      i.serviceDetails?.repairStartedAt ?? "",
                      i.serviceDetails?.completedAt ?? "",
                      i.serviceDetails?.orderNumber ?? "",
                      i.serviceDetails?.works?.join("; ") ?? "",
                      lane(i).known ? laneCost(i) : "Не распределена",
                      i.serviceDetails?.costDate ?? "",
                      lanePaid(i),
                      Math.max(0, laneCost(i) - lanePaid(i)),
                      laneProfit(i),
                      JSON.stringify(i.serviceDetails?.payments ?? []),
                    ]),
                  )
                }
              >
                Скачать CSV
              </button>
            </div>
          </div>
          <div
            className="sto-stats"
            aria-label={`Дашборд: ${workshopLabels[shop]}`}
          >
            {[
              [
                "Автомобили в ремонте",
                String(
                  new Set(
                    periodRecords.filter((i) => !closed(i)).map(vehicleKey),
                  ).size,
                ),
              ],
              ["Стоимость услуг", formatCurrency(sums.cost)],
              ["Оплачено", formatCurrency(sums.paid)],
              [
                "Не оплачено",
                formatCurrency(
                  periodRecords.reduce(
                    (total, i) =>
                      total + Math.max(0, laneCost(i) - lanePaid(i)),
                    0,
                  ),
                ),
              ],
              [
                "Прибыль СТО · 30%",
                formatCurrency(sums.painting * 0.3 + sums.repair * 0.3),
              ],
            ].map(([label, value]) => renderMetric(label, value, "finance"))}
          </div>
          <p className="muted sto-allocation-note">
            Для машины в двух цехах услуги и работы учитываются по направлениям.
            Общие оплаты и расходы распределяются пропорционально их стоимости.
            Прибыль — 30% услуг и работ, без расходов.
          </p>
          {periodRecords.some((i) => !lane(i).known) && (
            <p className="sto-late">
              Без разбивки суммы:{" "}
              {periodRecords.filter((i) => !lane(i).known).length}. Укажите
              стоимости работ по направлениям в карточке; неизвестные суммы не
              включены в показатели.
            </p>
          )}
          <div className="sto-stats" aria-label="Статистика ДТП">
            {[
              ["Всего ДТП", String(accidents.length)],
              [
                "Водитель виновен · включая обоюдную",
                `${guilty} · ${percent(guilty)}`,
              ],
              ["Водитель не виновен", `${innocent} · ${percent(innocent)}`],
              [
                "Виновность не установлена",
                String(accidents.length - knownFault),
              ],
              [
                "Стоимость ДТП",
                formatCurrency(
                  accidents.reduce((sum, i) => sum + laneCost(i), 0),
                ),
              ],
            ].map(([label, value]) => renderMetric(label, value, "accident"))}
          </div>
          <p className="muted">
            ДТП — за период по дате происшествия. Проценты — среди случаев с
            установленной виновностью. Стоимость: услуги, а для старых записей —
            исторический расход; без суммы:{" "}
            {
              accidents.filter(
                (i) =>
                  i.serviceDetails?.serviceCost == null && i.amount == null,
              ).length
            }
            .
          </p>
          <div className="panel sto-filters">
            <label>
              Компания
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="all">Все компании</option>
                {[
                  ...new Set(
                    (cars.data ?? []).map((c) => c.companyName).filter(Boolean),
                  ),
                ].map((c) => (
                  <option key={c!} value={c!}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип обращения
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">Ремонт и ДТП</option>
                <option value="repair">Только ремонт</option>
                <option value="accident">ДТП</option>
                <option value="accident_repair">ДТП и ремонт</option>
                <option value="accident_all">Все случаи с ДТП</option>
              </select>
            </label>
            <label>
              Случай
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
              >
                <option value="all">Все случаи</option>
                <option value="insurance">Страховой</option>
                <option value="non_insurance">Нестраховой</option>
              </select>
            </label>
            <label>
              Бригадир
              <select
                aria-label="Бригадир"
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
              >
                <option value="">Все бригадиры</option>
                {[
                  ...new Set(
                    [
                      ...records.map((i) => i.managerLabel),
                      ...(cars.data ?? [])
                        .filter((c) => c.status === "maintenance")
                        .map((c) => c.managerName),
                    ].filter((v): v is string => !!v),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Машина в СТО
              <select
                aria-label="Машина в СТО"
                value={carFilter}
                onChange={(e) => setCarFilter(e.target.value)}
              >
                <option value="">Все машины</option>
                {(cars.data ?? [])
                  .filter(
                    (c) =>
                      c.status === "maintenance" ||
                      records.some(
                        (i) =>
                          i.carId === c.id &&
                          (!closed(i) ||
                            filter === "archived" ||
                            filter === "all"),
                      ) ||
                      c.id === carFilter,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.plateNumber} · {c.make} {c.model}
                    </option>
                  ))}
                {records
                  .filter((i) => i.serviceDetails?.manualVehicle && !i.carId)
                  .map((i) => (
                    <option key={`manual:${i.id}`} value={`manual:${i.id}`}>
                      {i.serviceDetails!.manualVehicle!.plateNumber} ·{" "}
                      {i.serviceDetails!.manualVehicle!.make}{" "}
                      {i.serviceDetails!.manualVehicle!.model}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Поиск
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Машина, водитель, причина"
              />
            </label>
            <label>
              Статус
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="active">Активные ремонты</option>
                <option value="all">Все ремонты</option>
                <option value="overdue_start">
                  Нарушен срок начала ремонта
                </option>
                {stages
                  .filter((s) => s !== "completed")
                  .map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                <option value="archived">Завершённые / архив</option>
              </select>
            </label>
            <label>
              Оплата
              <select
                aria-label="Фильтр оплаты"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="all">Все оплаты</option>
                <option value="with_payments">Есть оплаты</option>
                <option value="unpaid">Есть остаток к оплате</option>
                <option value="partial">Частично оплачено</option>
                <option value="paid">Полностью оплачено</option>
              </select>
            </label>
            <label>
              Плательщик
              <select value={payer} onChange={(e) => setPayer(e.target.value)}>
                <option value="all">Все плательщики</option>
                {Object.entries(payerLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Период по
              <select
                aria-label="Основание периода"
                value={periodBasis}
                onChange={(e) => setPeriodBasis(e.target.value)}
              >
                <option value="cost">Дате стоимости услуг</option>
                <option value="incident">Дате ДТП / инцидента</option>
              </select>
            </label>
            <label>
              С
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              По
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <p className="muted sto-wide">
              Записей без указанной стоимости услуг:{" "}
              {
                periodRecords.filter(
                  (i) => i.serviceDetails?.serviceCost === undefined,
                ).length
              }
              . Исторические расходы не включаются в прибыль без стоимости
              услуг.
              <br />
              Прибыль начисленная (30% от услуг и работ):{" "}
              {formatCurrency(
                (sums.painting + sums.repair + sums.unallocated) * 0.3,
              )}
              . Расходы в прибыль не включаются.
              <br />
              Период:{" "}
              {periodBasis === "cost"
                ? "по дате стоимости услуг"
                : "по дате ДТП / инцидента"}
              . Поступило по датам оплаты: {formatCurrency(receipts)}.
            </p>
          </div>
          {error && (
            <div role="alert" className="panel">
              Не удалось загрузить журнал.{" "}
              <button onClick={() => void refresh()}>Повторить</button>
            </div>
          )}
          {incidents.loading && <div className="panel">Загрузка ремонтов…</div>}
          {message && (
            <div role="status" className="panel">
              {message}
            </div>
          )}
          <section
            ref={resultsRef}
            tabIndex={-1}
            aria-label="Список ремонтов"
            className="sto-results"
          >
            {activeMetric && (
              <div className="sto-filter-summary">
                Показано: {activeMetric}
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setMetricScope("all");
                    setFaultFilter("all");
                    setPaymentFilter("all");
                    setKind("all");
                    setFilter("all");
                    setActiveMetric("");
                  }}
                >
                  Показать все
                </button>
              </div>
            )}
            <div className="sto-cards">{rows.map(renderRepairCard)}</div>
            {!rows.length && <p className="muted">Машин по фильтрам нет</p>}
            {((shop === "main" &&
              allRecords.some((i) => !i.serviceDetails?.workshop)) ||
              !!untracked.length) && <h3>Цех пока не указан</h3>}
            <div className="sto-cards">
              {(shop === "main" && !activeMetric ? allRecords : [])
                .filter(
                  (i) =>
                    !i.serviceDetails?.workshop &&
                    (company === "all" || recordCompany(i) === company) &&
                    (filter === "all" ||
                      (filter === "active"
                        ? !closed(i)
                        : filter === "archived"
                          ? closed(i)
                          : i.serviceStage === filter)) &&
                    (!search ||
                      [vehicleLabel(i), repairReason(i)]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase())),
                )
                .map(renderRepairCard)}
              {untracked.map((c) => (
                <article className="sto-card" key={c.id}>
                  <div className="sto-card-heading">
                    <h3>{c.plateNumber}</h3>
                    <span className="sto-badge">В ремонте</span>
                  </div>
                  <p>
                    {c.make} {c.model}
                  </p>
                  <div className="sto-reason">
                    <strong>Причина: </strong>
                    {c.incidentComment?.trim() || "Не указана в журнале"}
                  </div>
                  <p className="muted">
                    Открытый кейс не найден. Укажите причину, заказ-наряд и
                    работы перед завершением.
                  </p>
                  {canEdit && (
                    <button
                      className="button button--secondary"
                      onClick={() => {
                        setSendCar(c.id);
                        setReason(c.incidentComment ?? "");
                        setManualEntry(false);
                        setWorkshop(shop);
                        setShowDispatch(true);
                      }}
                    >
                      Оформить ремонт
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!rows.length &&
              !untracked.length &&
              !incidents.loading &&
              !error && <div className="panel">Ремонтов по фильтру нет.</div>}
          </section>
          {canSend && showDispatch && (
            <button
              type="button"
              className="entity-modal__backdrop"
              aria-label="Закрыть добавление на СТО"
              disabled={busy}
              onClick={() => setShowDispatch(false)}
            />
          )}
          {canSend && showDispatch && (
            <section
              className="entity-modal sto-dispatch"
              role="dialog"
              aria-modal="true"
              aria-label="Добавить на СТО"
            >
              <div className="sto-card-heading">
                <h3>Добавить на СТО</h3>
                <button
                  className="button button--secondary"
                  disabled={busy}
                  onClick={() => setShowDispatch(false)}
                >
                  Закрыть
                </button>
              </div>
              <div className="entity-modal__body">
                <label>
                  Куда направить *
                  <select
                    aria-label="Куда направить"
                    value={workshop}
                    onChange={(e) =>
                      setWorkshop(e.target.value as typeof workshop)
                    }
                  >
                    <option value="">Выберите цех</option>
                    {Object.entries(workshopLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Способ добавления
                  <select
                    aria-label="Способ добавления"
                    value={manualEntry ? "manual" : "list"}
                    onChange={(e) =>
                      setManualEntry(e.target.value === "manual")
                    }
                  >
                    <option value="list">Выбрать из списка</option>
                    {canEdit && <option value="manual">Ввести вручную</option>}
                  </select>
                </label>
                <label>
                  Вид случая
                  <select
                    aria-label="Вид случая"
                    value={repairCategory}
                    onChange={(e) =>
                      setRepairCategory(e.target.value as typeof repairCategory)
                    }
                  >
                    {Object.entries(categoryLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {repairCategory !== "repair" && (
                  <div className="sto-filters">
                    <label>
                      Виновность при ДТП *
                      <select
                        aria-label="Виновность при ДТП"
                        value={dispatchFault}
                        onChange={(e) =>
                          setDispatchFault(
                            e.target.value as typeof dispatchFault,
                          )
                        }
                      >
                        <option value="">Выберите виновность</option>
                        {Object.entries(faultLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Кто оплачивает ДТП *
                      <select
                        aria-label="Кто оплачивает ДТП"
                        value={dispatchPayer}
                        onChange={(e) =>
                          setDispatchPayer(
                            e.target.value as typeof dispatchPayer,
                          )
                        }
                      >
                        <option value="">Выберите плательщика</option>
                        {Object.entries(payerLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    {dispatchPayer === "insurance" && (
                      <label>
                        Страховая компания *
                        <select
                          aria-label="Страховая ДТП"
                          value={dispatchInsurer}
                          onChange={(e) =>
                            setDispatchInsurer(
                              e.target.value as typeof dispatchInsurer,
                            )
                          }
                        >
                          <option value="">Выберите страховую</option>
                          {Object.entries(insurerLabels).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
                <h3>
                  {carById.get(sendCar)?.status === "maintenance"
                    ? "Оформить текущий ремонт"
                    : "Отправить на СТО"}
                </h3>
                <div className="sto-filters">
                  {!manualEntry && (
                    <label>
                      Автомобиль
                      <select
                        value={sendCar}
                        onChange={(e) => setSendCar(e.target.value)}
                      >
                        <option value="">Выберите автомобиль</option>
                        {(cars.data ?? [])
                          .filter(
                            (c) => !["sold", "written_off"].includes(c.status),
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.plateNumber} · {c.make} {c.model}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {manualEntry && (
                    <>
                      {(
                        [
                          ["Госномер", manualPlate, setManualPlate],
                          ["Марка", manualMake, setManualMake],
                          ["Модель", manualModel, setManualModel],
                        ] as const
                      ).map(([label, value, setValue]) => (
                        <label key={label}>
                          {label} *
                          <input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                          />
                        </label>
                      ))}
                    </>
                  )}
                  <label className="sto-wide">
                    Причина *
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Что произошло и что требуется проверить"
                    />
                  </label>
                </div>
                <p className="muted">
                  Если СТО не подтвердит прибытие за 24 часа, бригадир получит
                  уведомление.
                </p>
                <button
                  className="button"
                  disabled={
                    busy ||
                    !workshop ||
                    (!manualEntry && !sendCar) ||
                    !reason.trim() ||
                    (manualEntry &&
                      ![manualPlate, manualMake, manualModel].every((v) =>
                        v.trim(),
                      ))
                  }
                  onClick={() => void send()}
                >
                  {busy ? "Сохранение…" : "Сохранить и уведомить"}
                </button>
                {message && <p role="alert">{message}</p>}
              </div>
            </section>
          )}
        </>
      )}
      {selected && message && (
        <div role="status" className="panel">
          {message}
        </div>
      )}
      {selected && (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="panel sto-detail"
          aria-label="Карточка ремонта"
        >
          <div className="sto-card-heading">
            <h3>Карточка ремонта · {vehicleLabel(selected)}</h3>
            <button
              className="button button--secondary"
              onClick={() => setSelected(null)}
            >
              Закрыть карточку
            </button>
          </div>
          <section
            className="sto-overview"
            aria-label="Подробная информация о ремонте"
          >
            <h4>Информация о машине и ремонте</h4>
            <dl>
              <div>
                <dt>Автомобиль</dt>
                <dd>
                  {[
                    vehicleLabel(selected),
                    carById.get(selected.carId ?? "")?.make,
                    carById.get(selected.carId ?? "")?.model,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
              <div>
                <dt>Водитель</dt>
                <dd>
                  {driverById.get(selected.driverId ?? "")?.fullName ??
                    selected.driverName ??
                    "Не указан"}
                </dd>
              </div>
              <div>
                <dt>Бригадир</dt>
                <dd>
                  {selected.managerLabel ??
                    carById.get(selected.carId ?? "")?.managerName ??
                    "Не указан"}
                </dd>
              </div>
              <div>
                <dt>Тип и этап</dt>
                <dd>
                  {selected.incidentType === "accident"
                    ? "После ДТП"
                    : "Ремонт"}{" "}
                  · {labels[selected.serviceStage ?? ""] ?? selected.status}
                </dd>
              </div>
              {selected.incidentType === "accident" &&
                !selected.accidentDetails && (
                  <div>
                    <dt>Виновность водителя</dt>
                    <dd>{faultLabels[faultOf(selected)]}</dd>
                  </div>
                )}
              {selected.serviceDetails?.expectedPayer && (
                <div>
                  <dt>Кто оплачивает</dt>
                  <dd>{payerLabels[selected.serviceDetails.expectedPayer]}</dd>
                </div>
              )}
              <div>
                <dt>Прибытие на СТО</dt>
                <dd>{stamp(selected.serviceDetails?.arrivedAt)}</dd>
              </div>
              <div>
                <dt>Цех</dt>
                <dd>
                  {selected.serviceDetails?.workshop
                    ? workshopLabels[selected.serviceDetails.workshop]
                    : "Пока не указан"}
                </dd>
              </div>
              <div className="sto-overview-wide">
                <dt>Причина ремонта</dt>
                <dd>{repairReason(selected)}</dd>
              </div>
              {selected.description?.trim() &&
                selected.description.trim() !== repairReason(selected) && (
                  <div className="sto-overview-wide">
                    <dt>Описание инцидента</dt>
                    <dd>{selected.description}</dd>
                  </div>
                )}
              {selected.locationNote && (
                <div>
                  <dt>Место</dt>
                  <dd>{selected.locationNote}</dd>
                </div>
              )}
              {selected.occurredAt && (
                <div>
                  <dt>Дата инцидента</dt>
                  <dd>{stamp(selected.occurredAt)}</dd>
                </div>
              )}
              {selected.accidentDetails && (
                <>
                  <div>
                    <dt>Место ДТП</dt>
                    <dd>{selected.accidentDetails.location}</dd>
                  </div>
                  <div>
                    <dt>Дата ДТП</dt>
                    <dd>{stamp(selected.accidentDetails.occurredAt)}</dd>
                  </div>
                  <div>
                    <dt>Виновность водителя</dt>
                    <dd>
                      {
                        {
                          driver: "Виновен",
                          other: "Не виновен",
                          both: "Обоюдная вина",
                          unknown: "Не установлена",
                        }[selected.accidentDetails.fault]
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Страховая ДТП</dt>
                    <dd>{insurerLabels[selected.accidentDetails.insurer]}</dd>
                  </div>
                  <div>
                    <dt>Второй участник</dt>
                    <dd>
                      {[
                        selected.accidentDetails.otherPlate,
                        selected.accidentDetails.otherMake,
                        selected.accidentDetails.otherModel,
                      ].join(" · ")}
                    </dd>
                  </div>
                </>
              )}
              {selected.referenceNumber && (
                <div>
                  <dt>Номер инцидента</dt>
                  <dd>{selected.referenceNumber}</dd>
                </div>
              )}
              {selected.periodLabel && (
                <div>
                  <dt>Период инцидента</dt>
                  <dd>{selected.periodLabel}</dd>
                </div>
              )}
              {selected.amount != null && (
                <div>
                  <dt>Исторический расход</dt>
                  <dd>{formatCurrency(selected.amount)}</dd>
                </div>
              )}
              {selected.insuranceCompensationAmount != null && (
                <div>
                  <dt>Страховое возмещение</dt>
                  <dd>
                    {formatCurrency(selected.insuranceCompensationAmount)}
                  </dd>
                </div>
              )}
              {selected.writeoffAmount != null && (
                <div>
                  <dt>Сумма списания</dt>
                  <dd>{formatCurrency(selected.writeoffAmount)}</dd>
                </div>
              )}
              {selected.insuranceNote && (
                <div className="sto-overview-wide">
                  <dt>Примечание по страхованию</dt>
                  <dd>{selected.insuranceNote}</dd>
                </div>
              )}
            </dl>
          </section>
          <div className="sto-timeline">
            {stages.map((s, n) => (
              <div
                key={s}
                className={
                  stages.indexOf(
                    selected.serviceStage === "awaiting_repair"
                      ? "sent_to_service"
                      : (selected.serviceStage ?? ""),
                  ) >= n
                    ? "sto-step--done"
                    : ""
                }
              >
                <b>{labels[s]}</b>
                <span>
                  {stamp(
                    selected.serviceDetails?.[
                      (["sentAt", "repairStartedAt", "completedAt"] as const)[n]
                    ],
                  )}
                </span>
              </div>
            ))}
          </div>
          {!!selected.statusHistory?.length && (
            <details className="sto-history">
              <summary>
                История всех этапов · {selected.statusHistory.length}
              </summary>
              <ol>
                {selected.statusHistory.map((entry, index) => (
                  <li key={index}>
                    {stamp(entry.changedAt)} ·{" "}
                    {labels[entry.serviceStage ?? ""] ??
                      entry.serviceStage ??
                      entry.status}{" "}
                    ·{" "}
                    {(
                      {
                        open: "Открыт",
                        closed: "Закрыт",
                        resolved: "Завершён",
                        archived: "Архив",
                      } as Record<string, string>
                    )[entry.status] ?? entry.status}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {selected.serviceDetails?.plannedRepairDate && (
            <p className={waitingLate(selected) ? "sto-late" : "muted"}>
              План начала ремонта:{" "}
              {formatDateOnly(selected.serviceDetails.plannedRepairDate)} ·{" "}
              {waitingLate(selected) ? "Срок нарушен" : "Срок не нарушен"}
              <br />
              Комментарий СТО: {selected.serviceDetails.waitingComment ?? "—"}
            </p>
          )}
          <fieldset disabled={!canEdit || busy}>
            <div className="sto-filters">
              <label>
                Цех
                <select
                  aria-label="Цех"
                  value={details.workshop ?? ""}
                  onChange={(e) =>
                    setDetails({
                      ...details,
                      workshop: e.target.value as "body" | "main" | "both",
                    })
                  }
                >
                  <option value="" disabled>
                    Не указан
                  </option>
                  {Object.entries(workshopLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(selected.serviceStage === "sent_to_service" ||
              details.plannedRepairDate) && (
              <div className="sto-filters">
                <label>
                  Комментарий приёмки *
                  <textarea
                    value={details.waitingComment ?? ""}
                    onChange={(e) =>
                      setDetails({ ...details, waitingComment: e.target.value })
                    }
                  />
                </label>
                <label>
                  Плановая дата начала ремонта *
                  <input
                    type="date"
                    min={today()}
                    disabled={
                      !!selected.serviceDetails?.plannedRepairDate &&
                      (selected.serviceStage !== "sent_to_service" ||
                        !!selected.serviceDetails?.arrivedAt)
                    }
                    value={details.plannedRepairDate ?? ""}
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        plannedRepairDate: e.target.value || undefined,
                      })
                    }
                  />
                </label>
              </div>
            )}
            {selected.incidentType === "accident" && (
              <div className="sto-filters">
                <label>
                  Виновность водителя
                  <select
                    value={accidentDraft.fault}
                    onChange={(e) =>
                      setAccidentDraft({
                        ...accidentDraft,
                        fault: e.target.value as AccidentDetails["fault"],
                      })
                    }
                  >
                    <option value="unknown">Не установлена</option>
                    <option value="driver">Виновен</option>
                    <option value="other">Не виновен</option>
                    <option value="both">Обоюдная вина</option>
                  </select>
                </label>
                {!selected.accidentDetails && (
                  <>
                    {(
                      [
                        ["location", "Место ДТП"],
                        ["otherPlate", "Госномер второго участника"],
                        ["otherMake", "Марка второго участника"],
                        ["otherModel", "Модель второго участника"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label} *
                        <input
                          value={accidentDraft[key]}
                          onChange={(e) =>
                            setAccidentDraft({
                              ...accidentDraft,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Дата и время ДТП *
                      <input
                        type="datetime-local"
                        value={
                          accidentDraft.occurredAt
                            ? accidentDraft.occurredAt.slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          setAccidentDraft({
                            ...accidentDraft,
                            occurredAt: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Страховая ДТП
                      <select
                        value={accidentDraft.insurer}
                        onChange={(e) =>
                          setAccidentDraft({
                            ...accidentDraft,
                            insurer: e.target
                              .value as AccidentDetails["insurer"],
                          })
                        }
                      >
                        {Object.entries(insurerLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {(["beforePhoto", "afterPhoto"] as const).map((key) => (
                  <label key={key}>
                    {key === "beforePhoto"
                      ? "Фото до ремонта · при приёмке *"
                      : "Фото после ремонта · при завершении *"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void loadPhoto(e.target.files?.[0], key)}
                    />
                    {details[key] && (
                      <a
                        href="#photo"
                        onClick={(e) => {
                          e.preventDefault();
                          setPhotoPreview(details[key] ?? null);
                        }}
                      >
                        <img
                          className="sto-photo"
                          src={details[key]}
                          alt={
                            key === "beforePhoto"
                              ? "До ремонта"
                              : "После ремонта"
                          }
                        />
                      </a>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="sto-filters">
              <label className="sto-wide">
                Причина *
                <textarea
                  value={details.reason}
                  onChange={(e) =>
                    setDetails({ ...details, reason: e.target.value })
                  }
                />
              </label>
              <label>
                Номер заказ-наряда *
                <input
                  value={details.orderNumber ?? ""}
                  readOnly
                  placeholder="Будет присвоен автоматически"
                />
              </label>
              <section
                className="sto-wide sto-order"
                aria-label="Работы заказ-наряда"
              >
                <h4>Работы заказ-наряда</h4>
                {message && <p className="sto-order-feedback">{message}</p>}
                {(details.orderItems ?? []).map((work, index) => (
                  <div className="sto-order-row" key={work.id}>
                    <label>
                      Наименование {index + 1} *
                      <input
                        value={work.description}
                        onChange={(e) =>
                          setOrderItems(
                            details.orderItems!.map((w) =>
                              w.id === work.id
                                ? { ...w, description: e.target.value }
                                : w,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Направление
                      <select
                        value={work.category}
                        onChange={(e) =>
                          setOrderItems(
                            details.orderItems!.map((w) =>
                              w.id === work.id
                                ? {
                                    ...w,
                                    category: e.target.value as
                                      | "repair"
                                      | "painting",
                                  }
                                : w,
                            ),
                          )
                        }
                      >
                        <option value="repair">Ремонт</option>
                        <option value="painting">Малярные работы</option>
                      </select>
                    </label>
                    <label>
                      Стоимость услуги, сом *
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={work.serviceAmount ?? ""}
                        onChange={(e) =>
                          setOrderItems(
                            details.orderItems!.map((w) =>
                              w.id === work.id
                                ? {
                                    ...w,
                                    serviceAmount:
                                      e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                  }
                                : w,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Стоимость работы, сом *
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={work.laborAmount ?? ""}
                        onChange={(e) =>
                          setOrderItems(
                            details.orderItems!.map((w) =>
                              w.id === work.id
                                ? {
                                    ...w,
                                    laborAmount:
                                      e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                  }
                                : w,
                            ),
                          )
                        }
                      />
                    </label>
                    {work.serviceAmount === undefined &&
                      work.laborAmount === undefined &&
                      work.amount !== undefined && (
                        <small>
                          Ранее сохранённая сумма: {formatCurrency(work.amount)}
                          . Разбивка не указана.
                        </small>
                      )}
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`Удалить работу ${index + 1}`}
                      onClick={() =>
                        setOrderItems(
                          details.orderItems!.filter((w) => w.id !== work.id),
                        )
                      }
                    >
                      Удалить
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={addOrderItem}
                >
                  Добавить строку
                </button>
                {incompleteOrder && (
                  <p className="muted">
                    Укажите название и стоимость каждой работы перед сохранением
                    и оплатой.
                  </p>
                )}
                <p>
                  <strong>
                    Общая сумма заказ-наряда:{" "}
                    {formatCurrency(details.serviceCost ?? 0)}
                  </strong>
                </p>
              </section>
              <section
                className="sto-wide sto-order"
                aria-label="Расходы заказ-наряда"
              >
                <h4>Расходы</h4>
                {(details.expenses ?? []).map((expense, index) => (
                  <div className="sto-expense-row" key={expense.id}>
                    <label>
                      Наименование расхода {index + 1} *
                      <input
                        disabled={expense.inventoryApplied}
                        value={expense.description}
                        onChange={(e) =>
                          setExpenses(
                            details.expenses!.map((x) =>
                              x.id === expense.id
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Стоимость расхода, сом *
                      <input
                        disabled={expense.inventoryApplied}
                        type="number"
                        min="0"
                        step="0.01"
                        value={expense.amount ?? ""}
                        onChange={(e) =>
                          setExpenses(
                            details.expenses!.map((x) =>
                              x.id === expense.id
                                ? {
                                    ...x,
                                    amount:
                                      e.target.value === ""
                                        ? undefined
                                        : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Кто приобрёл
                      <select
                        disabled={expense.inventoryApplied}
                        value={expense.purchaser}
                        onChange={(e) =>
                          setExpenses(
                            details.expenses!.map((x) =>
                              x.id === expense.id
                                ? {
                                    ...x,
                                    purchaser: e.target.value as
                                      | "sto"
                                      | "company"
                                      | "driver",
                                    inventoryMode: undefined,
                                    partId: undefined,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="sto">СТО — включить в счёт</option>
                        <option value="company">GoPark — не включать</option>
                        <option value="driver">Водитель — не включать</option>
                      </select>
                    </label>
                    {expense.purchaser === "company" && (
                      <>
                        <label>
                          Источник расхода
                          <select
                            disabled={expense.inventoryApplied}
                            value={expense.inventoryMode ?? "other"}
                            onChange={(e) =>
                              setExpenses(
                                details.expenses!.map((x) =>
                                  x.id === expense.id
                                    ? {
                                        ...x,
                                        inventoryMode:
                                          e.target.value === "other"
                                            ? undefined
                                            : (e.target.value as
                                                | "purchase"
                                                | "stock"),
                                        partId: undefined,
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <option value="other">Прочий расход</option>
                            <option value="purchase">
                              Купили новую запчасть — приход и расход
                            </option>
                            <option value="stock">
                              Запчасть со склада — только расход
                            </option>
                          </select>
                        </label>
                        {expense.inventoryMode === "stock" && (
                          <label>
                            Запчасть со склада
                            <select
                              disabled={expense.inventoryApplied}
                              value={expense.partId ?? ""}
                              onChange={(e) => {
                                const part = parts.data?.parts.find(
                                  (p) => p.id === e.target.value,
                                );
                                if (part)
                                  setExpenses(
                                    details.expenses!.map((x) =>
                                      x.id === expense.id
                                        ? {
                                            ...x,
                                            partId: part.id,
                                            description: part.name,
                                            amount: part.unitPrice ?? undefined,
                                          }
                                        : x,
                                    ),
                                  );
                              }}
                            >
                              <option value="">Выберите запчасть</option>
                              {(parts.data?.parts ?? [])
                                .filter(
                                  (p) =>
                                    p.quantity > 0 || p.id === expense.partId,
                                )
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} · {p.quantity} {p.unit}
                                  </option>
                                ))}
                            </select>
                            <small>
                              {parts.error
                                ? "Не удалось загрузить склад. Обновите страницу. "
                                : ""}
                              Будет списана 1 единица. Для нескольких запчастей
                              добавьте строки.
                            </small>
                          </label>
                        )}
                      </>
                    )}
                    {expense.inventoryApplied && (
                      <small>Складские движения сохранены</small>
                    )}
                    <button
                      disabled={expense.inventoryApplied}
                      type="button"
                      className="button button--secondary"
                      aria-label={`Удалить расход ${index + 1}`}
                      onClick={() =>
                        setExpenses(
                          details.expenses!.filter((x) => x.id !== expense.id),
                        )
                      }
                    >
                      Удалить
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    setExpenses([
                      ...(details.expenses ?? []),
                      {
                        id: paymentId(),
                        description: "",
                        purchaser: "sto",
                        amount: undefined,
                      },
                    ])
                  }
                >
                  Добавить расход
                </button>
                <p>
                  Расходы СТО в счёте:{" "}
                  {formatCurrency(billableServiceExpenses(details))}. Расходы
                  GoPark и водителя учитываются отдельно.
                </p>
              </section>
              {details.expenses &&
                !details.orderItems &&
                details.paintingCost === undefined &&
                details.repairCost === undefined && (
                  <label>
                    Услуги и работы без разбивки, сом
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={details.serviceBaseCost ?? 0}
                      onChange={(e) =>
                        setDetails(
                          recalculateServiceCosts({
                            ...details,
                            serviceBaseCost: Number(e.target.value),
                          }),
                        )
                      }
                    />
                  </label>
                )}
              <label>
                Малярные работы, сом
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={details.paintingCost ?? ""}
                  readOnly={!!details.orderItems?.length}
                  onChange={(e) => {
                    const amount =
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value);
                    setDetails(
                      recalculateServiceCosts({
                        ...details,
                        paintingCost: amount,
                        serviceCost:
                          Math.round(
                            ((amount ?? 0) + (details.repairCost ?? 0)) * 100,
                          ) / 100,
                        costDate: details.costDate ?? today(),
                      }),
                    );
                  }}
                />
              </label>
              <label>
                Ремонт, сом
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={details.repairCost ?? ""}
                  readOnly={!!details.orderItems?.length}
                  onChange={(e) => {
                    const amount =
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value);
                    setDetails(
                      recalculateServiceCosts({
                        ...details,
                        repairCost: amount,
                        serviceCost:
                          Math.round(
                            ((amount ?? 0) + (details.paintingCost ?? 0)) * 100,
                          ) / 100,
                        costDate: details.costDate ?? today(),
                      }),
                    );
                  }}
                />
              </label>
              <label>
                Стоимость услуг, сом
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={details.serviceCost ?? ""}
                  readOnly={
                    details.paintingCost !== undefined ||
                    details.repairCost !== undefined ||
                    details.expenses !== undefined
                  }
                  onChange={(e) =>
                    setDetails({
                      ...details,
                      serviceCost:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      costDate: details.costDate ?? today(),
                    })
                  }
                />
              </label>
              <label>
                Дата стоимости услуг
                <input
                  type="date"
                  value={details.costDate ?? ""}
                  onChange={(e) =>
                    setDetails({ ...details, costDate: e.target.value })
                  }
                />
              </label>
              {!details.orderItems && !!details.works?.length && (
                <label className="sto-wide">
                  Ранее сохранённый список выполненных работ
                  <textarea
                    value={(details.works ?? []).join("\n")}
                    placeholder="Каждая работа с новой строки"
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        works: e.target.value.split("\n"),
                      })
                    }
                  />
                </label>
              )}
            </div>
            {selected.amount != null &&
              selected.serviceDetails?.serviceCost === undefined && (
                <p className="muted">
                  Исторический расход: {formatCurrency(selected.amount)} ·
                  страховое возмещение:{" "}
                  {formatCurrency(selected.insuranceCompensationAmount ?? 0)}.
                  Эти суммы сохранены отдельно от стоимости услуг.
                </p>
              )}
            <h4>Оплаты</h4>
            <p role="status">
              Оплачено:{" "}
              {formatCurrency(paid({ ...selected, serviceDetails: details }))} ·
              Остаток:{" "}
              {formatCurrency(
                Math.max(
                  0,
                  (details.serviceCost ?? 0) -
                    paid({ ...selected, serviceDetails: details }),
                ),
              )}
            </p>
            {(payment.payer === "insurance" || details.insurance) && (
              <div className="sto-filters">
                <label>
                  Страховая компания
                  <select
                    value={details.insurance?.insurer ?? ""}
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        insurance: {
                          ...details.insurance,
                          insurer: e.target.value as
                            | "nsk"
                            | "alma"
                            | "gosstrakh",
                          paid: details.insurance?.paid ?? false,
                        },
                      })
                    }
                  >
                    <option value="">Выберите компанию</option>
                    {Object.entries(insurerLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {details.insurance?.paid && (
                  <p className="muted">
                    Оплата страховой учтена:{" "}
                    {formatDateOnly(details.insurance.paidAt ?? "")}.
                  </p>
                )}
              </div>
            )}
            {(details.payments ?? []).map((p) => (
              <div className="sto-line" key={p.id}>
                <span>
                  {formatDateOnly(p.paidAt)} · {payerLabels[p.payer]}{" "}
                  {p.insurer ? `· ${insurerLabels[p.insurer]}` : ""}
                </span>
                <b>{formatCurrency(p.amount)}</b>
              </div>
            ))}
            <div className="sto-filters">
              <label>
                Плательщик
                <select
                  value={payment.payer}
                  onChange={(e) =>
                    setPayment({
                      ...payment,
                      payer: e.target.value as ServicePaymentEntry["payer"],
                    })
                  }
                >
                  {Object.entries(payerLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сумма
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) =>
                    setPayment({ ...payment, amount: e.target.value })
                  }
                />
              </label>
              <label>
                Дата оплаты
                <input
                  type="date"
                  value={payment.paidAt}
                  onChange={(e) =>
                    setPayment({ ...payment, paidAt: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy || incompleteOrder}
                onClick={() => void addPayment()}
              >
                Добавить оплату
              </button>
            </div>
            <label className="sto-checkbox">
              <input
                type="checkbox"
                checked={
                  !incompleteOrder &&
                  details.serviceCost !== undefined &&
                  paid({ ...selected, serviceDetails: details }) >=
                    details.serviceCost
                }
                disabled={
                  busy ||
                  incompleteOrder ||
                  details.serviceCost === undefined ||
                  paid({ ...selected, serviceDetails: details }) >=
                    (details.serviceCost ?? Infinity)
                }
                onChange={(e) => {
                  if (e.target.checked) void confirmFullPayment();
                }}
              />
              Оплата произведена полностью
            </label>
            <p className="muted">
              Галочка сохраняет платёж на весь остаток стоимости с выбранным
              плательщиком и датой. Частичную сумму укажите в поле «Сумма» и
              нажмите «Добавить оплату».
            </p>
          </fieldset>
          <p className="muted">
            Перед завершением обязательны номер заказ-наряда и список работ.
            Изменения и готовность машины отправляются бригадиру.
          </p>
          {canEdit && (
            <div className="row-actions">
              <button
                className="button button--secondary"
                disabled={busy}
                onClick={() => void save()}
              >
                Сохранить
              </button>
              {!closed(selected) && (
                <button
                  className="button"
                  disabled={
                    busy ||
                    (selected.serviceStage === "sent_to_service" &&
                      (!details.waitingComment?.trim() ||
                        !details.plannedRepairDate)) ||
                    (selected.incidentType === "accident" &&
                      ((selected.serviceStage === "sent_to_service" &&
                        !details.beforePhoto) ||
                        (selected.serviceStage === "in_repair" &&
                          (!details.beforePhoto || !details.afterPhoto)))) ||
                    (selected.serviceStage === "in_repair" &&
                      (!details.orderNumber?.trim() ||
                        !details.works?.some((w) => w.trim())))
                  }
                  onClick={() =>
                    selected.serviceStage === "sent_to_service" &&
                    !selected.serviceDetails?.arrivedAt
                      ? void save(
                          undefined,
                          { ...details, arrivalConfirmed: true },
                          false,
                        )
                      : void save(
                          ["sent_to_service", "awaiting_repair"].includes(
                            selected.serviceStage ?? "",
                          )
                            ? "in_repair"
                            : "completed",
                        )
                  }
                >
                  {selected.serviceStage === "sent_to_service" &&
                  !selected.serviceDetails?.arrivedAt
                    ? "Подтвердить прибытие"
                    : ["sent_to_service", "awaiting_repair"].includes(
                          selected.serviceStage ?? "",
                        )
                      ? "Начать ремонт"
                      : "Завершить ремонт"}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
