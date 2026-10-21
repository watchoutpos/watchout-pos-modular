import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getQuantityDelta } from "./movementRules";
import type { InventoryMovement, Product } from "../../shared/types/domain";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import { loadProducts } from "../../shared/storage/productStorage";
import {
  loadInventoryMovements,
  loadStockRecords,
  recordStockMovement,
  type StockRecord,
} from "../../shared/storage/inventoryStorage";


const LOW_STOCK_THRESHOLD = 5;

export function Inventory() {
  const { identity, loading: workspaceLoading } = useWorkspace();
  const BUSINESS_ID = identity.businessId;
  const STORE_ID = identity.storeId;
  const workspaceKey = `${BUSINESS_ID ?? ""}::${STORE_ID ?? ""}`;
  const currentWorkspaceKeyRef = useRef(workspaceKey);
  const refreshRunRef = useRef(0);

  useLayoutEffect(() => {
    currentWorkspaceKeyRef.current = workspaceKey;
    refreshRunRef.current += 1;
  }, [workspaceKey]);

  const [products, setProducts] = useState<Product[]>([]);
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState<"opening-stock" | "increase" | "reduction" | "wastage">("opening-stock");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const saveSuccessTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (saveSuccessTimer.current !== undefined) window.clearTimeout(saveSuccessTimer.current);
  }, []);

  const refresh = useCallback(async () => {
    const runId = ++refreshRunRef.current;
    const businessId = BUSINESS_ID;
    const storeId = STORE_ID;
    const requestWorkspaceKey = `${businessId ?? ""}::${storeId ?? ""}`;

    if (workspaceLoading || !businessId || !storeId) {
      if (refreshRunRef.current === runId) {
        setProducts([]);
        setRecords([]);
        setMovements([]);
        setLoading(workspaceLoading);
        setProductId("");
        setSaving(false);
      }
      return;
    }

    setLoading(true);
    setSaving(false);
    setProducts([]);
    setRecords([]);
    setMovements([]);
    setProductId("");
    setError("");
    setNotice("");
    setSaveSucceeded(false);
    if (saveSuccessTimer.current !== undefined) {
      window.clearTimeout(saveSuccessTimer.current);
    }

    try {
      const [loadedProducts, loadedRecords, loadedMovements] = await Promise.all([
        loadProducts(businessId),
        loadStockRecords(businessId, storeId),
        loadInventoryMovements(businessId, storeId),
      ]);

      if (
        refreshRunRef.current !== runId ||
        currentWorkspaceKeyRef.current !== requestWorkspaceKey
      ) return;

      setProducts(loadedProducts);
      setRecords(loadedRecords);
      setMovements(loadedMovements);
    } catch (cause) {
      if (
        refreshRunRef.current === runId &&
        currentWorkspaceKeyRef.current === requestWorkspaceKey
      ) {
        setError(cause instanceof Error ? cause.message : "Could not load inventory.");
      }
    } finally {
      if (refreshRunRef.current === runId) setLoading(false);
    }
  }, [BUSINESS_ID, STORE_ID, workspaceLoading]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Starts async storage loading when the workspace changes.
    void refresh();
  }, [refresh]);
  const trackedProducts = useMemo(
    () => products.filter((p) => p.isActive &&
      (p.inventoryMode === "stocked" || p.inventoryMode === "batch-produced")),
    [products],
  );

  const recordByProduct = useMemo(
    () => new Map(records.map((r) => [r.balance.productId, r])),
    [records],
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return trackedProducts.filter((p) =>
      !term || p.name.toLowerCase().includes(term) ||
      (p.sku ?? "").toLowerCase().includes(term) ||
      (p.barcode ?? "").toLowerCase().includes(term),
    );
  }, [trackedProducts, search]);

  const quantities = trackedProducts.map((p) =>
    recordByProduct.get(p.id)?.balance.quantityOnHand,
  );
  const lowCount = quantities.filter((q) => q !== undefined && q > 0 && q <= LOW_STOCK_THRESHOLD).length;
  const outCount = quantities.filter((q) => q === 0).length;
  const selectedProduct = trackedProducts.find((p) => p.id === productId);

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaveSucceeded(false);
    if (saveSuccessTimer.current !== undefined) {
      window.clearTimeout(saveSuccessTimer.current);
    }

    const parsed = Number(quantity);
    if (!selectedProduct) {
      setError("Select an active stocked product.");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid quantity greater than zero.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason for this stock movement.");
      return;
    }
    if (!BUSINESS_ID || !STORE_ID || workspaceLoading) {
      setError("Select a valid business and store before updating stock.");
      return;
    }

    const movementWorkspaceKey = workspaceKey;
    const movementBusinessId = BUSINESS_ID;
    const movementStoreId = STORE_ID;
    const movementProduct = selectedProduct;
    const movementReason = reason.trim();
    const delta = getQuantityDelta(movementType, parsed);

    setSaving(true);
    try {
      await recordStockMovement({
        businessId: movementBusinessId,
        storeId: movementStoreId,
        productId: movementProduct.id,
        quantityDelta: delta,
        movementType:
          movementType === "increase" || movementType === "reduction"
            ? "adjustment"
            : movementType,
        reason: movementReason,
      });

      if (currentWorkspaceKeyRef.current !== movementWorkspaceKey) return;

      setQuantity("");
      setReason("");
      setNotice(`${movementProduct.name}: stock movement saved.`);
      setSaveSucceeded(true);
      saveSuccessTimer.current = window.setTimeout(
        () => setSaveSucceeded(false),
        5000,
      );
      await refresh();
    } catch (cause) {
      if (currentWorkspaceKeyRef.current === movementWorkspaceKey) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save stock movement.",
        );
      }
    } finally {
      if (currentWorkspaceKeyRef.current === movementWorkspaceKey) {
        setSaving(false);
      }
    }
  }
  return (
    <section className="inventory-workspace">
      <div className="inventory-summary-grid">
        <article className="inventory-stat">
          <span>Stock-tracked products</span>
          <strong>{trackedProducts.length}</strong>
          <small>Active stocked and batch-produced items</small>
        </article>
        <article className="inventory-stat">
          <span>Low stock</span>
          <strong>{lowCount}</strong>
          <small>Above zero, at or below {LOW_STOCK_THRESHOLD}</small>
        </article>
        <article className="inventory-stat">
          <span>Out of stock</span>
          <strong>{outCount}</strong>
          <small>Recorded balance is zero</small>
        </article>
      </div>

      <section className="inventory-panel">
        <div className="inventory-section-heading">
          <div>
            <h2>Stock levels</h2>
            <p>Quantities are maintained separately from product definitions.</p>
          </div>
          <input
            className="inventory-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, SKU or barcode"
            aria-label="Search inventory"
          />
        </div>

        {loading ? <p className="inventory-empty">Loading inventoryÃ¢â‚¬Â¦</p> :
          filteredProducts.length === 0 ? (
            <p className="inventory-empty">
              {trackedProducts.length === 0
                ? "No active stocked products yet. Add products in Product Master and select Stocked or Batch Produced."
                : "No products match your search."}
            </p>
          ) : (
            <div className="inventory-table-wrap">
              <table className="inventory-table">
                <thead>
                  <tr><th>Product</th><th>SKU</th><th>Unit</th><th>On hand</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const quantityOnHand = recordByProduct.get(product.id)?.balance.quantityOnHand;
                    const status = quantityOnHand === undefined
                      ? "Not initialized"
                      : quantityOnHand === 0
                        ? "Out of stock"
                        : quantityOnHand <= LOW_STOCK_THRESHOLD
                          ? "Low stock" : "In stock";
                    return (
                      <tr key={product.id}>
                        <td>{product.name}</td>
                        <td>{product.sku || "—"}</td>
                        <td>{product.unitOfMeasure}</td>
                        <td>{quantityOnHand === undefined ? "—" : quantityOnHand}</td>
                        <td><span className={`inventory-status ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </section>

      <section className="inventory-panel">
        <div className="inventory-section-heading">
          <div>
            <h2>Record stock</h2>
            <p>Every successful entry updates the balance and adds an audit movement.</p>
          </div>
        </div>
        <form className="inventory-form" onSubmit={submitMovement}>
          <label>
            Product
            <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
              <option value="">Select a stocked product</option>
              {trackedProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.name}{product.sku ? `  -  ${product.sku}` : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Movement type
            <select
              value={movementType}
              onChange={(event) => setMovementType(event.target.value as "opening-stock" | "increase" | "reduction" | "wastage")}
            >
              <option value="opening-stock" disabled={Boolean(selectedProduct && recordByProduct.has(selectedProduct.id))}>
                Opening stock
              </option>
              <option value="increase">Stock increase adjustment</option>
              <option value="reduction">Stock reduction</option>
              <option value="wastage">Wastage</option>
            </select>
          </label>
          {selectedProduct && recordByProduct.has(selectedProduct.id) && (
            <div className="inventory-form-note">
              Stock is already initialized for this product. Use an adjustment or wastage entry instead.
            </div>
          )}
          <label>
            Quantity to change
            <input type="number" min="0.001" step="any" value={quantity}
              onChange={(event) => setQuantity(event.target.value)} required />
          </label>
          <label>
            Reason / reference
            <input value={reason} onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Initial count" maxLength={200} required />
          </label>
          <div className="inventory-form-note">
            Reductions and wastage decrease stock. Enter a reason; stock cannot fall below zero.
          </div>
          <button className={saveSucceeded ? "primary-button save-success-button" : "primary-button"} type="submit" disabled={saving || trackedProducts.length === 0}>
            {saving ? "Saving..." : saveSucceeded ? "Saved ✓" : "Save stock movement"}
          </button>
        </form>
        {notice && <p className="inventory-success" role="status">{notice}</p>}
        {error && <p className="inventory-error" role="alert">{error}</p>}
      </section>

      <section className="inventory-panel">
        <div className="inventory-section-heading">
          <div>
            <h2>Recent movement history</h2>
            <p>Local audit history for this demo store.</p>
          </div>
        </div>
        {movements.length === 0 ? <p className="inventory-empty">No stock movements recorded yet.</p> : (
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>Reason</th></tr></thead>
              <tbody>
                {movements.slice(0, 20).map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.createdAt).toLocaleString()}</td>
                    <td>{products.find((p) => p.id === movement.productId)?.name ?? "Unknown product"}</td>
                    <td>{movement.movementType}</td>
                    <td>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</td>
                    <td>{movement.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}


