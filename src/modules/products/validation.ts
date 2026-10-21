import type {
  InventoryMode,
  Money,
  ProductType,
  UnitOfMeasure,
} from "../../shared/types/domain";
import type {
  ProductFieldErrors,
  ProductInput,
  ProductValidationResult,
} from "./types";

const PRODUCT_TYPES: readonly ProductType[] = [
  "finished-good",
  "ingredient-raw-material",
  "intermediate-product",
  "assembled-product",
];

const INVENTORY_MODES: readonly InventoryMode[] = [
  "stocked",
  "made-to-order",
  "batch-produced",
  "non-stocked",
];

const UNITS: readonly UnitOfMeasure[] = ["each", "g", "kg", "ml", "l"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProductType(value: unknown): value is ProductType {
  return typeof value === "string" && PRODUCT_TYPES.includes(value as ProductType);
}

function isInventoryMode(value: unknown): value is InventoryMode {
  return typeof value === "string" && INVENTORY_MODES.includes(value as InventoryMode);
}

function isUnitOfMeasure(value: unknown): value is UnitOfMeasure {
  return typeof value === "string" && UNITS.includes(value as UnitOfMeasure);
}

function normalizeOptionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function readMoney(
  value: unknown,
  field: "sellingPrice" | "costPrice" | "mrp",
  errors: ProductFieldErrors,
  optional: boolean,
): Money | null | undefined {
  if (value === undefined && optional) return undefined;
  if (value === null && optional) return null;

  if (!isRecord(value)) {
    errors[field] = "Enter a valid amount.";
    return undefined;
  }

  const amountMinor = value.amountMinor;
  const currency = value.currency;

  if (
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    errors[field] = "Amount must be a non-negative whole number in minor currency units.";
  }

  if (
    typeof currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(currency.trim())
  ) {
    errors[field] = "Currency must be a three-letter code, such as INR.";
  }

  if (
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    typeof currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(currency.trim())
  ) {
    return undefined;
  }

  return {
    amountMinor,
    currency: currency.trim().toUpperCase(),
  };
}

/**
 * Validates and normalizes product input without saving it.
 * Missing optional commercial fields receive safe defaults.
 * SKU/barcode uniqueness is checked by the storage layer.
 */
export function validateProductInput(input: unknown): ProductValidationResult {
  const errors: ProductFieldErrors = {};

  if (!isRecord(input)) {
    return {
      valid: false,
      errors: { name: "Provide valid product details." },
    };
  }

  const businessId =
    typeof input.businessId === "string" ? input.businessId.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";

  const sku =
    input.sku == null
      ? null
      : typeof input.sku === "string"
        ? input.sku.trim() || null
        : input.sku;

  const barcode =
    input.barcode == null
      ? null
      : typeof input.barcode === "string"
        ? input.barcode.trim() || null
        : input.barcode;

  if (!businessId) errors.businessId = "Business is required.";
  if (!name) errors.name = "Product name is required.";

  if (!isProductType(input.productType)) {
    errors.productType = "Select a valid product type.";
  }
  if (!isInventoryMode(input.inventoryMode)) {
    errors.inventoryMode = "Select a valid inventory mode.";
  }
  if (!isUnitOfMeasure(input.unitOfMeasure)) {
    errors.unitOfMeasure = "Select a supported unit of measure.";
  }
  if (typeof input.availableForDirectSale !== "boolean") {
    errors.availableForDirectSale =
      "Choose whether the product is available for direct sale.";
  }
  if (typeof input.isActive !== "boolean") {
    errors.isActive = "Product active status must be specified.";
  }
  if (typeof sku !== "string" && sku !== null) {
    errors.sku = "SKU must be text or empty.";
  }
  if (typeof barcode !== "string" && barcode !== null) {
    errors.barcode = "Barcode must be text or empty.";
  }

  const sellingPrice = readMoney(input.sellingPrice, "sellingPrice", errors, false);
  const costPrice = readMoney(input.costPrice, "costPrice", errors, true);
  const mrp = readMoney(input.mrp, "mrp", errors, true);

  const gstPercentage =
    input.gstPercentage === undefined ? 0 : input.gstPercentage;

  if (
    typeof gstPercentage !== "number" ||
    !Number.isFinite(gstPercentage) ||
    gstPercentage < 0 ||
    gstPercentage > 100
  ) {
    errors.gstPercentage = "GST must be a number between 0 and 100.";
  }

  const hsnSac = normalizeOptionalText(input.hsnSac);
  if (
    input.hsnSac !== undefined &&
    input.hsnSac !== null &&
    typeof input.hsnSac !== "string"
  ) {
    errors.hsnSac = "HSN/SAC must be text or empty.";
  }

  const taxInclusive =
    input.taxInclusive === undefined ? false : input.taxInclusive;

  if (typeof taxInclusive !== "boolean") {
    errors.taxInclusive = "Choose whether the selling price includes tax.";
  }

  const defaultDiscountPercentage =
    input.defaultDiscountPercentage === undefined ? 0 : input.defaultDiscountPercentage;

  if (
    typeof defaultDiscountPercentage !== "number" ||
    !Number.isFinite(defaultDiscountPercentage) ||
    defaultDiscountPercentage < 0 ||
    defaultDiscountPercentage > 100
  ) {
    errors.defaultDiscountPercentage = "Default discount must be a number between 0 and 100.";
  }

  if (Object.keys(errors).length > 0 || !sellingPrice) {
    return { valid: false, errors };
  }

  const value: ProductInput = {
    businessId,
    name,
    sku: sku as string | null,
    barcode: barcode as string | null,
    productType: input.productType as ProductType,
    inventoryMode: input.inventoryMode as InventoryMode,
    unitOfMeasure: input.unitOfMeasure as UnitOfMeasure,
    availableForDirectSale: input.availableForDirectSale as boolean,
    sellingPrice,
    costPrice: costPrice ?? null,
    gstPercentage: gstPercentage as number,
    mrp: mrp ?? null,
    hsnSac: hsnSac ?? null,
    taxInclusive: taxInclusive as boolean,
    defaultDiscountPercentage: defaultDiscountPercentage as number,
    category: typeof input.category === 'string' && input.category.trim() ? input.category.trim().slice(0, 60) : 'Uncategorized',
    imageDataUrl: typeof input.imageDataUrl === 'string' && input.imageDataUrl.startsWith('data:image/') ? input.imageDataUrl : null,
    isActive: input.isActive as boolean,
  };

  return { valid: true, errors: {}, value };
}
