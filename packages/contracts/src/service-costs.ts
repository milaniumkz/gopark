import type { ServiceRepairDetails } from "./manager-app.js";
const money = (v: number) => Math.round(v * 100) / 100;
export function billableServiceExpenses(
  d: ServiceRepairDetails | undefined | null,
): number {
  return money(
    (d?.expenses ?? [])
      .filter((e) => e.purchaser === "sto")
      .reduce((s, e) => s + (e.amount ?? 0), 0),
  );
}
/** Derive the bill from priced work rows and only the expenses purchased by STO. */
export function recalculateServiceCosts(
  input: ServiceRepairDetails,
  previous?: ServiceRepairDetails,
): ServiceRepairDetails {
  const result = { ...input };
  let base: number | undefined;
  if (input.orderItems !== undefined) {
    result.orderItems = input.orderItems.map((w) => ({
      ...w,
      amount:
        w.serviceAmount !== undefined || w.laborAmount !== undefined
          ? money((w.serviceAmount ?? 0) + (w.laborAmount ?? 0))
          : w.amount,
    }));
    result.paintingCost = money(
      result.orderItems
        .filter((w) => w.category === "painting")
        .reduce((s, w) => s + (w.amount ?? 0), 0),
    );
    result.repairCost = money(
      result.orderItems
        .filter((w) => w.category === "repair")
        .reduce((s, w) => s + (w.amount ?? 0), 0),
    );
    result.works = result.orderItems.map((w) => w.description.trim());
    base = money(result.paintingCost + result.repairCost);
  } else if (
    input.paintingCost !== undefined ||
    input.repairCost !== undefined
  ) {
    base = money((input.paintingCost ?? 0) + (input.repairCost ?? 0));
  }
  if (input.expenses !== undefined || base !== undefined) {
    base ??=
      input.serviceBaseCost ??
      previous?.serviceBaseCost ??
      (previous?.serviceCost !== undefined
        ? Math.max(0, previous.serviceCost - billableServiceExpenses(previous))
        : Math.max(
            0,
            (input.serviceCost ?? 0) - billableServiceExpenses(input),
          ));
    result.serviceBaseCost = money(base);
    result.serviceCost = money(base + billableServiceExpenses(input));
  }
  return result;
}
export function serviceFeeBase(
  d: ServiceRepairDetails | undefined | null,
): number {
  if (!d) return 0;
  return money(
    d.serviceBaseCost ??
      (d.paintingCost !== undefined || d.repairCost !== undefined
        ? (d.paintingCost ?? 0) + (d.repairCost ?? 0)
        : Math.max(0, (d.serviceCost ?? 0) - billableServiceExpenses(d))),
  );
}
export function serviceProfit(
  d: ServiceRepairDetails | undefined | null,
): number {
  return money(serviceFeeBase(d) * 0.3);
}
