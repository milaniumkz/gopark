import test from "node:test";
import assert from "node:assert/strict";
import { nextContractNumber } from "./contract-number.js";

test("continues existing numeric contracts after 55, preserving legacy series", () => {
  assert.equal(nextContractNumber(["GP-2025-0001", "GP-2025-0002", "1", "2", "3", "4", "6", "55"]), "56");
});
test("starts at one, ignores nonnumeric formats and compares numbers numerically", () => {
  assert.equal(nextContractNumber([]), "1");
  assert.equal(nextContractNumber(["9", "10", "0002", "GP-9999-9999", "12-test", " 20 "]), "21");
});
test("keeps precision for large contract numbers", () => {
  assert.equal(nextContractNumber(["99999999999999999999"]), "100000000000000000000");
});
