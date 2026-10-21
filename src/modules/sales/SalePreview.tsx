import type { BuiltSaleDraft } from "./saleBuilder";

interface SalePreviewProps {
  built: BuiltSaleDraft;
  onClose: () => void;
  onComplete: () => Promise<void>;
  isCompleting: boolean;
  completionError: string;
}

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export function SalePreview({
  built,
  onClose,
  onComplete,
  isCompleting,
  completionError,
}: SalePreviewProps) {
  const { sale, deductions } = built;
  const currency = sale.grandTotal.currency;

  return (
    <section className="sales-preview" aria-label="Sale preview" aria-live="polite">
      <header className="sales-preview-heading">
        <div>
          <span className="sales-preview-eyebrow">REVIEW SALE · NOT YET SAVED</span>
          <h3>Review sale</h3>
          <p>Review the items, discounts, tax and amount payable. Confirm only after receiving the full cash amount.</p>
        </div>
        <button type="button" className="sales-text-button sales-close-preview-button" disabled={isCompleting} onClick={onClose}>
          Close preview
        </button>
      </header>

      <div className="sales-preview-context">
        <span>Preview reference</span>
        <code>{sale.id}</code>
        <span>Store</span>
        <code>{sale.storeId}</code>
      </div>

      <div className="sales-preview-lines">
        {sale.lines.map((line) => (
          <article className="sales-preview-line" key={line.id}>
            <div className="sales-preview-line-copy">
              <strong>{line.productNameSnapshot}</strong>
              <span>
                {line.quantity} × {formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}
              </span>
              <small>
                Discount {line.discountPercentage}% · GST {line.gstPercentage}%
                {line.taxInclusive ? " · Inclusive" : " · Exclusive"}
              </small>
            </div>
            <strong>{formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}</strong>
          </article>
        ))}
      </div>

      <div className="sales-preview-totals">
        <div>
          <span>Subtotal</span>
          <strong>{formatMoney(sale.subtotal.amountMinor, currency)}</strong>
        </div>
        <div>
          <span>Discount</span>
          <strong>−{formatMoney(sale.discountTotal.amountMinor, currency)}</strong>
        </div>
        <div>
          <span>GST</span>
          <strong>{formatMoney(sale.taxTotal.amountMinor, currency)}</strong>
        </div>
        <div className="sales-preview-grand-total">
          <span>Amount payable</span>
          <strong>{formatMoney(sale.grandTotal.amountMinor, currency)}</strong>
        </div>
      </div>

      <p className="sales-preview-warning">
        Development mode only. Confirm only after receiving the full cash amount.
        This records a local sale and updates tracked inventory. Payment is not
        recorded separately; store and cashier identities are placeholders.
        No receipt or bank payment is created.
      </p>
      <p className="sales-preview-stock">
        Stock-tracked product lines: {deductions.length}. Inventory will be updated
        only if the sale transaction succeeds.
      </p>
      {completionError && (
        <p className="sales-error" role="alert">
          Sale not completed: {completionError}
        </p>
      )}
      <button
        type="button"
        className="sales-preview-button"
        disabled={isCompleting}
        onClick={() => void onComplete()}
      >
        {isCompleting ? "Saving sale…" : "Confirm cash received & save sale"}
      </button>
    </section>
  );
}