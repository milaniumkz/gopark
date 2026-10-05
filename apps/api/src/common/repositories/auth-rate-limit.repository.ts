export type AuthRateLimitAction =
  | "auth_login_ip"
  | "auth_login_identifier"
  | "auth_refresh_ip"
  | "auth_logout_ip";

export interface RegisterAuthRateLimitAttemptInput {
  action: AuthRateLimitAction;
  keyHash: string;
  now: Date;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}

export interface AuthRateLimitDecision {
  blocked: boolean;
  retryAfterSeconds: number;
}

export interface AuthRateLimitRepository {
  getRetryAfterSeconds(action: AuthRateLimitAction, keyHash: string, now: Date): Promise<number | null>;
  registerAttempt(input: RegisterAuthRateLimitAttemptInput): Promise<AuthRateLimitDecision>;
}
