import type { EntityId, ISODateTime, Money } from "./domain";

export type PurchaseStatus = "draft" | "receiving" | "received" | "cancelled";

export interface PurchaseLine {
  id: EntityId;
  productId: EntityId;
  productNameSnapshot: string;
  quantity: number;
  unitCost: Money;
  lineTotal: Money;
}

export interface Purchase {
  id: EntityId;
  businessId: EntityId;
  storeId: EntityId;
  supplierName: string;
  supplierInvoiceNumber: string | null;
  status: PurchaseStatus;
  lines: PurchaseLine[];
  subtotal: Money;
  notes: string;
  createdByUserId: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  receivedAt: ISODateTime | null;
}