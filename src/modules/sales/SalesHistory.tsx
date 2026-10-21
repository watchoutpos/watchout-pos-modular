import { useEffect, useMemo, useState } from "react";
import { loadSales } from "../../shared/storage/salesStorage";
import type { Sale, SaleStatus } from "../../shared/types/domain";
import { filterSalesHistory } from "./salesHistoryRules";
import "./SalesHistory.css";

type Props = {
  businessId: string;
  storeId: string;
  onClose: () => void;
  onOpenInvoice: (sale: Sale) => void;
};


function formatMoney(minor: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN");
}

const statuses: Array<{ value: "all" | SaleStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "draft", label: "Draft" },
];

export function SalesHistory({ businessId, storeId, onClose, onOpenInvoice }: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SaleStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [appliedFilters, setAppliedFilters] = useState({ query: "", status: "all" as "all" | SaleStatus, fromDate: "", toDate: "" });

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mark history loading when its business/store changes.
    setLoading(true);
    setError("");
    loadSales(businessId, storeId)
      .then((saved) => {
        if (active) setSales(saved);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load sales history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [businessId, storeId]);

  const filtered = useMemo(
    () => filterSalesHistory(sales, appliedFilters),
    [sales, appliedFilters],
  );

  return (
    <div className="sales-history-backdrop" role="presentation">
      <section className="sales-history-panel" role="dialog" aria-modal="true" aria-labelledby="sales-history-title">
        <header className="sales-history-header">
          <div>
            <p className="sales-history-eyebrow">SALES &amp; RECEIPTS</p>
            <h2 id="sales-history-title">Sales history</h2>
            <p>Saved local transactions for the selected business and store.</p>
          </div>
          <button type="button" className="sales-history-close" onClick={onClose} aria-label="Close sales history">Close</button>
        </header>

        <div className="sales-history-filters">
          <label>
            Search receipt / sale ID
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter sale ID" />
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | SaleStatus)}>
              {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            From date
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            To date
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>

        <div className="sales-history-filter-actions">
          <button type="button" className="sales-history-search-button" onClick={() => setAppliedFilters({ query, status, fromDate, toDate })}>Search</button>
          <button type="button" className="sales-history-clear-button" onClick={() => {
            setQuery("");
            setStatus("all");
            setFromDate("");
            setToDate("");
            setAppliedFilters({ query: "", status: "all", fromDate: "", toDate: "" });
          }}>Clear</button>
        </div>

        {loading ? <p className="sales-history-message">Loading saved salesâ€¦</p> : null}
        {error ? <p className="sales-history-error" role="alert">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="sales-history-message">No sales match these filters.</p>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <div className="sales-history-table-wrap">
            <table className="sales-history-table">
              <thead><tr><th>Sale / receipt ID</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.id}>
                    <td><strong>{sale.id}</strong></td>
                    <td>{formatDate(sale.createdAt)}</td>
                    <td>{sale.lines.reduce((sum, line) => sum + line.quantity, 0)}</td>
                    <td>{formatMoney(sale.grandTotal.amountMinor, sale.grandTotal.currency)}</td>
                    <td><span className={`sales-history-status status-${sale.status}`}>{sale.status}</span></td>
                    <td className="sales-history-actions">
                      <button type="button" onClick={() => setSelectedSale(sale)}>Details</button>
                      {sale.status !== "draft" && (
                        <button type="button" onClick={() => onOpenInvoice(sale)}>Open invoice</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {selectedSale && (
          <div className="sales-history-detail" role="region" aria-label="Selected sale details">
            <div className="sales-history-detail-header">
              <h3>Sale details</h3>
              <button type="button" onClick={() => setSelectedSale(null)}>Close details</button>
            </div>
            <p><strong>ID:</strong> {selectedSale.id}</p>
            <p><strong>Status:</strong> {selectedSale.status}</p>
            <p><strong>Created:</strong> {formatDate(selectedSale.createdAt)}</p>
            {selectedSale.cancelledAt && <p><strong>Cancelled:</strong> {formatDate(selectedSale.cancelledAt)}</p>}
            {selectedSale.cancellationReason && <p><strong>Cancellation reason:</strong> {selectedSale.cancellationReason}</p>}
            <div className="sales-history-table-wrap">
              <table className="sales-history-table">
                <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
                <tbody>{selectedSale.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.productNameSnapshot}</td>
                    <td>{line.quantity}</td>
                    <td>{formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}</td>
                    <td>{formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="sales-history-detail-total">Grand total: {formatMoney(selectedSale.grandTotal.amountMinor, selectedSale.grandTotal.currency)}</p>
          </div>
        )}
        <p className="sales-history-footnote">History is read-only. Opening an invoice does not create a sale, change stock, or record a payment.</p>
      </section>
    </div>
  );
}




