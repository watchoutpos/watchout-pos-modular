import type { ModuleDefinition, ModuleId } from "../types/modules";

/**
 * Central module registry.
 * This describes navigation metadata only; it does not grant permissions.
 */
export const MODULES: readonly ModuleDefinition[] = [
  {
    id: "sales",
    label: "Sales",
    description: "Create and manage sales and receipts.",
    navigationGroup: "operations",
  },
  {
    id: "products",
    label: "Products",
    description: "Maintain product details and pricing.",
    navigationGroup: "operations",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Track stock and inventory movements.",
    navigationGroup: "operations",
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Record purchases and supplier stock receipts.",
    navigationGroup: "operations",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Review sales and operational reports.",
    navigationGroup: "management",
  },
  {
    id: "business",
    label: "Business",
    description: "Manage business and store settings.",
    navigationGroup: "management",
  },
  {
    id: "users",
    label: "Users & Roles",
    description: "Manage staff, roles, and store assignments.",
    navigationGroup: "management",
  },
];

export function getModuleDefinition(
  moduleId: ModuleId,
): ModuleDefinition | undefined {
  return MODULES.find((module) => module.id === moduleId);
}