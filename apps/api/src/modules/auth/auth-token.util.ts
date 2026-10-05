import { createHmac, timingSafeEqual } from "node:crypto";
import type { TokenPair, UserRole } from "@gopark/contracts";
import { getConfig } from "../../config.js";

const DEV_AUTH_TOKEN_SECRET = "gopark-dev-auth-secret";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 12;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export type AuthTokenKind = "access" | "refresh";

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  kind: AuthTokenKind;
  iat: number;
  exp: number;
  sessionVersion?: number;
  customRoleKey?: string | null;
  managerLevel?: "regular" | "senior" | null;
  companyName?: string | null;
  mustChangePassword?: boolean;
}

export function issueTokenPair(
  requestUserId: string,
  requestUserRole: UserRole,
  refreshSessionVersion: number,
  companyName?: string | null,
  mustChangePassword = false,
  managerLevel?: "regular" | "senior" | null,
  customRoleKey?: string | null,
): TokenPair {
  return {
    accessToken: signAuthToken(
      requestUserId,
      requestUserRole,
      "access",
      ACCESS_TOKEN_TTL_SECONDS,
      {
        customRoleKey: customRoleKey ?? null,
        managerLevel: managerLevel ?? null,
        companyName: companyName ?? null,
        mustChangePassword,
      },
    ),
    refreshToken: signAuthToken(
      requestUserId,
      requestUserRole,
      "refresh",
      REFRESH_TOKEN_TTL_SECONDS,
      {
        sessionVersion: refreshSessionVersion,
        customRoleKey: customRoleKey ?? null,
        managerLevel: managerLevel ?? null,
        companyName: companyName ?? null,
        mustChangePassword,
      },
    ),
    expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    requestUserId,
    requestUserRole,
    customRoleKey: customRoleKey ?? null,
    managerLevel: managerLevel ?? null,
    companyName: companyName ?? null,
    mustChangePassword,
  };
}

export function verifyAccessToken(token: string): AuthTokenPayload | null {
  return verifyAuthToken(token, "access");
}

export function verifyRefreshToken(token: string): AuthTokenPayload | null {
  return verifyAuthToken(token, "refresh");
}

export function isAuthTokenSecretConfigured(): boolean {
  return Boolean(getConfig().authTokenSecret);
}

function signAuthToken(
  requestUserId: string,
  requestUserRole: UserRole,
  kind: AuthTokenKind,
  ttlSeconds: number,
  extraPayload: Partial<AuthTokenPayload> = {},
): string {
  const secret = getAuthTokenSecret();
  const header = base64UrlEncode(JSON.stringify({
    alg: "HS256",
    typ: "JWT",
  }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    sub: requestUserId,
    role: requestUserRole,
    kind,
    iat: now,
    exp: now + ttlSeconds,
    ...extraPayload,
  } satisfies AuthTokenPayload));
  const signature = sign(`${header}.${payload}`, secret);

  return `${header}.${payload}.${signature}`;
}

function verifyAuthToken(token: string, expectedKind: AuthTokenKind): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const secret = getAuthTokenSecret();
  const expectedSignature = sign(`${header}.${payload}`, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as Partial<AuthTokenPayload>;
    const hasValidSessionVersion =
      decoded.kind === "access"
      || typeof decoded.sessionVersion === "number";

    if (
      typeof decoded.sub !== "string"
      || typeof decoded.role !== "string"
      || (decoded.kind !== "access" && decoded.kind !== "refresh")
      || typeof decoded.iat !== "number"
      || typeof decoded.exp !== "number"
      || !hasValidSessionVersion
    ) {
      return null;
    }

    if (decoded.kind !== expectedKind || decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded as AuthTokenPayload;
  } catch {
    return null;
  }
}

function getAuthTokenSecret(): string {
  const config = getConfig();
  if (config.authTokenSecret) {
    return config.authTokenSecret;
  }

  if (config.nodeEnv !== "production") {
    return DEV_AUTH_TOKEN_SECRET;
  }

  throw new Error("Missing AUTH_TOKEN_SECRET for production bearer auth");
}

function sign(input: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(input).digest());
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const normalized = input
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}
