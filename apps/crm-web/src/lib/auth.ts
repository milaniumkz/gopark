import type { TokenPair, UserRole } from "@gopark/contracts";
import { localizeApiError } from "./errors";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
const sessionStorageKey = "gopark.crm.session";
const allowedCrmRoles: UserRole[] = [
  "owner",
  "admin",
  "finance",
  "manager",
  "operator",
  "auditor",
];

export type CrmAuthSession = Omit<TokenPair, "requestUserRole"> & {
  requestUserRole: UserRole;
};

function buildUrl(path: string): string {
  return `${apiBaseUrl}/${path}`;
}

function isAllowedCrmRole(role: string): role is UserRole {
  return allowedCrmRoles.includes(role as UserRole);
}

export async function loginCrm(login: string, password: string): Promise<CrmAuthSession> {
  let response: Response;
  try {
    response = await fetch(buildUrl("auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ login, password }),
    });
  } catch (error) {
    throw new Error(localizeApiError(error instanceof Error ? error.message : String(error)));
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Неверный логин или пароль.");
    }
    let message = "";
    try {
      const payload = await response.json() as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? "";
    } catch (_) {}
    throw new Error(localizeApiError(message, response.status));
  }

  const session = await response.json() as CrmAuthSession;
  if (!isAllowedCrmRole(session.requestUserRole)) {
    throw new Error(`CRM недоступна для роли ${session.requestUserRole}`);
  }

  saveCrmSession(session);
  return session;
}

export async function refreshCrmSession(session: CrmAuthSession | null = loadCrmSession()): Promise<CrmAuthSession | null> {
  if (!session) {
    return null;
  }

  const response = await fetch(buildUrl("auth/refresh"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });

  if (!response.ok) {
    clearCrmSession();
    return null;
  }

  const refreshedSession = await response.json() as CrmAuthSession;
  if (!isAllowedCrmRole(refreshedSession.requestUserRole)) {
    clearCrmSession();
    return null;
  }

  saveCrmSession(refreshedSession);
  return refreshedSession;
}

export async function logoutCrm(session: CrmAuthSession | null = loadCrmSession()): Promise<void> {
  try {
    if (session) {
      await fetch(buildUrl("auth/logout"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
    }
  } finally {
    clearCrmSession();
  }
}

export function loadCrmSession(): CrmAuthSession | null {
  const raw = window.localStorage.getItem(sessionStorageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CrmAuthSession;
  } catch {
    window.localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

export function saveCrmSession(session: CrmAuthSession): void {
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearCrmSession(): void {
  window.localStorage.removeItem(sessionStorageKey);
}

export function resetCrmSessionForUnauthorized(): void {
  clearCrmSession();
  window.location.replace("/");
}
