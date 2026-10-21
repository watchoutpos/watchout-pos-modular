import type {
  EntityId,
  ISODateTime,
} from "./domain";

import type { ModuleId } from "./modules";

/** Business categories provide defaults, not fixed behavior. */
export type BusinessCategory =
  | "street-vendor"
  | "kirana"
  | "tea-stall"
  | "cafe"
  | "bakery"
  | "retail"
  | "other";

/** Stable identifiers for optional application capabilities. */
export type BusinessFeatureId =
  | "barcode"
  | "sku"
  | "discounts"
  | "sales-returns"
  | "multiple-payment-methods"
  | "stock-tracking"
  | "wastage"
  | "stock-transfers"
  | "stock-adjustments"
  | "suppliers"
  | "purchase-orders"
  | "purchase-receipts"
  | "recipes"
  | "ingredient-consumption"
  | "batch-production"
  | "sales-reports"
  | "stock-reports"
  | "consolidated-reports"
  | "multi-store"
  | "staff-management";

/** A business may override its default feature settings. */
export type FeatureSetting = "inherit" | "enabled" | "disabled";

/** Platform-level entitlements define what a plan permits. */
export interface PlanEntitlements {
  planId: EntityId;
  enabledModules: ModuleId[];
  enabledFeatures: BusinessFeatureId[];
  updatedAt: ISODateTime;
}

/** Business-specific operational configuration. */
export interface BusinessConfiguration {
  businessId: EntityId;
  category: BusinessCategory;
  enabledModules: ModuleId[];
  featureSettings: Partial<
    Record<BusinessFeatureId, FeatureSetting>
  >;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  revision: number;
}

/** Optional store-level overrides for supported features. */
export interface StoreConfigurationOverride {
  businessId: EntityId;
  storeId: EntityId;
  featureSettings: Partial<
    Record<BusinessFeatureId, FeatureSetting>
  >;
  updatedAt: ISODateTime;
}

/**
 * Effective access must be resolved using:
 * plan entitlement + business configuration +
 * optional store override + user permissions.
 *
 * These types do not implement authorization or persistence.
 */
