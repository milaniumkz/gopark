/** Continue the numeric series across active and archived contracts. */
export function nextContractNumber(numbers: Iterable<string>): string {
  let maximum = 0n;
  for (const value of numbers) {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      const number = BigInt(normalized);
      if (number > maximum) maximum = number;
    }
  }
  return String(maximum + 1n);
}
