import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadPurchaseById,
  savePurchase,
  beginPurchaseReceiving,
} from "../../shared/storage/purchaseStorage.ts";
import {
  loadInventoryMovements,
  loadStockRecords,
  receivePurchaseLineStock,
} from "../../shared/storage/inventoryStorage.ts";
import { receivePurchase } from "./receivingService.ts";
import type { Purchase } from "../../shared/types/purchase";

const PURCHASE_DB = "watchout-pos-purchases";
const INVENTORY_DB = "watchout-pos-inventory";
const BUSINESS = "receiving-test-business";
const STORE = "receiving-test-store";
const USER = "receiving-test-user";
const PRODUCT = "receiving-test-product";

async function resetDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Reset blocked: ${name}`));
  });
}

async function resetBoth(): Promise<void> {
  await resetDatabase(PURCHASE_DB);
  await resetDatabase(INVENTORY_DB);
}

function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  const now = new Date().toISOString();
  return {
    id: "receiving-test-purchase",
    businessId: BUSINESS,
    storeId: STORE,
    supplierName: "Test Supplier",
    supplierInvoiceNumber: null,
    status: "draft",
    lines: [
      {
        id: "line-1",
        productId: PRODUCT,
        productNameSnapshot: "Test Product",
        quantity: 2,
        unitCost: { amountMinor: 100, currency: "INR" },
        lineTotal: { amountMinor: 200, currency: "INR" },
      },
      {
        id: "line-2",
        productId: PRODUCT,
        productNameSnapshot: "Test Product",
        quantity: 3,
        unitCost: { amountMinor: 100, currency: "INR" },
        lineTotal: { amountMinor: 300, currency: "INR" },
      },
    ],
    subtotal: { amountMinor: 500, currency: "INR" },
    notes: "",
    createdByUserId: USER,
    createdAt: now,
    updatedAt: now,
    receivedAt: null,
    ...overrides,
  };
}

async function readQuantity(): Promise<number> {
  const records = await loadStockRecords(BUSINESS, STORE);
  return records.find((record) => record.balance.productId === PRODUCT)
    ?.balance.quantityOnHand ?? 0;
}

async function readMovementCount(): Promise<number> {
  return (await loadInventoryMovements(BUSINESS, STORE)).filter(
    (movement) => movement.movementType === "purchase-receipt",
  ).length;
}

function input(overrides: Partial<{
  purchaseId: string;
  businessId: string;
  storeId: string;
  createdByUserId: string;
}> = {}) {
  return {
    purchaseId: "receiving-test-purchase",
    businessId: BUSINESS,
    storeId: STORE,
    createdByUserId: USER,
    ...overrides,
  };
}

test("receiving adds all purchase lines and marks the purchase received", async () => {
  await resetBoth();
  await savePurchase(makePurchase());

  const received = await receivePurchase(input());

  assert.equal(received.status, "received");
  assert.ok(received.receivedAt);
  assert.equal(await readQuantity(), 5);
  assert.equal(await readMovementCount(), 2);
});

test("resuming an interrupted receipt does not add a previously received line twice", async () => {
  await resetBoth();
  const purchase = makePurchase();
  await savePurchase(purchase);

  const locked = await beginPurchaseReceiving(purchase.id, BUSINESS, STORE);
  await receivePurchaseLineStock({
    businessId: BUSINESS,
    storeId: STORE,
    productId: locked.lines[0].productId,
    purchaseId: locked.id,
    purchaseLineId: locked.lines[0].id,
    quantity: locked.lines[0].quantity,
    createdByUserId: USER,
  });

  assert.equal(await readQuantity(), 2);

  const received = await receivePurchase(input());

  assert.equal(received.status, "received");
  assert.equal(await readQuantity(), 5);
  assert.equal(await readMovementCount(), 2);
});

test("ordinary saves cannot change purchase lines while receiving", async () => {
  await resetBoth();
  const purchase = makePurchase();
  await savePurchase(purchase);
  await beginPurchaseReceiving(purchase.id, BUSINESS, STORE);

  await assert.rejects(
    savePurchase({
      ...purchase,
      supplierName: "Changed Supplier",
      updatedAt: new Date().toISOString(),
    }),
    /locked|receiving workflow/i,
  );

  const stored = await loadPurchaseById(purchase.id);
  assert.equal(stored?.status, "receiving");
  assert.equal(stored?.supplierName, "Test Supplier");
});

test("receiving rejects a mismatched business or store without changing stock", async () => {
  await resetBoth();
  await savePurchase(makePurchase());

  await assert.rejects(
    receivePurchase(input({ businessId: "another-business" })),
    /active business and store/i,
  );
  await assert.rejects(
    receivePurchase(input({ storeId: "another-store" })),
    /active business and store/i,
  );

  assert.equal((await loadPurchaseById("receiving-test-purchase"))?.status, "draft");
  assert.equal(await readQuantity(), 0);
  assert.equal(await readMovementCount(), 0);
});

test("cancelled purchases cannot be received", async () => {
  await resetBoth();
  await savePurchase(makePurchase({ status: "cancelled" }));

  await assert.rejects(receivePurchase(input()), /cancelled/i);

  assert.equal((await loadPurchaseById("receiving-test-purchase"))?.status, "cancelled");
  assert.equal(await readQuantity(), 0);
});

test("already received purchases cannot be received a second time", async () => {
  await resetBoth();
  await savePurchase(makePurchase({
    status: "received",
    receivedAt: new Date().toISOString(),
  }));

  await assert.rejects(receivePurchase(input()), /already been received/i);
  assert.equal(await readQuantity(), 0);
  assert.equal(await readMovementCount(), 0);
});