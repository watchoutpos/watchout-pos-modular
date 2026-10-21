export interface CartEntry {
  productId: string;
  productName: string;
  sku: string | null;
  unitPriceMinor: number;
  currency: string;
  quantity: number;
}

export function addCartItem(
  cart: CartEntry[],
  item: Omit<CartEntry, "quantity">,
): CartEntry[] {
  if (!item.productId.trim()) throw new Error("Product ID is required.");
  if (!item.productName.trim()) throw new Error("Product name is required.");
  if (!Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) {
    throw new Error("Product price must be a non-negative amount in minor units.");
  }
  if (!/^[A-Za-z]{3}$/.test(item.currency)) {
    throw new Error("Currency must be a three-letter code.");
  }

  const existing = cart.find((line) => line.productId === item.productId);
  if (existing) {
    return cart.map((line) =>
      line.productId === item.productId
        ? { ...line, quantity: line.quantity + 1 }
        : line,
    );
  }
  return [...cart, { ...item, quantity: 1 }];
}

export function setCartQuantity(
  cart: CartEntry[],
  productId: string,
  quantity: number,
): CartEntry[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
    throw new Error("Quantity must be a whole number greater than zero.");
  }
  if (!cart.some((line) => line.productId === productId)) {
    throw new Error("Cart item was not found.");
  }
  return cart.map((line) =>
    line.productId === productId ? { ...line, quantity } : line,
  );
}

export function removeCartItem(cart: CartEntry[], productId: string): CartEntry[] {
  return cart.filter((line) => line.productId !== productId);
}

export function getCartTotals(cart: CartEntry[]): {
  itemCount: number;
  subtotalMinor: number;
} {
  let itemCount = 0;
  let subtotalMinor = 0;

  for (const line of cart) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new Error("Cart contains an invalid quantity.");
    }
    const lineTotal = line.unitPriceMinor * line.quantity;
    if (!Number.isSafeInteger(lineTotal)) {
      throw new Error("Cart line total exceeds the supported amount.");
    }
    itemCount += line.quantity;
    subtotalMinor += lineTotal;
    if (!Number.isSafeInteger(subtotalMinor)) {
      throw new Error("Cart subtotal exceeds the supported amount.");
    }
  }
  return { itemCount, subtotalMinor };
}