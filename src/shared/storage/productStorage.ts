import type { Product } from "../types/domain";

const DATABASE_NAME = "watchout-pos-modular";
const DATABASE_VERSION = 1;
const STORE_NAME = "products";

export class DuplicateProductIdentifierError extends Error {
  constructor(identifier: "SKU" | "barcode") {
    super(`A product with this ${identifier} already exists for this business.`);
    this.name = "DuplicateProductIdentifierError";
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open product storage."));
    request.onblocked = () =>
      reject(new Error("Product storage upgrade is blocked by another open tab."));
  });
}

export async function loadProducts(businessId: string): Promise<Product[]> {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();

      request.onsuccess = () => {
        resolve(
          (request.result as Product[])
            .filter((product) => product.businessId === businessId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      };

      request.onerror = () =>
        reject(request.error ?? new Error("Could not load products."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Loading products was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function saveProduct(product: Product): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let duplicateError: DuplicateProductIdentifierError | undefined;

      request.onsuccess = () => {
        const existing = (request.result as Product[]).filter(
          (item) => item.businessId === product.businessId,
        );

        const sku = product.sku?.trim().toLowerCase();
        const barcode = product.barcode?.trim().toLowerCase();

        if (sku && existing.some((item) => item.sku?.trim().toLowerCase() === sku)) {
          duplicateError = new DuplicateProductIdentifierError("SKU");
          transaction.abort();
          return;
        }

        if (
          barcode &&
          existing.some((item) => item.barcode?.trim().toLowerCase() === barcode)
        ) {
          duplicateError = new DuplicateProductIdentifierError("barcode");
          transaction.abort();
          return;
        }

        store.add(product);
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(
          duplicateError ??
            transaction.error ??
            new Error("Could not save the product."),
        );
      };
      transaction.onabort = () => {
        reject(
          duplicateError ??
            transaction.error ??
            new Error("Saving the product was aborted."),
        );
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Could not check existing products."));
      };
    });
  } finally {
    database.close();
  }
}

export async function updateStoredProduct(product: Product): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let failure: DuplicateProductIdentifierError | Error | undefined;

      const normalize = (value: string | null | undefined) =>
        value?.trim().toLowerCase() ?? "";

      request.onsuccess = () => {
        const existingForBusiness = (request.result as Product[]).filter(
          (item) =>
            item.businessId === product.businessId &&
            item.id !== product.id,
        );

        const sku = normalize(product.sku);
        const barcode = normalize(product.barcode);

        if (
          sku &&
          existingForBusiness.some((item) => normalize(item.sku) === sku)
        ) {
          failure = new DuplicateProductIdentifierError("SKU");
          transaction.abort();
          return;
        }

        if (
          barcode &&
          existingForBusiness.some(
            (item) => normalize(item.barcode) === barcode,
          )
        ) {
          failure = new DuplicateProductIdentifierError("barcode");
          transaction.abort();
          return;
        }

        const existingProduct = (request.result as Product[]).some(
          (item) =>
            item.id === product.id &&
            item.businessId === product.businessId,
        );

        if (!existingProduct) {
          failure = new Error(
            "Cannot update this product because it no longer exists in this business.",
          );
          transaction.abort();
          return;
        }

        store.put(product);
      };

      request.onerror = () => {
        failure = request.error ?? new Error("Could not check existing products.");
        transaction.abort();
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          failure ??
            transaction.error ??
            new Error("Could not update the product."),
        );
      transaction.onabort = () =>
        reject(
          failure ??
            transaction.error ??
            new Error("Updating the product was aborted."),
        );
    });
  } finally {
    database.close();
  }
}


/**
 * Saves a batch of products in a single IndexedDB transaction.
 * If validation, duplicate checks, or any write fails, the transaction aborts.
 * This function writes product records only; it does not write inventory.
 */
export async function saveProductsAtomically(
  products: Product[],
  businessId: string,
): Promise<void> {
  if (products.length === 0) {
    throw new Error("There are no products to import.");
  }

  if (products.some((product) => product.businessId !== businessId)) {
    throw new Error("Every imported product must belong to the target business.");
  }

  const normalize = (value: string | null | undefined) =>
    value?.trim().toLowerCase() ?? "";

  const incomingSkus = new Set<string>();
  const incomingBarcodes = new Set<string>();

  for (const product of products) {
    const sku = normalize(product.sku);
    const barcode = normalize(product.barcode);

    if (sku && incomingSkus.has(sku)) {
      throw new DuplicateProductIdentifierError("SKU");
    }
    if (barcode && incomingBarcodes.has(barcode)) {
      throw new DuplicateProductIdentifierError("barcode");
    }

    if (sku) incomingSkus.add(sku);
    if (barcode) incomingBarcodes.add(barcode);
  }

  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let failure: Error | undefined;

      request.onsuccess = () => {
        try {
          const existing = request.result as Product[];
          const existingForBusiness = existing.filter(
            (item) => item.businessId === businessId,
          );

          for (const product of products) {
            const sku = normalize(product.sku);
            const barcode = normalize(product.barcode);

            if (
              sku &&
              existingForBusiness.some(
                (item) => normalize(item.sku) === sku,
              )
            ) {
              failure = new DuplicateProductIdentifierError("SKU");
              transaction.abort();
              return;
            }

            if (
              barcode &&
              existingForBusiness.some(
                (item) => normalize(item.barcode) === barcode,
              )
            ) {
              failure = new DuplicateProductIdentifierError("barcode");
              transaction.abort();
              return;
            }
          }

          for (const product of products) {
            store.add(product);
          }
        } catch (error: unknown) {
          failure =
            error instanceof Error
              ? error
              : new Error("Could not prepare the product import.");
          try {
            transaction.abort();
          } catch {
            reject(failure);
          }
        }
      };

      request.onerror = () => {
        failure = request.error ?? new Error("Could not check existing products.");
        try {
          transaction.abort();
        } catch {
          reject(failure);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(failure ?? transaction.error ?? new Error("Product import failed."));
      transaction.onabort = () =>
        reject(failure ?? transaction.error ?? new Error("Product import was aborted."));
    });
  } finally {
    database.close();
  }
}