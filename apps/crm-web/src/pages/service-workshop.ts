import type {
  ManagerIncidentItem,
  ServiceRepairDetails,
} from "@gopark/contracts";
import {
  billableServiceExpenses,
  serviceFeeBase,
  serviceProfit,
  serviceWorkProfit,
} from "@gopark/contracts";
type Shop = "main" | "body";
const money = (amount: number) => Math.round(amount * 100) / 100;
type WorkRow = NonNullable<ServiceRepairDetails["orderItems"]>[number];
export function workOrderAmount(work: WorkRow): number | undefined {
  return work.serviceAmount !== undefined || work.laborAmount !== undefined
    ? money((work.serviceAmount ?? 0) + (work.laborAmount ?? 0))
    : work.amount;
}
export function workOrderProfit(
  work: WorkRow,
  workshop?: ServiceRepairDetails["workshop"],
): number | undefined {
  const amount = workOrderAmount(work);
  return amount === undefined
    ? undefined
    : serviceWorkProfit({ reason: "", workshop }, work);
}
function baseSplit(d: ServiceRepairDetails) {
  if (d.orderItems !== undefined) {
    const base = (category: "painting" | "repair") =>
      money(
        d
          .orderItems!.filter((w) => w.category === category)
          .reduce(
            (s, w) =>
              s +
              (w.serviceAmount !== undefined || w.laborAmount !== undefined
                ? (w.serviceAmount ?? 0) + (w.laborAmount ?? 0)
                : (w.amount ?? 0)),
            0,
          ),
      );
    return { body: base("painting"), main: base("repair"), known: true };
  }
  return {
    body: d.paintingCost ?? 0,
    main: d.repairCost ?? 0,
    known: d.paintingCost !== undefined || d.repairCost !== undefined,
  };
}
/** Round the body share and use the remainder for main: the two columns add up exactly. */
export function workshopPayment(
  d: ServiceRepairDetails | null | undefined,
  shop: Shop,
  amount: number,
): number {
  if (!d || (d.workshop !== shop && d.workshop !== "both")) return 0;
  if (d.workshop === shop) return money(amount);
  const split = baseSplit(d),
    total = split.body + split.main;
  if (!split.known || total <= 0) return 0;
  const body = money((amount * split.body) / total);
  return shop === "body" ? body : money(amount - body);
}
export function workshopFinance(
  d: ServiceRepairDetails | null | undefined,
  shop: Shop,
) {
  if (!d || (d.workshop !== shop && d.workshop !== "both"))
    return { base: 0, cost: 0, paid: 0, profit: 0, known: false };
  const payments = workshopPayment(
    d,
    shop,
    (d.payments ?? []).reduce((sum, p) => sum + p.amount, 0),
  );
  if (d.workshop === shop) {
    const base = serviceFeeBase(d);
    return {
      base,
      cost: d.serviceCost ?? 0,
      paid: money(payments),
      profit: serviceProfit(d),
      known: d.serviceCost !== undefined,
    };
  }
  const split = baseSplit(d),
    base = split[shop];
  const known =
    split.known && (split.body + split.main > 0 || d.serviceCost === 0);
  return {
    base,
    cost: known
      ? money(base + workshopPayment(d, shop, billableServiceExpenses(d)))
      : 0,
    paid: money(payments),
    profit: d.orderItems?.length
      ? money(
          d.orderItems
            .filter(
              (work) =>
                work.category === (shop === "body" ? "painting" : "repair"),
            )
            .reduce((sum, work) => sum + serviceWorkProfit(d, work), 0),
        )
      : money(base * 0.3),
    known,
  };
}

/** Allocate cumulative receipts so rounding cannot leave a fully paid invoice partly unpaid. */
export function workshopPayments(
  d: ServiceRepairDetails | null | undefined,
  shop: Shop,
) {
  let received = 0,
    allocated = 0;
  return (d?.payments ?? []).map((payment) => {
    received = money(received + payment.amount);
    const total = workshopPayment(d, shop, received);
    const amount = money(total - allocated);
    allocated = total;
    return { ...payment, amount };
  });
}

export function serviceCardDates(item: ManagerIncidentItem) {
  const result: Array<{ label: string; at: string; dateOnly?: boolean }> = [];
  const d = item.serviceDetails;
  const phases = [
    ["sent_to_service", "Отправлен на СТО", d?.sentAt],
    ["awaiting_repair", "Прибыл на СТО", d?.arrivedAt],
    ["in_repair", "Начало ремонта", d?.repairStartedAt],
    ["completed", "Завершён", d?.completedAt],
  ] as const;
  const known = new Set<string>();
  const add = (label: string, at: string | undefined, dateOnly = false) => {
    if (at && Number.isFinite(Date.parse(at)))
      result.push({ label, at, dateOnly });
  };
  for (const [phase, label, at] of phases)
    if (at && Number.isFinite(Date.parse(at))) {
      add(label, at);
      known.add(phase);
    }
  const names: Record<string, string> = {
    sent_to_service: "Отправлен на СТО",
    awaiting_repair: "Прибыл на СТО",
    in_repair: "Начало ремонта",
    completed: "Завершён",
    written_off: "Списан",
    writeoff_requested: "Запрошено списание",
    open: "Открыт",
    closed: "Закрыт",
    resolved: "Завершён",
    archived: "Архив",
  };
  for (const entry of item.statusHistory ?? []) {
    if (
      !["archived", "closed", "resolved"].includes(entry.status) &&
      entry.serviceStage &&
      known.has(entry.serviceStage)
    )
      continue;
    const key = ["archived", "closed", "resolved"].includes(entry.status)
      ? entry.status
      : (entry.serviceStage ?? entry.status);
    const label = names[key] ?? key;
    if (
      !result.some(
        (r) =>
          r.label === label && Date.parse(r.at) === Date.parse(entry.changedAt),
      )
    )
      add(label, entry.changedAt);
  }
  result.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (item.incidentType === "accident")
    add(
      "ДТП",
      item.accidentDetails?.occurredAt ?? item.occurredAt ?? undefined,
    );
  add("План начала", d?.plannedRepairDate, true);
  return result;
}
