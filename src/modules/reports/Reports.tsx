import { useEffect, useState } from "react";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import { cancelSaleAtomically, loadSales } from "../../shared/storage/salesStorage";
import { InvoiceDocument } from "../sales/InvoiceDocument";
import { loadPurchases } from "../../shared/storage/purchaseStorage";
import { loadProducts } from "../../shared/storage/productStorage";
import { loadStockRecords, loadInventoryMovements } from "../../shared/storage/inventoryStorage";
import type { Sale, InventoryMovement, Product } from "../../shared/types/domain";
import type { Purchase } from "../../shared/types/purchase";
import "./Reports.css";

function dateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(amountMinor: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function inRange(timestamp: string, start: string, end: string): boolean {
  const day = timestamp.slice(0, 10);
  return day >= start && day <= end;
}

function totalMinor<T>(
  items: T[],
  getAmount: (item: T) => number,
): number {
  return items.reduce((total, item) => total + getAmount(item), 0);
}

function csvCell(value: string | number): string {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

export function Reports() {
  const { identity, loading: workspaceLoading } = useWorkspace();
  const businessId = identity.businessId;
  const storeId = identity.storeId;

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return dateString(date);
  });
  const [endDate, setEndDate] = useState(() => dateString(new Date()));
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockCount, setStockCount] = useState(0);
  const [stockUnits, setStockUnits] = useState(0);
  const [movementCount, setMovementCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [cancellingSaleId, setCancellingSaleId] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceLoading) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show loading while the asynchronous report queries run.
    setLoading(true);
    setError("");

    Promise.all([
      loadSales(businessId, storeId),
      loadPurchases(businessId, storeId),
      loadStockRecords(businessId, storeId),
      loadInventoryMovements(businessId, storeId),
      loadProducts(businessId),
    ])
      .then(([allSales, allPurchases, stockRecords, movements, allProducts]) => {
        if (cancelled) return;
        setSales(allSales);
        setPurchases(allPurchases);
        setProducts(allProducts);
        setStockCount(stockRecords.length);
        setStockUnits(stockRecords.reduce(
          (total, record) => total + record.balance.quantityOnHand,
          0,
        ));
        setMovementCount(movements.filter(
          (movement: InventoryMovement) =>
            inRange(movement.createdAt, startDate, endDate),
        ).length);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load reports.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, storeId, workspaceLoading, startDate, endDate, refreshKey]);

  const rangeSales = sales.filter(
    (sale) => inRange(sale.createdAt, startDate, endDate),
  );
  const completedSales = rangeSales.filter(
    (sale) => sale.status === "completed",
  );
  const historySales = rangeSales.filter(
    (sale) => sale.status === "completed" || sale.status === "cancelled",
  );
  const rangePurchases = purchases.filter(
    (purchase) =>
      purchase.status === "received" &&
      purchase.receivedAt !== null &&
      inRange(purchase.receivedAt, startDate, endDate),
  );

  const salesTotal = totalMinor(
    completedSales,
    (sale) => sale.grandTotal.amountMinor,
  );
  const discountTotal = totalMinor(
    completedSales,
    (sale) => sale.discountTotal.amountMinor,
  );
  const taxTotal = totalMinor(
    completedSales,
    (sale) => sale.taxTotal.amountMinor,
  );
  const purchaseTotal = totalMinor(
    rangePurchases,
    (purchase) => purchase.subtotal.amountMinor,
  );
  const averageSale = completedSales.length
    ? Math.round(salesTotal / completedSales.length)
    : 0;

  const currency =
    completedSales[0]?.grandTotal.currency ??
    rangePurchases[0]?.subtotal.currency ??
    "INR";

  const productMap = new Map<
    string,
    { name: string; quantity: number; salesMinor: number }
  >();

  for (const sale of completedSales) {
    for (const line of sale.lines) {
      const current = productMap.get(line.productId) ?? {
        name: line.productNameSnapshot,
        quantity: 0,
        salesMinor: 0,
      };
      current.quantity += line.quantity;
      current.salesMinor += line.lineTotal.amountMinor;
      productMap.set(line.productId, current);
    }
  }

  const topProducts = [...productMap.entries()]
    .map(([productId, product]) => ({ productId, ...product }))
    .sort((a, b) =>
      b.quantity - a.quantity ||
      b.salesMinor - a.salesMinor ||
      a.name.localeCompare(b.name),
    );

  const marginEstimate = (() => {
    const productById = new Map(products.map((product) => [product.id, product]));
    let taxableSalesMinor = 0;
    let estimatedCostMinor = 0;
    let includedLines = 0;
    let missingCostLines = 0;
    let currencyMismatchLines = 0;

    for (const sale of completedSales) {
      for (const line of sale.lines) {
        const cost = productById.get(line.productId)?.costPrice;

        if (!cost || !Number.isFinite(cost.amountMinor) || cost.amountMinor < 0) {
          missingCostLines += 1;
          continue;
        }

        if (
          line.taxableAmount.currency !== currency ||
          cost.currency !== line.taxableAmount.currency
        ) {
          currencyMismatchLines += 1;
          continue;
        }

        taxableSalesMinor += line.taxableAmount.amountMinor;
        estimatedCostMinor += Math.round(line.quantity * cost.amountMinor);
        includedLines += 1;
      }
    }

    const estimatedGrossProfitMinor = taxableSalesMinor - estimatedCostMinor;

    return {
      taxableSalesMinor,
      estimatedCostMinor,
      estimatedGrossProfitMinor,
      estimatedMarginPercent: taxableSalesMinor > 0
        ? (estimatedGrossProfitMinor / taxableSalesMinor) * 100
        : null,
      includedLines,
      missingCostLines,
      currencyMismatchLines,
    };
  })();

  const dailySales = (() => {
    const buckets = new Map<string, { date: string; count: number; totalMinor: number }>();

    for (const sale of completedSales) {
      const date = sale.createdAt.slice(0, 10);
      const bucket = buckets.get(date) ?? { date, count: 0, totalMinor: 0 };
      bucket.count += 1;
      bucket.totalMinor += sale.grandTotal.amountMinor;
      buckets.set(date, bucket);
    }

    return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
  })();

  const maxDailySales = Math.max(0, ...dailySales.map((day) => day.totalMinor));
  function exportReportsCsv() {
    const rows: (string | number)[][] = [
      ["WATCHOUT POS - REPORT"],
      ["Business ID", businessId],
      ["Store ID", storeId],
      ["From", startDate],
      ["To", endDate],
      [],
      ["SALES SUMMARY"],
      ["Completed transactions", completedSales.length],
      ["Completed sales total", (salesTotal / 100).toFixed(2), currency],
      ["Average sale", (averageSale / 100).toFixed(2), currency],
      ["Discounts", (discountTotal / 100).toFixed(2), currency],
      ["Recorded tax", (taxTotal / 100).toFixed(2), currency],
      [],
      ["TOP-SELLING PRODUCTS"],
      ["Product ID", "Product name", "Quantity sold", "Sales value", "Currency"],
      ...topProducts.map((product) => [
        product.productId,
        product.name,
        product.quantity,
        (product.salesMinor / 100).toFixed(2),
        currency,
      ]),
      [],
      ["SALES TRANSACTIONS"],
      ["Sale ID", "Created at", "Status", "Item quantity", "Total", "Currency", "Cancellation reason"],
      ...historySales.map((sale) => [
        sale.id,
        sale.createdAt,
        sale.status,
        sale.lines.reduce((sum, line) => sum + line.quantity, 0),
        (sale.grandTotal.amountMinor / 100).toFixed(2),
        sale.grandTotal.currency,
        sale.cancellationReason ?? "",
      ]),
      [],
      ["RECEIVED PURCHASES"],
      ["Purchase ID", "Supplier", "Received at", "Subtotal", "Currency"],
      ...rangePurchases.map((purchase) => [
        purchase.id,
        purchase.supplierName,
        purchase.receivedAt ?? "",
        (purchase.subtotal.amountMinor / 100).toFixed(2),
        purchase.subtotal.currency,
      ]),
      [],
      ["Note", "Sales totals exclude cancelled sales. Product sales values are based on saved sale-line totals."],
      [],
      ["GROSS MARGIN ESTIMATE"],
      ["Eligible taxable sales", (marginEstimate.taxableSalesMinor / 100).toFixed(2), currency],
      ["Estimated product cost", (marginEstimate.estimatedCostMinor / 100).toFixed(2), currency],
      ["Estimated gross profit", (marginEstimate.estimatedGrossProfitMinor / 100).toFixed(2), currency],
      ["Estimated gross margin percent", marginEstimate.estimatedMarginPercent === null ? "N/A" : marginEstimate.estimatedMarginPercent.toFixed(2)],
      ["Sale lines included", marginEstimate.includedLines],
      ["Sale lines missing cost data", marginEstimate.missingCostLines],
      ["Sale lines excluded for currency mismatch", marginEstimate.currencyMismatchLines],
      [],
      ["Note", "Uses current recorded product costs, not historical costs at the time of sale."],
      ["Note", "Uses taxable sale-line amounts after discounts and before tax. Excludes overheads and other business expenses; not audited profit."],
      ["Note", "Payment-method totals are not calculated."],
    ];

    const csv = "\uFEFF" + rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `watchout-report-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const countByStatus = (status: Purchase["status"]) =>
    purchases.filter((purchase) => purchase.status === status).length;

  async function cancelSale(sale: Sale) {
    if (sale.status !== "completed" || cancellingSaleId) return;
    const reason = window.prompt(`Enter the reason for cancelling sale ${sale.id}:`);
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Cancellation requires a reason. No changes were made.");
      return;
    }
    if (!window.confirm(`Cancel sale ${sale.id}? Tracked stock will be restored. This does not refund a payment.`)) return;
    setCancellingSaleId(sale.id);
    setError("");
    try {
      await cancelSaleAtomically({
        saleId: sale.id,
        businessId,
        storeId,
        actorUserId: identity.userId,
        reason: reason.trim(),
      });
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel the sale.");
    } finally {
      setCancellingSaleId(null);
    }
  }

  return (
    <section className="reports-page">
      <header className="reports-header">
        <div>
          <p className="reports-eyebrow">BUSINESS OVERVIEW</p>
          <h1>Reports</h1>
          <p className="reports-subtitle">
            Review sales, purchasing and current inventory activity.
          </p>
        </div>
        <button
          className="reports-export"
          type="button"
          onClick={exportReportsCsv}
          disabled={loading || workspaceLoading || !!error}
        >
          Export CSV
        </button>
        <button
          className="reports-refresh"
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading || workspaceLoading}
        >
          Refresh data
        </button>
      </header>

      <div className="reports-filters">
        <label>
          From
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </div>

      {error && <p className="reports-error" role="alert">{error}</p>}

      {loading || workspaceLoading ? (
        <p className="reports-message">Loading report dataâ€¦</p>
      ) : (
        <>
          <h2 className="reports-section-title">Sales performance</h2>
          <div className="reports-grid">
            <article className="reports-card reports-card-primary">
              <span>Completed sales</span>
              <strong>{money(salesTotal, currency)}</strong>
              <small>{completedSales.length} completed transactions</small>
            </article>
            <article className="reports-card">
              <span>Average sale</span>
              <strong>{money(averageSale, currency)}</strong>
              <small>Per completed transaction</small>
            </article>
            <article className="reports-card">
              <span>Discounts given</span>
              <strong>{money(discountTotal, currency)}</strong>
              <small>Completed sales in selected period</small>
            </article>
            <article className="reports-card">
              <span>Tax collected</span>
              <strong>{money(taxTotal, currency)}</strong>
              <small>Recorded tax on completed sales</small>
            </article>
          </div>

          <section className="reports-margin-estimate">
            <h2 className="reports-section-title">Estimated gross margin</h2>
            <p className="reports-margin-note">
              Estimate based on current product cost prices and completed sales
              in the selected date range. This is not audited profit.
            </p>
            <div className="reports-grid">
              <article className="reports-card">
                <span>Eligible taxable sales</span>
                <strong>{money(marginEstimate.taxableSalesMinor, currency)}</strong>
                <small>Sale lines with usable cost data</small>
              </article>
              <article className="reports-card">
                <span>Estimated product cost</span>
                <strong>{money(marginEstimate.estimatedCostMinor, currency)}</strong>
                <small>Current recorded cost prices</small>
              </article>
              <article className="reports-card reports-card-primary">
                <span>Estimated gross profit</span>
                <strong>{money(marginEstimate.estimatedGrossProfitMinor, currency)}</strong>
                <small>Before overheads and other expenses</small>
              </article>
              <article className="reports-card">
                <span>Estimated gross margin</span>
                <strong>
                  {marginEstimate.estimatedMarginPercent === null
                    ? "N/A"
                    : `${marginEstimate.estimatedMarginPercent.toFixed(2)}%`}
                </strong>
                <small>Estimated gross profit ÷ eligible taxable sales</small>
              </article>
            </div>
            {(marginEstimate.missingCostLines > 0 ||
              marginEstimate.currencyMismatchLines > 0) && (
              <p className="reports-margin-warning" role="status">
                Some sale lines are excluded from this estimate:{" "}
                {marginEstimate.missingCostLines} missing cost price(s) and{" "}
                {marginEstimate.currencyMismatchLines} currency mismatch(es).
                Review product cost prices for a more complete estimate.
              </p>
            )}
          </section>

          <section className="reports-daily-trends">
            <h2 className="reports-section-title">Daily sales trends</h2>
            <p className="reports-daily-note">
              Completed sales only for the selected date range and business/store.
            </p>
            {dailySales.length === 0 ? (
              <p className="reports-message">No completed sales in this date range.</p>
            ) : (
              <div className="reports-daily-list">
                {dailySales.map((day) => {
                  const percentage = maxDailySales > 0
                    ? (day.totalMinor / maxDailySales) * 100
                    : 0;

                  return (
                    <div className="reports-daily-row" key={day.date}>
                      <div className="reports-daily-label">
                        <strong>
                          {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN")}
                        </strong>
                        <span>{day.count} {day.count === 1 ? "sale" : "sales"}</span>
                      </div>
                      <div className="reports-daily-bar-track" aria-hidden="true">
                        <div
                          className="reports-daily-bar"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <strong className="reports-daily-total">
                        {money(day.totalMinor, currency)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <h2 className="reports-section-title">Top-selling products</h2>
          {topProducts.length === 0 ? (
            <p className="reports-message">
              No completed-sale product data in this date range.
            </p>
          ) : (
            <div className="reports-history-wrap">
              <table className="reports-history reports-top-products">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Product ID</th>
                    <th>Quantity sold</th>
                    <th>Sales value</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product) => (
                    <tr key={product.productId}>
                      <td>{product.name}</td>
                      <td>{product.productId}</td>
                      <td>{product.quantity.toLocaleString("en-IN")}</td>
                      <td>{money(product.salesMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="reports-section-title">Sales transaction history</h2>
          {historySales.length === 0 ? (
            <p className="reports-message">
              No completed or cancelled sales in this date range for the selected business and store.
            </p>
          ) : (
            <div className="reports-history-wrap">
              <table className="reports-history">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sale ID</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Receipt / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {historySales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.createdAt).toLocaleString("en-IN")}</td>
                      <td>{sale.id}</td>
                      <td>{sale.lines.reduce((sum, line) => sum + line.quantity, 0)}</td>
                      <td>{money(sale.grandTotal.amountMinor, sale.grandTotal.currency)}</td>
                      <td>{sale.status === "cancelled" ? "Cancelled" : sale.status}</td>
                      <td>
                        <button
                          className="reports-receipt-button"
                          type="button"
                          onClick={() => setReceiptSale(sale)}
                        >
                          View / Print
                        </button>
                        {sale.status === "completed" && (
                          <button
                            className="reports-receipt-button"
                            type="button"
                            disabled={cancellingSaleId !== null}
                            onClick={() => void cancelSale(sale)}
                          >
                            {cancellingSaleId === sale.id ? "Cancellingâ€¦" : "Cancel sale"}
                          </button>
                        )}
                        {sale.status === "cancelled" && sale.cancellationReason && (
                          <small title={sale.cancellationReason}>
                            Reason: {sale.cancellationReason}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

                    {receiptSale && (
            <InvoiceDocument
              sale={receiptSale}
              onClose={() => setReceiptSale(null)}
            />
          )}
          <h2 className="reports-section-title">Purchases</h2>
          <div className="reports-grid">
            <article className="reports-card">
              <span>Received purchase value</span>
              <strong>{money(purchaseTotal, currency)}</strong>
              <small>{rangePurchases.length} received purchases in period</small>
            </article>
            <article className="reports-card">
              <span>Draft purchases</span>
              <strong>{countByStatus("draft")}</strong>
              <small>All dates</small>
            </article>
            <article className="reports-card">
              <span>Awaiting receipt</span>
              <strong>{countByStatus("receiving")}</strong>
              <small>All dates</small>
            </article>
            <article className="reports-card">
              <span>Cancelled purchases</span>
              <strong>{countByStatus("cancelled")}</strong>
              <small>All dates</small>
            </article>
          </div>

          <h2 className="reports-section-title">Current inventory</h2>
          <div className="reports-grid">
            <article className="reports-card">
              <span>Stock records</span>
              <strong>{stockCount}</strong>
              <small>Products with inventory records</small>
            </article>
            <article className="reports-card">
              <span>Units on hand</span>
              <strong>{stockUnits.toLocaleString("en-IN")}</strong>
              <small>Current snapshot, not historical stock</small>
            </article>
            <article className="reports-card">
              <span>Stock movements</span>
              <strong>{movementCount}</strong>
              <small>Movements in selected period</small>
            </article>
          </div>

          <p className="reports-note">
            These are operational summaries. Sales totals are not profit:
            purchase costs, operating expenses and other adjustments are not
            deducted. Purchase value is based on received purchase records.
          </p>
        </>
      )}
    </section>
  );
}


