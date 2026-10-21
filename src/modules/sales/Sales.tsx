import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { completeSaleAtomically } from "../../shared/storage/salesStorage";
import { SalesHistory } from "./SalesHistory";
import { InvoiceDocument } from "./InvoiceDocument";
import type { Product, Sale } from "../../shared/types/domain";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import { loadProducts } from "../../shared/storage/productStorage";
import {
  addCartItem,
  getCartTotals,
  removeCartItem,
  setCartQuantity,
  type CartEntry,
} from "./cartRules";
import { calculateSalePricing, type PricingResult } from "./pricingRules";
import { buildSaleDraft, type BuiltSaleDraft } from "./saleBuilder";
import { validateSalePreviewAgainstProducts } from "./salePreviewValidation";
import { SalePreview } from "./SalePreview";

function money(amountMinor: number, currencyCode = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currencyCode} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function searchable(product: Product, query: string): boolean {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return [product.name, product.sku ?? "", product.barcode ?? ""]
    .some((field) => field.toLowerCase().includes(value));
}

export function Sales() {
  const { identity, loading: workspaceLoading } = useWorkspace();
  const BUSINESS_ID = identity.businessId;
  const STORE_ID = identity.storeId;
  const USER_ID = identity.userId;
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [discounts, setDiscounts] = useState<Record<string, number>>({});
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const [discountEditorOpen, setDiscountEditorOpen] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [salePreview, setSalePreview] = useState<BuiltSaleDraft | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [completedSaleForInvoice, setCompletedSaleForInvoice] = useState<Sale | null>(null);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const completingSaleRef = useRef(false);
  // Escape closes the topmost Sales dialog without completing or saving a sale.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isCompletingSale) return;

      if (salePreview) {
        setSalePreview(null);
        return;
      }
      if (completedSaleForInvoice) {
        setCompletedSaleForInvoice(null);
        return;
      }
      if (showSalesHistory) {
        setShowSalesHistory(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [salePreview, isCompletingSale, completedSaleForInvoice, showSalesHistory]);

  useEffect(() => {
    let cancelled = false;

    if (workspaceLoading || !BUSINESS_ID || !STORE_ID) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear products when workspace context is unavailable.
      setProducts([]);
      setLoading(workspaceLoading);
      setLoadError("");
      return () => {
        cancelled = true;
      };
    }

    // Prevent products from the previous business remaining visible.
    setProducts([]);
    setLoading(true);
    setLoadError("");

    loadProducts(BUSINESS_ID)
      .then((saved) => {
        if (!cancelled) {
          setProducts(
            saved.filter(
              (product) => product.isActive && product.availableForDirectSale,
            ),
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load products.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [BUSINESS_ID, STORE_ID, workspaceLoading]);

  // A cart and preview belong to the workspace in which they were created.
  // Clear transient checkout state whenever the selected business/store changes.
  const workspaceKey = `${BUSINESS_ID ?? ""}::${STORE_ID ?? ""}`;
  const currentWorkspaceKeyRef = useRef(workspaceKey);

  useLayoutEffect(() => {
    currentWorkspaceKeyRef.current = workspaceKey;
  }, [workspaceKey]);

  const previousWorkspaceKey = useRef(workspaceKey);

  useEffect(() => {
    if (previousWorkspaceKey.current === workspaceKey) return;

    previousWorkspaceKey.current = workspaceKey;
    setCart([]);
    setDiscounts({});
    setDiscountDrafts({});
    setDiscountEditorOpen({});
    setSalePreview(null);
    setPreviewError("");
    setCompletionError("");
    setNotice("Workspace changed. The previous cart was cleared; no sale was created.");
  }, [workspaceKey]);

  const salesCategories = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set([
          "Uncategorized",
          ...products
            .map((product) => product.category?.trim())
            .filter((category): category is string => Boolean(category)),
        ]),
      ),
    ].sort((a, b) =>
      a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b),
    ),
    [products],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          searchable(product, search) &&
          (selectedCategory === "All" ||
            (product.category?.trim() || "Uncategorized") === selectedCategory),
      ),
    [products, search, selectedCategory],
  );

  const itemCount = useMemo(() => {
    try {
      return getCartTotals(cart).itemCount;
    } catch {
      return 0;
    }
  }, [cart]);

  const pricing = useMemo<{ result: PricingResult | null; error: string }>(() => {
    if (cart.length === 0) return { result: null, error: "" };

    try {
      const pricingLines = cart.map((line) => {
        const product = products.find((candidate) => candidate.id === line.productId);
        if (!product) {
          throw new Error(`Product details are unavailable for ${line.productName}. Remove it and add it again.`);
        }

        return {
          productId: line.productId,
          unitPriceMinor: line.unitPriceMinor,
          quantity: line.quantity,
          currency: line.currency.toUpperCase(),
          gstPercentage: product.gstPercentage ?? 0,
          taxInclusive: product.taxInclusive ?? false,
          discountPercentage: discounts[line.productId] ?? product.defaultDiscountPercentage ?? 0,
        };
      });

      return { result: calculateSalePricing(pricingLines), error: "" };
    } catch (error: unknown) {
      return {
        result: null,
        error: error instanceof Error ? error.message : "Could not calculate sale pricing.",
      };
    }
  }, [cart, products, discounts]);

  function addProduct(product: Product) {
    try {
      setCart((current) => addCartItem(current, {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceMinor: product.sellingPrice.amountMinor,
        currency: product.sellingPrice.currency,
      }));
      setNotice(`${product.name} added to cart.`);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "Could not add product.");
    }
  }

  function changeQuantity(productId: string, value: string) {
    const quantity = Number(value);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;
    try {
      setCart((current) => setCartQuantity(current, productId, quantity));
      setNotice("");
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "Could not change quantity.");
    }
  }

  function changeDiscount(productId: string, value: string) {
    setDiscountDrafts((current) => ({ ...current, [productId]: value }));

    if (value.trim() === "") return;

    const discount = Number(value);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return;

    setDiscounts((current) => ({ ...current, [productId]: discount }));
    setNotice("");
  }

  function finishDiscountEdit(productId: string) {
    const draft = discountDrafts[productId];
    if (draft === undefined) return;

    if (draft.trim() === "") {
      setDiscountDrafts((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      return;
    }

    const discount = Number(draft);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      setDiscountDrafts((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      return;
    }

    setDiscounts((current) => ({ ...current, [productId]: discount }));
    setDiscountDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function resetToProductDefaultDiscount(productId: string) {
    setDiscounts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setDiscountDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setDiscountDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setDiscountEditorOpen((current) => ({ ...current, [productId]: false }));
    setNotice("");
  }

  function removeProduct(productId: string) {
    setCart((current) => removeCartItem(current, productId));
    setDiscounts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setNotice("");
  }

  function clearCart() {
    setCart([]);
    setDiscounts({});
    setDiscountEditorOpen({});
    setDiscountDrafts({});
    setNotice("Cart cleared. No sale was created.");
  }

  async function completeCashSale() {
    if (completingSaleRef.current || !salePreview) return;

    completingSaleRef.current = true;
    setIsCompletingSale(true);
    setCompletionError("");
    setPreviewError("");

    try {
      const checkoutWorkspaceKey = workspaceKey;
      const checkoutBusinessId = BUSINESS_ID;
      const currentProducts = await loadProducts(checkoutBusinessId);

      if (currentWorkspaceKeyRef.current !== checkoutWorkspaceKey) {
        throw new Error(
          "Workspace changed while checkout was loading. No sale was created; please review the cart and try again.",
        );
      }
      validateSalePreviewAgainstProducts(
        salePreview.sale,
        currentProducts,
        discounts,
      );

      const now = new Date().toISOString();
      const completedSale: Sale = {
        ...salePreview.sale,
        status: "completed",
        syncStatus: "local-only",
        updatedAt: now,
      };

      await completeSaleAtomically(completedSale, salePreview.deductions);
      setCompletedSaleForInvoice(completedSale);

      setCart([]);
      setDiscounts({});
      setDiscountEditorOpen({});
      setDiscountDrafts({});
      setSalePreview(null);
      setNotice(
        `Sale ${completedSale.id} completed locally. Cash received and inventory updated.`,
      );
    } catch (error: unknown) {
      setCompletionError(
        error instanceof Error
          ? error.message
          : "Sale could not be completed. The cart has been retained.",
      );
    } finally {
      completingSaleRef.current = false;
      setIsCompletingSale(false);
    }
  }

  function openSalePreview() {
    setPreviewError("");
    setCompletionError("");
    setSalePreview(null);

    if (workspaceLoading || !BUSINESS_ID || !STORE_ID || !USER_ID) {
      setPreviewError("Select an active business and store before previewing a sale.");
      return;
    }

    try {
      const built = buildSaleDraft(
        cart.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          unitPriceMinor: line.unitPriceMinor,
          currency: line.currency.toUpperCase(),
          quantity: line.quantity,
        })),
        products,
        discounts,
        {
          businessId: BUSINESS_ID,
          storeId: STORE_ID,
          createdByUserId: USER_ID,
          createdAt: new Date().toISOString(),
          createId: () => crypto.randomUUID(),
        },
      );
      setSalePreview(built);
    } catch (error: unknown) {
      setPreviewError(
        error instanceof Error ? error.message : "Could not create sale preview.",
      );
    }
  }
  const pricedLines = pricing.result?.lines ?? [];

  return (
    <section className="sales-workspace" aria-label="Sales cart">
      <div className="sales-history-toolbar">
        <button type="button" className="sales-history-open-button" onClick={() => setShowSalesHistory(true)}>
          Sales history
        </button>
      </div>
      {showSalesHistory && (
        <SalesHistory
          businessId={BUSINESS_ID}
          storeId={STORE_ID}
          onClose={() => setShowSalesHistory(false)}
          onOpenInvoice={(sale) => {
            setShowSalesHistory(false);
            setCompletedSaleForInvoice(sale);
          }}
        />
      )}
      <div className="sales-toolbar">
        <div>
          <h2>New sale</h2>
          <p>Find products and build the customer's cart.</p>
        </div>
        <span className="sales-local-badge">LOCAL CART ONLY</span>
      </div>

      <div className="sales-layout">
        <section className="sales-products">
          <div className="sales-section-heading">
            <div>
              <h3>Choose products</h3>
              <p>{products.length} active items available for direct sale</p>
            </div>
          </div>

          <label className="sales-search">
            <span className="sales-search-icon" aria-hidden="true"></span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU or barcode"
              aria-label="Search products by name, SKU or barcode"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear product search">
                Clear
              </button>
            )}
          </label>

          <div className="sales-category-filters" aria-label="Filter products by category">
            {salesCategories.map((category) => (
              <button key={category} type="button" className={selectedCategory === category ? "sales-category-chip is-active" : "sales-category-chip"} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)} disabled={Boolean(salePreview) || isCompletingSale}>{category}</button>
            ))}
          </div>          {loading ? (
            <p className="sales-feedback" role="status">Loading products&#x2026;</p>
          ) : loadError ? (
            <p className="sales-error" role="alert">{loadError}</p>
          ) : filteredProducts.length === 0 ? (
            <div className="sales-empty">
              <strong>{search ? "No matching products" : "No saleable products yet"}</strong>
              <p>{search ? "Try another name, SKU or barcode." : "Add an active product and enable Available for direct sale in Product Master."}</p>
            </div>
          ) : (
            <div className="sales-product-grid">
              {filteredProducts.map((product) => (
                <button
                  type="button"
                  className="sales-product"
                  key={product.id}
                  onClick={() => addProduct(product)}
                  disabled={Boolean(salePreview) || isCompletingSale}
                >
                  {product.imageDataUrl ? <img className="sales-product-image" src={product.imageDataUrl} alt="" /> : <span className="sales-product-image sales-product-image-placeholder" aria-hidden="true">No image</span>}
                  <span className="sales-product-name">{product.name}</span>
                  <span className="sales-product-meta">{product.sku || "No SKU"} &#x00B7; {product.unitOfMeasure}</span>
                  <span className="sales-product-bottom">
                    <strong>{money(product.sellingPrice.amountMinor, product.sellingPrice.currency)}</strong>
                    <span aria-hidden="true">+</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="sales-cart">
          <div className="sales-section-heading sales-cart-heading">
            <div>
              <h3>Current cart</h3>
              <p>{itemCount} item{itemCount === 1 ? "" : "s"}</p>
            </div>
            <button type="button" className="sales-text-button sales-clear-cart-button" onClick={clearCart} disabled={cart.length === 0 || Boolean(salePreview) || isCompletingSale}>
              Clear cart
            </button>
          </div>

          {cart.length === 0 ? (
            <div className="sales-cart-empty">
              <span aria-hidden="true">+</span>
              <strong>Your cart is empty</strong>
              <p>Select a product to begin.</p>
            </div>
          ) : (
            <div className="sales-cart-lines">
              {cart.map((line) => {
                const pricedLine = pricedLines.find((item) => item.productId === line.productId);
                return (
                  <article className="sales-cart-line" key={line.productId}>
                    <div className="sales-line-copy">
                      <strong>{line.productName}</strong>
                      <small>{money(line.unitPriceMinor, line.currency)} each</small>
                      <div className="sales-discount-controls">
                        <small>Discount: {Number(discounts[line.productId] ?? products.find((item) => item.id === line.productId)?.defaultDiscountPercentage ?? 0)}%</small>
                        <button type="button" className="sales-discount-toggle" onClick={() => setDiscountEditorOpen((current) => ({ ...current, [line.productId]: !current[line.productId] }))} aria-expanded={Boolean(discountEditorOpen[line.productId])} disabled={Boolean(salePreview) || isCompletingSale}>
                          {discountEditorOpen[line.productId] ? "Hide" : "Edit discount"}
                        </button>
                        {discountEditorOpen[line.productId] && <div className="sales-discount-editor">
                          <label className="sales-discount">
                            <span>Discount (%)</span>
                            <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={discountDrafts[line.productId] ?? String(discounts[line.productId] ?? products.find((item) => item.id === line.productId)?.defaultDiscountPercentage ?? 0)} aria-label={`Discount percentage for ${line.productName}`} onChange={(event) => changeDiscount(line.productId, event.target.value)} onBlur={() => finishDiscountEdit(line.productId)} disabled={Boolean(salePreview) || isCompletingSale} />
                          </label>
                          <button type="button" className="sales-discount-toggle" onClick={() => resetToProductDefaultDiscount(line.productId)} disabled={Boolean(salePreview) || isCompletingSale}>Use product default</button>
                        </div>}
                      </div>
                    </div>
                    <div className="sales-quantity">
                      <span>Qty</span>
                      <div className="sales-quantity-controls">
                        <button
                          type="button"
                          className="sales-quantity-button"
                          aria-label={`Decrease quantity of ${line.productName}`}
                          disabled={Boolean(salePreview) || isCompletingSale}
                          onClick={() => {
                            if (line.quantity <= 1) {
                              removeProduct(line.productId);
                            } else {
                              changeQuantity(line.productId, String(line.quantity - 1));
                            }
                          }}
                        >-</button>
                        <output className="sales-quantity-value" aria-label={`Quantity for ${line.productName}`}>
                          {line.quantity}
                        </output>
                        <button
                          type="button"
                          className="sales-quantity-button"
                          aria-label={`Increase quantity of ${line.productName}`}
                          onClick={() => changeQuantity(line.productId, String(line.quantity + 1))}
                          disabled={line.quantity >= 100000 || Boolean(salePreview) || isCompletingSale}
                        >+</button>
                      </div>
                    </div>
                    <div className="sales-line-total">
                      <strong>{pricedLine ? money(pricedLine.totalMinor, pricedLine.currency) : "&#x2014;"}</strong>
                      <button
                        type="button"
                        className="sales-remove"
                        onClick={() => removeProduct(line.productId)}
                        aria-label={`Remove ${line.productName}`}
                        disabled={Boolean(salePreview) || isCompletingSale}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {pricing.error && (
            <p className="sales-error" role="alert">
              Pricing error: {pricing.error}
            </p>
          )}

          {pricing.result && (
            <div className="sales-pricing-summary" aria-label="Sale pricing summary" aria-live="polite">
              <div className="sales-pricing-row">
                <span>Subtotal</span>
                <strong>{money(pricing.result.subtotalMinor, pricing.result.currency)}</strong>
              </div>
              <div className="sales-pricing-row">
                <span>Discount</span>
                <strong>-{money(pricing.result.discountMinor, pricing.result.currency)}</strong>
              </div>
              <div className="sales-pricing-row">
                <span>Taxable amount</span>
                <strong>{money(pricing.result.taxableMinor, pricing.result.currency)}</strong>
              </div>
              <div className="sales-pricing-row">
                <span>GST</span>
                <strong>{money(pricing.result.taxMinor, pricing.result.currency)}</strong>
              </div>
              <div className="sales-pricing-row sales-pricing-grand-total">
                <span>Amount payable</span>
                <strong>{money(pricing.result.totalMinor, pricing.result.currency)}</strong>
              </div>
            </div>
          )}

          <p className="sales-tax-note">
            GST uses each product's configured rate and tax-inclusive setting. Missing legacy GST settings default to 0% and tax-exclusive. Confirming a cash sale saves the sale and updates inventory locally, then opens its invoice for review or printing.
          </p>
          {notice && <p className="sales-feedback" role="status">{notice}</p>}
          {previewError && (
            <p className="sales-error" role="alert">
              Preview error: {previewError}
            </p>
          )}

          <button
            type="button"
            className="sales-preview-button"
            onClick={openSalePreview}
            disabled={cart.length === 0 || Boolean(pricing.error) || !pricing.result || Boolean(salePreview) || isCompletingSale}
          >
            Preview sale
          </button>

          {salePreview && (
            <div
              className="sale-preview-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isCompletingSale) {
                  setSalePreview(null);
                }
              }}
            >
              <div
                className="sale-preview-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Review sale before saving"
              >
                <SalePreview
                  built={salePreview}
                  onClose={() => {
                    if (!isCompletingSale) setSalePreview(null);
                  }}
                  onComplete={completeCashSale}
                  isCompleting={isCompletingSale}
                  completionError={completionError}
                />
              </div>
            </div>
          )}{completedSaleForInvoice && (
            <InvoiceDocument
              sale={completedSaleForInvoice}
              onClose={() => setCompletedSaleForInvoice(null)}
            />
          )}
        </section>
      </div>
    </section>
  );
}





