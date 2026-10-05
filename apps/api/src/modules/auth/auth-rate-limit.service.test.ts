import test from "node:test";
import assert from "node:assert/strict";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { resolveAuthClientIp } from "./auth-rate-limit.request.js";

const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  loginAttempts: process.env.AUTH_LOGIN_RATE_LIMIT_ATTEMPTS,
  loginWindow: process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
  loginBlock: process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS,
  refreshAttempts: process.env.AUTH_REFRESH_RATE_LIMIT_ATTEMPTS,
  refreshWindow: process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS,
  refreshBlock: process.env.AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS,
};

function setTightRateLimitEnv(): void {
  delete process.env.DATABASE_URL;
  process.env.AUTH_LOGIN_RATE_LIMIT_ATTEMPTS = "2";
  process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS = "120";
  process.env.AUTH_REFRESH_RATE_LIMIT_ATTEMPTS = "1";
  process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS = "120";
}

test("login failures block by client ip and login identifier", async () => {
  setTightRateLimitEnv();
  const service = new AuthRateLimitService();
  const request = {
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  };

  await service.assertLoginAllowed(request, "admin@gopark.local");
  await service.registerLoginFailure(request, "admin@gopark.local");

  await service.assertLoginAllowed(request, "admin@gopark.local");
  await service.registerLoginFailure(request, "admin@gopark.local");

  await service.assertLoginAllowed(request, "admin@gopark.local");
  await assert.rejects(
    () => service.registerLoginFailure(request, "admin@gopark.local"),
    (error) => {
      assert.match(String(error), /Too many authentication attempts/);
      return true;
    },
  );

  await assert.rejects(
    () => service.assertLoginAllowed(request, "admin@gopark.local"),
    (error) => {
      assert.match(String(error), /Too many authentication attempts/);
      return true;
    },
  );
});

test("refresh attempts are rate-limited by client ip", async () => {
  setTightRateLimitEnv();
  const service = new AuthRateLimitService();
  const request = {
    headers: {
      "x-forwarded-for": "203.0.113.11",
    },
  };

  await service.consumeRefreshAttempt(request);

  await assert.rejects(
    () => service.consumeRefreshAttempt(request),
    (error) => {
      assert.match(String(error), /Too many authentication attempts/);
      return true;
    },
  );
});

test("client ip resolver uses the last forwarded hop", () => {
  const resolved = resolveAuthClientIp({
    headers: {
      "x-forwarded-for": "198.51.100.1, 203.0.113.12",
    },
  });

  assert.equal(resolved, "203.0.113.12");
});

test.after(() => {
  restoreEnv("DATABASE_URL", originalEnv.databaseUrl);
  restoreEnv("AUTH_LOGIN_RATE_LIMIT_ATTEMPTS", originalEnv.loginAttempts);
  restoreEnv("AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS", originalEnv.loginWindow);
  restoreEnv("AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS", originalEnv.loginBlock);
  restoreEnv("AUTH_REFRESH_RATE_LIMIT_ATTEMPTS", originalEnv.refreshAttempts);
  restoreEnv("AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS", originalEnv.refreshWindow);
  restoreEnv("AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS", originalEnv.refreshBlock);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value == null) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
