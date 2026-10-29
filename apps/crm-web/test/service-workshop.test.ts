import test from "node:test";
import assert from "node:assert/strict";
import type { ServiceRepairDetails } from "@gopark/contracts";
import {
  serviceCardDates,
  workOrderAmount,
  workOrderProfit,
  workshopFinance,
  workshopPayment,
  workshopPayments,
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

test("small partial receipts settle both workshop balances exactly after rounding", () => {
  const d: ServiceRepairDetails = {
    reason: "Test",
    workshop: "both",
    serviceCost: 0.02,
    paintingCost: 0.01,
    repairCost: 0.01,
    payments: [
      { id: "1", payer: "driver", amount: 0.01, paidAt: "2026-10-01" },
      { id: "2", payer: "driver", amount: 0.01, paidAt: "2026-10-01" },
    ],
  };
  for (const shop of ["main", "body"] as const) {
    const totals = workshopFinance(d, shop);
    assert.equal(totals.paid, totals.cost);
    assert.equal(
      workshopPayments(d, shop).reduce((s, p) => s + p.amount, 0),
      totals.paid,
    );
  }
});

test("service price produces 30% profit without adding that profit to the invoice", () => {
  const row = {
    id: "r",
    description: "Service",
    category: "repair" as const,
    serviceAmount: 1000,
    laborAmount: 0,
  };
  assert.equal(workOrderAmount(row), 1000);
  assert.equal(workOrderProfit(row), 300);
  assert.equal(workOrderAmount({ ...row, serviceAmount: 0 }), 0);
  assert.equal(workOrderProfit({ ...row, serviceAmount: 0 }), 0);
  assert.equal(
    workOrderProfit({
      ...row,
      serviceAmount: undefined,
      laborAmount: undefined,
    }),
    undefined,
  );
  assert.equal(workOrderProfit({ ...row, serviceAmount: 100.01 }), 30);
});
test("historic work components retain their combined price and profit", () => {
  const row = {
    id: "r",
    description: "Historic",
    category: "painting" as const,
    serviceAmount: 700,
    laborAmount: 300,
  };
  assert.equal(workOrderAmount(row), 1000);
  assert.equal(workOrderProfit(row), 300);
  assert.equal(
    workOrderAmount({
      ...row,
      serviceAmount: undefined,
      laborAmount: undefined,
      amount: 1250,
    }),
    1250,
  );
});

test("collapsed cards show known stage dates and history without inventing missing dates", () => {
  const item = {
    id: "i",
    title: "Test",
    incidentType: "repair",
    status: "archived",
    priority: "high",
    serviceDetails: {
      reason: "Test",
      sentAt: "2026-10-01T08:00:00Z",
      repairStartedAt: "2026-10-02T08:00:00Z",
      plannedRepairDate: "2026-10-02",
    },
    statusHistory: [
      {
        serviceStage: "in_repair",
        status: "open",
        changedAt: "2026-10-02T08:00:01Z",
      },
      {
        serviceStage: "completed",
        status: "archived",
        changedAt: "2026-10-03T08:00:00Z",
      },
    ],
  };
  const dates = serviceCardDates(item);
  assert.deepEqual(
    dates.map((x) => x.label),
    ["Отправлен на СТО", "Начало ремонта", "Архив", "План начала"],
  );
  assert.ok(dates.every((x) => x.at));
  assert.equal(
    serviceCardDates({ ...item, serviceDetails: undefined, statusHistory: [] })
      .length,
    0,
  );
});

test("painting profit is entered manually, main profit remains automatic and neither changes the bill", () => {
  const work = {
    id: "p",
    description: "Paint",
    category: "painting" as const,
    serviceAmount: 1000,
    laborAmount: 0,
    profitAmount: 170,
  };
  assert.equal(workOrderProfit(work, "body"), 170);
  assert.equal(workOrderProfit(work, "main"), 300);
  assert.equal(
    workshopFinance(
      {
        reason: "Test",
        workshop: "body",
        serviceCost: 1000,
        orderItems: [work],
      },
      "body",
    ).profit,
    170,
  );
  const shared = {
    reason: "Test",
    workshop: "both" as const,
    serviceCost: 2000,
    orderItems: [
      work,
      { ...work, id: "r", category: "repair" as const, profitAmount: 900 },
    ],
  };
  assert.equal(workshopFinance(shared, "body").profit, 170);
  assert.equal(workshopFinance(shared, "main").profit, 300);
  assert.equal(
    workshopFinance(shared, "body").cost + workshopFinance(shared, "main").cost,
    2000,
  );
});
