import { BadRequestException } from "@nestjs/common";

/** Allocate the financed principal exactly; extras are billed separately. */
export function buildInstallmentSchedule(
  dueDates: string[],
  financedAmount: number,
  installmentAmount: number,
): Array<{ dueDate: string; amount: number }> {
  const total = Math.round(financedAmount * 100);
  const daily = Math.round(installmentAmount * 100);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(daily) || total <= 0 || daily <= 0) {
    throw new BadRequestException("Сумма договора и ежедневный платёж должны быть больше нуля.");
  }
  if (dueDates.length * daily < total) {
    throw new BadRequestException("График не покрывает сумму договора. Увеличьте срок с учётом выходных или ежедневный платёж.");
  }
  let remaining = total;
  const schedule: Array<{ dueDate: string; amount: number }> = [];
  for (const dueDate of dueDates) {
    if (remaining === 0) break;
    const amount = Math.min(remaining, daily);
    schedule.push({ dueDate, amount: amount / 100 });
    remaining -= amount;
  }
  return schedule;
}
