import type { RequestUser } from "./request-user.js";

export function getScopedCompanyName(currentUser: RequestUser | null | undefined): string | null {
  const companyName = currentUser?.companyName?.trim();
  return companyName ? companyName : null;
}

export function matchesCompanyScope(
  currentUser: RequestUser | null | undefined,
  companyName?: string | null,
): boolean {
  const scopedCompanyName = getScopedCompanyName(currentUser);
  if (!scopedCompanyName) {
    return true;
  }

  return (companyName?.trim() || null) === scopedCompanyName;
}
