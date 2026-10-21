import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  DuplicateProductIdentifierError,
  loadProducts,
  saveProduct,
  updateStoredProduct,
  saveProductsAtomically,
} from "./productStorage.ts";
import type { Product } from "../types/domain";

const DB_NAME = "watchout-pos-modular";

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = new Date().toISOString();

  return {
    id: "product-test-1",
    businessId: "business-a",
    name: "Test Product",
    sku: "SKU-001",
    barcode: "BAR-001",
    productType: "finished-good",
    inventoryMode: "stocked",
    unitOfMeasure: "each",
    availableForDirectSale: true,
    sellingPrice: { amountMinor: 10000, currency: "INR" },
    costPrice: { amountMinor: 5000, currency: "INR" },
    gstPercentage: 18,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function resetDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Product database reset blocked."));
  });
}

beforeEach(async () => {
  await resetDatabase();
});

test("saves and reloads products from IndexedDB", async () => {
  const product = makeProduct();
  await saveProduct(product);

  const loaded = await loadProducts("business-a");

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, product.id);
  assert.equal(loaded[0].name, product.name);
  assert.equal(loaded[0].sellingPrice.amountMinor, 10000);
});

test("isolates loaded products by business", async () => {
  await saveProduct(makeProduct());
  await saveProduct(makeProduct({
    id: "product-business-b",
    businessId: "business-b",
    sku: "SKU-001",
    barcode: "BAR-001",
  }));

  assert.deepEqual(
    (await loadProducts("business-a")).map((product) => product.id),
    ["product-test-1"],
  );
  assert.deepEqual(
    (await loadProducts("business-b")).map((product) => product.id),
    ["product-business-b"],
  );
  assert.deepEqual(await loadProducts("business-c"), []);
});

test("rejects duplicate SKU within the same business", async () => {
  await saveProduct(makeProduct());

  await assert.rejects(
    saveProduct(makeProduct({
      id: "product-duplicate-sku",
      sku: " sku-001 ",
      barcode: "BAR-002",
    })),
    (error: unknown) =>
      error instanceof DuplicateProductIdentifierError &&
      /SKU/.test(error.message),
  );

  assert.equal((await loadProducts("business-a")).length, 1);
});

test("rejects duplicate barcode within the same business", async () => {
  await saveProduct(makeProduct());

  await assert.rejects(
    saveProduct(makeProduct({
      id: "product-duplicate-barcode",
      sku: "SKU-002",
      barcode: " bar-001 ",
    })),
    (error: unknown) =>
      error instanceof DuplicateProductIdentifierError &&
      /barcode/.test(error.message),
  );

  assert.equal((await loadProducts("business-a")).length, 1);
});

test("allows the same SKU and barcode in different businesses", async () => {
  await saveProduct(makeProduct());
  await saveProduct(makeProduct({
    id: "product-business-b",
    businessId: "business-b",
  }));

  assert.equal((await loadProducts("business-a")).length, 1);
  assert.equal((await loadProducts("business-b")).length, 1);
});

test("rejects updating a product that does not belong to the specified business", async () => {
  const original = makeProduct();
  await saveProduct(original);

  await assert.rejects(
    updateStoredProduct({
      ...original,
      businessId: "business-b",
      name: "Unauthorized change",
    }),
    /no longer exists in this business/,
  );

  const loaded = await loadProducts("business-a");
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, original.name);
});

test("rejects a bulk import with duplicate identifiers before writing", async () => {
  const products = [
    makeProduct({ id: "bulk-1", sku: "BULK-001", barcode: "BULK-BAR-1" }),
    makeProduct({ id: "bulk-2", sku: " bulk-001 ", barcode: "BULK-BAR-2" }),
  ];

  await assert.rejects(
    saveProductsAtomically(products, "business-a"),
    (error: unknown) =>
      error instanceof DuplicateProductIdentifierError &&
      /SKU/.test(error.message),
  );

  assert.deepEqual(await loadProducts("business-a"), []);
});

test("rejects a bulk import containing a different business without writing", async () => {
  const products = [
    makeProduct({ id: "bulk-valid", sku: "BULK-101", barcode: "BULK-BAR-101" }),
    makeProduct({
      id: "bulk-wrong-business",
      businessId: "business-b",
      sku: "BULK-102",
      barcode: "BULK-BAR-102",
    }),
  ];

  await assert.rejects(
    saveProductsAtomically(products, "business-a"),
    /Every imported product must belong to the target business/,
  );

  assert.deepEqual(await loadProducts("business-a"), []);
  assert.deepEqual(await loadProducts("business-b"), []);
});

test("rejects a bulk import that duplicates an existing product SKU", async () => {
  await saveProduct(makeProduct());

  await assert.rejects(
    saveProductsAtomically(
      [
        makeProduct({
          id: "bulk-new",
          sku: "SKU-NEW",
          barcode: "BAR-NEW",
        }),
        makeProduct({
          id: "bulk-conflict",
          sku: "sku-001",
          barcode: "BAR-CONFLICT",
        }),
      ],
      "business-a",
    ),
    (error: unknown) =>
      error instanceof DuplicateProductIdentifierError &&
      /SKU/.test(error.message),
  );

  assert.deepEqual(
    (await loadProducts("business-a")).map((product) => product.id),
    ["product-test-1"],
  );
});

