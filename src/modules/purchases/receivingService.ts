import { loadPurchaseById, beginPurchaseReceiving, completePurchaseReceiving } from "../../shared/storage/purchaseStorage.ts";
import { receivePurchaseLineStock } from "../../shared/storage/inventoryStorage.ts";
import type { Purchase } from "../../shared/types/purchase";

export interface ReceivePurchaseInput {
  purchaseId: string;
  businessId: string;
  storeId: string;
  createdByUserId: string;
}

export async function receivePurchase(
  input: ReceivePurchaseInput,
): Promise<Purchase> {
  for (const [key, value] of Object.entries(input)) {
    if (!value.trim()) {
      throw new Error(`${key} is required to receive a purchase.`);
    }
  }

  const existing = await loadPurchaseById(input.purchaseId);
  if (!existing) throw new Error("Purchase not found.");

  if (
    existing.businessId !== input.businessId ||
    existing.storeId !== input.storeId
  ) {
    throw new Error("Purchase does not belong to the active business and store.");
  }

  if (existing.status === "received") {
    throw new Error("This purchase has already been received.");
  }
  if (existing.status === "cancelled") {
    throw new Error("A cancelled purchase cannot be received.");
  }

  // Atomically locks the purchase lines or resumes the previously locked lines.
  const locked = await beginPurchaseReceiving(
    input.purchaseId,
    input.businessId,
    input.storeId,
  );

  // Each line receipt has a stable idempotency reference in inventory storage.
  // If interrupted, retrying reuses the locked purchase and safely replays lines.
  for (const line of locked.lines) {
    await receivePurchaseLineStock({
      businessId: locked.businessId,
      storeId: locked.storeId,
      productId: line.productId,
      purchaseId: locked.id,
      purchaseLineId: line.id,
      quantity: line.quantity,
      createdByUserId: input.createdByUserId,
    });
  }

  // Only mark received after every stock movement has succeeded.
  return completePurchaseReceiving(
    locked.id,
    locked.businessId,
    locked.storeId,
  );
}