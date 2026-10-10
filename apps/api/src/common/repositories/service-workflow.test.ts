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
    /по порядку/,
  );
  const p = serviceWorkflow(
    {
      serviceStage: "awaiting_repair",
      serviceDetails: {
        reason: "Тормоза",
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

test("closing an inspection is independent of STO and does not require a repair order",()=>{
 assert.deepEqual(serviceWorkflow({serviceStage:"completed",status:"resolved"},{...previous,incidentType:"inspection",serviceStage:"inspection",serviceDetails:null}),{});
});
