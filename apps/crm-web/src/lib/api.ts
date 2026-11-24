import { loadCrmSession, refreshCrmSession, resetCrmSessionForUnauthorized } from "./auth";
import { localizeApiError } from "./errors";
import { ReadCache } from "./read-cache";
const reads = new ReadCache();
export function readSessionKey(): string { return loadCrmSession()?.accessToken ?? ""; }
export function cachedJson<T>(path: string): T | undefined { return reads.snapshot<T>(readSessionKey(), path); }

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

function buildUrl(path: string): string {
  return `${apiBaseUrl}/${path}`;
}

async function ensureOk(response: Response): Promise<void> {
  if (response.status === 401) {
    resetCrmSessionForUnauthorized();
    throw new Error("Сессия истекла. Войдите заново.");
  }

  if (!response.ok) {
    const text = await response.text();
    if (text.trim()) {
      try {
        const payload = JSON.parse(text) as { message?: string | string[]; error?: string };
        const message = Array.isArray(payload.message) ? payload.message.join("; ") : payload.message;
        if (message) {
          throw new Error(localizeApiError(message, response.status));
        }
        if (payload.error) {
          throw new Error(localizeApiError(payload.error, response.status));
        }
      } catch (error) {
        if (error instanceof Error && !error.message.startsWith("Unexpected token") && error.message !== "Unexpected end of JSON input") {
          throw error;
        }
      }
    }

    throw new Error(localizeApiError("", response.status));
  }
}

async function parseJsonOrNull<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

function buildAuthHeaders(extraHeaders?: HeadersInit): HeadersInit {
  const session = loadCrmSession();
  if (!session) {
    throw new Error("Сессия истекла. Войдите заново.");
  }

  return buildAuthHeadersForToken(session.accessToken, extraHeaders);
}

function buildAuthHeadersForToken(accessToken: string, extraHeaders?: HeadersInit): HeadersInit {
  return {
    ...(extraHeaders ?? {}),
    authorization: `Bearer ${accessToken}`,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  if (init.method && init.method !== "GET") return fetch(url, init);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(20_000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("Сервер не ответил. Проверьте соединение и повторите загрузку.");
    throw error;
  }
}

async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const mutation = !!init.method && init.method !== "GET";
  if (mutation) reads.invalidate();
  try { return await sendWithAuth(path, init); }
  finally { if (mutation) reads.invalidate(); }
}

async function sendWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const session = loadCrmSession();
  if (!session) {
    throw new Error("Сессия истекла. Войдите заново.");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(buildUrl(path), {
      ...init,
      headers: buildAuthHeadersForToken(session.accessToken, init.headers),
    });
  } catch (error) {
    throw new Error(localizeApiError(error instanceof Error ? error.message : String(error)));
  }

  if (response.status !== 401) {
    return response;
  }

  const refreshedSession = await refreshCrmSession(session);
  if (!refreshedSession) {
    resetCrmSessionForUnauthorized();
    throw new Error("Сессия истекла. Войдите заново.");
  }

  try {
    return await fetchWithTimeout(buildUrl(path), {
      ...init,
      headers: buildAuthHeadersForToken(refreshedSession.accessToken, init.headers),
    });
  } catch (error) {
    throw new Error(localizeApiError(error instanceof Error ? error.message : String(error)));
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  return reads.read<T>(readSessionKey(), path, async () => {
    const response = await fetchWithAuth(path);
    await ensureOk(response);
    return parseJsonOrNull<T>(response);
  });
}

export async function fetchJsonWithQuery<T>(
  path: string,
  query: Record<string, string>,
): Promise<T> {
  const search = new URLSearchParams(query).toString();
  return fetchJson<T>(`${path}${search ? `?${search}` : ""}`);
}

export async function postJson<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  const response = await fetchWithAuth(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await ensureOk(response);

  return parseJsonOrNull<TResponse>(response);
}

export async function patchJson<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  const response = await fetchWithAuth(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await ensureOk(response);

  return parseJsonOrNull<TResponse>(response);
}
