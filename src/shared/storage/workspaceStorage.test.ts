import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadBusinesses,
  loadStores,
  saveBusiness,
  saveStore,
  loadInvoiceSettings,
  saveInvoiceSettings,
} from "./workspaceStorage.ts";

const DB_NAME = "watchout-pos-workspace";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database deletion blocked."));
  });
}

const business = {
  id: "test-business",
  name: "Test Business",
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
};

const store = {
  id: "test-store",
  businessId: "test-business",
  name: "Test Store",
  isActive: true,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
};

test("saves and loads a business and its store", async () => {
  await deleteDatabase();

  try {
    await saveBusiness(business);
    await saveStore(store);

    assert.deepEqual(await loadBusinesses(), [business]);
    assert.deepEqual(await loadStores("test-business"), [store]);
    assert.deepEqual(await loadStores("another-business"), []);
  } finally {
    await deleteDatabase();
  }
});

test("rejects a duplicate business ID", async () => {
  await deleteDatabase();

  try {
    await saveBusiness(business);
    await assert.rejects(
      saveBusiness(business),
      /Business ID already exists/,
    );
    assert.deepEqual(await loadBusinesses(), [business]);
  } finally {
    await deleteDatabase();
  }
});

test("rejects a store whose business does not exist", async () => {
  await deleteDatabase();

  try {
    await assert.rejects(
      saveStore({ ...store, businessId: "missing-business" }),
      /Business does not exist/,
    );
    assert.deepEqual(await loadStores("missing-business"), []);
  } finally {
    await deleteDatabase();
  }
});

test("rejects a duplicate store ID", async () => {
  await deleteDatabase();

  try {
    await saveBusiness(business);
    await saveStore(store);

    await assert.rejects(
      saveStore(store),
      /Store ID already exists/,
    );

    assert.deepEqual(await loadStores("test-business"), [store]);
  } finally {
    await deleteDatabase();
  }
});

const defaultInvoiceSettings = {
  businessId: "test-business",
  storeId: null,
  businessName: "Test Business",
  address: "Test Address",
  phone: "",
  email: "",
  gstin: "",
  invoiceMode: "non-gst" as const,
  showWatchoutLogo: true,
  businessLogoUrl: "",
  watermarkEnabled: true,
  watermarkText: "WATCHOUT",
  qrMode: "off" as const,
  qrStaticValue: "",
  invoiceNumberPrefix: "WO",
  updatedAt: "2026-10-19T00:00:00.000Z",
};

test("saves and loads business invoice settings separately from store overrides", async () => {
  await deleteDatabase();

  try {
    await saveBusiness(business);
    await saveStore(store);

    await saveInvoiceSettings(defaultInvoiceSettings);
    await saveInvoiceSettings({
      ...defaultInvoiceSettings,
      storeId: "test-store",
      businessName: "Test Store Invoice",
      invoiceMode: "gst",
      gstin: "TEST-GSTIN",
    });

    const businessSettings = await loadInvoiceSettings("test-business");
    const storeSettings = await loadInvoiceSettings("test-business", "test-store");

    assert.equal(businessSettings?.businessName, "Test Business");
    assert.equal(businessSettings?.invoiceMode, "non-gst");
    assert.equal(storeSettings?.businessName, "Test Store Invoice");
    assert.equal(storeSettings?.invoiceMode, "gst");
    assert.equal(storeSettings?.gstin, "TEST-GSTIN");
    assert.equal(await loadInvoiceSettings("another-business"), undefined);

    // Existing workspace records must remain available.
    assert.deepEqual(await loadBusinesses(), [business]);
    assert.deepEqual(await loadStores("test-business"), [store]);
  } finally {
    await deleteDatabase();
  }
});

test("rejects invoice settings for a missing or unrelated store", async () => {
  await deleteDatabase();

  try {
    await saveBusiness(business);
    await saveBusiness({
      ...business,
      id: "another-business",
      name: "Another Business",
    });
    await saveStore(store);

    await assert.rejects(
      saveInvoiceSettings({
        ...defaultInvoiceSettings,
        storeId: "missing-store",
      }),
      /Store does not exist/,
    );

    await assert.rejects(
      saveInvoiceSettings({
        ...defaultInvoiceSettings,
        businessId: "another-business",
        storeId: "test-store",
      }),
      /Store does not belong/,
    );

    assert.equal(await loadInvoiceSettings("test-business", "missing-store"), undefined);
  } finally {
    await deleteDatabase();
  }
});

test("upgrades a version 1 workspace database without losing existing records", async () => {
  await deleteDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("businesses", { keyPath: "id" });
        const stores = db.createObjectStore("stores", { keyPath: "id" });
        stores.createIndex("byBusinessId", "businessId", { unique: false });
      };

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["businesses", "stores"], "readwrite");
        transaction.objectStore("businesses").add(business);
        transaction.objectStore("stores").add(store);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };

      request.onerror = () => reject(request.error);
    });

    assert.deepEqual(await loadBusinesses(), [business]);
    assert.deepEqual(await loadStores("test-business"), [store]);
    await saveInvoiceSettings(defaultInvoiceSettings);
    assert.equal(
      (await loadInvoiceSettings("test-business"))?.watermarkText,
      "WATCHOUT",
    );
  } finally {
    await deleteDatabase();
  }
});