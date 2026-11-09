import type { ObligationDebtSnapshot } from "../../common/repositories/obligation.repository.js";
import { decimalToNumber, toDateOnly } from "../prisma/prisma.utils.js";

/** Aggregate schedules without loading every daily row. Preserve the existing
 * car-preview (0) and payment-policy (1) offsets for deferred dates. */
export async function readPrincipalSummaries(
  prisma: any,
  inputs: Array<{contractId: string; driverId?: string}>,
  asOfDate: string,
  deferredShiftDays: 0 | 1,
): Promise<Map<string, ObligationDebtSnapshot & {hasDeferredPayment: boolean}>> {
  if (!inputs.length) return new Map();
  const scope = JSON.stringify([...new Map(inputs.map(i => [`${i.contractId}:${i.driverId ?? ""}`, {contract_id: i.contractId, driver_id: i.driverId ?? null}])).values()]);
  const rows = await prisma.$queryRaw`
    WITH amounts AS (
      SELECT o.contract_id, o.id, o.due_date::date AS original_date,
        CASE WHEN o.deferred_until IS NULL THEN o.due_date::date
          ELSE o.deferred_until::date + ${deferredShiftDays}::int END AS effective_date,
        o.deferred_until IS NOT NULL AS deferred,
        GREATEST(0, (CASE WHEN jsonb_typeof(o.metadata->'installmentAmount')='number'
          THEN (o.metadata->>'installmentAmount')::numeric ELSE o.amount END) - GREATEST(0,o.paid_amount)) AS remaining
      FROM obligations o
      JOIN contracts c ON c.id=o.contract_id AND c.status='active'
      JOIN jsonb_to_recordset(${scope}::jsonb) AS s(contract_id uuid,driver_id uuid)
        ON s.contract_id=o.contract_id AND (s.driver_id IS NULL OR s.driver_id=o.driver_id)
      WHERE o.type='installment'
    )
    SELECT contract_id, SUM(remaining) AS total,
      COALESCE(SUM(remaining) FILTER (WHERE effective_date < ${asOfDate}::date),0) AS overdue,
      MIN(effective_date) FILTER (WHERE effective_date < ${asOfDate}::date) AS overdue_from,
      MAX(effective_date) FILTER (WHERE effective_date < ${asOfDate}::date) AS overdue_to,
      MIN(effective_date) AS next_date,
      (array_agg(remaining ORDER BY effective_date,original_date,id))[1] AS next_amount,
      bool_or(deferred) AS deferred
    FROM amounts WHERE remaining>0 GROUP BY contract_id`;
  return new Map(rows.map((r: any) => [r.contract_id, {
    totalDebt: decimalToNumber(r.total), overdueDebt: decimalToNumber(r.overdue),
    overdueSinceDate: r.overdue_from ? toDateOnly(r.overdue_from) : null,
    overdueUntilDate: r.overdue_to ? toDateOnly(r.overdue_to) : null,
    nextPaymentDate: r.next_date ? toDateOnly(r.next_date) : null,
    nextPaymentAmount: decimalToNumber(r.next_amount), hasDeferredPayment: !!r.deferred,
  }]));
}
