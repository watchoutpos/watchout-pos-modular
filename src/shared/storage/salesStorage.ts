import type { InventoryBalance, InventoryMovement, Sale } from "../types/domain";
import { calculateSalePricing } from "../../modules/sales/pricingRules.ts";

const DB_NAME = "watchout-pos-inventory";
const DB_VERSION = 3;
const BALANCES = "balances";
const MOVEMENTS = "movements";
const SALES = "sales";

export interface StockDeduction {
  productId: string;
  quantity: number;
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
      if (!db.objectStoreNames.contains(BALANCES)) {
        db.createObjectStore(BALANCES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MOVEMENTS)) {
        const movements = db.createObjectStore(MOVEMENTS, { keyPath: "id" });
        movements.createIndex("byProduct", "productId", { unique: false });
      }
      const movements = request.transaction?.objectStore(MOVEMENTS);
      if (movements && !movements.indexNames.contains("byReferenceId")) {
        movements.createIndex("byReferenceId", "referenceId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SALES)) {
        const sales = db.createObjectStore(SALES, { keyPath: "id" });
        sales.createIndex(
          "byBusinessStoreDate",
          ["businessId", "storeId", "createdAt"],
          { unique: false },
        );
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open sales storage."));
    request.onblocked = () =>
      reject(new Error("Sales storage upgrade is blocked by another tab. Close other WatchOut tabs and retry."));
  });
}

function balanceId(businessId: string, storeId: string, productId: string): string {
  return `${businessId}:${storeId}:${productId}`;
}

function validateSale(sale: Sale, deductions: StockDeduction[]): void {
  if (!sale.id.trim() || !sale.businessId.trim() || !sale.storeId.trim()) {
    throw new Error("Sale, business and store IDs are required.");
  }
  if (!sale.createdByUserId.trim()) throw new Error("The sale creator is required.");
  if (sale.status !== "completed") {
    throw new Error("Only a completed sale can be persisted by this operation.");
  }
  if (sale.lines.length === 0) throw new Error("A sale must contain at least one line.");
  if (!sale.createdAt || !sale.updatedAt) throw new Error("Sale timestamps are required.");

  const currency = sale.grandTotal.currency;
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Sale contains an invalid total.");
  for (const money of [sale.subtotal, sale.discountTotal, sale.taxTotal, sale.grandTotal]) {
    if (!Number.isSafeInteger(money.amountMinor) || money.amountMinor < 0 ||
        money.currency !== currency) {
      throw new Error("Sale contains an invalid total or inconsistent currency.");
    }
  }

  const pricingLines = sale.lines.map((line) => {
    if (!line.id.trim() || !line.productId.trim() || !line.productNameSnapshot.trim()) {
      throw new Error("Every sale line needs an ID, product ID and product name.");
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Sale quantities must be positive whole numbers.");
    }
    for (const money of [
      line.unitPrice, line.lineDiscount, line.taxableAmount, line.taxAmount, line.lineTotal,
    ]) {
      if (!Number.isSafeInteger(money.amountMinor) || money.amountMinor < 0 ||
          !/^[A-Z]{3}$/.test(money.currency) || money.currency !== currency) {
        throw new Error("Sale line contains an invalid money amount or inconsistent currency.");
      }
    }
    if (!Number.isFinite(line.gstPercentage) || line.gstPercentage < 0 || line.gstPercentage > 100) {
      throw new Error("Sale line GST percentage must be between 0 and 100.");
    }
    if (!Number.isFinite(line.discountPercentage) ||
        line.discountPercentage < 0 || line.discountPercentage > 100) {
      throw new Error("Sale line discount percentage must be between 0 and 100.");
    }
    if (typeof line.taxInclusive !== "boolean" || typeof line.stockTracked !== "boolean") {
      throw new Error("Sale line tax mode and stock-tracking snapshot are required.");
    }
    return {
      productId: line.productId,
      unitPriceMinor: line.unitPrice.amountMinor,
      quantity: line.quantity,
      currency,
      gstPercentage: line.gstPercentage,
      taxInclusive: line.taxInclusive,
      discountPercentage: line.discountPercentage,
    };
  });

  const pricing = calculateSalePricing(pricingLines);
  for (let i = 0; i < sale.lines.length; i += 1) {
    const line = sale.lines[i];
    const priced = pricing.lines[i];
    if (line.lineDiscount.amountMinor !== priced.discountMinor ||
        line.taxableAmount.amountMinor !== priced.taxableMinor ||
        line.taxAmount.amountMinor !== priced.taxMinor ||
        line.lineTotal.amountMinor !== priced.totalMinor) {
      throw new Error("Sale line financial values do not match the saved pricing snapshot.");
    }
  }
  if (sale.subtotal.amountMinor !== pricing.subtotalMinor ||
      sale.discountTotal.amountMinor !== pricing.discountMinor ||
      sale.taxTotal.amountMinor !== pricing.taxMinor ||
      sale.grandTotal.amountMinor !== pricing.totalMinor) {
    throw new Error("Sale totals do not match the saved line pricing.");
  }

  const soldQuantities = new Map<string, number>();
  const trackedQuantities = new Map<string, number>();
  const trackingFlags = new Map<string, boolean>();
  for (const line of sale.lines) {
    soldQuantities.set(line.productId, (soldQuantities.get(line.productId) ?? 0) + line.quantity);
    const previousFlag = trackingFlags.get(line.productId);
    if (previousFlag !== undefined && previousFlag !== line.stockTracked) {
      throw new Error("A product cannot have conflicting stock-tracking snapshots within one sale.");
    }
    trackingFlags.set(line.productId, line.stockTracked);
    if (line.stockTracked) {
      trackedQuantities.set(line.productId, (trackedQuantities.get(line.productId) ?? 0) + line.quantity);
    }
  }

  const seenProducts = new Set<string>();
  for (const deduction of deductions) {
    if (!deduction.productId.trim() || !Number.isSafeInteger(deduction.quantity) || deduction.quantity <= 0) {
      throw new Error("Stock deductions need a product and a positive quantity.");
    }
    if (seenProducts.has(deduction.productId)) {
      throw new Error("Combine duplicate product stock deductions before saving.");
    }
    seenProducts.add(deduction.productId);
    // Membership/quantity first preserves the existing unknown-product test contract.
    if (soldQuantities.get(deduction.productId) !== deduction.quantity) {
      throw new Error("Sale line quantities must match stock deductions.");
    }
    if (trackingFlags.get(deduction.productId) !== true) {
      throw new Error("Stock deduction supplied for a product not marked as stock-tracked.");
    }
  }
  for (const [productId, quantity] of trackedQuantities) {
    const deduction = deductions.find((item) => item.productId === productId);
    if (!deduction || deduction.quantity !== quantity) {
      throw new Error("Every stock-tracked sale product must have a matching stock deduction.");
    }
  }
}



/**
 * Persists a completed sale and its stock deductions in one IndexedDB transaction.
 * The caller must pass deductions only for stock-tracked products.
 * Payment processing is deliberately outside this function.
 */
export async function completeSaleAtomically(
  sale: Sale,
  deductions: StockDeduction[],
): Promise<void> {
  validateSale(sale, deductions);

  const db = await openDatabase();
  const now = new Date().toISOString();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SALES, BALANCES, MOVEMENTS], "readwrite");
      const sales = tx.objectStore(SALES);
      const balances = tx.objectStore(BALANCES);
      const movements = tx.objectStore(MOVEMENTS);
      let failure: Error | null = null;

      const abortWith = (error: Error) => {
        failure = error;
        try { tx.abort(); } catch { /* Transaction may already have ended. */ }
      };

      const existingSale = sales.get(sale.id);
      existingSale.onsuccess = () => {
        if (existingSale.result) {
          abortWith(new Error("This sale ID has already been recorded."));
          return;
        }

        let pending = deductions.length;
        const saveSale = () => {
          sales.add({ ...sale, lines: sale.lines.map((line) => ({ ...line })) });
        };

        if (pending === 0) {
          saveSale();
          return;
        }

        for (const deduction of deductions) {
          const request = balances.get(
            balanceId(sale.businessId, sale.storeId, deduction.productId),
          );

          request.onsuccess = () => {
            const existing = request.result as
              | (InventoryBalance & { id: string })
              | undefined;

            if (!existing) {
              abortWith(new Error(`Stock has not been initialized for product ${deduction.productId}.`));
              return;
            }

            const nextQuantity = existing.quantityOnHand - deduction.quantity;
            if (!Number.isFinite(existing.quantityOnHand) ||
                existing.quantityOnHand < 0 ||
                !Number.isFinite(nextQuantity) ||
                nextQuantity < 0) {
              abortWith(new Error(`Insufficient stock for product ${deduction.productId}.`));
              return;
            }

            balances.put({
              ...existing,
              quantityOnHand: nextQuantity,
              updatedAt: now,
            });

            const movement: InventoryMovement = {
              id: crypto.randomUUID(),
              businessId: sale.businessId,
              storeId: sale.storeId,
              productId: deduction.productId,
              movementType: "sale",
              quantityDelta: -deduction.quantity,
              referenceId: sale.id,
              reason: `Sale ${sale.id}`,
              createdByUserId: sale.createdByUserId,
              createdAt: now,
            };
            movements.add(movement);

            pending -= 1;
            if (pending === 0) saveSale();
          };

          request.onerror = () => {
            abortWith(request.error instanceof Error
              ? request.error
              : new Error("Could not read the stock balance."));
          };
        }
      };

      existingSale.onerror = () =>
        abortWith(new Error("Could not check for a duplicate sale."));

      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(failure ?? tx.error ?? new Error("Sale transaction failed."));
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Sale transaction was aborted."));
    });
  } finally {
    db.close();
  }
}

/**
 * Cancels a completed sale and restores its tracked stock atomically.
 * This records an inventory reversal only; it does not issue a payment refund.
 */
export async function cancelSaleAtomically(input: {
  saleId: string;
  businessId: string;
  storeId: string;
  actorUserId: string;
  reason: string;
}): Promise<Sale> {
  const saleId = input.saleId.trim();
  const businessId = input.businessId.trim();
  const storeId = input.storeId.trim();
  const actorUserId = input.actorUserId.trim();
  const reason = input.reason.trim();
  if (!saleId || !businessId || !storeId || !actorUserId) {
    throw new Error("Sale, business, store and cancelling user are required.");
  }
  if (!reason) throw new Error("Enter a reason for cancelling this sale.");
  if (reason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer.");

  const db = await openDatabase();
  const now = new Date().toISOString();
  try {
    return await new Promise<Sale>((resolve, reject) => {
      const tx = db.transaction([SALES, BALANCES, MOVEMENTS], "readwrite");
      const sales = tx.objectStore(SALES);
      const balances = tx.objectStore(BALANCES);
      const movements = tx.objectStore(MOVEMENTS);
      let failure: Error | null = null;
      let cancelledSale: Sale | null = null;
      const abortWith = (error: Error) => {
        failure = error;
        try { tx.abort(); } catch { /* Transaction may already have ended. */ }
      };

      const saleRequest = sales.get(saleId);
      saleRequest.onsuccess = () => {
        const sale = saleRequest.result as Sale | undefined;
        if (!sale) { abortWith(new Error("Sale was not found.")); return; }
        if (sale.businessId !== businessId || sale.storeId !== storeId) {
          abortWith(new Error("Sale does not belong to the selected business and store.")); return;
        }
        if (sale.status !== "completed") {
          abortWith(new Error(sale.status === "cancelled"
            ? "This sale has already been cancelled."
            : "Only a completed sale can be cancelled."));
          return;
        }

        const quantities = new Map<string, number>();
        const flags = new Map<string, boolean>();
        for (const line of sale.lines) {
          if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !line.productId) {
            abortWith(new Error("Sale contains invalid product quantities; stock was not changed.")); return;
          }
          const previous = flags.get(line.productId);
          if (previous !== undefined && previous !== line.stockTracked) {
            abortWith(new Error("Sale contains conflicting stock-tracking records; stock was not changed.")); return;
          }
          flags.set(line.productId, line.stockTracked);
          if (line.stockTracked) {
            quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
          }
        }

        const items = Array.from(quantities.entries());
        let pending = items.length;
        const saveCancelledSale = () => {
          cancelledSale = {
            ...sale,
            status: "cancelled",
            updatedAt: now,
            cancelledAt: now,
            cancelledByUserId: actorUserId,
            cancellationReason: reason,
          };
          sales.put(cancelledSale);
        };
        if (pending === 0) { saveCancelledSale(); return; }

        for (const [productId, quantity] of items) {
          const balanceRequest = balances.get(balanceId(businessId, storeId, productId));
          balanceRequest.onsuccess = () => {
            if (failure) return;
            const existing = balanceRequest.result as (InventoryBalance & { id: string }) | undefined;
            if (!existing || existing.businessId !== businessId || existing.storeId !== storeId ||
                existing.productId !== productId || !Number.isSafeInteger(existing.quantityOnHand) ||
                existing.quantityOnHand < 0 || !Number.isSafeInteger(existing.quantityOnHand + quantity)) {
              abortWith(new Error(`A valid stock balance is missing for product ${productId}; cancellation was not saved.`));
              return;
            }
            balances.put({ ...existing, quantityOnHand: existing.quantityOnHand + quantity, updatedAt: now });
            const movement: InventoryMovement = {
              id: crypto.randomUUID(), businessId, storeId, productId,
              movementType: "sale-return", quantityDelta: quantity, referenceId: sale.id,
              reason: `Sale cancellation ${sale.id}: ${reason}`,
              createdByUserId: actorUserId, createdAt: now,
            };
            movements.add(movement);
            pending -= 1;
            if (pending === 0) saveCancelledSale();
          };
          balanceRequest.onerror = () => abortWith(new Error(`Could not read stock balance for product ${productId}.`));
        }
      };
      saleRequest.onerror = () => abortWith(new Error("Could not load the sale to cancel."));
      tx.oncomplete = () => {
        if (cancelledSale) resolve(cancelledSale);
        else reject(new Error("Cancellation transaction completed without a sale result."));
      };
      tx.onerror = () => reject(failure ?? tx.error ?? new Error("Sale cancellation transaction failed."));
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("Sale cancellation was aborted; stock was not changed."));
    });
  } finally {
    db.close();
  }
}

export async function loadSales(
  businessId: string,
  storeId: string,
): Promise<Sale[]> {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SALES, "readonly");
      const request = tx.objectStore(SALES).getAll();

      request.onsuccess = () => {
        resolve((request.result as Sale[])
          .filter((sale) => sale.businessId === businessId && sale.storeId === storeId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not load sales history."));
      tx.onabort = () =>
        reject(tx.error ?? new Error("Loading sales history was aborted."));
    });
  } finally {
    db.close();
  }
}

