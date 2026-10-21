import type {
  BusinessFeatureId,
  BusinessConfiguration,
  FeatureSetting,
  PlanEntitlements,
  StoreConfigurationOverride,
} from "./types/configuration";

import type { ModuleId } from "./types/modules";

/**
 * These are the modules that own each feature.
 * Keep this mapping aligned with the module registry.
 */
const FEATURE_MODULE: Record<BusinessFeatureId, ModuleId> = {
  barcode: "products",
  sku: "products",
  discounts: "sales",
  "sales-returns": "sales",
  "multiple-payment-methods": "sales",
  "stock-tracking": "inventory",
  wastage: "inventory",
  "stock-transfers": "inventory",
  "stock-adjustments": "inventory",
  suppliers: "purchases",
  "purchase-orders": "purchases",
  "purchase-receipts": "purchases",
  recipes: "inventory",
  "ingredient-consumption": "inventory",
  "batch-production": "inventory",
  "sales-reports": "reports",
  "stock-reports": "reports",
  "consolidated-reports": "reports",
  "multi-store": "business",
  "staff-management": "business",
};

export interface ConfigurationResolutionInput {
  plan: PlanEntitlements;
  business: BusinessConfiguration;
  store?: StoreConfigurationOverride;
  userAllowedModules: readonly ModuleId[];
  userAllowedFeatures: readonly BusinessFeatureId[];
}

export interface ConfigurationResolution {
  enabledModules: ModuleId[];
  enabledFeatures: BusinessFeatureId[];
}

/**
 * Calculates effective feature availability.
 *
 * This is a domain-level resolver, not an authorization boundary.
 * A backend must independently enforce plan and user access.
 */
export function resolveConfiguration(
  input: ConfigurationResolutionInput,
): ConfigurationResolution {
  const {
    plan,
    business,
    store,
    userAllowedModules,
    userAllowedFeatures,
  } = input;

  // A store override must belong to the same business.
  if (store && store.businessId !== business.businessId) {
    throw new Error(
      "Store configuration belongs to a different business.",
    );
  }

  const enabledModules = business.enabledModules.filter(
    (moduleId) =>
      plan.enabledModules.includes(moduleId) &&
      userAllowedModules.includes(moduleId),
  );

  const enabledFeatures = (
    Object.keys(FEATURE_MODULE) as BusinessFeatureId[]
  ).filter((featureId) => {
    const owningModule = FEATURE_MODULE[featureId];

    // The plan must permit the feature and its owning module.
    if (
      !plan.enabledFeatures.includes(featureId) ||
      !enabledModules.includes(owningModule) ||
      !userAllowedFeatures.includes(featureId)
    ) {
      return false;
    }

    const businessSetting: FeatureSetting =
      business.featureSettings[featureId] ?? "inherit";

    // Business configuration cannot grant an unentitled feature.
    const businessEnabled =
      businessSetting === "enabled" ||
      (businessSetting === "inherit" &&
        plan.enabledFeatures.includes(featureId));

    if (!businessEnabled) {
      return false;
    }

    const storeSetting: FeatureSetting =
      store?.featureSettings[featureId] ?? "inherit";

    // Store overrides may narrow access, not expand business access.
    if (storeSetting === "disabled") {
      return false;
    }

    return true;
  });

  return {
    enabledModules,
    enabledFeatures,
  };
}
