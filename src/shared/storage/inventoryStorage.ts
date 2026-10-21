import { calculateNextStockQuantity } from "../../modules/inventory/movementRules.ts";
import type {
  InventoryBalance,
  InventoryMovement,
  InventoryMovementType,
} from "../types/domain";

const DB_NAME = "watchout-pos-inventory";
const DB_VERSION = 3;
const BALANCES = "balances";
const MOVEMENTS = "movements";
const SALES = "sales";

export interface StockRecord {
  balance: InventoryBalance;
  lastMovement: InventoryMovement | null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SALES)) {
        const sales = db.createObjectStore(SALES, { keyPath: "id" });
        sales.createIndex("byBusinessStoreDate", ["businessId", "storeId", "createdAt"], { unique: false });
      }
      if (!db.objectStoreNames.contains(BALANCES)) {
        db.createObjectStore(BALANCES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MOVEMENTS)) {
        const store = db.createObjectStore(MOVEMENTS, { keyPath: "id" });
        store.createIndex("byProduct", "productId", { unique: false });
      }
      const movements = request.transaction?.objectStore(MOVEMENTS);
      if (movements && !movements.indexNames.contains("byReferenceId")) {
        movements.createIndex("byReferenceId", "referenceId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open inventory storage."));
    request.onblocked = () => reject(new Error("Inventory storage upgrade is blocked by another tab."));
  });
}

function balanceId(businessId: string, storeId: string, productId: string): string {
  return `${businessId}:${storeId}:${productId}`;
}

export async function loadStockRecords(
  businessId: string,
  storeId: string,
): Promise<StockRecord[]> {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([BALANCES, MOVEMENTS], "readonly");
      const balanceRequest = tx.objectStore(BALANCES).getAll();
      const movementRequest = tx.objectStore(MOVEMENTS).getAll();

      tx.oncomplete = () => {
        const balances = (balanceRequest.result as Array<InventoryBalance & { id: string }>)
          .filter((b) => b.businessId === businessId && b.storeId === storeId);
        const movements = movementRequest.result as InventoryMovement[];

        resolve(balances.map((balance) => ({
          balance: {
            businessId: balance.businessId,
            storeId: balance.storeId,
            productId: balance.productId,
            quantityOnHand: balance.quantityOnHand,
            updatedAt: balance.updatedAt,
          },
          lastMovement: movements
            .filter((m) => m.productId === balance.productId &&
              m.businessId === businessId && m.storeId === storeId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
        })).sort((a, b) => a.balance.productId.localeCompare(b.balance.productId)));
      };

      tx.onerror = () => reject(tx.error ?? new Error("Could not load stock records."));
      balanceRequest.onerror = () => reject(balanceRequest.error);
      movementRequest.onerror = () => reject(movementRequest.error);
    });
  } finally {
    db.close();
  }
}

export async function loadInventoryMovements(
  businessId: string,
  storeId: string,
): Promise<InventoryMovement[]> {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(MOVEMENTS, "readonly");
      const request = tx.objectStore(MOVEMENTS).getAll();

      request.onsuccess = () => resolve(
        (request.result as InventoryMovement[])
          .filter((m) => m.businessId === businessId && m.storeId === storeId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      request.onerror = () => reject(request.error ?? new Error("Could not load movement history."));
    });
  } finally {
    db.close();
  }
}

export async function recordStockMovement(input: {
  businessId: string;
  storeId: string;
  productId: string;
  quantityDelta: number;
  movementType: Extract<InventoryMovementType, "opening-stock" | "adjustment" | "wastage">;
  reason: string;
}): Promise<void> {
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error("Stock change must be a non-zero number.");
  }
  if (!input.reason.trim()) {
    throw new Error("Enter a reason for this stock movement.");
  }
  if (input.movementType === "opening-stock" && input.quantityDelta < 0) {
    throw new Error("Opening stock cannot be negative.");
  }

  const db = await openDatabase();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const idForBalance = balanceId(input.businessId, input.storeId, input.productId);

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([BALANCES, MOVEMENTS], "readwrite");
      const balances = tx.objectStore(BALANCES);
      const movements = tx.objectStore(MOVEMENTS);
      const request = balances.get(idForBalance);
      let validationError: Error | null = null;

      request.onsuccess = () => {
        const existing = request.result as (InventoryBalance & { id: string }) | undefined;

        if (input.movementType === "opening-stock" && existing) {
          validationError = new Error("A stock balance already exists. Use an adjustment instead.");
          tx.abort();
          return;
        }

        let nextQuantity: number;
        try {
          nextQuantity = calculateNextStockQuantity(
            existing?.quantityOnHand ?? 0,
            input.quantityDelta,
          );
        } catch (cause) {
          validationError = cause instanceof Error
            ? cause
            : new Error("Invalid stock movement.");
          tx.abort();
          return;
        }

        const balance: InventoryBalance & { id: string } = {
          id: idForBalance,
          businessId: input.businessId,
          storeId: input.storeId,
          productId: input.productId,
          quantityOnHand: nextQuantity,
          updatedAt: now,
        };

        const movement: InventoryMovement = {
          id,
          businessId: input.businessId,
          storeId: input.storeId,
          productId: input.productId,
          movementType: input.movementType,
          quantityDelta: input.quantityDelta,
          referenceId: null,
          reason: input.reason.trim(),
          createdByUserId: "local-demo-user",
          createdAt: now,
        };

        balances.put(balance);
        movements.add(movement);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(validationError ?? tx.error ?? new Error("Could not save stock movement."));
      tx.onabort = () => reject(validationError ?? tx.error ?? new Error("Stock movement was cancelled."));
      request.onerror = () => reject(request.error ?? new Error("Could not read the current stock balance."));
    });
  } finally {
    db.close();
  }
}

// Receives one purchase line. The balance and movement are saved atomically.
// Repeating the same purchase/line reference will not add stock twice.
export async function receivePurchaseLineStock(input: {
  businessId: string;
  storeId: string;
  productId: string;
  purchaseId: string;
  purchaseLineId: string;
  quantity: number;
  createdByUserId: string;
}): Promise<void> {
  for (const [name, value] of Object.entries({
    businessId: input.businessId,
    storeId: input.storeId,
    productId: input.productId,
    purchaseId: input.purchaseId,
    purchaseLineId: input.purchaseLineId,
    createdByUserId: input.createdByUserId,
  })) {
    if (!value.trim()) {
      throw new Error(`${name} is required for purchase receiving.`);
    }
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Received quantity must be greater than zero.");
  }

  const referenceId = `purchase-receipt:${input.purchaseId}:${input.purchaseLineId}`;
  const db = await openDatabase();
  const now = new Date().toISOString();
  const idForBalance = balanceId(input.businessId, input.storeId, input.productId);

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([BALANCES, MOVEMENTS], "readwrite");
      const balances = tx.objectStore(BALANCES);
      const movements = tx.objectStore(MOVEMENTS);
      const referenceIndex = movements.index("byReferenceId");
      const referenceRequest = referenceIndex.get(referenceId);
      let validationError: Error | null = null;

      referenceRequest.onsuccess = () => {
        const existingMovement = referenceRequest.result as InventoryMovement | undefined;

        if (existingMovement) {
          const isSameReceipt =
            existingMovement.movementType === "purchase-receipt" &&
            existingMovement.businessId === input.businessId &&
            existingMovement.storeId === input.storeId &&
            existingMovement.productId === input.productId &&
            existingMovement.quantityDelta === input.quantity;

          if (!isSameReceipt) {
            validationError = new Error(
              "This purchase-line receipt reference already exists with different details.",
            );
            tx.abort();
          }
          // Same receipt already committed: treat this retry as successful.
          return;
        }

        const balanceRequest = balances.get(idForBalance);
        balanceRequest.onsuccess = () => {
          const existingBalance = balanceRequest.result as
            (InventoryBalance & { id: string }) | undefined;

          let nextQuantity: number;
          try {
            nextQuantity = calculateNextStockQuantity(
              existingBalance?.quantityOnHand ?? 0,
              input.quantity,
            );
          } catch (cause) {
            validationError = cause instanceof Error
              ? cause
              : new Error("Could not calculate the received stock balance.");
            tx.abort();
            return;
          }

          const balance: InventoryBalance & { id: string } = {
            id: idForBalance,
            businessId: input.businessId,
            storeId: input.storeId,
            productId: input.productId,
            quantityOnHand: nextQuantity,
            updatedAt: now,
          };

          const movement: InventoryMovement = {
            id: crypto.randomUUID(),
            businessId: input.businessId,
            storeId: input.storeId,
            productId: input.productId,
            movementType: "purchase-receipt",
            quantityDelta: input.quantity,
            referenceId,
            reason: `Purchase received: ${input.purchaseId}`,
            createdByUserId: input.createdByUserId,
            createdAt: now,
          };

          balances.put(balance);
          movements.add(movement);
        };
        balanceRequest.onerror = () => {
          validationError = balanceRequest.error instanceof Error
            ? balanceRequest.error
            : new Error("Could not read the current stock balance.");
          tx.abort();
        };
      };

      referenceRequest.onerror = () => {
        validationError = referenceRequest.error instanceof Error
          ? referenceRequest.error
          : new Error("Could not check for a duplicate purchase receipt.");
        tx.abort();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(
        validationError ?? tx.error ?? new Error("Could not receive purchase stock."),
      );
      tx.onabort = () => reject(
        validationError ?? tx.error ?? new Error("Purchase stock receiving was cancelled."),
      );
    });
  } finally {
    db.close();
  }
}
