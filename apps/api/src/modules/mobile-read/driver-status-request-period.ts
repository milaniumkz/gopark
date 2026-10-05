export interface DriverStatusRequestPeriodRange {
  startDate: string;
  endDate: string;
}

export function parseDriverStatusRequestPeriod(period: string): DriverStatusRequestPeriodRange | null {
  const normalized = period.trim();
  const rangeParts = normalized.split(" .. ").map((item) => item.trim());

  if (rangeParts.length === 2 && isDateOnly(rangeParts[0]) && isDateOnly(rangeParts[1])) {
    const [startDate, endDate] = rangeParts[0] <= rangeParts[1]
      ? rangeParts
      : [rangeParts[1], rangeParts[0]];

    return { startDate, endDate };
  }

  if (isDateOnly(normalized)) {
    return { startDate: normalized, endDate: normalized };
  }

  return null;
}

export function periodsOverlap(
  left: DriverStatusRequestPeriodRange,
  right: DriverStatusRequestPeriodRange,
): boolean {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
