import type { Business, Store } from "../types/domain.ts";

const DATABASE_NAME = "watchout-pos-workspace";
const DATABASE_VERSION = 2;
const INVOICE_SETTINGS = "invoiceSettings";

export interface InvoiceSettings {
  id: string;
  businessId: string;
  storeId: string | null;
  businessName: string;
  tagline?: string;
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  location?: string;
  phone: string;
  email: string;
  gstin: string;
  invoiceMode: "gst" | "non-gst";
  showWatchoutLogo: boolean;
  showDiscountOnInvoice?: boolean;
  businessLogoUrl: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkImageUrl?: string;
  watermarkOpacity?: number;
  watermarkSize?: number;
  qrMode: "off" | "static" | "sale-total";
  qrStaticValue: string;
  invoiceNumberPrefix: string;
  updatedAt: string;
}

export type InvoiceSettingsInput = Omit<InvoiceSettings, "id">;

function invoiceSettingsId(
  businessId: string,
  storeId: string | null,
): string {
  return JSON.stringify([businessId, storeId]);
}

function validateInvoiceSettings(settings: InvoiceSettingsInput): void {
  if (!settings.businessId.trim()) {
    throw new Error("Invoice settings require a business ID.");
  }

  if (settings.storeId !== null && !settings.storeId.trim()) {
    throw new Error("Store ID must be null or a non-empty string.");
  }

  const stringFields: Array<keyof InvoiceSettingsInput> = [
    "businessName", "address", "phone", "email", "gstin",
    "businessLogoUrl", "watermarkText", "qrStaticValue",
    "invoiceNumberPrefix", "updatedAt",
  ];

  for (const field of stringFields) {
    if (typeof settings[field] !== "string") {
      throw new Error("Invalid invoice settings field: " + field);
    }
  }

  for (const field of ["tagline", "city", "state", "postalCode", "country", "location"] as const) {
    const value = settings[field];
    if (value !== undefined && typeof value !== "string") {
      throw new Error("Invalid invoice settings field: " + field);
    }
  }
  if (settings.watermarkImageUrl !== undefined && typeof settings.watermarkImageUrl !== "string") {
    throw new Error("Invalid invoice settings field: watermarkImageUrl");
  }
  for (const field of ["watermarkOpacity", "watermarkSize"] as const) {
    const value = settings[field];
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100)) {
      throw new Error(field + " must be a number from 0 to 100.");
    }
  }
  if (settings.invoiceMode !== "gst" && settings.invoiceMode !== "non-gst") {
    throw new Error("Invoice mode must be gst or non-gst.");
  }

  if (
    settings.qrMode !== "off" &&
    settings.qrMode !== "static" &&
    settings.qrMode !== "sale-total"
  ) {
    throw new Error("QR mode must be off, static, or sale-total.");
  }

  if (
    typeof settings.showWatchoutLogo !== "boolean" ||
    typeof settings.watermarkEnabled !== "boolean"
  ) {
    throw new Error("Invoice logo and watermark settings must be boolean.");
  }

  if (settings.showDiscountOnInvoice !== undefined && typeof settings.showDiscountOnInvoice !== "boolean") {
    throw new Error("showDiscountOnInvoice must be a boolean.");
  }

  if (!settings.updatedAt.trim() || Number.isNaN(Date.parse(settings.updatedAt))) {
    throw new Error("Invoice settings require a valid update timestamp.");
  }
}
const BUSINESSES = "businesses";
const STORES = "stores";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(BUSINESSES)) {
        db.createObjectStore(BUSINESSES, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES)) {
        const stores = db.createObjectStore(STORES, { keyPath: "id" });
        stores.createIndex("byBusinessId", "businessId", { unique: false });
      }

      if (!db.objectStoreNames.contains(INVOICE_SETTINGS)) {
        const settings = db.createObjectStore(INVOICE_SETTINGS, { keyPath: "id" });
        settings.createIndex("byBusinessId", "businessId", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Workspace database upgrade is blocked by another connection."));
  });
}

function validateBusiness(business: Business): void {
  if (!business.id.trim() || !business.name.trim()) {
    throw new Error("Business ID and name are required.");
  }

  if (!business.createdAt || !business.updatedAt) {
    throw new Error("Business creation and update timestamps are required.");
  }
}

function validateStore(store: Store): void {
  if (!store.id.trim() || !store.businessId.trim() || !store.name.trim()) {
    throw new Error("Store ID, business ID, and name are required.");
  }

  if (typeof store.isActive !== "boolean") {
    throw new Error("Store active status must be a boolean.");
  }

  if (!store.createdAt || !store.updatedAt) {
    throw new Error("Store creation and update timestamps are required.");
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Workspace transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Workspace transaction failed."));
  });
}

export async function loadInvoiceSettings(
  businessId: string,
  storeId: string | null = null,
): Promise<InvoiceSettings | undefined> {
  if (!businessId.trim()) {
    throw new Error("Business ID is required.");
  }

  const db = await openDatabase();

  try {
    const transaction = db.transaction(INVOICE_SETTINGS, "readonly");
    const done = transactionDone(transaction);
    const record = await requestResult(
      transaction.objectStore(INVOICE_SETTINGS).get(
        invoiceSettingsId(businessId, storeId),
      ),
    );
    await done;
    return record as InvoiceSettings | undefined;
  } finally {
    db.close();
  }
}

export async function saveInvoiceSettings(
  input: InvoiceSettingsInput,
): Promise<void> {
  validateInvoiceSettings(input);

  const settings: InvoiceSettings = {
    ...input,
    id: invoiceSettingsId(input.businessId, input.storeId),
  };

  const db = await openDatabase();

  try {
    const transaction = db.transaction(
      [BUSINESSES, STORES, INVOICE_SETTINGS],
      "readwrite",
    );
    const done = transactionDone(transaction);
    const businesses = transaction.objectStore(BUSINESSES);
    const stores = transaction.objectStore(STORES);
    const settingsStore = transaction.objectStore(INVOICE_SETTINGS);

    const businessRequest = requestResult(businesses.get(input.businessId));
    const storeRequest = input.storeId === null
      ? Promise.resolve(undefined)
      : requestResult(stores.get(input.storeId));

    const [business, store] = await Promise.all([
      businessRequest,
      storeRequest,
    ]);

    if (!business) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error(`Business does not exist: ${input.businessId}`);
    }

    if (input.storeId !== null && !store) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error(`Store does not exist: ${input.storeId}`);
    }

    if (input.storeId !== null && store.businessId !== input.businessId) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error("Store does not belong to the specified business.");
    }

    settingsStore.put(settings);
    await done;
  } finally {
    db.close();
  }
}
export async function loadBusinesses(): Promise<Business[]> {
  const db = await openDatabase();

  try {
    const transaction = db.transaction(BUSINESSES, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(BUSINESSES).getAll(),
    );
    await done;
    return records as Business[];
  } finally {
    db.close();
  }
}

export async function loadStores(businessId: string): Promise<Store[]> {
  if (!businessId.trim()) {
    throw new Error("Business ID is required.");
  }

  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORES, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(STORES).index("byBusinessId").getAll(businessId),
    );
    await done;
    return records as Store[];
  } finally {
    db.close();
  }
}

export async function saveBusiness(business: Business): Promise<void> {
  validateBusiness(business);
  const db = await openDatabase();

  try {
    const transaction = db.transaction(BUSINESSES, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(BUSINESSES);
    const existing = await requestResult(store.get(business.id));

    if (existing) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error(`Business ID already exists: ${business.id}`);
    }

    store.add(business);
    await done;
  } finally {
    db.close();
  }
}

export async function saveStore(store: Store): Promise<void> {
  validateStore(store);
  const db = await openDatabase();

  try {
    const transaction = db.transaction([BUSINESSES, STORES], "readwrite");
    const done = transactionDone(transaction);
    const businesses = transaction.objectStore(BUSINESSES);
    const stores = transaction.objectStore(STORES);

    const [business, existingStore] = await Promise.all([
      requestResult(businesses.get(store.businessId)),
      requestResult(stores.get(store.id)),
    ]);

    if (!business) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error(`Business does not exist: ${store.businessId}`);
    }

    if (existingStore) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new Error(`Store ID already exists: ${store.id}`);
    }

    stores.add(store);
    await done;
  } finally {
    db.close();
  }
}
