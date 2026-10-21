import assert from "node:assert/strict";
import test from "node:test";
import { getActiveIdentityContext } from "./getActiveIdentity.ts";

test("returns the expected local development identity", () => {
  assert.deepEqual(getActiveIdentityContext(), {
    businessId: "local-demo-business",
    storeId: "local-demo-store",
    userId: "local-demo-preview-user",
    role: "owner",
  });
});

test("returns a fresh context object on each call", () => {
  const first = getActiveIdentityContext();
  const second = getActiveIdentityContext();

  assert.notStrictEqual(first, second);
  assert.deepEqual(first, second);
});

