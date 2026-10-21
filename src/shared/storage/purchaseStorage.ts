import type { Purchase, PurchaseStatus } from "../types/purchase";

const DB_NAME = "watchout-pos-purchases";
const DB_VERSION = 1;
const PURCHASES = "purchases";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PURCHASES)) {
        const store = db.createObjectStore(PURCHASES, { keyPath: "id" });
        store.createIndex(
          "byBusinessStoreCreatedAt",
          ["businessId", "storeId", "createdAt"],
          { unique: false },
        );
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      request.error ?? new Error("Could not open purchase storage."),
    );
    request.onblocked = () => reject(
      new Error("Purchase storage upgrade is blocked by another tab."),
    );
  });
}

function validatePurchase(purchase: Purchase): void {
  if (!purchase.id.trim() || !purchase.businessId.trim() || !purchase.storeId.trim()) {
    throw new Error("Purchase, business, and store IDs are required.");
  }
  if (!purchase.supplierName.trim()) {
    throw new Error("Supplier name is required.");
  }
  if (purchase.lines.length === 0) {
    throw new Error("Add at least one product to the purchase.");
  }
  if (purchase.status !== "draft" && purchase.status !== "receiving" &&
      purchase.status !== "cancelled" && purchase.status !== "received") {
    throw new Error("Invalid purchase status.");
  }

  for (const line of purchase.lines) {
    if (!line.productId.trim() || !line.productNameSnapshot.trim()) {
      throw new Error("Each purchase line must identify a product.");
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("Purchase quantities must be greater than zero.");
    }
    if (!Number.isSafeInteger(line.unitCost.amountMinor) || line.unitCost.amountMinor < 0) {
      throw new Error("Unit cost must be a non-negative amount in minor currency units.");
    }
    if (!Number.isSafeInteger(line.lineTotal.amountMinor) || line.lineTotal.amountMinor < 0) {
      throw new Error("Line total must be a non-negative amount in minor currency units.");
    }
    if (line.unitCost.currency !== "INR" || line.lineTotal.currency !== "INR") {
      throw new Error("Purchase amounts must use INR.");
    }
  }

  if (!Number.isSafeInteger(purchase.subtotal.amountMinor) ||
      purchase.subtotal.amountMinor < 0 ||
      purchase.subtotal.currency !== "INR") {
    throw new Error("Purchase subtotal must be a non-negative INR amount in minor units.");
  }

  if ((purchase.status === "receiving" || purchase.status === "draft" || purchase.status === "cancelled") && purchase.receivedAt) {
    throw new Error("Only a received purchase may have a receipt timestamp.");
  }
  if (purchase.status === "received" && !purchase.receivedAt) {
    throw new Error("A received purchase must have a receipt timestamp.");
  }
  if (purchase.status !== "received" && purchase.receivedAt) {
    throw new Error("Only a received purchase may have a receipt timestamp.");
  }
}

/** Saves a purchase record only. This function never changes inventory. */
export async function savePurchase(purchase: Purchase): Promise<void> {
  validatePurchase(purchase);
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PURCHASES, "readwrite");
      const store = tx.objectStore(PURCHASES);
      const request = store.get(purchase.id);
      let validationError: Error | null = null;

      request.onsuccess = () => {
        const existing = request.result as Purchase | undefined;

        if (existing && (
          existing.businessId !== purchase.businessId ||
          existing.storeId !== purchase.storeId
        )) {
          validationError = new Error(
            "A purchase cannot be moved to another business or store.",
          );
          tx.abort();
          return;
        }

        if (existing?.status === "receiving") {
          validationError = new Error("A purchase being received is locked; use the receiving workflow.");
          tx.abort();
          return;
        }
        if (existing?.status === "received" && purchase.status !== "received") {
          validationError = new Error("A received purchase cannot be changed to another status.");
          tx.abort();
          return;
        }

        if (existing?.status === "cancelled" && purchase.status !== "cancelled") {
          validationError = new Error("A cancelled purchase cannot be reopened.");
          tx.abort();
          return;
        }

        if (existing?.status === "draft" && (purchase.status === "received" || purchase.status === "receiving")) {
          validationError = new Error(
            "Use the receiving workflow to receive a purchase; direct status changes are blocked.",
          );
          tx.abort();
          return;
        }

        store.put(purchase);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(
        validationError ?? tx.error ?? new Error("Could not save purchase."),
      );
      tx.onabort = () => reject(
        validationError ?? tx.error ?? new Error("Purchase save was cancelled."),
      );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadPurchases(
  businessId: string,
  storeId: string,
): Promise<Purchase[]> {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PURCHASES, "readonly");
      const request = tx.objectStore(PURCHASES).getAll();

      request.onsuccess = () => {
        resolve(
          (request.result as Purchase[])
            .filter((purchase) =>
              purchase.businessId === businessId &&
              purchase.storeId === storeId,
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      };

      request.onerror = () => reject(
        request.error ?? new Error("Could not load purchases."),
      );
    });
  } finally {
    db.close();
  }
}

export async function loadPurchaseById(
  purchaseId: string,
): Promise<Purchase | null> {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PURCHASES, "readonly");
      const request = tx.objectStore(PURCHASES).get(purchaseId);

      request.onsuccess = () => resolve(
        (request.result as Purchase | undefined) ?? null,
      );
      request.onerror = () => reject(
        request.error ?? new Error("Could not load purchase."),
      );
    });
  } finally {
    db.close();
  }
}

export function isPurchaseStatus(value: string): value is PurchaseStatus {
  return value === "draft" || value === "receiving" || value === "received" || value === "cancelled";
}

// Atomically starts receiving, or resumes an interrupted receiving operation.
// The receiving state locks purchase lines against ordinary saves.
export async function beginPurchaseReceiving(
  purchaseId: string,
  businessId: string,
  storeId: string,
): Promise<Purchase> {
  const db = await openDatabase();

  try {
    return await new Promise<Purchase>((resolve, reject) => {
      const tx = db.transaction(PURCHASES, "readwrite");
      const store = tx.objectStore(PURCHASES);
      const request = store.get(purchaseId);
      let result: Purchase | null = null;
      let validationError: Error | null = null;

      request.onsuccess = () => {
        const current = request.result as Purchase | undefined;

        if (!current) {
          validationError = new Error("Purchase not found.");
          tx.abort();
          return;
        }
        if (current.businessId !== businessId || current.storeId !== storeId) {
          validationError = new Error("Purchase does not belong to the active business and store.");
          tx.abort();
          return;
        }
        if (current.status === "cancelled") {
          validationError = new Error("A cancelled purchase cannot be received.");
          tx.abort();
          return;
        }
        if (current.status === "received") {
          validationError = new Error("This purchase has already been received.");
          tx.abort();
          return;
        }

        if (current.status === "draft") {
          result = { ...current, status: "receiving", updatedAt: new Date().toISOString() };
          store.put(result);
        } else if (current.status === "receiving") {
          // Reuse the stored, locked lines when recovering after interruption.
          result = current;
        } else {
          validationError = new Error("Unsupported purchase status.");
          tx.abort();
        }
      };

      tx.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("Could not start purchase receiving."));
      };
      tx.onerror = () => reject(
        validationError ?? tx.error ?? new Error("Could not start purchase receiving."),
      );
      tx.onabort = () => reject(
        validationError ?? tx.error ?? new Error("Purchase receiving was aborted."),
      );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

// Finalizes only a receiving purchase in the matching business/store.
export async function completePurchaseReceiving(
  purchaseId: string,
  businessId: string,
  storeId: string,
): Promise<Purchase> {
  const db = await openDatabase();

  try {
    return await new Promise<Purchase>((resolve, reject) => {
      const tx = db.transaction(PURCHASES, "readwrite");
      const store = tx.objectStore(PURCHASES);
      const request = store.get(purchaseId);
      let result: Purchase | null = null;
      let validationError: Error | null = null;

      request.onsuccess = () => {
        const current = request.result as Purchase | undefined;

        if (!current) {
          validationError = new Error("Purchase not found.");
          tx.abort();
          return;
        }
        if (current.businessId !== businessId || current.storeId !== storeId) {
          validationError = new Error("Purchase does not belong to the active business and store.");
          tx.abort();
          return;
        }
        if (current.status !== "receiving") {
          validationError = new Error("Only a receiving purchase can be completed.");
          tx.abort();
          return;
        }

        const now = new Date().toISOString();
        result = { ...current, status: "received", receivedAt: now, updatedAt: now };
        store.put(result);
      };

      tx.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("Could not complete purchase receiving."));
      };
      tx.onerror = () => reject(
        validationError ?? tx.error ?? new Error("Could not complete purchase receiving."),
      );
      tx.onabort = () => reject(
        validationError ?? tx.error ?? new Error("Purchase completion was aborted."),
      );
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
