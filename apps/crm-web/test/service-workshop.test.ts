import test from "node:test";
import assert from "node:assert/strict";
import type { ServiceRepairDetails } from "@gopark/contracts";
import {
  workshopFinance,
  workshopPayment,
} from "../src/pages/service-workshop.js";
test("a workshop receives only its own cases, including full legacy single-workshop quotes", () => {
  const d: ServiceRepairDetails = {
    reason: "Test",
    workshop: "main",
    serviceCost: 1200,
    expenses: [
      { id: "e", description: "Materials", amount: 200, purchaser: "sto" },
    ],
    payments: [{ id: "p", payer: "driver", amount: 600, paidAt: "2026-10-01" }],
  };
  assert.deepEqual(workshopFinance(d, "main"), {
    base: 1000,
    cost: 1200,
    paid: 600,
    profit: 300,
    known: true,
  });
  assert.equal(workshopFinance(d, "body").cost, 0);
});
test("two workshops split fees, shared expenses and receipts without counting money twice", () => {
  const d: ServiceRepairDetails = {
    reason: "Test",
    workshop: "both",
    serviceCost: 3300,
    orderItems: [
      {
        id: "a",
        description: "Paint",
        category: "painting",
        serviceAmount: 1000,
        laborAmount: 1000,
      },
      {
        id: "b",
        description: "Repair",
        category: "repair",
        serviceAmount: 600,
        laborAmount: 400,
      },
    ],
    expenses: [
      { id: "e", description: "Materials", amount: 300, purchaser: "sto" },
      { id: "x", description: "Part", amount: 900, purchaser: "company" },
    ],
    payments: [
      { id: "p", payer: "driver", amount: 1500, paidAt: "2026-10-01" },
    ],
  };
  assert.deepEqual(workshopFinance(d, "body"), {
    base: 2000,
    cost: 2200,
    paid: 1000,
    profit: 600,
    known: true,
  });
  assert.deepEqual(workshopFinance(d, "main"), {
    base: 1000,
    cost: 1100,
    paid: 500,
    profit: 300,
    known: true,
  });
  for (const amount of [0.01, 0.02, 100.01, 1500])
    assert.equal(
      Math.round(
        (workshopPayment(d, "body", amount) +
          workshopPayment(d, "main", amount)) *
          100,
      ),
      Math.round(amount * 100),
    );
});
test("an unsplit shared case has no invented allocation or profit", () => {
  const d: ServiceRepairDetails = {
    reason: "Test",
    workshop: "both",
    serviceCost: 900,
  };
  for (const shop of ["main", "body"] as const)
    assert.deepEqual(workshopFinance(d, shop), {
      base: 0,
      cost: 0,
      paid: 0,
      profit: 0,
      known: false,
    });
});
test("a shared case with work only in one workshop allocates nothing to the other", () => {
  const d: ServiceRepairDetails = {
    reason: "Test",
    workshop: "both",
    serviceCost: 100,
    paintingCost: 100,
    repairCost: 0,
  };
  assert.equal(workshopFinance(d, "body").cost, 100);
  assert.equal(workshopFinance(d, "main").cost, 0);
});
