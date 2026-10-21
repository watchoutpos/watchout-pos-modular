import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadStockRecords, loadInventoryMovements } from "./inventoryStorage.ts";

const DB_NAME = "watchout-pos-inventory";
const BUSINESS = "v1-upgrade-business";
const STORE = "v1-upgrade-store";
const PRODUCT = "v1-upgrade-product";

test("genuine v1 database upgrades to v3 and preserves stock and movement history", async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("balances", { keyPath: "id" });
      const movements = db.createObjectStore("movements", { keyPath: "id" });
      movements.createIndex("byProduct", "productId", { unique: false });
    };

    request.onerror = () => reject(request.error ?? new Error("Could not create v1 fixture."));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["balances", "movements"], "readwrite");

      tx.objectStore("balances").put({
        id: `${BUSINESS}:${STORE}:${PRODUCT}`,
        businessId: BUSINESS,
        storeId: STORE,
        productId: PRODUCT,
        quantityOnHand: 7,
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      tx.objectStore("movements").put({
        id: "v1-opening-movement",
        businessId: BUSINESS,
        storeId: STORE,
        productId: PRODUCT,
        quantityDelta: 7,
        movementType: "opening-stock",
        reason: "Version 1 migration fixture",
        referenceId: null,
        createdByUserId: "v1-upgrade-user",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        const error = tx.error ?? new Error("Could not seed v1 fixture.");
        db.close();
        reject(error);
      };
      tx.onabort = () => {
        const error = tx.error ?? new Error("Seeding v1 fixture was aborted.");
        db.close();
        reject(error);
      };
    };
  });

  // These application calls must trigger the real version 1 -> version 3 upgrade.
  const records = await loadStockRecords(BUSINESS, STORE);
  const movements = await loadInventoryMovements(BUSINESS, STORE);

  assert.equal(records.length, 1);
  assert.equal(records[0].balance.quantityOnHand, 7);
  assert.equal(records[0].balance.productId, PRODUCT);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].id, "v1-opening-movement");
  assert.equal(movements[0].quantityDelta, 7);

  const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not inspect upgraded database."));
  });

  try {
    assert.equal(upgraded.version, 3);
    assert.equal(upgraded.objectStoreNames.contains("balances"), true);
    assert.equal(upgraded.objectStoreNames.contains("movements"), true);
    assert.equal(upgraded.objectStoreNames.contains("sales"), true);
    assert.equal(
      upgraded.transaction("sales", "readonly")
        .objectStore("sales")
        .indexNames.contains("byBusinessStoreDate"),
      true,
    );
  } finally {
    upgraded.close();
  }
});
