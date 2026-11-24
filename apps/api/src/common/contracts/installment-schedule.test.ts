import assert from "node:assert/strict";
import test from "node:test";
import { buildInstallmentSchedule } from "./installment-schedule.js";
import { openPrincipalAmount } from "./principal-debt.js";

test("daily payment is respected and final partial payment makes the principal exact", () => {
  for (const daily of [1700, 2200, 2300, 3000, 0.03]) {
    const total = daily === 0.03 ? 0.1 : 10001;
    const dates = Array.from({ length: Math.ceil(total / daily) + 2 }, (_, i) => String(i));
    const rows = buildInstallmentSchedule(dates, total, daily);
    assert.equal(rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0), Math.round(total * 100));
    assert.ok(rows.every(r => r.amount > 0 && r.amount <= daily));
    assert.equal(rows.length, Math.ceil(total / daily));
  }
});

test("a short schedule and invalid amounts cannot silently undercharge a contract", () => {
  assert.throws(() => buildInstallmentSchedule(["2026-11-05"], 5000, 2300), /не покрывает/);
  assert.throws(() => buildInstallmentSchedule([], 100, 50), /не покрывает/);
  for (const value of [0, -1, NaN, Infinity]) assert.throws(() => buildInstallmentSchedule(["date"], 100, value));
});

test("principal debt excludes extras and never goes below zero after payment", () => {
  assert.equal(openPrincipalAmount("installment", { installmentAmount: 2200, gpsAmount: 100 }, 2300, 500), 1700);
  assert.equal(openPrincipalAmount("installment", null, 2200, 3000), 0);
  assert.equal(openPrincipalAmount("insurance", null, 1000, 0), 0);
  assert.equal(openPrincipalAmount("gps", null, 300, 0), 0);
});
