import type { Product, Sale } from "../../shared/types/domain.ts";

type SaleSnapshot = Pick<Sale, "businessId" | "lines">;

/**
 * Rejects a preview when relevant product settings changed after it was built.
 * This is a pre-save check, not a cross-tab transaction lock.
 */
export function validateSalePreviewAgainstProducts(
  sale: SaleSnapshot,
  currentProducts: Product[],
  selectedDiscounts: Record<string, number>,
): void {
  const productById = new Map(currentProducts.map((product) => [product.id, product]));

  for (const line of sale.lines) {
    const product = productById.get(line.productId);

    if (!product) {
      throw new Error(`Product ${line.productNameSnapshot} no longer exists. Rebuild the sale preview.`);
    }
    if (product.businessId !== sale.businessId) {
      throw new Error(`Product ${product.name} belongs to a different business. Rebuild the sale preview.`);
    }
    if (!product.isActive || !product.availableForDirectSale) {
      throw new Error(`Product ${product.name} is no longer available for direct sale. Rebuild the sale preview.`);
    }
    if (
      product.sellingPrice.amountMinor !== line.unitPrice.amountMinor ||
      product.sellingPrice.currency !== line.unitPrice.currency
    ) {
      throw new Error(`Price changed for ${product.name}. Rebuild the sale preview before completing.`);
    }

    const currentGst = product.gstPercentage ?? 0;
    const currentTaxInclusive = product.taxInclusive ?? false;
    const currentDiscount =
      selectedDiscounts[product.id] ?? product.defaultDiscountPercentage ?? 0;
    const currentStockTracked =
      product.inventoryMode === "stocked" ||
      product.inventoryMode === "batch-produced";

    if (
      currentGst !== line.gstPercentage ||
      currentTaxInclusive !== line.taxInclusive ||
      currentDiscount !== line.discountPercentage ||
      currentStockTracked !== line.stockTracked ||
      product.name !== line.productNameSnapshot
    ) {
      throw new Error(
        `Product settings changed for ${product.name}. Rebuild the sale preview before completing.`,
      );
    }
  }
}