import test from "node:test";
import assert from "node:assert/strict";
import { resolveConfiguration } from "./resolveConfiguration.ts";

const plan = {
  planId: "plan-basic",
  enabledModules: ["products", "sales", "inventory", "purchases", "reports", "business"],
  enabledFeatures: ["barcode", "sku", "discounts", "stock-tracking", "multi-store"],
  updatedAt: "2026-10-16T00:00:00.000Z",
};

const business = {
  businessId: "business-1",
  category: "retail",
  enabledModules: ["products", "sales", "inventory", "purchases", "reports", "business"],
  featureSettings: {},
  createdAt: "2026-10-16T00:00:00.000Z",
  updatedAt: "2026-10-16T00:00:00.000Z",
  revision: 1,
};

const baseInput = {
  plan,
  business,
  userAllowedModules: ["products", "sales", "inventory", "purchases", "reports", "business"],
  userAllowedFeatures: ["barcode", "sku", "discounts", "stock-tracking", "multi-store"],
};

test("allows a feature when all required layers permit it", () => {
  const result = resolveConfiguration(baseInput);
  assert.ok(result.enabledModules.includes("products"));
  assert.ok(result.enabledFeatures.includes("barcode"));
});

test("blocks a feature not included in the plan", () => {
  const restrictedPlan = {
    ...plan,
    enabledFeatures: plan.enabledFeatures.filter((feature) => feature !== "barcode"),
  };
  const result = resolveConfiguration({ ...baseInput, plan: restrictedPlan });
  assert.ok(!result.enabledFeatures.includes("barcode"));
});

test("blocks a feature disabled by the business", () => {
  const configuredBusiness = {
    ...business,
    featureSettings: { barcode: "disabled" },
  };
  const result = resolveConfiguration({ ...baseInput, business: configuredBusiness });
  assert.ok(!result.enabledFeatures.includes("barcode"));
});

test("blocks a feature disabled by the store", () => {
  const store = {
    businessId: "business-1",
    storeId: "store-1",
    featureSettings: { barcode: "disabled" },
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
  const result = resolveConfiguration({ ...baseInput, store });
  assert.ok(!result.enabledFeatures.includes("barcode"));
});

test("blocks a feature the user is not allowed to use", () => {
  const result = resolveConfiguration({
    ...baseInput,
    userAllowedFeatures: ["sku", "discounts", "stock-tracking", "multi-store"],
  });
  assert.ok(!result.enabledFeatures.includes("barcode"));
});

test("throws if the store belongs to a different business", () => {
  const store = {
    businessId: "business-2",
    storeId: "store-1",
    featureSettings: {},
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
  assert.throws(
    () => resolveConfiguration({ ...baseInput, store }),
    /different business/,
  );
});

test("a store cannot re-enable a feature disabled by the business", () => {
  const configuredBusiness = {
    ...business,
    featureSettings: { barcode: "disabled" },
  };
  const store = {
    businessId: "business-1",
    storeId: "store-1",
    featureSettings: { barcode: "enabled" },
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
  const result = resolveConfiguration({
    ...baseInput,
    business: configuredBusiness,
    store,
  });
  assert.ok(!result.enabledFeatures.includes("barcode"));
});

test("a store cannot bypass a plan restriction", () => {
  const restrictedPlan = {
    ...plan,
    enabledFeatures: plan.enabledFeatures.filter((feature) => feature !== "barcode"),
  };
  const store = {
    businessId: "business-1",
    storeId: "store-1",
    featureSettings: { barcode: "enabled" },
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
  const result = resolveConfiguration({ ...baseInput, plan: restrictedPlan, store });
  assert.ok(!result.enabledFeatures.includes("barcode"));
});

test("blocks a feature when its owning module is not enabled", () => {
  const configuredBusiness = {
    ...business,
    enabledModules: business.enabledModules.filter((module) => module !== "products"),
  };
  const result = resolveConfiguration({ ...baseInput, business: configuredBusiness });
  assert.ok(!result.enabledModules.includes("products"));
  assert.ok(!result.enabledFeatures.includes("barcode"));
});
