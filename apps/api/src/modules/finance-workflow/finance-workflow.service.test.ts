import test from "node:test";
import assert from "node:assert/strict";
import { FinanceWorkflowService } from "./finance-workflow.service.js";
import {
  seedContractDetails,
  seedContracts,
  seedDriverCreditBalances,
  seedLedger,
  seedObligations,
  seedPayments,
} from "../../data/seed.js";

function makeService(overrides?: {
  auditWrites?: Array<{ action: string; entityType: string; entityId: string | null }>;
  outboxCreates?: Array<{ topic: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }>;
}) {
  return new FinanceWorkflowService(
    {
      write: async (action: string, entityType: string, entityId: string | null) => {
        overrides?.auditWrites?.push({ action, entityType, entityId });
      },
    } as any,
    {
      createDriverPayoutRequested: async () => undefined,
      createDriverPayoutApproved: async () => undefined,
    } as any,
    {
      create: async (
        topic: string,
        aggregateType: string,
        aggregateId: string,
        payload: Record<string, unknown>,
      ) => {
        overrides?.outboxCreates?.push({ topic, aggregateType, aggregateId, payload });
      },
    } as any,
  );
}

test("registerPayment rejects non-positive amounts", async () => {
  const service = makeService();

  await assert.rejects(
    () =>
      service.registerPayment({
        driverId: "drv_1",
        contractId: "ctr_1",
        amount: 0,
        provider: "bakai",
      }),
    (error) => {
      assert.match(String(error), /Payment amount must be greater than 0/);
      return true;
    },
  );
});

test("registerPayment rejects empty provider", async () => {
  const service = makeService();

  await assert.rejects(
    () =>
      service.registerPayment({
        driverId: "drv_1",
        contractId: "ctr_1",
        amount: 1000,
        provider: "   ",
      }),
    (error) => {
      assert.match(String(error), /Payment provider must not be empty/);
      return true;
    },
  );
});

test("registerPayment rejects mismatched contract and driver", async () => {
  const service = makeService();

  await assert.rejects(
    () =>
      service.registerPayment({
        driverId: "drv_1",
        contractId: "ctr_2",
        amount: 1000,
        provider: "bakai",
      }),
    (error) => {
      assert.match(String(error), /Payment driverId does not match contract driverId/);
      return true;
    },
  );
});

test("registerPayment stores unapplied remainder as driver credit", async () => {
  const auditWrites: Array<{ action: string; entityType: string; entityId: string | null }> = [];
  const outboxCreates: Array<{ topic: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }> = [];
  const service = makeService({ auditWrites, outboxCreates });
  const originalObligations = seedObligations.map((item) => ({ ...item }));
  const originalPaymentsLength = seedPayments.length;
  const originalLedgerLength = seedLedger.length;
  const originalCreditBalance = seedDriverCreditBalances.drv_1 ?? 0;

  try {
    const payment = await service.registerPayment({
      driverId: "drv_1",
      contractId: "ctr_1",
      amount: 999999999,
      provider: "bakai",
    });

    assert.equal(payment.amount, 999999999);
    assert.equal(payment.appliedAmount, 5000);
    assert.equal(payment.unappliedAmount, 999994999);
    assert.equal(seedDriverCreditBalances.drv_1, originalCreditBalance + 999994999);
    const creditLedgerEntry = seedLedger.find((item) => item.externalReference === `${payment.id}:credit`);
    assert.equal(creditLedgerEntry?.type, "adjustment");
    assert.ok(auditWrites.some((item) => item.action === "driver.credit.created" && item.entityId === "drv_1"));
    assert.ok(outboxCreates.some((item) => item.topic === "driver.credit.created" && item.aggregateId === "drv_1"));
  } finally {
    seedObligations.splice(0, seedObligations.length, ...originalObligations);
    seedPayments.length = originalPaymentsLength;
    seedLedger.length = originalLedgerLength;
    seedDriverCreditBalances.drv_1 = originalCreditBalance;
  }
});

test("registerPayment applies money only inside the selected contract", async () => {
  const service = makeService();
  const originalContractsLength = seedContracts.length;
  const originalContractDetailsLength = seedContractDetails.length;
  const originalObligationsLength = seedObligations.length;
  const originalPaymentsLength = seedPayments.length;
  const originalLedgerLength = seedLedger.length;

  seedContracts.push({
    id: "ctr_test_scope",
    driverId: "drv_1",
    carId: "car_scope",
    status: "active",
    contractNumber: "GP-TEST-SCOPE",
    financedAmount: 100000,
    installmentAmount: 5000,
    currentDebt: 5000,
  });
  seedContractDetails.push({
    id: "ctr_test_scope",
    driverId: "drv_1",
    carId: "car_scope",
    status: "active",
    contractNumber: "GP-TEST-SCOPE",
    financedAmount: 100000,
    installmentAmount: 5000,
    principalAmount: 100000,
    installmentDay: 10,
    termMonths: 12,
    startDate: "2025-03-01",
    currentDebt: 5000,
    schedule: [],
  });
  seedObligations.push({
    id: "obl_test_scope_target",
    driverId: "drv_1",
    contractId: "ctr_test_scope",
    type: "installment",
    amount: 5000,
    paidAmount: 0,
    dueDate: "2025-03-10",
  });
  seedObligations.push({
    id: "obl_test_scope_other",
    driverId: "drv_1",
    contractId: "ctr_1",
    type: "installment",
    amount: 7000,
    paidAmount: 0,
    dueDate: "2025-03-05",
  });

  try {
    await service.registerPayment({
      driverId: "drv_1",
      contractId: "ctr_test_scope",
      amount: 5000,
      provider: "bakai",
    });

    const target = seedObligations.find((item) => item.id === "obl_test_scope_target");
    const other = seedObligations.find((item) => item.id === "obl_test_scope_other");

    assert.equal(target?.paidAmount, 5000);
    assert.equal(other?.paidAmount, 0);
  } finally {
    seedContracts.length = originalContractsLength;
    seedContractDetails.length = originalContractDetailsLength;
    seedObligations.length = originalObligationsLength;
    seedPayments.length = originalPaymentsLength;
    seedLedger.length = originalLedgerLength;
  }
});

test("registerPayment closes active contract when full debt is paid", async () => {
  const auditWrites: Array<{ action: string; entityType: string; entityId: string | null }> = [];
  const outboxCreates: Array<{ topic: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }> = [];
  const service = makeService({ auditWrites, outboxCreates });
  const originalContracts = seedContracts.map((item) => ({ ...item }));
  const originalContractDetails = seedContractDetails.map((item) => ({ ...item, schedule: [...(item.schedule ?? [])] }));
  const originalObligations = seedObligations.map((item) => ({ ...item }));
  const originalPaymentsLength = seedPayments.length;
  const originalLedgerLength = seedLedger.length;

  seedContracts.push({
    id: "ctr_test_regular_full_payoff",
    driverId: "drv_1",
    carId: "car_test_regular_full_payoff",
    status: "active",
    contractNumber: "GP-TEST-REGULAR-PAYOFF",
    financedAmount: 100000,
    installmentAmount: 5000,
    currentDebt: 5000,
  });
  seedContractDetails.push({
    id: "ctr_test_regular_full_payoff",
    driverId: "drv_1",
    carId: "car_test_regular_full_payoff",
    status: "active",
    contractNumber: "GP-TEST-REGULAR-PAYOFF",
    financedAmount: 100000,
    installmentAmount: 5000,
    principalAmount: 100000,
    installmentDay: 10,
    termMonths: 12,
    startDate: "2025-03-01",
    currentDebt: 5000,
    schedule: [],
  });
  seedObligations.push({
    id: "obl_test_regular_full_payoff",
    driverId: "drv_1",
    contractId: "ctr_test_regular_full_payoff",
    type: "installment",
    amount: 5000,
    paidAmount: 0,
    dueDate: "2025-03-10",
  });

  try {
    await service.registerPayment({
      driverId: "drv_1",
      contractId: "ctr_test_regular_full_payoff",
      amount: 5000,
      provider: "bank",
    });

    assert.equal(seedContracts.find((item) => item.id === "ctr_test_regular_full_payoff")?.status, "closed");
    assert.equal(seedContractDetails.find((item) => item.id === "ctr_test_regular_full_payoff")?.status, "closed");
    assert.ok(auditWrites.some((item) => item.action === "contract.paid_off" && item.entityId === "ctr_test_regular_full_payoff"));
    assert.ok(outboxCreates.some((item) => item.topic === "contract.paid_off" && item.aggregateId === "ctr_test_regular_full_payoff"));
  } finally {
    seedContracts.splice(0, seedContracts.length, ...originalContracts);
    seedContractDetails.splice(0, seedContractDetails.length, ...originalContractDetails);
    seedObligations.splice(0, seedObligations.length, ...originalObligations);
    seedPayments.length = originalPaymentsLength;
    seedLedger.length = originalLedgerLength;
  }
});

test("registerPayment applies today first, then overdue, then future obligations", async () => {
  const service = makeService();
  const originalContractsLength = seedContracts.length;
  const originalContractDetailsLength = seedContractDetails.length;
  const originalObligationsLength = seedObligations.length;
  const originalPaymentsLength = seedPayments.length;
  const originalLedgerLength = seedLedger.length;

  seedContracts.push({
    id: "ctr_test_priority",
    driverId: "drv_1",
    carId: "car_priority",
    status: "active",
    contractNumber: "GP-TEST-PRIORITY",
    financedAmount: 100000,
    installmentAmount: 5000,
    currentDebt: 15000,
  });
  seedContractDetails.push({
    id: "ctr_test_priority",
    driverId: "drv_1",
    carId: "car_priority",
    status: "active",
    contractNumber: "GP-TEST-PRIORITY",
    financedAmount: 100000,
    installmentAmount: 5000,
    principalAmount: 100000,
    installmentDay: 10,
    termMonths: 12,
    startDate: "2026-06-01",
    currentDebt: 15000,
    schedule: [],
  });
  seedObligations.push(
    {
      id: "obl_test_priority_overdue",
      driverId: "drv_1",
      contractId: "ctr_test_priority",
      type: "installment",
      amount: 5000,
      paidAmount: 0,
      dueDate: "2026-06-20",
    },
    {
      id: "obl_test_priority_today",
      driverId: "drv_1",
      contractId: "ctr_test_priority",
      type: "installment",
      amount: 5000,
      paidAmount: 0,
      dueDate: "2026-06-24",
    },
    {
      id: "obl_test_priority_future",
      driverId: "drv_1",
      contractId: "ctr_test_priority",
      type: "installment",
      amount: 5000,
      paidAmount: 0,
      dueDate: "2026-06-30",
    },
  );

  try {
    await service.registerPayment({
      driverId: "drv_1",
      contractId: "ctr_test_priority",
      amount: 12000,
      provider: "bank",
      paymentForDate: "2026-06-24",
    });

    assert.equal(seedObligations.find((item) => item.id === "obl_test_priority_today")?.paidAmount, 5000);
    assert.equal(seedObligations.find((item) => item.id === "obl_test_priority_overdue")?.paidAmount, 5000);
    assert.equal(seedObligations.find((item) => item.id === "obl_test_priority_future")?.paidAmount, 2000);
  } finally {
    seedContracts.length = originalContractsLength;
    seedContractDetails.length = originalContractDetailsLength;
    seedObligations.length = originalObligationsLength;
    seedPayments.length = originalPaymentsLength;
    seedLedger.length = originalLedgerLength;
  }
});

test("registerPayment stores manual payment as succeeded", async () => {
  const service = makeService();
  const originalPaymentsLength = seedPayments.length;
  const originalLedgerLength = seedLedger.length;

  try {
    const payment = await service.registerPayment({
      driverId: "drv_1",
      contractId: "ctr_1",
      amount: 1000,
      provider: "bakai",
    });

    assert.equal(payment.status, "succeeded");
    assert.equal(seedPayments.at(-1)?.status, "succeeded");
  } finally {
    seedPayments.length = originalPaymentsLength;
    seedLedger.length = originalLedgerLength;
  }
});

test("writeOffDriverCredit rejects amounts above current balance", async () => {
  const service = makeService();

  await assert.rejects(
    () =>
      service.writeOffDriverCredit({
        driverId: "drv_1",
        amount: 1,
        reason: "manual correction",
      }),
    (error) => {
      assert.match(String(error), /Credit writeoff amount exceeds current credit balance/);
      return true;
    },
  );
});

test("writeOffDriverCredit decreases balance and writes refund ledger/audit/outbox", async () => {
  const auditWrites: Array<{ action: string; entityType: string; entityId: string | null }> = [];
  const outboxCreates: Array<{ topic: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }> = [];
  const service = makeService({ auditWrites, outboxCreates });
  const originalLedgerLength = seedLedger.length;
  const originalCreditBalance = seedDriverCreditBalances.drv_1 ?? 0;

  seedDriverCreditBalances.drv_1 = 4000;

  try {
    const result = await service.writeOffDriverCredit({
      driverId: "drv_1",
      amount: 1500,
      reason: "manual correction",
    });

    assert.equal(result.amountWrittenOff, 1500);
    assert.equal(result.remainingCreditBalance, 2500);
    assert.equal(seedDriverCreditBalances.drv_1, 2500);

    const ledgerEntry = seedLedger.find((item) => item.externalReference?.startsWith("credit-writeoff:"));
    assert.equal(ledgerEntry?.type, "refund");
    assert.equal(ledgerEntry?.money.amount, "1500");
    assert.ok(auditWrites.some((item) => item.action === "driver.credit.written_off" && item.entityId === "drv_1"));
    assert.ok(outboxCreates.some((item) => item.topic === "driver.credit.written_off" && item.aggregateId === "drv_1"));
  } finally {
    seedLedger.length = originalLedgerLength;
    seedDriverCreditBalances.drv_1 = originalCreditBalance;
  }
});

test("autoApplyDriverCreditToContract applies free credit to a new contract debt", async () => {
  const auditWrites: Array<{ action: string; entityType: string; entityId: string | null }> = [];
  const outboxCreates: Array<{ topic: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }> = [];
  const service = makeService({ auditWrites, outboxCreates });
  const originalLedgerLength = seedLedger.length;
  const originalCreditBalance = seedDriverCreditBalances.drv_1 ?? 0;
  const originalObligations = seedObligations.map((item) => ({ ...item }));

  seedDriverCreditBalances.drv_1 = 4000;
  seedObligations.push({
    id: "obl_auto_credit_1",
    driverId: "drv_1",
    contractId: "ctr_auto_credit",
    type: "installment",
    amount: 6000,
    paidAmount: 0,
    dueDate: "2025-07-10",
  });

  try {
    const result = await service.autoApplyDriverCreditToContract({
      driverId: "drv_1",
      contractId: "ctr_auto_credit",
    });

    assert.equal(result?.amountWrittenOff, 4000);
    assert.equal(result?.remainingCreditBalance, 0);
    assert.equal(seedDriverCreditBalances.drv_1, 0);
    assert.equal(seedObligations.find((item) => item.id === "obl_auto_credit_1")?.paidAmount, 4000);

    const ledgerEntry = seedLedger.find((item) => item.externalReference?.startsWith("credit-auto-writeoff:"));
    assert.equal(ledgerEntry?.type, "refund");
    assert.ok(auditWrites.some((item) => item.action === "driver.credit.written_off" && item.entityId === "drv_1"));
    assert.ok(auditWrites.some((item) => item.action === "obligation.payment.applied" && item.entityId === "drv_1"));
    assert.ok(
      outboxCreates.some(
        (item) =>
          item.topic === "driver.credit.written_off" &&
          item.aggregateId === "drv_1" &&
          item.payload.automatic === true,
      ),
    );
  } finally {
    seedLedger.length = originalLedgerLength;
    seedDriverCreditBalances.drv_1 = originalCreditBalance;
    seedObligations.splice(0, seedObligations.length, ...originalObligations);
  }
});

test("payOffContractEarly rejects amounts below remaining contract debt", async () => {
  const service = makeService();
  const originalContractsLength = seedContracts.length;
  const originalContractDetailsLength = seedContractDetails.length;
  const originalObligationsLength = seedObligations.length;

  seedContracts.push({
    id: "ctr_test_payoff_reject",
    driverId: "drv_1",
    carId: "car_test_payoff_reject",
    status: "active",
    contractNumber: "GP-TEST-PAYOFF-REJECT",
    financedAmount: 100000,
    installmentAmount: 5000,
    currentDebt: 5000,
  });
  seedContractDetails.push({
    id: "ctr_test_payoff_reject",
    driverId: "drv_1",
    carId: "car_test_payoff_reject",
    status: "active",
    contractNumber: "GP-TEST-PAYOFF-REJECT",
    financedAmount: 100000,
    installmentAmount: 5000,
    principalAmount: 100000,
    installmentDay: 10,
    termMonths: 12,
    startDate: "2025-03-01",
    currentDebt: 5000,
    schedule: [],
  });
  seedObligations.push({
    id: "obl_test_payoff_reject",
    driverId: "drv_1",
    contractId: "ctr_test_payoff_reject",
    type: "installment",
    amount: 5000,
    paidAmount: 0,
    dueDate: "2025-03-10",
  });

  try {
    await assert.rejects(
      () =>
        service.payOffContractEarly({
          driverId: "drv_1",
          contractId: "ctr_test_payoff_reject",
          amount: 4000,
          provider: "cash",
        }),
      (error) => {
        assert.match(String(error), /Early payoff amount must cover the full remaining contract debt/);
        return true;
      },
    );
  } finally {
    seedContracts.length = originalContractsLength;
    seedContractDetails.length = originalContractDetailsLength;
    seedObligations.length = originalObligationsLength;
  }
});

test("payOffContractEarly closes contract and emits paid-off outbox", async () => {
  const auditWrites: Array<{ action: string; entityType: string; entityId: string | null }> = [];
  const outboxCreates: Array<{ topic: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }> = [];
  const service = makeService({ auditWrites, outboxCreates });
  const originalPaymentsLength = seedPayments.length;
  const originalLedgerLength = seedLedger.length;
  const originalCreditBalance = seedDriverCreditBalances.drv_1 ?? 0;
  const originalContracts = seedContracts.map((item) => ({ ...item }));
  const originalContractDetails = seedContractDetails.map((item) => ({ ...item }));
  const originalObligations = seedObligations.map((item) => ({ ...item }));

  seedContracts.push({
    id: "ctr_test_payoff_close",
    driverId: "drv_1",
    carId: "car_test_payoff_close",
    status: "active",
    contractNumber: "GP-TEST-PAYOFF-CLOSE",
    financedAmount: 100000,
    installmentAmount: 5000,
    currentDebt: 5000,
  });
  seedContractDetails.push({
    id: "ctr_test_payoff_close",
    driverId: "drv_1",
    carId: "car_test_payoff_close",
    status: "active",
    contractNumber: "GP-TEST-PAYOFF-CLOSE",
    financedAmount: 100000,
    installmentAmount: 5000,
    principalAmount: 100000,
    installmentDay: 10,
    termMonths: 12,
    startDate: "2025-03-01",
    currentDebt: 5000,
    schedule: [],
  });
  seedObligations.push({
    id: "obl_test_payoff_close",
    driverId: "drv_1",
    contractId: "ctr_test_payoff_close",
    type: "installment",
    amount: 5000,
    paidAmount: 0,
    dueDate: "2025-03-10",
  });

  try {
    const result = await service.payOffContractEarly({
      driverId: "drv_1",
      contractId: "ctr_test_payoff_close",
      amount: 7000,
      provider: "cash",
    });

    assert.equal(result.contractStatus, "closed");
    assert.equal(result.remainingContractDebt, 0);
    assert.equal(result.appliedAmount, 5000);
    assert.equal(result.unappliedAmount, 2000);
    assert.equal(seedContracts.find((item) => item.id === "ctr_test_payoff_close")?.status, "closed");
    assert.equal(seedContractDetails.find((item) => item.id === "ctr_test_payoff_close")?.status, "closed");
    assert.equal(seedObligations.find((item) => item.id === "obl_test_payoff_close")?.paidAmount, 5000);
    assert.equal(seedDriverCreditBalances.drv_1, originalCreditBalance + 2000);
    assert.ok(auditWrites.some((item) => item.action === "contract.paid_off" && item.entityId === "ctr_test_payoff_close"));
    assert.ok(outboxCreates.some((item) => item.topic === "contract.paid_off" && item.aggregateId === "ctr_test_payoff_close"));
  } finally {
    seedPayments.length = originalPaymentsLength;
    seedLedger.length = originalLedgerLength;
    seedDriverCreditBalances.drv_1 = originalCreditBalance;
    seedContracts.splice(0, seedContracts.length, ...originalContracts);
    seedContractDetails.splice(0, seedContractDetails.length, ...originalContractDetails);
    seedObligations.splice(0, seedObligations.length, ...originalObligations);
  }
});
