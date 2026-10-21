import type {
  EntityId,
  InventoryMode,
  Money,
  ProductType,
  UnitOfMeasure,
} from "../../shared/types/domain";

/** Editable fields supplied when creating or updating a product. */
export interface ProductInput {
  businessId: EntityId;
  name: string;
  sku: string | null;
  barcode: string | null;
  productType: ProductType;
  inventoryMode: InventoryMode;
  unitOfMeasure: UnitOfMeasure;
  availableForDirectSale: boolean;
  sellingPrice: Money;
  costPrice?: Money | null;
  gstPercentage?: number;
  mrp?: Money | null;
  hsnSac?: string | null;
  taxInclusive?: boolean;
  defaultDiscountPercentage?: number;
  category?: string;
  imageDataUrl?: string | null;
  isActive: boolean;
}

export type ProductFieldErrors = Partial<
  Record<keyof ProductInput, string>
>;

export type ProductValidationResult =
  | {
      valid: true;
      value: ProductInput;
      errors: ProductFieldErrors;
    }
  | {
      valid: false;
      errors: ProductFieldErrors;
      value?: never;
    };


