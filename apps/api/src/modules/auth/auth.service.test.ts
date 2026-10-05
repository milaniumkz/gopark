import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "./auth.service.js";
import { verifyRefreshToken } from "./auth-token.util.js";
import { seedUsers } from "../../data/seed.js";

const originalAuthTokenSecret = process.env.AUTH_TOKEN_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

function resetSeedUsers() {
  for (const user of seedUsers) {
    user.refreshTokenVersion = 0;
    user.status = "active";
  }
}

test("refresh rotates session version and invalidates previous refresh token", async () => {
  process.env.AUTH_TOKEN_SECRET = "auth-service-test-secret";
  process.env.NODE_ENV = "test";
  resetSeedUsers();

  const service = new AuthService();
  const login = await service.login({
    login: "admin@gopark.local",
    password: "admin123",
  });

  const issuedToken = verifyRefreshToken(login.refreshToken);
  assert.equal(issuedToken?.sessionVersion, 1);

  const rotated = await service.refresh({
    refreshToken: login.refreshToken,
  });

  const rotatedToken = verifyRefreshToken(rotated.refreshToken);
  assert.equal(rotatedToken?.sessionVersion, 2);

  await assert.rejects(
    () => service.refresh({ refreshToken: login.refreshToken }),
    (error) => {
      assert.match(String(error), /Invalid refresh token/);
      return true;
    },
  );
});

test("logout revokes active refresh token", async () => {
  process.env.AUTH_TOKEN_SECRET = "auth-service-test-secret";
  process.env.NODE_ENV = "test";
  resetSeedUsers();

  const service = new AuthService();
  const login = await service.login({
    login: "+996555123456",
    password: "driver123",
  });

  const result = await service.logout({
    refreshToken: login.refreshToken,
  });

  assert.deepEqual(result, { revoked: true });

  await assert.rejects(
    () => service.refresh({ refreshToken: login.refreshToken }),
    (error) => {
      assert.match(String(error), /Invalid refresh token/);
      return true;
    },
  );
});

test("login rejects blocked users", async () => {
  process.env.AUTH_TOKEN_SECRET = "auth-service-test-secret";
  process.env.NODE_ENV = "test";
  resetSeedUsers();
  const manager = seedUsers.find((item) => item.login === "manager@gopark.local");
  assert.ok(manager);
  manager.status = "blocked";

  const service = new AuthService();

  await assert.rejects(
    () => service.login({ login: "manager@gopark.local", password: "manager123" }),
    (error) => {
      assert.match(String(error), /Invalid credentials/);
      return true;
    },
  );
});

test.after(() => {
  resetSeedUsers();
  if (originalAuthTokenSecret == null) {
    delete process.env.AUTH_TOKEN_SECRET;
  } else {
    process.env.AUTH_TOKEN_SECRET = originalAuthTokenSecret;
  }

  if (originalNodeEnv == null) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});
