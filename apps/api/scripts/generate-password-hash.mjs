import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/generate-password-hash.mjs <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const N = 16384;
const r = 8;
const p = 1;
const derived = scryptSync(password, salt, 64, { N, r, p }).toString("hex");

console.log(`scrypt$${N}$${r}$${p}$${salt}$${derived}`);
