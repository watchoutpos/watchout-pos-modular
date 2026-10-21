import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateLinePricing,
  calculateSalePricing,
  type PricingLineInput,
} from "./pricingRules.ts";

function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    productId: "p1",
    unitPriceMinor: 10000,
    quantity: 1,
    currency: "INR",
    gstPercentage: 18,
    taxInclusive: false,
    ...overrides,
  };
}

test("exclusive GST adds tax to the discounted taxable amount", () => {
  const result = calculateLinePricing(line());
  assert.equal(result.subtotalMinor, 10000);
  assert.equal(result.taxableMinor, 10000);
  assert.equal(result.taxMinor, 1800);
  assert.equal(result.totalMinor, 11800);
});

test("inclusive GST is extracted from the selling price", () => {
  const result = calculateLinePricing(line({ taxInclusive: true }));
  assert.equal(result.totalMinor, 10000);
  assert.equal(result.taxMinor, 1525);
  assert.equal(result.taxableMinor, 8475);
});

test("quantity multiplies the unit price before discount and tax", () => {
  const result = calculateLinePricing(line({ quantity: 3 }));
  assert.equal(result.subtotalMinor, 30000);
  assert.equal(result.taxMinor, 5400);
  assert.equal(result.totalMinor, 35400);
});

test("percentage discount is applied before GST", () => {
  const result = calculateLinePricing(line({ discountPercentage: 10 }));
  assert.equal(result.discountMinor, 1000);
  assert.equal(result.taxableMinor, 9000);
  assert.equal(result.taxMinor, 1620);
  assert.equal(result.totalMinor, 10620);
});

test("inclusive price discount reduces gross total before GST extraction", () => {
  const result = calculateLinePricing(line({
    taxInclusive: true,
    discountPercentage: 10,
  }));
  assert.equal(result.discountMinor, 1000);
  assert.equal(result.totalMinor, 9000);
  assert.equal(result.taxableMinor + result.taxMinor, result.totalMinor);
});

test("zero GST and zero price are supported", () => {
  const zeroTax = calculateLinePricing(line({ gstPercentage: 0 }));
  assert.equal(zeroTax.taxMinor, 0);
  assert.equal(zeroTax.totalMinor, 10000);

  const zeroPrice = calculateLinePricing(line({ unitPriceMinor: 0 }));
  assert.equal(zeroPrice.totalMinor, 0);
});

test("sale totals aggregate multiple lines", () => {
  const result = calculateSalePricing([
    line({ productId: "p1", unitPriceMinor: 10000 }),
    line({ productId: "p2", unitPriceMinor: 5000, gstPercentage: 5 }),
  ]);
  assert.equal(result.subtotalMinor, 15000);
  assert.equal(result.taxMinor, 2050);
  assert.equal(result.totalMinor, 17050);
  assert.equal(result.lines.length, 2);
});

test("mixed currencies are rejected", () => {
  assert.throws(
    () => calculateSalePricing([
      line({ currency: "INR" }),
      line({ productId: "p2", currency: "USD" }),
    ]),
    /mixed currencies/,
  );
});

test("invalid quantities, prices and percentages are rejected", () => {
  assert.throws(() => calculateLinePricing(line({ quantity: 0 })), /Quantity/);
  assert.throws(() => calculateLinePricing(line({ quantity: 1.5 })), /Quantity/);
  assert.throws(() => calculateLinePricing(line({ unitPriceMinor: -1 })), /Unit price/);
  assert.throws(() => calculateLinePricing(line({ gstPercentage: 101 })), /GST/);
  assert.throws(() => calculateLinePricing(line({ discountPercentage: -1 })), /Discount/);
  assert.throws(() => calculateLinePricing(line({ discountPercentage: 101 })), /Discount/);
});

test("empty sale and invalid currency are rejected", () => {
  assert.throws(() => calculateSalePricing([]), /At least one/);
  assert.throws(() => calculateLinePricing(line({ currency: "rupee" })), /Currency/);
});

test("discount cannot make a line total negative", () => {
  const result = calculateLinePricing(line({ discountPercentage: 100 }));
  assert.equal(result.discountMinor, 10000);
  assert.equal(result.taxableMinor, 0);
  assert.equal(result.taxMinor, 0);
  assert.equal(result.totalMinor, 0);
});
