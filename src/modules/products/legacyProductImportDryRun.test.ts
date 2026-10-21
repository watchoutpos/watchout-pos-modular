import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Product } from "../../shared/types/domain.ts";
import { runLegacyProductImportDryRun } from "./legacyProductImport.ts";

const previewPath =
  "D:/Watchout-Backups/WatchOut-POS-Modular-Migration/product-import-preview-commercial-20261016-220023.json";

const businessId = "local-demo-business";

async function readPreview(): Promise<unknown> {
  const raw = await readFile(previewPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
}

test("dry-run approves eight valid products when the destination is empty", async () => {
  const report = runLegacyProductImportDryRun(
    await readPreview(),
    [],
    businessId,
  );

  assert.equal(report.status, "DRY_RUN_PASSED");
  assert.equal(report.readyToImport, true);
  assert.equal(report.expectedSourceCount, 8);
  assert.equal(report.mappedCount, 8);
  assert.equal(report.importableProducts.length, 8);
  assert.deepEqual(report.conflicts, []);
  assert.deepEqual(report.errors, []);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.inventoryImported, false);
});

test("dry-run blocks an existing SKU without modifying destination products", async () => {
  const existing: Product[] = [
    {
      id: "existing-test-product",
      businessId,
      name: "Existing product",
      sku: "wo-000001",
      barcode: null,
      productType: "finished-good",
      inventoryMode: "stocked",
      unitOfMeasure: "each",
      availableForDirectSale: true,
      sellingPrice: { amountMinor: 18000, currency: "INR" },
      costPrice: { amountMinor: 8500, currency: "INR" },
      gstPercentage: 18,
      mrp: { amountMinor: 18000, currency: "INR" },
      hsnSac: null,
      taxInclusive: false,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const before = structuredClone(existing);

  const report = runLegacyProductImportDryRun(
    await readPreview(),
    existing,
    businessId,
  );

  assert.equal(report.status, "DRY_RUN_BLOCKED");
  assert.equal(report.readyToImport, false);
  assert.ok(report.conflicts.some((issue) => issue.sku === "WO-000001"));
  assert.deepEqual(existing, before);
  assert.equal(report.writesPerformed, false);
});

test("dry-run blocks a mismatched business ID", async () => {
  const report = runLegacyProductImportDryRun(
    await readPreview(),
    [],
    "different-business",
  );

  assert.equal(report.status, "DRY_RUN_BLOCKED");
  assert.equal(report.readyToImport, false);
  assert.ok(report.errors.some((issue) => issue.reason.includes("Business ID mismatch")));
  assert.equal(report.writesPerformed, false);
});
