import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadInventoryMovements,
  loadStockRecords,
  recordStockMovement,
  receivePurchaseLineStock,
} from "../../shared/storage/inventoryStorage.ts";

const BUSINESS = "inventory-test-business";
const STORE = "inventory-test-store";
const PRODUCT = "inventory-test-product";
const DATABASE = "watchout-pos-inventory";

function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(
      request.error ?? new Error("Could not reset test database."),
    );
    request.onblocked = () => reject(new Error("Test database deletion was blocked."));
  });
}

async function addOpeningStock(quantity: number): Promise<void> {
  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: PRODUCT,
    quantityDelta: quantity,
    movementType: "opening-stock",
    reason: "Automated transaction test",
  });
}

async function readBalance(): Promise<number | undefined> {
  const records = await loadStockRecords(BUSINESS, STORE);
  return records.find((record) => record.balance.productId === PRODUCT)
    ?.balance.quantityOnHand;
}

async function readMovementCount(): Promise<number> {
  return (await loadInventoryMovements(BUSINESS, STORE)).length;
}

test("first opening stock saves one balance and one movement", async () => {
  await resetDatabase();
  await addOpeningStock(10);
  assert.equal(await readBalance(), 10);
  assert.equal(await readMovementCount(), 1);
});

test("duplicate opening stock is rejected without changing saved records", async () => {
  await resetDatabase();
  await addOpeningStock(10);

  await assert.rejects(
    recordStockMovement({
      businessId: BUSINESS,
      storeId: STORE,
      productId: PRODUCT,
      quantityDelta: 5,
      movementType: "opening-stock",
      reason: "Duplicate opening attempt",
    }),
    /balance already exists/i,
  );

  assert.equal(await readBalance(), 10);
  assert.equal(await readMovementCount(), 1);
});

test("a valid stock increase updates balance and movement history", async () => {
  await resetDatabase();
  await addOpeningStock(10);

  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: PRODUCT,
    quantityDelta: 5,
    movementType: "adjustment",
    reason: "Test stock received",
  });

  assert.equal(await readBalance(), 15);
  assert.equal(await readMovementCount(), 2);
});

test("a reduction below zero is rejected without changing balance or history", async () => {
  await resetDatabase();
  await addOpeningStock(10);

  await assert.rejects(
    recordStockMovement({
      businessId: BUSINESS,
      storeId: STORE,
      productId: PRODUCT,
      quantityDelta: -11,
      movementType: "adjustment",
      reason: "Test invalid reduction",
    }),
    /stock negative/i,
  );

  assert.equal(await readBalance(), 10);
  assert.equal(await readMovementCount(), 1);
});

test("zero quantity and a missing reason are rejected without writes", async () => {
  await resetDatabase();

  await assert.rejects(
    recordStockMovement({
      businessId: BUSINESS,
      storeId: STORE,
      productId: PRODUCT,
      quantityDelta: 0,
      movementType: "adjustment",
      reason: "Zero quantity test",
    }),
    /non-zero number/i,
  );

  await assert.rejects(
    recordStockMovement({
      businessId: BUSINESS,
      storeId: STORE,
      productId: PRODUCT,
      quantityDelta: 2,
      movementType: "adjustment",
      reason: "   ",
    }),
    /reason/i,
  );

  assert.equal(await readBalance(), undefined);
  assert.equal(await readMovementCount(), 0);
});
// Purchase receipt idempotency tests. These use only the isolated test database.
const RECEIPT_USER = "inventory-test-user";

function receiptInput(quantity: number) {
  return {
    businessId: BUSINESS,
    storeId: STORE,
    productId: PRODUCT,
    purchaseId: "inventory-test-purchase",
    purchaseLineId: "inventory-test-purchase-line",
    quantity,
    createdByUserId: RECEIPT_USER,
  };
}

test("receiving a purchase line increases stock and records one movement", async () => {
  await resetDatabase();

  await receivePurchaseLineStock(receiptInput(5));

  assert.equal(await readBalance(), 5);
  assert.equal(await readMovementCount(), 1);

  const movements = await loadInventoryMovements(BUSINESS, STORE);
  assert.equal(movements[0]?.movementType, "purchase-receipt");
  assert.equal(movements[0]?.quantityDelta, 5);
  assert.equal(
    movements[0]?.referenceId,
    "purchase-receipt:inventory-test-purchase:inventory-test-purchase-line",
  );
});

test("retrying the same purchase receipt does not add stock twice", async () => {
  await resetDatabase();

  await receivePurchaseLineStock(receiptInput(5));
  await receivePurchaseLineStock(receiptInput(5));

  assert.equal(await readBalance(), 5);
  assert.equal(await readMovementCount(), 1);
});

test("conflicting details for an existing receipt reference are rejected", async () => {
  await resetDatabase();

  await receivePurchaseLineStock(receiptInput(5));

  await assert.rejects(
    receivePurchaseLineStock(receiptInput(7)),
    /different details/i,
  );

  assert.equal(await readBalance(), 5);
  assert.equal(await readMovementCount(), 1);
});

test("invalid purchase receipt quantities leave inventory unchanged", async () => {
  await resetDatabase();

  for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      receivePurchaseLineStock(receiptInput(quantity)),
      /quantity must be greater than zero/i,
    );
  }

  assert.equal(await readBalance(), undefined);
  assert.equal(await readMovementCount(), 0);
});
// WATCHOUT_INVENTORY_WORKSPACE_ISOLATION_TESTS_V1
test("stock balances and movements are isolated between stores", async () => {
  await resetDatabase();

  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: PRODUCT,
    quantityDelta: 10,
    movementType: "opening-stock",
    reason: "Store A opening stock",
  });

  await recordStockMovement({
    businessId: BUSINESS,
    storeId: "inventory-test-store-b",
    productId: PRODUCT,
    quantityDelta: 25,
    movementType: "opening-stock",
    reason: "Store B opening stock",
  });

  const storeA = await loadStockRecords(BUSINESS, STORE);
  const storeB = await loadStockRecords(BUSINESS, "inventory-test-store-b");

  assert.equal(storeA.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 10);
  assert.equal(storeB.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 25);
  assert.equal((await loadInventoryMovements(BUSINESS, STORE)).length, 1);
  assert.equal((await loadInventoryMovements(BUSINESS, "inventory-test-store-b")).length, 1);
});

test("stock balances and movements are isolated between businesses", async () => {
  await resetDatabase();

  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: PRODUCT,
    quantityDelta: 10,
    movementType: "opening-stock",
    reason: "Business A opening stock",
  });

  await recordStockMovement({
    businessId: "inventory-test-business-b",
    storeId: STORE,
    productId: PRODUCT,
    quantityDelta: 30,
    movementType: "opening-stock",
    reason: "Business B opening stock",
  });

  const businessA = await loadStockRecords(BUSINESS, STORE);
  const businessB = await loadStockRecords("inventory-test-business-b", STORE);

  assert.equal(businessA.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 10);
  assert.equal(businessB.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 30);
  assert.equal((await loadInventoryMovements(BUSINESS, STORE)).length, 1);
  assert.equal((await loadInventoryMovements("inventory-test-business-b", STORE)).length, 1);
});

test("a receipt reference cannot be reused by another business", async () => {
  await resetDatabase();

  await receivePurchaseLineStock(receiptInput(5));

  await assert.rejects(
    receivePurchaseLineStock({
      ...receiptInput(5),
      businessId: "inventory-test-business-b",
    }),
    /different details/i,
  );

  assert.equal(await readBalance(), 5);
  assert.equal(await readMovementCount(), 1);
  assert.equal((await loadStockRecords("inventory-test-business-b", STORE)).length, 0);
  assert.equal((await loadInventoryMovements("inventory-test-business-b", STORE)).length, 0);
});

test("a receipt reference cannot be reused by another store", async () => {
  await resetDatabase();

  await receivePurchaseLineStock(receiptInput(5));

  await assert.rejects(
    receivePurchaseLineStock({
      ...receiptInput(5),
      storeId: "inventory-test-store-b",
    }),
    /different details/i,
  );

  assert.equal(await readBalance(), 5);
  assert.equal(await readMovementCount(), 1);
  assert.equal((await loadStockRecords(BUSINESS, "inventory-test-store-b")).length, 0);
  assert.equal((await loadInventoryMovements(BUSINESS, "inventory-test-store-b")).length, 0);
});
