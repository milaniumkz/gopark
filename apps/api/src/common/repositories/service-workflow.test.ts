import test from "node:test";
import assert from "node:assert/strict";
import { serviceWorkflow, validateAccident } from "./service-workflow.js";
import type { ManagerIncidentItem } from "@gopark/contracts";
const previous: ManagerIncidentItem = {
  id: "case",
  title: "repair",
  status: "open",
  priority: "high",
  incidentType: "repair",
  serviceStage: "sent_to_service",
  serviceDetails: { reason: "Тормоза", sentAt: "2026-10-09T10:00:00Z" },
};
test("STO requires a reason, confirms arrival sequentially, and does not accept fabricated timestamps", () => {
  assert.throws(
    () =>
      serviceWorkflow({
        incidentType: "repair",
        serviceStage: "sent_to_service",
      }),
    /причину/,
  );
  assert.throws(
    () => serviceWorkflow({ serviceStage: "in_repair" }, previous),
    /прибытие|по порядку/,
  );
  const p = serviceWorkflow(
    {
      serviceDetails: {
        reason: "Тормоза",
        arrivalConfirmed: true,
        waitingComment: "Ждём мастера",
        plannedRepairDate: "2099-12-31",
        sentAt: "2000-01-01",
        completedAt: "2000-01-01",
      },
    },
    previous,
  );
  assert.equal(p.serviceDetails?.sentAt, previous.serviceDetails!.sentAt);
  assert.ok(p.serviceDetails?.arrivedAt);
  assert.equal(p.serviceDetails?.completedAt, undefined);
});
test("completion requires an order and works, immutable payment history and no overpayment", () => {
  const p = { ...previous, serviceStage: "in_repair" };
  assert.throws(
    () => serviceWorkflow({ serviceStage: "completed" }, p),
    /заказ-наряда/,
  );
  const details = {
    reason: "Тормоза",
    orderNumber: "1",
    works: ["Диагностика"],
    serviceCost: 1000,
    costDate: "2026-10-10",
    payments: [
      {
        id: "payment",
        payer: "company" as const,
        amount: 400,
        paidAt: "2026-10-10",
      },
    ],
  };
  const completed = serviceWorkflow(
    { serviceStage: "completed", serviceDetails: details },
    p,
  );
  assert.equal(completed.servicePaymentStatus, "partial");
  assert.ok(completed.serviceDetails?.completedAt);
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            ...details,
            payments: [{ ...details.payments[0]!, amount: 1001 }],
          },
        },
        p,
      ),
    /превышать/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        { serviceDetails: { ...details, payments: [] } },
        { ...p, serviceDetails: details },
      ),
    /нельзя удалять/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        { serviceStage: "sent_to_service" },
        { ...p, status: "closed", serviceStage: "completed" },
      ),
    /по порядку|повторно/,
  );
});
test("DTP requires structured data and date but does not require photos", () => {
  const data = {
    location: "Учебное место",
    occurredAt: "2026-10-01T10:00:00Z",
    fault: "unknown" as const,
    insurer: "nsk" as const,
    otherPlate: "TEST",
    otherMake: "Test",
    otherModel: "Test",
  };
  assert.equal(validateAccident(data), data);
  assert.throws(() => validateAccident({ ...data, location: "" }), /место/);
  assert.throws(
    () => validateAccident({ ...data, occurredAt: "2100-01-01" }),
    /будущем/,
  );
});

test("closing an inspection is independent of STO and does not require a repair order", () => {
  assert.deepEqual(
    serviceWorkflow(
      { serviceStage: "completed", status: "resolved" },
      {
        ...previous,
        incidentType: "inspection",
        serviceStage: "inspection",
        serviceDetails: null,
      },
    ),
    {},
  );
});

test("STO accident reception and completion require separate before/after photos", () => {
  const photo = "data:image/png;base64,aGVsbG8=";
  const accident = { ...previous, incidentType: "accident" };
  assert.throws(
    () =>
      serviceWorkflow(
        { serviceDetails: { reason: "ДТП", arrivalConfirmed: true } },
        accident,
      ),
    /фото до/,
  );
  const arrived = serviceWorkflow(
    {
      serviceDetails: {
        reason: "ДТП",
        arrivalConfirmed: true,
        beforePhoto: photo,
        waitingComment: "Ждём запчасти",
        plannedRepairDate: "2099-12-31",
      },
    },
    accident,
  );
  assert.ok(arrived.serviceDetails?.arrivedAt);
  assert.throws(
    () => serviceWorkflow({ status: "closed" }, accident),
    /до и после/,
  );
  const repairing = {
    ...accident,
    serviceStage: "in_repair",
    serviceDetails: {
      ...arrived.serviceDetails!,
      orderNumber: "STO-1",
      works: ["Замена крыла"],
    },
  };
  assert.throws(
    () => serviceWorkflow({ serviceStage: "completed" }, repairing),
    /до и после/,
  );
  assert.ok(
    serviceWorkflow(
      {
        serviceStage: "completed",
        serviceDetails: { ...repairing.serviceDetails, afterPhoto: photo },
      },
      repairing,
    ).serviceDetails?.completedAt,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "ДТП",
            beforePhoto: "https://example.invalid/photo",
          },
        },
        accident,
      ),
    /Фото/,
  );
});

test("insurance status requires an insurer and a real paid date without changing financial payments", () => {
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Ремонт",
            insurance: { insurer: "nsk", paid: true },
          },
        },
        previous,
      ),
    /Дата оплаты/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Ремонт",
            insurance: { insurer: "nsk", paid: true, paidAt: "2100-01-01" },
          },
        },
        previous,
      ),
    /будущем/,
  );
  const saved = serviceWorkflow(
    {
      serviceDetails: {
        reason: "Ремонт",
        insurance: { insurer: "nsk", paid: true, paidAt: "2026-10-01" },
      },
    },
    previous,
  );
  assert.equal(saved.serviceDetails?.insurance?.paid, true);
  assert.equal(saved.servicePaymentStatus, "unpaid");
  assert.equal(saved.serviceDetails?.payments, undefined);
});

test("insurer identity on saved payments is immutable and mandatory for new insurance receipts", () => {
  const payment = {
    id: "insurance-1",
    payer: "insurance" as const,
    amount: 500,
    paidAt: "2026-10-01",
    insurer: "nsk" as const,
  };
  const details = {
    reason: "Кузов",
    serviceCost: 1000,
    costDate: "2026-10-01",
    payments: [payment],
  };
  const saved = serviceWorkflow({ serviceDetails: details }, previous);
  assert.equal(saved.serviceDetails?.payments?.[0]?.insurer, "nsk");
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            ...details,
            payments: [{ ...payment, insurer: "alma" }],
          },
        },
        { ...previous, serviceDetails: details },
      ),
    /нельзя удалять/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            ...details,
            payments: [{ ...payment, insurer: undefined }],
          },
        },
        previous,
      ),
    /страховую компанию/,
  );
  const legacy = { ...details, payments: [{ ...payment, insurer: undefined }] };
  assert.equal(
    serviceWorkflow(
      { serviceDetails: legacy },
      { ...previous, serviceDetails: legacy },
    ).servicePaymentStatus,
    "partial",
  );
});

test("arrival requires a comment and a valid immutable planned start date", () => {
  assert.throws(
    () =>
      serviceWorkflow(
        { serviceDetails: { reason: "Ремонт", arrivalConfirmed: true } },
        previous,
      ),
    /комментарий/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Ремонт",
            arrivalConfirmed: true,
            waitingComment: "Ждём",
          },
        },
        previous,
      ),
    /дат/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Ремонт",
            arrivalConfirmed: true,
            waitingComment: "Ждём",
            plannedRepairDate: "2000-01-01",
          },
        },
        previous,
      ),
    /прошлом/,
  );
  const saved = serviceWorkflow(
    {
      serviceDetails: {
        reason: "Ремонт",
        arrivalConfirmed: true,
        waitingComment: "Ждём запчасть",
        plannedRepairDate: "2099-12-31",
      },
    },
    previous,
  );
  assert.equal(saved.serviceDetails?.plannedRepairDate, "2099-12-31");
  assert.ok(saved.serviceDetails?.arrivedAt);
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            ...saved.serviceDetails!,
            plannedRepairDate: "2099-12-30",
          },
        },
        {
          ...previous,

          serviceDetails: saved.serviceDetails,
        },
      ),
    /нельзя менять/,
  );
});

test("paid insurance flags become dated ledger payments once; increasing a quote does not invent another receipt", () => {
  const confirmed = {
    reason: "Ремонт",
    serviceCost: 1000,
    costDate: "2026-10-01",
    insurance: { insurer: "nsk" as const, paid: true, paidAt: "2026-10-01" },
    payments: [
      {
        id: "driver-paid",
        payer: "driver" as const,
        amount: 200,
        paidAt: "2026-10-01",
      },
    ],
  };
  const first = serviceWorkflow({ serviceDetails: confirmed }, previous);
  assert.equal(first.servicePaymentStatus, "paid");
  assert.equal(
    first.serviceDetails!.payments!.reduce((s, p) => s + p.amount, 0),
    1000,
  );
  assert.equal(
    first.serviceDetails!.payments!.filter((p) => p.payer === "insurance")[0]!
      .amount,
    800,
  );
  const retry = serviceWorkflow(
    { serviceDetails: first.serviceDetails! },
    { ...previous, serviceDetails: first.serviceDetails },
  );
  assert.equal(retry.serviceDetails!.payments!.length, 2);
  const increase = serviceWorkflow(
    { serviceDetails: { ...first.serviceDetails!, serviceCost: 1500 } },
    { ...previous, serviceDetails: first.serviceDetails },
  );
  assert.equal(increase.servicePaymentStatus, "partial");
  assert.equal(
    increase.serviceDetails!.payments!.reduce((s, p) => s + p.amount, 0),
    1000,
  );
});

test("priced work rows determine the authoritative total and separate painting and repair profit bases", () => {
  const orderItems = [
    {
      id: "p",
      description: "Покраска крыла",
      category: "painting" as const,
      amount: 2000,
    },
    {
      id: "r",
      description: "Замена детали",
      category: "repair" as const,
      amount: 1000,
    },
  ];
  const saved = serviceWorkflow(
    {
      serviceDetails: {
        reason: "Ремонт",
        orderItems,
        serviceCost: 999,
        costDate: "2026-10-01",
      },
    },
    previous,
  );
  assert.equal(saved.serviceDetails!.serviceCost, 3000);
  assert.equal(saved.serviceDetails!.paintingCost, 2000);
  assert.equal(saved.serviceDetails!.repairCost, 1000);
  assert.deepEqual(saved.serviceDetails!.works, [
    "Покраска крыла",
    "Замена детали",
  ]);
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Ремонт",
            orderItems: [{ ...orderItems[0]!, amount: undefined }],
          },
        },
        previous,
      ),
    /каждой работы/,
  );
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Ремонт",
            orderItems: [{ ...orderItems[0]!, amount: -1 }],
          },
        },
        previous,
      ),
    /каждой работы/,
  );
});

test("two prices per work add up, only STO expenses enter the invoice and expenses never earn commission", async () => {
  const { serviceProfit } = await import("@gopark/contracts");
  const saved = serviceWorkflow(
    {
      serviceDetails: {
        reason: "Work",
        orderItems: [
          {
            id: "w",
            description: "Work",
            category: "repair",
            serviceAmount: 100,
            laborAmount: 50,
            amount: 999,
          },
        ],
        expenses: [
          {
            id: "s",
            description: "STO materials",
            amount: 20,
            purchaser: "sto",
          },
          {
            id: "c",
            description: "GoPark part",
            amount: 30,
            purchaser: "company",
          },
          {
            id: "d",
            description: "Driver part",
            amount: 40,
            purchaser: "driver",
          },
        ],
      },
    },
    previous,
  );
  assert.equal(saved.serviceDetails!.orderItems![0]!.amount, 150);
  assert.equal(saved.serviceDetails!.serviceBaseCost, 150);
  assert.equal(saved.serviceDetails!.serviceCost, 170);
  assert.equal(saved.serviceDetails!.repairCost, 150);
  assert.equal(serviceProfit(saved.serviceDetails), 45);
  assert.throws(
    () =>
      serviceWorkflow(
        {
          serviceDetails: {
            reason: "Work",
            orderItems: [
              {
                id: "w",
                description: "Work",
                category: "repair",
                serviceAmount: 100,
              },
            ],
          },
        },
        previous,
      ),
    /стоимость/,
  );
});
