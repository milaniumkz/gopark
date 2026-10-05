export interface AuthRateLimitRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string | null;
  };
}

export function resolveAuthClientIp(request: AuthRateLimitRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  const headerValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const forwardedChain = headerValue
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const candidate = forwardedChain?.at(-1)
    || request.ip?.trim()
    || request.socket?.remoteAddress?.trim()
    || "unknown";

  return candidate.replace(/^::ffff:/, "");
}
