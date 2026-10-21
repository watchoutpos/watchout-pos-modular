import assert from "node:assert/strict";
import { test } from "node:test";
import { canCancelCompletedSale } from "./cancellationPolicy.ts";

test("owner can cancel a completed sale under the initial policy", () => {
  assert.equal(canCancelCompletedSale("owner"), true);
});

test("admin can cancel a completed sale under the initial policy", () => {
  assert.equal(canCancelCompletedSale("admin"), true);
});

test("manager cannot cancel a completed sale by default", () => {
  assert.equal(canCancelCompletedSale("manager"), false);
});

test("cashier cannot cancel a completed sale", () => {
  assert.equal(canCancelCompletedSale("cashier"), false);
});

test("missing role is denied", () => {
  assert.equal(canCancelCompletedSale(null), false);
  assert.equal(canCancelCompletedSale(undefined), false);
});

test("unknown role is denied", () => {
  assert.equal(
    canCancelCompletedSale("superuser" as never),
    false,
  );
});