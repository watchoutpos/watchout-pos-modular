import test from "node:test";
import assert from "node:assert/strict";
import type { Product } from "../../shared/types/domain.ts";
import { buildSaleDraft } from "./saleBuilder.ts";
import { validateSalePreviewAgainstProducts } from "./salePreviewValidation.ts";

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
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
  defaultDiscountPercentage: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function makePreview(product: Product, discounts: Record<string, number> = {}) {
  let id = 0;
  return buildSaleDraft(
    [{
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPriceMinor: product.sellingPrice.amountMinor,
      currency: product.sellingPrice.currency,
      quantity: 1,
    }],
    [product],
    discounts,
    {
      businessId: product.businessId,
      storeId: "store1",
      createdByUserId: "user1",
      createdAt: "2026-10-19T00:00:00.000Z",
      createId: () => `id-${++id}`,
    },
  );
}

test("accepts a preview when current product settings still match", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.doesNotThrow(() =>
    validateSalePreviewAgainstProducts(preview.sale, [product], {}),
  );
});

test("rejects a preview when the product is missing", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.throws(
    () => validateSalePreviewAgainstProducts(preview.sale, [], {}),
    /no longer exists/,
  );
});

test("rejects inactive or non-saleable products", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ isActive: false })],
      {},
    ),
    /no longer available/,
  );
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ availableForDirectSale: false })],
      {},
    ),
    /no longer available/,
  );
});

test("rejects a changed price or currency", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ sellingPrice: { amountMinor: 11000, currency: "INR" } })],
      {},
    ),
    /Price changed/,
  );
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ sellingPrice: { amountMinor: 10000, currency: "USD" } })],
      {},
    ),
    /Price changed/,
  );
});

test("rejects changed GST or tax-inclusive settings", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ gstPercentage: 5 })],
      {},
    ),
    /settings changed/,
  );
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ taxInclusive: true })],
      {},
    ),
    /settings changed/,
  );
});

test("rejects changed default discount or inventory tracking mode", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ defaultDiscountPercentage: 5 })],
      {},
    ),
    /settings changed/,
  );
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ inventoryMode: "non-stocked" })],
      {},
    ),
    /settings changed/,
  );
});

test("honours the discount explicitly selected for the preview", () => {
  const product = makeProduct({ defaultDiscountPercentage: 10 });
  const selectedDiscounts = { p1: 5 };
  const preview = makePreview(product, selectedDiscounts);
  assert.doesNotThrow(() =>
    validateSalePreviewAgainstProducts(preview.sale, [product], selectedDiscounts),
  );
  assert.throws(
    () => validateSalePreviewAgainstProducts(preview.sale, [product], {}),
    /settings changed/,
  );
});

test("rejects a changed product name or business", () => {
  const product = makeProduct();
  const preview = makePreview(product);
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ name: "Tea - Updated" })],
      {},
    ),
    /settings changed/,
  );
  assert.throws(
    () => validateSalePreviewAgainstProducts(
      preview.sale,
      [makeProduct({ businessId: "other-business" })],
      {},
    ),
    /different business/,
  );
});