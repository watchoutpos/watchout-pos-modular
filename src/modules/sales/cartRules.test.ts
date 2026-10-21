import test from "node:test";
import assert from "node:assert/strict";
import {
  addCartItem,
  getCartTotals,
  removeCartItem,
  setCartQuantity,
  type CartEntry,
} from "./cartRules.ts";

const vanilla = {
  productId: "p1",
  productName: "Vanilla",
  sku: "WO-001",
  unitPriceMinor: 14000,
  currency: "INR",
};

const waffle = {
  productId: "p2",
  productName: "Waffle",
  sku: "WO-002",
  unitPriceMinor: 22000,
  currency: "INR",
};

test("adding a product creates a quantity-one cart line", () => {
  assert.deepEqual(addCartItem([], vanilla), [{ ...vanilla, quantity: 1 }]);
});

test("adding the same product increases quantity instead of duplicating lines", () => {
  const first = addCartItem([], vanilla);
  const second = addCartItem(first, vanilla);
  assert.equal(second.length, 1);
  assert.equal(second[0].quantity, 2);
});

test("different products create separate cart lines", () => {
  const cart = addCartItem(addCartItem([], vanilla), waffle);
  assert.equal(cart.length, 2);
});

test("quantity can be updated to a positive integer", () => {
  const cart = addCartItem([], vanilla);
  assert.equal(setCartQuantity(cart, "p1", 4)[0].quantity, 4);
});

test("zero, negative, fractional and unsafe quantities are rejected", () => {
  const cart = addCartItem([], vanilla);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => setCartQuantity(cart, "p1", value));
  }
});

test("updating a product absent from cart is rejected", () => {
  assert.throws(() => setCartQuantity([], "missing", 2));
});

test("removing a cart line leaves other lines intact", () => {
  const cart = addCartItem(addCartItem([], vanilla), waffle);
  const updated = removeCartItem(cart, "p1");
  assert.deepEqual(updated.map((line) => line.productId), ["p2"]);
});

test("totals use integer minor units and count item quantities", () => {
  const cart: CartEntry[] = [
    { ...vanilla, quantity: 2 },
    { ...waffle, quantity: 1 },
  ];
  assert.deepEqual(getCartTotals(cart), {
    itemCount: 3,
    subtotalMinor: 50000,
  });
});

test("empty cart has zero totals", () => {
  assert.deepEqual(getCartTotals([]), { itemCount: 0, subtotalMinor: 0 });
});

test("invalid product prices are rejected", () => {
  assert.throws(() => addCartItem([], { ...vanilla, unitPriceMinor: -1 }));
  assert.throws(() => addCartItem([], { ...vanilla, unitPriceMinor: 1.2 }));
});

test("overflowing cart totals are rejected", () => {
  const cart: CartEntry[] = [
    { ...vanilla, unitPriceMinor: Number.MAX_SAFE_INTEGER, quantity: 2 },
  ];
  assert.throws(() => getCartTotals(cart));
});