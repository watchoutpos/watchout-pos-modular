import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Product } from "../../shared/types/domain";
import type { Purchase, PurchaseLine } from "../../shared/types/purchase";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import { loadProducts } from "../../shared/storage/productStorage";
import { loadPurchases, savePurchase } from "../../shared/storage/purchaseStorage";
import { receivePurchase } from "./receivingService";
import "./Purchases.css";

const inr = (amountMinor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amountMinor / 100);

export function Purchases() {
  const { identity, loading: workspaceLoading } = useWorkspace();
  const workspaceKey = `${identity.businessId ?? ""}::${identity.storeId ?? ""}`;
  const currentWorkspaceKeyRef = useRef(workspaceKey);
  const refreshRunRef = useRef(0);

  useLayoutEffect(() => {
    currentWorkspaceKeyRef.current = workspaceKey;
    refreshRunRef.current += 1;
  }, [workspaceKey]);

  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const saveSuccessTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (saveSuccessTimer.current !== undefined) window.clearTimeout(saveSuccessTimer.current);
  }, []);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"new" | "history">("new");
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const selectedProduct = products.find((product) => product.id === productId);
  const subtotalMinor = useMemo(
    () => lines.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0),
    [lines],
  );

  const refresh = useCallback(async () => {
    const runId = ++refreshRunRef.current;
    const businessId = identity.businessId;
    const storeId = identity.storeId;
    const requestWorkspaceKey = `${businessId ?? ""}::${storeId ?? ""}`;

    if (workspaceLoading || !businessId || !storeId) {
      if (refreshRunRef.current === runId) {
        setProducts([]);
        setPurchases([]);
        setLoading(workspaceLoading);
      }
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [loadedProducts, loadedPurchases] = await Promise.all([
        loadProducts(businessId),
        loadPurchases(businessId, storeId),
      ]);

      if (
        refreshRunRef.current !== runId ||
        currentWorkspaceKeyRef.current !== requestWorkspaceKey
      ) return;

      setProducts(loadedProducts.filter((product) => product.isActive));
      setPurchases(loadedPurchases);
    } catch (cause) {
      if (
        refreshRunRef.current === runId &&
        currentWorkspaceKeyRef.current === requestWorkspaceKey
      ) {
        setError(cause instanceof Error ? cause.message : "Could not load purchases.");
      }
    } finally {
      if (refreshRunRef.current === runId) setLoading(false);
    }
  }, [identity.businessId, identity.storeId, workspaceLoading]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Starts async storage loading for the active workspace.
    void refresh();
  }, [refresh]);

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const draftWorkspaceKey = workspaceKey;
    const draftBusinessId = identity.businessId;
    const draftStoreId = identity.storeId;
    const draftUserId = identity.userId;

    setError("");
    setNotice("");
    setSaveSucceeded(false);
    if (saveSuccessTimer.current !== undefined) {
      window.clearTimeout(saveSuccessTimer.current);
      saveSuccessTimer.current = undefined;
    }

    if (!draftBusinessId || !draftStoreId) {
      setError("Select a business and store before saving a purchase.");
      return;
    }
    if (!supplierName.trim()) {
      setError("Supplier name is required.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one product before saving.");
      return;
    }

    const now = new Date().toISOString();
    const purchase: Purchase = {
      id: `purchase-${crypto.randomUUID()}`,
      businessId: draftBusinessId,
      storeId: draftStoreId,
      supplierName: supplierName.trim(),
      supplierInvoiceNumber: invoiceNumber.trim() || null,
      status: "draft",
      lines,
      subtotal: { amountMinor: subtotalMinor, currency: "INR" },
      notes: notes.trim(),
      createdByUserId: draftUserId,
      createdAt: now,
      updatedAt: now,
      receivedAt: null,
    };

    setSaving(true);
    try {
      await savePurchase(purchase);

      // The save is committed in its original workspace; don't update a new workspace's UI.
      if (currentWorkspaceKeyRef.current !== draftWorkspaceKey) return;

      await refresh();
      if (currentWorkspaceKeyRef.current !== draftWorkspaceKey) return;

      setSupplierName("");
      setInvoiceNumber("");
      setNotes("");
      setLines([]);
      setNotice(`Draft ${purchase.id} saved. Inventory was not changed.`);
      setSaveSucceeded(true);
      saveSuccessTimer.current = window.setTimeout(() => {
        if (currentWorkspaceKeyRef.current === draftWorkspaceKey) {
          setSaveSucceeded(false);
        }
      }, 5000);
      setView("history");
    } catch (cause) {
      if (currentWorkspaceKeyRef.current === draftWorkspaceKey) {
        setError(cause instanceof Error ? cause.message : "Could not save purchase.");
      }
    } finally {
      if (currentWorkspaceKeyRef.current === draftWorkspaceKey) {
        setSaving(false);
      }
    }
  }
  async function handleReceivePurchase(purchase: Purchase) {
    if (receivingId) return;

    const receiveWorkspaceKey = workspaceKey;
    const receiveBusinessId = identity.businessId;
    const receiveStoreId = identity.storeId;
    const receiveUserId = identity.userId;

    if (
      !receiveBusinessId ||
      !receiveStoreId ||
      purchase.businessId !== receiveBusinessId ||
      purchase.storeId !== receiveStoreId
    ) {
      setError("The purchase does not belong to the currently selected business and store.");
      return;
    }

    if (purchase.status !== "draft" && purchase.status !== "receiving") {
      setError("Only draft or interrupted receiving purchases can be received.");
      return;
    }

    const itemSummary = purchase.lines
      .map((line) => `- ${line.productNameSnapshot}: ${line.quantity}`)
      .join("\n");

    const confirmation = window.confirm(
      `Confirm stock receipt?\n\n` +
      `Supplier: ${purchase.supplierName}\n` +
      `Purchase: ${purchase.id}\n` +
      `Items:\n${itemSummary}\n\n` +
      `This will increase inventory for this store. Continue?`
    );

    if (!confirmation) return;
    if (currentWorkspaceKeyRef.current !== receiveWorkspaceKey) return;

    setReceivingId(purchase.id);
    setError("");
    setNotice("");

    try {
      const received = await receivePurchase({
        purchaseId: purchase.id,
        businessId: receiveBusinessId,
        storeId: receiveStoreId,
        createdByUserId: receiveUserId,
      });

      if (currentWorkspaceKeyRef.current !== receiveWorkspaceKey) return;

      await refresh();
      if (currentWorkspaceKeyRef.current !== receiveWorkspaceKey) return;

      setNotice(`Purchase ${received.id} received successfully. Inventory was updated.`);
    } catch (cause) {
      if (currentWorkspaceKeyRef.current !== receiveWorkspaceKey) return;

      const message =
        cause instanceof Error ? cause.message : "Could not complete stock receipt.";

      await refresh();
      if (currentWorkspaceKeyRef.current !== receiveWorkspaceKey) return;

      setError(
        `${message} If this purchase is still marked "receiving", you can retry it safely.`
      );
    } finally {
      if (currentWorkspaceKeyRef.current === receiveWorkspaceKey) {
        setReceivingId(null);
      }
    }
  }

  return (
    <section className="purchases-workspace" aria-label="Purchases workspace">
      <div className="purchases-toolbar">
        <div>
          <p className="purchases-eyebrow">SUPPLIERS & STOCK INTAKE</p>
          <h2>Purchases</h2>
          <p className="purchases-muted">Create purchase drafts and review purchase history.</p>
        </div>
        <div className="purchases-tabs">
          <button type="button" className={view === "new" ? "active" : ""} onClick={() => setView("new")}>New Purchase</button>
          <button type="button" className={view === "history" ? "active" : ""} onClick={() => { setView("history"); void refresh(); }}>Purchase History</button>
        </div>
      </div>

      <div className="purchases-scope">
        Workspace: <strong>{identity.businessId || "No business"} / {identity.storeId || "No store"}</strong>
      </div>

      {error && <p className="purchases-error" role="alert">{error}</p>}
      {notice && <p className="purchases-notice" role="status">{notice}</p>}

      {view === "new" ? (
        <form className="purchases-form" onSubmit={saveDraft}>
          <div className="purchases-fields">
            <label>Supplier name
              <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Enter supplier name" required />
            </label>
            <label>Supplier invoice number
              <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Optional" />
            </label>
            <label>Notes
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional purchase notes" />
            </label>
          </div>

          <div className="purchases-section-heading">
            <h3>Purchase items</h3>
            <span>{lines.length} item line(s)</span>
          </div>

          <div className="purchases-add-line">
            <label>Product
              <select value={productId} onChange={(event) => {
                const nextId = event.target.value;
                setProductId(nextId);
                const product = products.find((item) => item.id === nextId);
                if (product?.costPrice) setUnitCost((product.costPrice.amountMinor / 100).toFixed(2));
              }}>
                <option value="">Select product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` (${product.sku})` : ""}</option>)}
              </select>
            </label>
            <label>Quantity
              <input type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>Unit cost (â‚¹)
              <input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="0.00" />
            </label>
            <button type="button" className="purchases-secondary-button" onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) {
                const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
                form.dispatchEvent(submitEvent);
              }
            }} hidden>Add item</button>
            <button type="button" className="purchases-primary-button" onClick={() => {
              setError("");
              if (!selectedProduct) { setError("Select a product first."); return; }
              const qty = Number(quantity);
              const cost = Number(unitCost);
              if (!Number.isFinite(qty) || qty <= 0) { setError("Quantity must be greater than zero."); return; }
              if (!Number.isFinite(cost) || cost < 0) { setError("Enter a valid non-negative unit cost."); return; }
              const unitCostMinor = Math.round(cost * 100);
              setLines((current) => [...current, {
                id: `purchase-line-${crypto.randomUUID()}`,
                productId: selectedProduct.id,
                productNameSnapshot: selectedProduct.name,
                quantity: qty,
                unitCost: { amountMinor: unitCostMinor, currency: "INR" },
                lineTotal: { amountMinor: Math.round(qty * unitCostMinor), currency: "INR" },
              }]);
              setProductId("");
              setQuantity("1");
              setUnitCost("");
            }}>Add item</button>
          </div>

          {products.length === 0 && <p className="purchases-muted">No active products found for this business. Add products in Product Master first.</p>}

          <div className="purchases-table-wrap">
            <table className="purchases-table">
              <thead><tr><th>Product</th><th>Quantity</th><th>Unit cost</th><th>Line total</th><th></th></tr></thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.productNameSnapshot}</td>
                    <td>{line.quantity}</td>
                    <td>{inr(line.unitCost.amountMinor)}</td>
                    <td>{inr(line.lineTotal.amountMinor)}</td>
                    <td><button type="button" className="purchases-remove" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button></td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={5} className="purchases-empty">No items added yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="purchases-form-footer">
            <div><span>Draft subtotal</span><strong>{inr(subtotalMinor)}</strong></div>
            <button type="submit" className={saveSucceeded ? "purchases-primary-button save-success-button" : "purchases-primary-button"} disabled={saving || loading}>
              {saving ? "Saving..." : saveSucceeded ? "Saved âœ“" : "Save draft"}
            </button>
          </div>
          <p className="purchases-warning">Drafts do not update inventory. Stock receiving will be added in a later step.</p>
        </form>
      ) : (
        <div className="purchases-history">
          <div className="purchases-section-heading"><h3>Purchase history</h3><span>{purchases.length} record(s)</span></div>
          {loading ? <p className="purchases-muted">Loading purchasesâ€¦</p> : purchases.length === 0 ? (
            <p className="purchases-empty-block">No purchases saved for this store yet.</p>
          ) : (
            <div className="purchases-table-wrap">
              <table className="purchases-table">
                <thead><tr><th>Date</th><th>Purchase ID</th><th>Supplier</th><th>Invoice</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
                <tbody>{purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{new Date(purchase.createdAt).toLocaleDateString("en-IN")}</td>
                    <td>{purchase.id}</td>
                    <td>{purchase.supplierName}</td>
                    <td>{purchase.supplierInvoiceNumber || "â€”"}</td>
                    <td><span className={`purchases-status status-${purchase.status}`}>{purchase.status}</span></td>
                    <td>{inr(purchase.subtotal.amountMinor)}</td>
                    <td>
                      {purchase.status === "draft" || purchase.status === "receiving" ? (
                        <button
                          type="button"
                          className="purchases-primary-button purchases-receive-button"
                          disabled={receivingId !== null || loading}
                          onClick={() => void handleReceivePurchase(purchase)}
                        >
                          {receivingId === purchase.id
                            ? "Receivingâ€¦"
                            : purchase.status === "receiving"
                              ? "Retry Receipt"
                              : "Receive Stock"}
                        </button>
                      ) : (
                        <span className="purchases-muted">
                          {purchase.status === "received" ? "Completed" : "Unavailable"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}


