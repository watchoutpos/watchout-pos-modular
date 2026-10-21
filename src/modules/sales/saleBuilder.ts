import type { Product, Sale, SaleLine, Money } from "../../shared/types/domain.ts";
import { calculateSalePricing } from "./pricingRules.ts";

export interface SaleBuilderCartLine {
  productId: string;
  productName: string;
  sku: string | null;
  unitPriceMinor: number;
  currency: string;
  quantity: number;
}

export interface SaleBuilderContext {
  businessId: string;
  storeId: string;
  createdByUserId: string;
  createdAt: string;
  createId: () => string;
}

export interface SaleStockDeduction {
  productId: string;
  quantity: number;
}

export type SaleDraft = Omit<Sale, "status" | "syncStatus">;

export interface BuiltSaleDraft {
  sale: SaleDraft;
  deductions: SaleStockDeduction[];
}

function money(amountMinor: number, currency: string): Money {
  return { amountMinor, currency };
}

/**
 * Builds an in-memory sale snapshot only.
 * It does not persist a sale, deduct inventory, or represent a payment.
 * Only stocked and batch-produced products deduct finished-product stock.
 */
export function buildSaleDraft(
  cart: SaleBuilderCartLine[],
  products: Product[],
  discounts: Record<string, number>,
  context: SaleBuilderContext,
): BuiltSaleDraft {
  if (!cart.length) throw new Error("Cannot build a sale from an empty cart.");

  for (const [label, value] of [
    ["Business ID", context.businessId],
    ["Store ID", context.storeId],
    ["Creator user ID", context.createdByUserId],
  ] as const) {
    if (!value.trim()) throw new Error(`${label} is required.`);
  }
  if (!context.createdAt || Number.isNaN(Date.parse(context.createdAt))) {
    throw new Error("A valid sale timestamp is required.");
  }
  if (typeof context.createId !== "function") {
    throw new Error("An ID generator is required.");
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const seen = new Set<string>();

  const source = cart.map((item) => {
    if (!item.productId.trim() || seen.has(item.productId)) {
      throw new Error("Cart product IDs must be non-empty and unique.");
    }
    seen.add(item.productId);

    const product = productById.get(item.productId);
    if (!product) throw new Error(`Product ${item.productId} no longer exists.`);
    if (!product.isActive || !product.availableForDirectSale) {
      throw new Error(`Product ${product.name} is not available for direct sale.`);
    }
    if (product.businessId !== context.businessId) {
      throw new Error(`Product ${product.name} belongs to a different business.`);
    }
    if (
      item.unitPriceMinor !== product.sellingPrice.amountMinor ||
      item.currency !== product.sellingPrice.currency
    ) {
      throw new Error(`Price changed for ${product.name}. Refresh the cart before continuing.`);
    }

    return {
      item,
      product,
      gstPercentage: product.gstPercentage ?? 0,
      taxInclusive: product.taxInclusive ?? false,
      discountPercentage: discounts[product.id] ?? product.defaultDiscountPercentage ?? 0,
    };
  });

  const pricing = calculateSalePricing(source.map(({ item, gstPercentage, taxInclusive, discountPercentage }) => ({
    productId: item.productId,
    unitPriceMinor: item.unitPriceMinor,
    quantity: item.quantity,
    currency: item.currency,
    gstPercentage,
    taxInclusive,
    discountPercentage,
  })));

  const lines: SaleLine[] = source.map(
    ({ item, product, gstPercentage, taxInclusive, discountPercentage }, index) => {
      const priced = pricing.lines[index];
      const line: SaleLine = {
        id: context.createId(),
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: item.quantity,
        unitPrice: money(item.unitPriceMinor, item.currency),
        lineDiscount: money(priced.discountMinor, priced.currency),
        discountPercentage,
        gstPercentage,
        taxInclusive,
        stockTracked:
          product.inventoryMode === "stocked" ||
          product.inventoryMode === "batch-produced",
        taxableAmount: money(priced.taxableMinor, priced.currency),
        taxAmount: money(priced.taxMinor, priced.currency),
        lineTotal: money(priced.totalMinor, priced.currency),
      };
      return line;
    },
  );

  const ids = [context.createId(), ...lines.map((line) => line.id)];
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error("The ID generator must return unique, non-empty IDs.");
  }

  const sale: SaleDraft = {
    id: ids[0],
    businessId: context.businessId,
    storeId: context.storeId,
    createdByUserId: context.createdByUserId,
    lines,
    subtotal: money(pricing.subtotalMinor, pricing.currency),
    discountTotal: money(pricing.discountMinor, pricing.currency),
    taxTotal: money(pricing.taxMinor, pricing.currency),
    grandTotal: money(pricing.totalMinor, pricing.currency),
    createdAt: context.createdAt,
    updatedAt: context.createdAt,
  };

  const deductions = lines
    .filter((line) => line.stockTracked)
    .reduce<SaleStockDeduction[]>((result, line) => {
      const existing = result.find((entry) => entry.productId === line.productId);
      if (existing) existing.quantity += line.quantity;
      else result.push({ productId: line.productId, quantity: line.quantity });
      return result;
    }, []);

  return { sale, deductions };
}