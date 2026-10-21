import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateProductInput } from "./validation.ts";

const previewPath =
  "D:/Watchout-Backups/WatchOut-POS-Modular-Migration/product-import-preview-commercial-20261016-220023.json";

test("legacy preview has eight valid products for the demo business", async () => {
  const raw = await readFile(previewPath, "utf8");
  const preview: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));

  assert.ok(typeof preview === "object" && preview !== null);
  const data = preview as Record<string, unknown>;

  assert.equal(data.status, "DRY_RUN_PASSED");
  assert.equal(data.writesPerformed, false);
  assert.equal(data.inventoryImported, false);
  assert.equal(data.expectedSourceCount, 8);
  assert.equal(data.mappedCount, 8);
  assert.equal(data.businessId, "local-demo-business");
  assert.deepEqual(data.errors, []);
  assert.ok(Array.isArray(data.products));
  assert.equal(data.products.length, 8);

  const expected: Record<string, {
    selling: number;
    cost: number;
    mrp: number;
    gst: number;
    taxInclusive: boolean;
  }> = {
    "WO-000001": { selling: 18000, cost: 8500, mrp: 18000, gst: 18, taxInclusive: false },
    "WO-000002": { selling: 14000, cost: 5500, mrp: 14000, gst: 18, taxInclusive: false },
    "WO-000003": { selling: 15000, cost: 6500, mrp: 15000, gst: 18, taxInclusive: false },
    "WO-000004": { selling: 19000, cost: 8000, mrp: 19000, gst: 18, taxInclusive: false },
    "WO-000005": { selling: 21000, cost: 9000, mrp: 21000, gst: 18, taxInclusive: false },
    "WO-000006": { selling: 22000, cost: 9500, mrp: 22000, gst: 18, taxInclusive: false },
    "WO-11332": { selling: 15000, cost: 12000, mrp: 16300, gst: 18, taxInclusive: true },
    "WO-74013513": { selling: 150000, cost: 120000, mrp: 150000, gst: 18, taxInclusive: false },
  };

  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();

  for (const candidate of data.products) {
    const result = validateProductInput(candidate);
    assert.equal(
      result.valid,
      true,
      `Invalid product: ${JSON.stringify(result.valid ? {} : result.errors)}`
    );
    if (!result.valid) continue;

    const product = result.value;
    assert.equal(product.businessId, "local-demo-business");

    const sku = product.sku;
    assert.ok(sku, "Every legacy product must have an SKU");
    assert.ok(expected[sku], `Unexpected SKU: ${sku}`);

    const commercial = expected[sku];
    assert.equal(product.sellingPrice.amountMinor, commercial.selling, `${sku} selling price`);
    assert.equal(product.costPrice?.amountMinor, commercial.cost, `${sku} cost price`);
    assert.equal(product.mrp?.amountMinor, commercial.mrp, `${sku} MRP`);
    assert.equal(product.gstPercentage, commercial.gst, `${sku} GST`);
    assert.equal(product.taxInclusive, commercial.taxInclusive, `${sku} tax-inclusive flag`);

    const normalizedSku = sku.trim().toLowerCase();
    assert.ok(!seenSkus.has(normalizedSku), `Duplicate SKU: ${sku}`);
    seenSkus.add(normalizedSku);

    if (product.barcode) {
      const normalizedBarcode = product.barcode.trim().toLowerCase();
      assert.ok(!seenBarcodes.has(normalizedBarcode), `Duplicate barcode: ${product.barcode}`);
      seenBarcodes.add(normalizedBarcode);
    }
  }

  assert.equal(seenSkus.size, 8);
});