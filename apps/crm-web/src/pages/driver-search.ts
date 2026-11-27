const lookalikes: Record<string, string> = { А:'A', В:'B', Е:'E', К:'K', М:'M', Н:'H', О:'O', Р:'P', С:'C', Т:'T', У:'Y', Х:'X' };
export function normalizeDriverPlate(value: string): string {
  return value.toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, c => lookalikes[c]!).replace(/[^A-Z0-9]/g, '');
}
export function matchesDriverSearch(driver: {fullName: string; phone: string}, query: string, plates: string[]): boolean {
  const text = query.trim().toLowerCase();
  if (!text || driver.fullName.toLowerCase().includes(text) || driver.phone.includes(text)) return true;
  const plate = normalizeDriverPlate(query);
  return !!plate && plates.some(value => normalizeDriverPlate(value).includes(plate));
}
