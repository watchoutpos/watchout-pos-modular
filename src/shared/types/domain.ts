/**
 * Shared domain models for WatchOut POS Modular.
 * These are TypeScript contracts only; they do not persist data.
 */

export type EntityId = string;
export type ISODateTime = string;

/** Money is represented in minor units to avoid floating-point currency errors. */
export interface Money {
  amountMinor: number;
  currency: string;
}

export interface Business {
  id: EntityId;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Store {
  id: EntityId;
  businessId: EntityId;
  name: string;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type UserRole = "owner" | "admin" | "manager" | "cashier";

export interface User {
  id: EntityId;
  businessId: EntityId;
  storeId?: EntityId | null;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ProductType =
  | "finished-good"
  | "ingredient-raw-material"
  | "intermediate-product"
  | "assembled-product";

export type InventoryMode =
  | "stocked"
  | "made-to-order"
  | "batch-produced"
  | "non-stocked";

/** Base unit used for product quantities and inventory movements. */
export type UnitOfMeasure = "each" | "g" | "kg" | "ml" | "l";

export interface Product {
  id: EntityId;
  businessId: EntityId;
  name: string;
  sku: string | null;
  barcode: string | null;
  productType: ProductType;
  inventoryMode: InventoryMode;
  unitOfMeasure: UnitOfMeasure;
  availableForDirectSale: boolean;
  sellingPrice: Money;
  /** Optional while older IndexedDB records are migrated. */
  costPrice?: Money | null;
  gstPercentage?: number;
  mrp?: Money | null;
  hsnSac?: string | null;
  taxInclusive?: boolean;
  /** Default item discount percentage; older products default to zero. */
  defaultDiscountPercentage?: number;
  /** Optional customer-facing category used by Sales filters. */
  category?: string;
  /** Optional image data URL; older products need not have an image. */
  imageDataUrl?: string | null;
  isActive: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type SaleStatus =
  | "draft"
  | "completed"
  | "cancelled"
  | "refunded";

export type SyncStatus =
  | "local-only"
  | "pending"
  | "failed"
  | "synchronized";

export interface SaleLine {
  id: EntityId;
  productId: EntityId;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: Money;
  lineDiscount: Money;
  /** Commercial and tax settings captured at the time of sale. */
  discountPercentage: number;
  gstPercentage: number;
  taxInclusive: boolean;
  stockTracked: boolean;
  taxableAmount: Money;
  taxAmount: Money;
  lineTotal: Money;
}

export interface Sale {
  /** Generate this ID before attempting to sync the sale. */
  id: EntityId;
  businessId: EntityId;
  storeId: EntityId;
  createdByUserId: EntityId;
  status: SaleStatus;
  lines: SaleLine[];
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
  syncStatus: SyncStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Audit metadata set only when a completed sale is cancelled. */
  cancelledAt?: ISODateTime;
  cancelledByUserId?: EntityId;
  cancellationReason?: string;
}

export type InventoryMovementType =
  | "opening-stock"
  | "purchase-receipt"
  | "sale"
  | "sale-return"
  | "purchase-return"
  | "adjustment"
  | "transfer-in"
  | "transfer-out"
  | "wastage";

/**
 * Maintained stock projection for one product at one store.
 * Inventory movements remain the auditable history.
 */
export interface InventoryBalance {
  businessId: EntityId;
  storeId: EntityId;
  productId: EntityId;
  quantityOnHand: number;
  updatedAt: ISODateTime;
}

export interface InventoryMovement {
  id: EntityId;
  businessId: EntityId;
  storeId: EntityId;
  productId: EntityId;
  movementType: InventoryMovementType;
  /** Positive for stock received; negative for stock removed. */
  quantityDelta: number;
  referenceId: EntityId | null;
  reason: string | null;
  createdByUserId: EntityId;
  createdAt: ISODateTime;
}



