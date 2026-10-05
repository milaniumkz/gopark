import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { getConfig } from "../../config.js";
import { makeAuthRateLimitRepository } from "../../common/application/repository.factory.js";
import type {
  AuthRateLimitAction,
  AuthRateLimitRepository,
} from "../../common/repositories/index.js";
import {
  type AuthRateLimitRequest,
  resolveAuthClientIp,
} from "./auth-rate-limit.request.js";

type AuthRateLimitPolicy = {
  attempts: number;
  windowSeconds: number;
  blockSeconds: number;
};

@Injectable()
export class AuthRateLimitService {
  private readonly repository: AuthRateLimitRepository = makeAuthRateLimitRepository();

  async assertLoginAllowed(request: AuthRateLimitRequest, login: string): Promise<void> {
    void request;
    void login;
  }

  async registerLoginFailure(request: AuthRateLimitRequest, login: string): Promise<void> {
    void request;
    void login;
  }

  async consumeRefreshAttempt(request: AuthRateLimitRequest): Promise<void> {
    await this.registerAttempt("auth_refresh_ip", hashRateLimitKey("ip", resolveAuthClientIp(request)));
  }

  async consumeLogoutAttempt(request: AuthRateLimitRequest): Promise<void> {
    await this.registerAttempt("auth_logout_ip", hashRateLimitKey("ip", resolveAuthClientIp(request)));
  }

  private async assertNotBlocked(action: AuthRateLimitAction, keyHash: string): Promise<void> {
    const retryAfterSeconds = await this.repository.getRetryAfterSeconds(action, keyHash, new Date());
    if (retryAfterSeconds != null) {
      throwRateLimitExceeded(retryAfterSeconds);
    }
  }

  private async registerAttempt(action: AuthRateLimitAction, keyHash: string): Promise<void> {
    const policy = getPolicy(action);
    const now = new Date();
    const decision = await this.repository.registerAttempt({
      action,
      keyHash,
      now,
      maxAttempts: policy.attempts,
      windowMs: policy.windowSeconds * 1000,
      blockMs: policy.blockSeconds * 1000,
    });

    if (decision.blocked) {
      throwRateLimitExceeded(decision.retryAfterSeconds);
    }
  }
}

function getPolicy(action: AuthRateLimitAction): AuthRateLimitPolicy {
  const config = getConfig();

  switch (action) {
    case "auth_login_ip":
    case "auth_login_identifier":
      return {
        attempts: config.authLoginRateLimitAttempts,
        windowSeconds: config.authLoginRateLimitWindowSeconds,
        blockSeconds: config.authLoginRateLimitBlockSeconds,
      };
    case "auth_refresh_ip":
      return {
        attempts: config.authRefreshRateLimitAttempts,
        windowSeconds: config.authRefreshRateLimitWindowSeconds,
        blockSeconds: config.authRefreshRateLimitBlockSeconds,
      };
    case "auth_logout_ip":
      return {
        attempts: config.authLogoutRateLimitAttempts,
        windowSeconds: config.authLogoutRateLimitWindowSeconds,
        blockSeconds: config.authLogoutRateLimitBlockSeconds,
      };
  }
}

function hashRateLimitKey(kind: string, value: string): string {
  return createHash("sha256")
    .update(`${kind}:${value}`)
    .digest("hex");
}

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function throwRateLimitExceeded(retryAfterSeconds: number): never {
  throw new HttpException(
    `Too many authentication attempts. Retry after ${retryAfterSeconds} seconds.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
