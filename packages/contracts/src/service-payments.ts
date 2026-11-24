import type { ServiceRepairDetails } from "./manager-app.js";
/** A paid insurance confirmation settles the known balance once, without
 * inventing a date or changing existing receipts. Legacy flags are projected
 * on read; the amount is frozen when the case is next saved. */
export function normalizeServicePayments(
  input: ServiceRepairDetails,
): ServiceRepairDetails {
  const insurance = input.insurance;
  if (
    !insurance?.paid ||
    !insurance.paidAt ||
    !Number.isFinite(Date.parse(insurance.paidAt)) ||
    !["nsk", "alma", "gosstrakh"].includes(insurance.insurer) ||
    !Number.isFinite(input.serviceCost) ||
    input.serviceCost! < 0 ||
    !Array.isArray(input.payments ?? [])
  )
    return input;
  const payments = [...(input.payments ?? [])];
  const other = payments
    .filter((p) => p.payer !== "insurance")
    .reduce((s, p) => s + p.amount, 0);
  const insured = payments
    .filter((p) => p.payer === "insurance")
    .reduce((s, p) => s + p.amount, 0);
  const confirmed =
    insurance.confirmedAmount ??
    Math.round(Math.max(0, input.serviceCost! - other) * 100) / 100;
  if (!Number.isFinite(confirmed) || confirmed < 0) return input;
  const difference = Math.round((confirmed - insured) * 100) / 100;
  if (difference > 0)
    payments.push({
      id: `insurance-confirmed:${insurance.insurer}:${insurance.paidAt}:${confirmed}`,
      payer: "insurance",
      insurer: insurance.insurer,
      amount: difference,
      paidAt: insurance.paidAt,
    });
  return {
    ...input,
    insurance: { ...insurance, confirmedAmount: confirmed },
    payments,
  };
}
