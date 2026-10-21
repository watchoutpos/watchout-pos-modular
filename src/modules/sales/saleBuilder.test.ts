import test from "node:test";
import assert from "node:assert/strict";
import type { Product } from "../../shared/types/domain.ts";
import { buildSaleDraft } from "./saleBuilder.ts";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "p1",
  businessId: "biz1",
  name: "Tea",
  sku: "TEA-1",
  barcode: null,
  productType: "finished-good",
  inventoryMode: "stocked",
  unitOfMeasure: "each",
  availableForDirectSale: true,
  sellingPrice: { amountMinor: 10000, currency: "INR" },
  gstPercentage: 18,
  taxInclusive: false,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const cartLine = (overrides: Record<string, unknown> = {}) => ({
  productId: "p1",
  productName: "Tea",
  sku: "TEA-1",
  unitPriceMinor: 10000,
  currency: "INR",
  quantity: 1,
  ...overrides,
});

function context() {
  let sequence = 0;
  return {
    businessId: "biz1",
    storeId: "store1",
    createdByUserId: "user1",
    createdAt: "2026-10-17T12:00:00.000Z",
    createId: () => `id-${++sequence}`,
  };
}

test("builds a sale snapshot with GST-exclusive totals and stock deduction", () => {
  const result = buildSaleDraft([cartLine()], [product()], {}, context());

  assert.equal(result.sale.grandTotal.amountMinor, 11800);
  assert.equal(result.sale.subtotal.amountMinor, 10000);
  assert.equal(result.sale.taxTotal.amountMinor, 1800);
  assert.equal(result.sale.lines[0].productNameSnapshot, "Tea");
  assert.equal(result.sale.lines[0].stockTracked, true);
  assert.deepEqual(result.deductions, [{ productId: "p1", quantity: 1 }]);
  assert.equal("status" in result.sale, false);
  assert.equal("syncStatus" in result.sale, false);
});

test("captures discount and tax-inclusive product settings", () => {
  const result = buildSaleDraft(
    [cartLine()],
    [product({ taxInclusive: true })],
    { p1: 10 },
    context(),
  );

  assert.equal(result.sale.discountTotal.amountMinor, 1000);
  assert.equal(result.sale.grandTotal.amountMinor, 9000);
  assert.equal(result.sale.taxTotal.amountMinor, 1373);
});

test("does not deduct finished-product stock for made-to-order or non-stocked items", () => {
  for (const inventoryMode of ["made-to-order", "non-stocked"] as const) {
    const result = buildSaleDraft(
      [cartLine()],
      [product({ inventoryMode })],
      {},
      context(),
    );
    assert.deepEqual(result.deductions, []);
    assert.equal(result.sale.lines[0].stockTracked, false);
  }
});

test("deducts stock for batch-produced products", () => {
  const result = buildSaleDraft(
    [cartLine()],
    [product({ inventoryMode: "batch-produced" })],
    {},
    context(),
  );
  assert.deepEqual(result.deductions, [{ productId: "p1", quantity: 1 }]);
});

test("rejects empty carts and missing products", () => {
  assert.throws(() => buildSaleDraft([], [product()], {}, context()), /empty cart/i);
  assert.throws(() => buildSaleDraft([cartLine()], [], {}, context()), /no longer exists/i);
});

test("rejects inactive or non-saleable products", () => {
  assert.throws(
    () => buildSaleDraft([cartLine()], [product({ isActive: false })], {}, context()),
    /not available for direct sale/i,
  );
  assert.throws(
    () => buildSaleDraft([cartLine()], [product({ availableForDirectSale: false })], {}, context()),
    /not available for direct sale/i,
  );
});

test("rejects a stale cart price rather than silently using it", () => {
  assert.throws(
    () => buildSaleDraft([cartLine({ unitPriceMinor: 9000 })], [product()], {}, context()),
    /price changed/i,
  );
});

test("rejects mixed-business products and missing creator identity", () => {
  assert.throws(
    () => buildSaleDraft([cartLine()], [product({ businessId: "other" })], {}, context()),
    /different business/i,
  );
  assert.throws(
    () => buildSaleDraft([cartLine()], [product()], {}, { ...context(), createdByUserId: "" }),
    /creator user ID is required/i,
  );
});

test("rejects invalid quantities and discounts", () => {
  assert.throws(
    () => buildSaleDraft([cartLine({ quantity: 0 })], [product()], {}, context()),
    /quantity/i,
  );
  assert.throws(
    () => buildSaleDraft([cartLine()], [product()], { p1: 101 }, context()),
    /discount percentage/i,
  );
});

test("rejects duplicate cart product lines", () => {
  assert.throws(
    () => buildSaleDraft([cartLine(), cartLine()], [product()], {}, context()),
    /unique/i,
  );
});

test("rejects duplicate generated IDs", () => {
  assert.throws(
    () => buildSaleDraft(
      [cartLine()],
      [product()],
      {},
      { ...context(), createId: () => "same-id" },
    ),
    /unique/i,
  );
});