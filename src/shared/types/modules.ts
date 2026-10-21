/** Stable identifiers for the main application modules. */
export type ModuleId =
  | "sales"
  | "products"
  | "inventory"
  | "purchases"
  | "reports"
  | "business"
  | "users";

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  navigationGroup: "operations" | "management";
}