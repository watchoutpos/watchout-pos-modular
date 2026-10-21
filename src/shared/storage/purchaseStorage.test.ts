import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { loadPurchaseById, loadPurchases, savePurchase } from "./purchaseStorage.ts";
import type { Purchase } from "../types/purchase";

const DB_NAME = "watchout-pos-purchases";

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  const now = new Date().toISOString();

  return {
    id: "purchase-test-1",
    businessId: "business-a",
    storeId: "store-a",
    supplierName: "Test Supplier",
    supplierInvoiceNumber: null,
    status: "draft",
    lines: [{
      id: "line-1",
      productId: "product-1",
      productNameSnapshot: "Test Product",
      quantity: 2,
      unitCost: { amountMinor: 5000, currency: "INR" },
      lineTotal: { amountMinor: 10000, currency: "INR" },
    }],
    subtotal: { amountMinor: 10000, currency: "INR" },
    notes: "",
    createdByUserId: "test-user",
    createdAt: now,
    updatedAt: now,
    receivedAt: null,
    ...overrides,
  };
}

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Purchase database reset blocked."));
  });
}

beforeEach(async () => {
  await resetDatabase();
});

test("saves and loads a draft without changing its status", async () => {
  const purchase = makePurchase();
  await savePurchase(purchase);

  assert.equal((await loadPurchaseById(purchase.id))?.status, "draft");
  assert.equal((await loadPurchases("business-a", "store-a")).length, 1);
});

test("isolates purchase history by business and store", async () => {
  await savePurchase(makePurchase());
  await savePurchase(makePurchase({
    id: "purchase-test-2",
    businessId: "business-b",
    storeId: "store-b",
  }));

  assert.equal((await loadPurchases("business-a", "store-a")).length, 1);
  assert.equal((await loadPurchases("business-b", "store-b")).length, 1);
  assert.equal((await loadPurchases("business-a", "store-b")).length, 0);
});

test("rejects a purchase without a supplier or lines", async () => {
  await assert.rejects(
    savePurchase(makePurchase({ supplierName: " " })),
    /Supplier name is required/,
  );
  await assert.rejects(
    savePurchase(makePurchase({ id: "empty-lines", lines: [] })),
    /at least one product/,
  );
});

test("rejects invalid quantities", async () => {
  const purchase = makePurchase();
  purchase.lines[0].quantity = 0;

  await assert.rejects(savePurchase(purchase), /greater than zero/);
});

test("prevents changing a purchase's business or store", async () => {
  await savePurchase(makePurchase());

  await assert.rejects(
    savePurchase(makePurchase({ storeId: "another-store" })),
    /cannot be moved/,
  );
});

test("blocks marking a draft received without the receiving workflow", async () => {
  await savePurchase(makePurchase());

  await assert.rejects(
    savePurchase(makePurchase({
      status: "received",
      receivedAt: new Date().toISOString(),
    })),
    /receiving workflow/,
  );
});

test("blocks reopening a cancelled purchase", async () => {
  const now = new Date().toISOString();
  await savePurchase(makePurchase({
    status: "cancelled",
    updatedAt: now,
  }));

  await assert.rejects(
    savePurchase(makePurchase()),
    /cannot be reopened/,
  );
});