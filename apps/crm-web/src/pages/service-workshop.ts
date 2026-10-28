import type { ServiceRepairDetails } from "@gopark/contracts";
import { billableServiceExpenses, serviceFeeBase } from "@gopark/contracts";
type Shop = "main" | "body";
const money = (amount: number) => Math.round(amount * 100) / 100;
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
  const payments = (d.payments ?? []).reduce(
    (s, p) => s + workshopPayment(d, shop, p.amount),
    0,
  );
  if (d.workshop === shop) {
    const base = serviceFeeBase(d);
    return {
      base,
      cost: d.serviceCost ?? 0,
      paid: money(payments),
      profit: money(base * 0.3),
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
    profit: money(base * 0.3),
    known,
  };
}
