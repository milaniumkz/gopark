export function decimalToNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  return 0;
}

export function toDateOnly(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

export function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function joinName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
