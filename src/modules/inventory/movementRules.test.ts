import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateNextStockQuantity,
  getQuantityDelta,
} from "./movementRules.ts";

test("opening stock and increase choices produce positive deltas", () => {
  assert.equal(getQuantityDelta("opening-stock", 10), 10);
  assert.equal(getQuantityDelta("increase", 5), 5);
});

test("reduction and wastage choices produce negative deltas", () => {
  assert.equal(getQuantityDelta("reduction", 3), -3);
  assert.equal(getQuantityDelta("wastage", 2), -2);
});

test("rejects zero, negative, and non-finite entry quantities", () => {
  for (const quantity of [0, -1, Number.NaN, Infinity, -Infinity]) {
    assert.throws(() => getQuantityDelta("increase", quantity));
  }
});

test("calculates an increase correctly", () => {
  assert.equal(calculateNextStockQuantity(10, 5), 15);
});

test("calculates a reduction correctly", () => {
  assert.equal(calculateNextStockQuantity(15, -3), 12);
});

test("calculates wastage correctly", () => {
  assert.equal(calculateNextStockQuantity(12, -2), 10);
});

test("allows stock to reach exactly zero", () => {
  assert.equal(calculateNextStockQuantity(10, -10), 0);
});

test("rejects a movement that would make stock negative", () => {
  assert.throws(
    () => calculateNextStockQuantity(10, -11),
    /stock negative/i,
  );
});

test("rejects invalid current balances and zero stock changes", () => {
  assert.throws(() => calculateNextStockQuantity(-1, 1));
  assert.throws(() => calculateNextStockQuantity(Number.NaN, 1));
  assert.throws(() => calculateNextStockQuantity(10, 0));
});