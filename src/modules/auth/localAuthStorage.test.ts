import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { createFirstOwner, getOwnerCredential, getAuthSession, hasOwnerCredential, signInOwner, signOutOwner } from "./localAuthStorage.ts";
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
if (!globalThis.sessionStorage) {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  }});
}
test("first-run owner setup stores salted PBKDF2 verifier and preserves existing staff data", async () => {
  // Seed an existing staff record in its existing database before owner setup.
  const staffDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("watchout-pos-users", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore("users", { keyPath: "id" });
      store.createIndex("byBusinessId", "businessId", { unique: false });
      store.createIndex("byStoreId", "storeId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = staffDb.transaction("users", "readwrite");
    tx.objectStore("users").put({ id: "existing-staff-1", businessId: "existing-business", name: "Existing Cashier", role: "cashier", isActive: true });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  staffDb.close();

  assert.equal(await hasOwnerCredential(), false);
  const session = await createFirstOwner({ username: "owner.admin", password: "Correct-Horse-Battery-42", confirmPassword: "Correct-Horse-Battery-42" });
  const credential = await getOwnerCredential();
  assert.equal(session.role, "owner"); assert.equal(session.username, "owner.admin"); assert.ok(credential);
  assert.notEqual(credential.passwordHash, "Correct-Horse-Battery-42"); assert.ok(credential.salt); assert.equal(credential.iterations, 310_000);
  assert.equal(await hasOwnerCredential(), true);

  const verifyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("watchout-pos-users", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const staff = await new Promise<Array<{ id: string; name: string }>>((resolve, reject) => {
      const request = verifyDb.transaction("users", "readonly").objectStore("users").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assert.deepEqual(staff.map((item) => [item.id, item.name]), [["existing-staff-1", "Existing Cashier"]]);
  } finally { verifyDb.close(); }
});
test("first-run setup cannot replace an existing owner", async () => {
  await assert.rejects(createFirstOwner({ username: "second.owner", password: "Another-Strong-Password-42", confirmPassword: "Another-Strong-Password-42" }), /already complete/i);
  assert.equal((await getOwnerCredential())?.username, "owner.admin");
});
test("rejects weak passwords, mismatched confirmation and invalid username", async () => {
  await assert.rejects(createFirstOwner({ username: "validuser", password: "short", confirmPassword: "short" }), /12–256/);
  await assert.rejects(createFirstOwner({ username: "validuser", password: "Long-Enough-Password-123", confirmPassword: "Different-Password-123" }), /do not match/);
  await assert.rejects(createFirstOwner({ username: "bad user", password: "Long-Enough-Password-123", confirmPassword: "Long-Enough-Password-123" }), /username/i);
});
test("login accepts correct credentials and rejects wrong credentials", async () => {
  signOutOwner();
  await assert.rejects(signInOwner("owner.admin", "incorrect-password-123"), /Invalid username or password/);
  await assert.rejects(signInOwner("unknown", "Correct-Horse-Battery-42"), /Invalid username or password/);
  const session = await signInOwner("OWNER.ADMIN", "Correct-Horse-Battery-42");
  assert.equal(session.role, "owner"); assert.equal(getAuthSession()?.userId, session.userId);
});
test("sign-out clears session but keeps the owner credential", async () => {
  signOutOwner(); assert.equal(getAuthSession(), null); assert.equal(await hasOwnerCredential(), true);
  assert.equal((await getOwnerCredential())?.username, "owner.admin");
});