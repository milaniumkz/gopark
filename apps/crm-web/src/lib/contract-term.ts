/** Contract dates include both the first and last day, just like the payment calendar. */
export function getContractTerm(startDate?: string | null, endDate?: string | null): { months: number; days: number } | null {
  const parse = (value?: string | null): Date | null => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  };
  const start = parse(startDate);
  const end = parse(endDate);
  if (!start || !end || end < start) return null;
  const exclusiveEnd = new Date(end);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  const anniversary = (months: number): Date => {
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return first;
  };
  let months = (exclusiveEnd.getUTCFullYear() - start.getUTCFullYear()) * 12 + exclusiveEnd.getUTCMonth() - start.getUTCMonth();
  if (anniversary(months) > exclusiveEnd) months -= 1;
  return { months, days: Math.round((exclusiveEnd.getTime() - anniversary(months).getTime()) / 86400000) };
}

export function formatContractTerm(startDate?: string | null, endDate?: string | null): string {
  const term = getContractTerm(startDate, endDate);
  if (!term) return "—";
  return [term.months > 0 ? `${term.months} мес.` : "", term.days > 0 ? `${term.days} дн.` : ""].filter(Boolean).join(" ");
}

export function calculateContractEndDate(startDate: string, financedAmount: number, dailyAmount: number, weeklyDayOff?: string | null): string {
  const total = Math.round(financedAmount * 100);
  const daily = Math.round(dailyAmount * 100);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(daily) || total <= 0 || daily <= 0 || !getContractTerm(startDate, startDate)) return "";
  const count = Math.ceil(total / daily);
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const off = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weeklyDayOff ?? "");
  if (off < 0) cursor.setUTCDate(cursor.getUTCDate() + count - 1);
  else {
    if (cursor.getUTCDay() === off) cursor.setUTCDate(cursor.getUTCDate() + 1);
    const remaining = count - 1;
    cursor.setUTCDate(cursor.getUTCDate() + Math.floor(remaining / 6) * 7);
    for (let days = remaining % 6; days > 0;) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (cursor.getUTCDay() !== off) days -= 1;
    }
  }
  return Number.isFinite(cursor.getTime()) && cursor.getUTCFullYear() <= 9999 ? cursor.toISOString().slice(0, 10) : "";
}
