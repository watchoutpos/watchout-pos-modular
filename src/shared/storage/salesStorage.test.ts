import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { recordStockMovement, loadStockRecords, loadInventoryMovements } from "./inventoryStorage.ts";
import { cancelSaleAtomically, completeSaleAtomically, loadSales } from "./salesStorage.ts";
import type { Sale } from "../types/domain";

const BUSINESS = "sales-test-business";
const STORE = "sales-test-store";
const USER = "sales-test-user";
const PRODUCT = "sales-test-product";

function makeSale(id = "sale-test-1"): Sale {
  const now = new Date().toISOString();
  return {
    id,
    businessId: BUSINESS,
    storeId: STORE,
    createdByUserId: USER,
    status: "completed",
    lines: [{
      id: `${id}-line-1`,
      productId: PRODUCT,
      productNameSnapshot: "Test item",
      quantity: 2,
      unitPrice: { amountMinor: 10000, currency: "INR" },
      lineDiscount: { amountMinor: 0, currency: "INR" },
      discountPercentage: 0,
      gstPercentage: 18,
      taxInclusive: false,
      stockTracked: true,
      taxableAmount: { amountMinor: 20000, currency: "INR" },
      taxAmount: { amountMinor: 3600, currency: "INR" },
      lineTotal: { amountMinor: 23600, currency: "INR" },
    }],
    subtotal: { amountMinor: 20000, currency: "INR" },
    discountTotal: { amountMinor: 0, currency: "INR" },
    taxTotal: { amountMinor: 3600, currency: "INR" },
    grandTotal: { amountMinor: 23600, currency: "INR" },
    syncStatus: "local-only",
    createdAt: now,
    updatedAt: now,
  };
}

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("watchout-pos-inventory");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database reset blocked."));
  });
}

beforeEach(async () => {
  await resetDatabase();
});

async function seedStock(quantity: number): Promise<void> {
  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: PRODUCT,
    quantityDelta: quantity,
    movementType: "opening-stock",
    reason: "Automated test setup",
  });
}

test("schema upgrade preserves stock and records a completed sale atomically", async () => {
  await seedStock(10);
  await completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 2 }]);

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);

  assert.equal(records.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 8);
  assert.equal(movements.filter((m) => m.movementType === "sale").length, 1);
  assert.equal(movements.find((m) => m.movementType === "sale")?.referenceId, "sale-test-1");
  assert.equal(sales.length, 1);
  assert.equal(sales[0].grandTotal.amountMinor, 23600);
});

test("duplicate sale ID is rejected without a second stock deduction", async () => {
  await seedStock(10);
  await completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 2 }]);

  await assert.rejects(
    completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 2 }]),
    /already been recorded/,
  );

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);

  assert.equal(records.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 8);
  assert.equal(movements.filter((m) => m.movementType === "sale").length, 1);
  assert.equal(sales.length, 1);
});

test("concurrent completion attempts with same sale ID deduct stock only once", async () => {
  await seedStock(10);

  const sale = makeSale("sale-concurrent-completion");
  const deductions = [{ productId: PRODUCT, quantity: 2 }];

  const results = await Promise.allSettled([
    completeSaleAtomically(sale, deductions),
    completeSaleAtomically(sale, deductions),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);

  assert.equal(
    records.find((record) => record.balance.productId === PRODUCT)?.balance.quantityOnHand,
    8,
  );
  assert.equal(sales.filter((saved) => saved.id === sale.id).length, 1);
  assert.equal(
    movements.filter(
      (movement) => movement.movementType === "sale" && movement.referenceId === sale.id,
    ).length,
    1,
  );
});
test("insufficient stock rolls back sale, balance update and movement", async () => {
  await seedStock(1);

  await assert.rejects(
    completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 2 }]),
    /Insufficient stock/,
  );

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);

  assert.equal(records.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 1);
  assert.equal(movements.filter((m) => m.movementType === "sale").length, 0);
  assert.equal(sales.length, 0);
});

test("missing stock balance rejects sale without writing any sale record", async () => {
  await assert.rejects(
    completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 2 }]),
    /not been initialized/,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
});

test("stock deduction quantity must match the sold quantity", async () => {
  await seedStock(10);

  await assert.rejects(
    completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 1 }]),
    /Sale line quantities must match stock deductions/,
  );

  assert.equal(
    (await loadStockRecords(BUSINESS, STORE))
      .find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand,
    10,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
  assert.equal(
    (await loadInventoryMovements(BUSINESS, STORE))
      .filter((m) => m.movementType === "sale").length,
    0,
  );
});

test("stock deduction product must exist on a sale line", async () => {
  await seedStock(10);

  await assert.rejects(
    completeSaleAtomically(makeSale(), [
      { productId: PRODUCT, quantity: 2 },
      { productId: "not-on-this-sale", quantity: 1 },
    ]),
    /Sale line quantities must match stock deductions/,
  );

  assert.equal(
    (await loadStockRecords(BUSINESS, STORE))
      .find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand,
    10,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
  assert.equal(
    (await loadInventoryMovements(BUSINESS, STORE))
      .filter((m) => m.movementType === "sale").length,
    0,
  );
});
test("multi-product sale rolls back every stock change when one product has insufficient stock", async () => {
  const SECOND_PRODUCT = "sales-test-second-product";

  await seedStock(10);
  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: SECOND_PRODUCT,
    quantityDelta: 1,
    movementType: "opening-stock",
    reason: "Automated multi-product rollback setup",
  });

  const sale = makeSale("sale-multi-product-rollback");
  sale.lines.push({
    id: "sale-multi-product-rollback-line-2",
    productId: SECOND_PRODUCT,
    productNameSnapshot: "Second test item",
    quantity: 2,
    unitPrice: { amountMinor: 10000, currency: "INR" },
    lineDiscount: { amountMinor: 0, currency: "INR" },
    discountPercentage: 0,
    gstPercentage: 18,
    taxInclusive: false,
    stockTracked: true,
    taxableAmount: { amountMinor: 20000, currency: "INR" },
    taxAmount: { amountMinor: 3600, currency: "INR" },
    lineTotal: { amountMinor: 23600, currency: "INR" },
  });
  sale.subtotal = { amountMinor: 40000, currency: "INR" };
  sale.discountTotal = { amountMinor: 0, currency: "INR" };
  sale.taxTotal = { amountMinor: 7200, currency: "INR" };
  sale.grandTotal = { amountMinor: 47200, currency: "INR" };

  await assert.rejects(
    completeSaleAtomically(sale, [
      { productId: PRODUCT, quantity: 2 },
      { productId: SECOND_PRODUCT, quantity: 2 },
    ]),
    /Insufficient stock/,
  );

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);

  assert.equal(
    records.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand,
    10,
    "First product stock must be rolled back.",
  );
  assert.equal(
    records.find((r) => r.balance.productId === SECOND_PRODUCT)?.balance.quantityOnHand,
    1,
    "Second product stock must remain unchanged.",
  );
  assert.equal(movements.filter((m) => m.movementType === "sale").length, 0);
  assert.equal(sales.length, 0);
});
test("tampered sale totals are rejected before storage changes", async () => {
  await seedStock(10);
  const sale = makeSale("sale-tampered-totals");
  sale.grandTotal = { amountMinor: 1, currency: "INR" };
  await assert.rejects(
    completeSaleAtomically(sale, [{ productId: PRODUCT, quantity: 2 }]),
    /Sale totals do not match/,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
  assert.equal((await loadStockRecords(BUSINESS, STORE))
    .find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 10);
});

test("missing deduction for a stock-tracked product is rejected", async () => {
  await seedStock(10);
  await assert.rejects(
    completeSaleAtomically(makeSale("sale-missing-deduction"), []),
    /Every stock-tracked sale product/,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
  assert.equal((await loadStockRecords(BUSINESS, STORE))
    .find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand, 10);
});

test("non-stock-tracked product rejects a stock deduction", async () => {
  const sale = makeSale("sale-nonstock-deduction");
  sale.lines[0].stockTracked = false;
  await assert.rejects(
    completeSaleAtomically(sale, [{ productId: PRODUCT, quantity: 2 }]),
    /not marked as stock-tracked/,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
});

test("tampered GST amount is rejected", async () => {
  await seedStock(10);
  const sale = makeSale("sale-tampered-gst");
  sale.lines[0].taxAmount = { amountMinor: 1, currency: "INR" };
  await assert.rejects(
    completeSaleAtomically(sale, [{ productId: PRODUCT, quantity: 2 }]),
    /financial values do not match/,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
});
test("invalid deduction is rejected before storage changes", async () => {
  await seedStock(10);

  await assert.rejects(
    completeSaleAtomically(makeSale(), [{ productId: PRODUCT, quantity: 0 }]),
    /positive quantity/,
  );

  assert.equal(
    (await loadStockRecords(BUSINESS, STORE))
      .find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand,
    10,
  );
  assert.equal((await loadSales(BUSINESS, STORE)).length, 0);
});
test("sale cancellation restores tracked stock atomically", async () => {
  await seedStock(10);
  await completeSaleAtomically(makeSale("sale-cancel-test"), [
    { productId: PRODUCT, quantity: 2 },
  ]);

  const cancelled = await cancelSaleAtomically({
    saleId: "sale-cancel-test",
    businessId: BUSINESS,
    storeId: STORE,
    actorUserId: USER,
    reason: "Customer order cancelled",
  });

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledByUserId, USER);
  assert.equal(cancelled.cancellationReason, "Customer order cancelled");
  assert.ok(cancelled.cancelledAt);
  assert.equal(
    records.find((record) => record.balance.productId === PRODUCT)?.balance.quantityOnHand,
    10,
    "Cancellation must restore the quantity deducted by the sale.",
  );
  assert.equal(movements.filter((movement) => movement.movementType === "sale").length, 1);
  const reversals = movements.filter(
    (movement) => movement.movementType === "sale-return" &&
      movement.referenceId === "sale-cancel-test",
  );
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].quantityDelta, 2);
  assert.equal(reversals[0].createdByUserId, USER);
  assert.equal(sales.length, 1, "The original sale must remain in history.");
  assert.equal(sales[0].status, "cancelled");
});

test("a sale cannot be cancelled twice or restore stock twice", async () => {
  await seedStock(10);
  await completeSaleAtomically(makeSale("sale-cancel-twice"), [
    { productId: PRODUCT, quantity: 2 },
  ]);

  const input = {
    saleId: "sale-cancel-twice",
    businessId: BUSINESS,
    storeId: STORE,
    actorUserId: USER,
    reason: "Duplicate cancellation test",
  };
  await cancelSaleAtomically(input);

  await assert.rejects(
    cancelSaleAtomically(input),
    /already been cancelled/i,
  );

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  assert.equal(
    records.find((record) => record.balance.productId === PRODUCT)?.balance.quantityOnHand,
    10,
  );
  assert.equal(
    movements.filter((movement) =>
      movement.movementType === "sale-return" &&
      movement.referenceId === "sale-cancel-twice"
    ).length,
    1,
  );
});

test("sale cancellation rejects an empty reason and a mismatched store without changes", async () => {
  await seedStock(10);
  await completeSaleAtomically(makeSale("sale-cancel-validation"), [
    { productId: PRODUCT, quantity: 2 },
  ]);

  await assert.rejects(
    cancelSaleAtomically({
      saleId: "sale-cancel-validation",
      businessId: BUSINESS,
      storeId: STORE,
      actorUserId: USER,
      reason: "   ",
    }),
    /reason/i,
  );

  await assert.rejects(
    cancelSaleAtomically({
      saleId: "sale-cancel-validation",
      businessId: BUSINESS,
      storeId: "another-store",
      actorUserId: USER,
      reason: "Wrong store validation",
    }),
    /does not belong/i,
  );

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const sales = await loadSales(BUSINESS, STORE);
  assert.equal(
    records.find((record) => record.balance.productId === PRODUCT)?.balance.quantityOnHand,
    8,
  );
  assert.equal(movements.filter((movement) => movement.movementType === "sale-return").length, 0);
  assert.equal(sales[0].status, "completed");
});

test("sale cancellation rolls back every restoration when one product balance is missing", async () => {
  const SECOND_PRODUCT = "sales-test-cancel-second-product";

  await seedStock(10);
  await recordStockMovement({
    businessId: BUSINESS,
    storeId: STORE,
    productId: SECOND_PRODUCT,
    quantityDelta: 10,
    movementType: "opening-stock",
    reason: "Automated cancellation rollback setup",
  });

  const sale = makeSale("sale-cancel-multi-product-rollback");
  sale.lines.push({
    id: "sale-cancel-multi-product-rollback-line-2",
    productId: SECOND_PRODUCT,
    productNameSnapshot: "Second cancellation test item",
    quantity: 2,
    unitPrice: { amountMinor: 10000, currency: "INR" },
    lineDiscount: { amountMinor: 0, currency: "INR" },
    discountPercentage: 0,
    gstPercentage: 18,
    taxInclusive: false,
    stockTracked: true,
    taxableAmount: { amountMinor: 20000, currency: "INR" },
    taxAmount: { amountMinor: 3600, currency: "INR" },
    lineTotal: { amountMinor: 23600, currency: "INR" },
  });
  sale.subtotal = { amountMinor: 40000, currency: "INR" };
  sale.discountTotal = { amountMinor: 0, currency: "INR" };
  sale.taxTotal = { amountMinor: 7200, currency: "INR" };
  sale.grandTotal = { amountMinor: 47200, currency: "INR" };

  await completeSaleAtomically(sale, [
    { productId: PRODUCT, quantity: 2 },
    { productId: SECOND_PRODUCT, quantity: 2 },
  ]);

  // Damage only the fake IndexedDB test fixture after completing the test sale.
  // This forces cancellation to abort rather than partially restore stock.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("watchout-pos-inventory", 3);
    request.onerror = () => reject(request.error ?? new Error("Could not open test database."));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["balances"], "readwrite");
      tx.objectStore("balances").delete(`${BUSINESS}:${STORE}:${SECOND_PRODUCT}`);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        const error = tx.error ?? new Error("Could not remove test balance.");
        db.close();
        reject(error);
      };
      tx.onabort = () => {
        const error = tx.error ?? new Error("Test balance removal was aborted.");
        db.close();
        reject(error);
      };
    };
  });

  await assert.rejects(
    cancelSaleAtomically({
      saleId: sale.id,
      businessId: BUSINESS,
      storeId: STORE,
      actorUserId: USER,
      reason: "Test rollback when a product balance is missing",
    }),
    /valid stock balance is missing/i,
  );

  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);
  const savedSales = await loadSales(BUSINESS, STORE);

  assert.equal(
    records.find((r) => r.balance.productId === PRODUCT)?.balance.quantityOnHand,
    8,
    "First product stock must remain at its post-sale quantity after rollback.",
  );
  assert.equal(
    records.some((r) => r.balance.productId === SECOND_PRODUCT),
    false,
    "The deliberately removed second balance must remain absent.",
  );
  assert.equal(
    movements.filter((m) => m.movementType === "sale-return" && m.referenceId === sale.id).length,
    0,
    "No cancellation movement may be committed after rollback.",
  );
  assert.equal(
    savedSales.find((saved) => saved.id === sale.id)?.status,
    "completed",
    "The sale must remain completed after a failed cancellation.",
  );
});

test("loadSales filters by business and store and sorts newest first", async () => {
  // Initialize the isolated fake database through the storage API so its schema exists.
  await seedStock(20);
  await completeSaleAtomically(
    { ...makeSale("history-oldest"), createdAt: "2026-01-01T10:00:00.000Z" },
    [{ productId: PRODUCT, quantity: 2 }],
  );

  const newest = {
    ...makeSale("history-newest"),
    createdAt: "2026-01-03T10:00:00.000Z",
    businessId: BUSINESS,
    storeId: STORE,
  };
  const middle = {
    ...makeSale("history-middle"),
    createdAt: "2026-01-02T10:00:00.000Z",
    businessId: BUSINESS,
    storeId: STORE,
  };
  const otherStore = {
    ...makeSale("history-other-store"),
    createdAt: "2026-01-04T10:00:00.000Z",
    businessId: BUSINESS,
    storeId: "different-store",
  };
  const otherBusiness = {
    ...makeSale("history-other-business"),
    createdAt: "2026-01-05T10:00:00.000Z",
    businessId: "different-business",
    storeId: STORE,
  };

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("watchout-pos-inventory");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  try {
    assert.ok(db.objectStoreNames.contains("sales"), "sales object store should exist after storage API initialization");
    const tx = db.transaction("sales", "readwrite");
    const store = tx.objectStore("sales");
    store.add(newest);
    store.add(middle);
    store.add(otherStore);
    store.add(otherBusiness);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Test sale seeding aborted."));
    });
  } finally {
    db.close();
  }

  const loaded = await loadSales(BUSINESS, STORE);
  assert.deepEqual(
    loaded.map((sale) => sale.id),
    ["history-newest", "history-middle", "history-oldest"],
  );
  assert.ok(loaded.every((sale) => sale.businessId === BUSINESS && sale.storeId === STORE));

  // Use distinct values for both dimensions: the previous assertions accidentally
  // reused the seeded "otherBusiness" / "otherStore" records as valid matches.
  assert.equal((await loadSales("unseeded-business", STORE)).length, 0);
  assert.equal((await loadSales(BUSINESS, "unseeded-store")).length, 0);
});

