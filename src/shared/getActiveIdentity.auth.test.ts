import test from "node:test";
import assert from "node:assert/strict";
import { getActiveIdentityContext } from "./getActiveIdentity.ts";
test("uses development identity when no authenticated owner session exists", () => {
  const original = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => null } });
  try { assert.equal(getActiveIdentityContext().userId, "local-demo-preview-user"); assert.equal(getActiveIdentityContext().role, "owner"); }
  finally { Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: original }); }
});
test("uses authenticated owner user ID from local session", () => {
  const original = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => JSON.stringify({ userId: "local-owner-test", role: "owner" }) } });
  try { assert.equal(getActiveIdentityContext().userId, "local-owner-test"); assert.equal(getActiveIdentityContext().role, "owner"); }
  finally { Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: original }); }
});