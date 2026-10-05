import { randomBytes, timingSafeEqual, scryptSync } from "node:crypto";

export function verifyPassword(
  password: string,
  passwordHash?: string | null,
  legacyPassword?: string | null,
): boolean {
  if (legacyPassword) {
    return password === legacyPassword;
  }

  if (!passwordHash) {
    return false;
  }

  if (!passwordHash.startsWith("scrypt$")) {
    return password === passwordHash;
  }

  const [, cost, blockSize, parallelization, salt, expectedHash] = passwordHash.split("$");
  if (!cost || !blockSize || !parallelization || !salt || !expectedHash) {
    return false;
  }

  const derived = scryptSync(password, salt, Buffer.from(expectedHash, "hex").length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  });
  const expected = Buffer.from(expectedHash, "hex");

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const hash = scryptSync(password, salt, 64, {
    N: cost,
    r: blockSize,
    p: parallelization,
  }).toString("hex");

  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt}$${hash}`;
}
