import type { Product } from "../../shared/types/domain";
import type { ProductInput } from "./types";
import { validateProductInput } from "./validation.ts";

export interface LegacyImportIssue {
  sku: string | null;
  productName: string;
  reason: string;
}

export interface LegacyProductDryRunReport {
  status: "DRY_RUN_PASSED" | "DRY_RUN_BLOCKED";
  businessId: string;
  expectedSourceCount: number;
  mappedCount: number;
  existingProductCount: number;
  importableProducts: ProductInput[];
  conflicts: LegacyImportIssue[];
  errors: LegacyImportIssue[];
  writesPerformed: false;
  inventoryImported: false;
  readyToImport: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedIdentifier(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function runLegacyProductImportDryRun(
  preview: unknown,
  existingProducts: Product[],
  businessId: string,
): LegacyProductDryRunReport {
  const conflicts: LegacyImportIssue[] = [];
  const errors: LegacyImportIssue[] = [];
  const importableProducts: ProductInput[] = [];

  let expectedSourceCount = 0;
  let mappedCount = 0;

  if (!isRecord(preview)) {
    errors.push({
      sku: null,
      productName: "(preview)",
      reason: "Preview must be a JSON object.",
    });
  } else {
    expectedSourceCount =
      typeof preview.expectedSourceCount === "number"
        ? preview.expectedSourceCount
        : 0;
    mappedCount =
      typeof preview.mappedCount === "number" ? preview.mappedCount : 0;

    if (preview.status !== "DRY_RUN_PASSED") {
      errors.push({
        sku: null,
        productName: "(preview)",
        reason: "Source preview status is not DRY_RUN_PASSED.",
      });
    }

    if (preview.writesPerformed !== false) {
      errors.push({
        sku: null,
        productName: "(preview)",
        reason: "Source preview does not confirm that no writes were performed.",
      });
    }

    if (preview.inventoryImported !== false) {
      errors.push({
        sku: null,
        productName: "(preview)",
        reason: "Source preview does not confirm that inventory was excluded.",
      });
    }

    if (preview.businessId !== businessId) {
      errors.push({
        sku: null,
        productName: "(preview)",
        reason: `Business ID mismatch. Expected ${businessId}.`,
      });
    }

    if (!Array.isArray(preview.products)) {
      errors.push({
        sku: null,
        productName: "(preview)",
        reason: "Preview products must be an array.",
      });
    } else {
      if (preview.products.length !== expectedSourceCount) {
        errors.push({
          sku: null,
          productName: "(preview)",
          reason: "Product count does not match expectedSourceCount.",
        });
      }

      if (preview.products.length !== mappedCount) {
        errors.push({
          sku: null,
          productName: "(preview)",
          reason: "Product count does not match mappedCount.",
        });
      }

      if (
        !Array.isArray(preview.errors) ||
        preview.errors.length !== 0
      ) {
        errors.push({
          sku: null,
          productName: "(preview)",
          reason: "Source preview contains errors or has no valid errors list.",
        });
      }

      const existingForBusiness = existingProducts.filter(
        (product) => product.businessId === businessId,
      );

      const existingSkus = new Set(
        existingForBusiness
          .map((product) => normalizedIdentifier(product.sku))
          .filter(Boolean),
      );
      const existingBarcodes = new Set(
        existingForBusiness
          .map((product) => normalizedIdentifier(product.barcode))
          .filter(Boolean),
      );

      const seenSourceSkus = new Set<string>();
      const seenSourceBarcodes = new Set<string>();

      for (const candidate of preview.products) {
        const candidateRecord = isRecord(candidate) ? candidate : {};
        const sku =
          typeof candidateRecord.sku === "string"
            ? candidateRecord.sku
            : null;
        const productName =
          typeof candidateRecord.name === "string"
            ? candidateRecord.name
            : "(unnamed product)";

        const validation = validateProductInput(candidate);

        if (!validation.valid) {
          errors.push({
            sku,
            productName,
            reason: `Product validation failed: ${JSON.stringify(validation.errors)}`,
          });
          continue;
        }

        const product = validation.value;

        if (product.businessId !== businessId) {
          errors.push({
            sku: product.sku,
            productName: product.name,
            reason: "Product business ID does not match the import target.",
          });
          continue;
        }

        const normalizedSku = normalizedIdentifier(product.sku);
        const normalizedBarcode = normalizedIdentifier(product.barcode);

        if (normalizedSku && existingSkus.has(normalizedSku)) {
          conflicts.push({
            sku: product.sku,
            productName: product.name,
            reason: "SKU already exists in the destination business.",
          });
        }

        if (normalizedSku && seenSourceSkus.has(normalizedSku)) {
          conflicts.push({
            sku: product.sku,
            productName: product.name,
            reason: "Duplicate SKU within the legacy import file.",
          });
        }

        if (normalizedBarcode && existingBarcodes.has(normalizedBarcode)) {
          conflicts.push({
            sku: product.sku,
            productName: product.name,
            reason: "Barcode already exists in the destination business.",
          });
        }

        if (
          normalizedBarcode &&
          seenSourceBarcodes.has(normalizedBarcode)
        ) {
          conflicts.push({
            sku: product.sku,
            productName: product.name,
            reason: "Duplicate barcode within the legacy import file.",
          });
        }

        if (normalizedSku) seenSourceSkus.add(normalizedSku);
        if (normalizedBarcode) seenSourceBarcodes.add(normalizedBarcode);

        importableProducts.push(product);
      }
    }
  }

  const readyToImport =
    errors.length === 0 &&
    conflicts.length === 0 &&
    importableProducts.length === expectedSourceCount &&
    expectedSourceCount > 0;

  return {
    status: readyToImport ? "DRY_RUN_PASSED" : "DRY_RUN_BLOCKED",
    businessId,
    expectedSourceCount,
    mappedCount,
    existingProductCount: existingProducts.filter(
      (product) => product.businessId === businessId,
    ).length,
    importableProducts,
    conflicts,
    errors,
    writesPerformed: false,
    inventoryImported: false,
    readyToImport,
  };
}
