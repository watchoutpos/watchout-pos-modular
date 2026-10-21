export type InventoryEntryChoice =
  | "opening-stock"
  | "increase"
  | "reduction"
  | "wastage";

export function getQuantityDelta(
  choice: InventoryEntryChoice,
  quantity: number,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Enter a quantity greater than zero.");
  }

  return choice === "reduction" || choice === "wastage"
    ? -quantity
    : quantity;
}

export function calculateNextStockQuantity(
  currentQuantity: number,
  quantityDelta: number,
): number {
  if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
    throw new Error("Current stock quantity is invalid.");
  }
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Stock change must be a non-zero number.");
  }

  const nextQuantity = currentQuantity + quantityDelta;
  if (nextQuantity < 0) {
    throw new Error("This adjustment would make stock negative.");
  }

  return nextQuantity;
}