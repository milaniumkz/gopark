import test from "node:test";
import assert from "node:assert/strict";
import { applyServiceInventory } from "./service-inventory.js";

function fixture() {
  const movements: any[] = [];
  const parts = new Map<string, any>([
    ["stock", { id: "stock", quantity: 2, unitPrice: 40 }],
  ]);
  let saved: any;
  const tx = {
    part: {
      create: async ({ data }: any) => {
        const part = { ...data, id: `new-${parts.size}` };
        parts.set(part.id, part);
        return part;
      },
      findFirst: async ({ where }: any) => parts.get(where.id),
      updateMany: async ({ where }: any) => {
        const part = parts.get(where.id);
        if (!part || part.quantity < 1) return { count: 0 };
        part.quantity--;
        return { count: 1 };
      },
    },
    partMovement: { create: async ({ data }: any) => movements.push(data) },
    incident: {
      update: async ({ data }: any) => {
        saved = data.serviceDetails;
      },
    },
  };
  return { tx, movements, parts, saved: () => saved };
}

test("STO saves create receipt and writeoff for new expenses of every purchaser; stock only writes off", async () => {
  const f = fixture();
  const incident: any = {
    id: "case",
    title: "Repair",
    serviceDetails: {
      expenses: [
        ...["sto", "company", "driver"].map((purchaser) => ({
          id: purchaser,
          description: purchaser,
          amount: 25,
          purchaser,
        })),
        {
          id: "existing",
          description: "Stock",
          amount: 40,
          purchaser: "sto",
          inventoryMode: "stock",
          partId: "stock",
        },
      ],
    },
  };
  await applyServiceInventory(f.tx, incident, undefined, null);
  assert.equal(f.movements.filter((m) => m.type === "receive").length, 3);
  assert.equal(f.movements.filter((m) => m.type === "writeoff").length, 4);
  assert.equal(f.parts.get("stock").quantity, 1);
  assert.ok(f.saved().expenses.every((e: any) => e.inventoryApplied));
  const previous = structuredClone(incident);
  await applyServiceInventory(f.tx, incident, previous, null);
  assert.equal(
    f.movements.length,
    7,
    "repeated saves must not duplicate stock movements",
  );
});

test("manager update of historical expenses without source never posts inventory", async () => {
  const f = fixture();
  await applyServiceInventory(
    f.tx,
    {
      id: "case",
      serviceDetails: {
        expenses: [
          { id: "e", description: "Part", amount: 10, purchaser: "sto" },
        ],
      },
    },
    undefined,
    undefined,
  );
  assert.equal(f.movements.length, 0);
});

test("historical unposted expense is posted once on an authorised STO save", async () => {
  const f = fixture();
  const incident: any = {
    id: "case",
    serviceDetails: {
      expenses: [
        { id: "old", description: "Part", amount: 10, purchaser: "company" },
      ],
    },
  };
  await applyServiceInventory(f.tx, incident, structuredClone(incident), null);
  assert.deepEqual(
    f.movements.map((m) => m.type),
    ["receive", "writeoff"],
  );
  const previous = structuredClone(incident);
  const retry = structuredClone(incident);
  delete retry.serviceDetails.expenses[0].inventoryMode;
  await applyServiceInventory(f.tx, retry, previous, null);
  assert.equal(f.movements.length, 2);
});
