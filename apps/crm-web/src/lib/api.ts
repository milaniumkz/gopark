import { loadCrmSession, refreshCrmSession, resetCrmSessionForUnauthorized } from "./auth";
import { localizeApiError } from "./errors";

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

async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const session = loadCrmSession();
  if (!session) {
    throw new Error("Сессия истекла. Войдите заново.");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
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
    return await fetch(buildUrl(path), {
      ...init,
      headers: buildAuthHeadersForToken(refreshedSession.accessToken, init.headers),
    });
  } catch (error) {
    throw new Error(localizeApiError(error instanceof Error ? error.message : String(error)));
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetchWithAuth(path);
  await ensureOk(response);

  return parseJsonOrNull<T>(response);
}

export async function fetchJsonWithQuery<T>(
  path: string,
  query: Record<string, string>,
): Promise<T> {
  const search = new URLSearchParams(query).toString();
  const response = await fetchWithAuth(`${path}${search ? `?${search}` : ""}`);

  await ensureOk(response);

  return parseJsonOrNull<T>(response);
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
