import assert from "node:assert/strict";
import test from "node:test";
import { calculateContractEndDate, getContractTerm, formatContractTerm } from "../src/lib/contract-term.js";

test("term uses calendar months and remaining days with both payment dates included", () => {
  assert.deepEqual(getContractTerm("2026-11-05", "2030-04-18"), { months: 41, days: 14 });
  assert.deepEqual(getContractTerm("2026-11-05", "2030-04-17"), { months: 41, days: 13 });
  assert.equal(formatContractTerm("2026-11-05", "2029-11-04"), "36 мес.");
  assert.equal(formatContractTerm("2026-11-05", "2026-11-05"), "1 дн.");
  assert.deepEqual(getContractTerm("2028-01-31", "2028-02-28"), { months: 1, days: 0 });
  assert.equal(getContractTerm("2026-02-30", "2026-03-01"), null);
  assert.equal(getContractTerm("2026-11-06", "2026-11-05"), null);
});

test("deadline accounts for all weekly rest days and a partial final payment", () => {
  assert.equal(calculateContractEndDate("2026-11-05", 2484000, 2300, "sunday"), "2030-04-17");
  assert.equal(calculateContractEndDate("2026-11-05", 2484000, 2300), "2029-10-19");
  assert.equal(calculateContractEndDate("2026-11-08", 100, 50, "sunday"), "2026-11-10");
  assert.equal(calculateContractEndDate("2026-11-05", 0.1, 0.03), "2026-11-08");
});
