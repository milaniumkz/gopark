/** Debt on the vehicle principal. Insurance/GPS stay in their own schedule entries. */
export function openPrincipalAmount(type: string, metadata: unknown, amount: number, paidAmount: number): number {
  if (type !== "installment") return 0;
  const breakdown = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown> : {};
  const principal = typeof breakdown.installmentAmount === "number" ? breakdown.installmentAmount : amount;
  return Math.max(0, principal - Math.max(0, paidAmount));
}
