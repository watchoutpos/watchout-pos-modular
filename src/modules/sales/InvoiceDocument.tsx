import { useEffect, useState } from "react";
import * as QRCode from "qrcode";
import "../reports/Reports.css";
import type { Sale } from "../../shared/types/domain";
import {
  loadInvoiceSettings,
  type InvoiceSettings,
} from "../../shared/storage/workspaceStorage";

interface InvoiceDocumentProps {
  sale: Sale;
  onClose: () => void;
}

type PrintFormat = "full-page" | "thermal";

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Prints an existing sale only. It never completes sales or changes stock. */
export function InvoiceDocument({ sale, onClose }: InvoiceDocumentProps) {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [printFormat, setPrintFormat] = useState<PrintFormat>("full-page");
  const [qrDataUrl, setQrDataUrl] = useState<{
    payload: string;
    dataUrl: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const storeSettings = sale.storeId
          ? await loadInvoiceSettings(sale.businessId, sale.storeId)
          : undefined;
        const businessSettings = storeSettings
          ? undefined
          : await loadInvoiceSettings(sale.businessId);

        if (!cancelled) {
          setSettings(storeSettings ?? businessSettings ?? null);
        }
      } catch {
        if (!cancelled) setSettings(null);
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [sale.businessId, sale.storeId]);

  const qrPayload =
    settings?.qrMode === "static"
      ? settings.qrStaticValue.trim()
      : settings?.qrMode === "sale-total"
        ? JSON.stringify({
            type: "watchout-pos-sale-summary",
            invoiceId: settings.invoiceNumberPrefix.trim()
              ? `${settings.invoiceNumberPrefix.trim()}-${sale.id}`
              : sale.id,
            currency: sale.grandTotal.currency,
            totalAmountMinor: sale.grandTotal.amountMinor,
            createdAt: sale.createdAt,
          })
        : "";

  useEffect(() => {
    let cancelled = false;

    if (!qrPayload) {
      return () => { cancelled = true; };
    }

    void QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    }).then(
      (dataUrl) => {
        if (!cancelled) setQrDataUrl({ payload: qrPayload, dataUrl });
      },
      () => { if (!cancelled) setQrDataUrl(null); },
    );

    return () => { cancelled = true; };
  }, [qrPayload]);

  const fallbackLogoUrl = "/assets/watchout-pos-compact.png";
const configuredLogoUrl = settings?.businessLogoUrl.trim();
  const logoUrl = configuredLogoUrl || fallbackLogoUrl;
  const businessName = settings?.businessName.trim() || "WATCHOUT POS";
  const currency = sale.grandTotal.currency;
  const isGst = settings?.invoiceMode === "gst";
  const showWatermark =
    settings?.watermarkEnabled === true &&
    Boolean(settings.watermarkImageUrl?.trim() || settings.watermarkText.trim());
  const taxTotal = sale.taxTotal.amountMinor;

  const handleInvoicePrint = async () => {
    const invoice = document.querySelector<HTMLElement>(".reports-invoice-document");
    if (!invoice) return;

    const images = Array.from(invoice.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );

    window.print();
  };

  const useFallbackLogo = (event: import("react").SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.getAttribute("src") !== fallbackLogoUrl) {
      image.src = fallbackLogoUrl;
    }
  };

  return (
    <section
      className={`reports-receipt reports-invoice-document invoice-${printFormat}`}
      aria-label="Saved sale invoice"
    >
      <div className="reports-receipt-actions invoice-screen-actions">
        <h2>Invoice preview</h2>
        <label>
          Print layout{" "}
          <select
            value={printFormat}
            onChange={(event) =>
              setPrintFormat(event.target.value as PrintFormat)
            }
          >
            <option value="full-page">Full-page invoice</option>
            <option value="thermal">80 mm thermal receipt</option>
          </select>
        </label>
        <button type="button" onClick={handleInvoicePrint}>
          Print invoice
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="invoice-paper">
        {showWatermark && settings?.watermarkImageUrl?.trim() ? (
          <img
            className="invoice-watermark-image"
            src={settings.watermarkImageUrl}
            alt=""
            aria-hidden="true"
            style={{
              opacity: Math.max(0, Math.min(100, settings.watermarkOpacity ?? 12)) / 100,
              width: `${Math.max(10, Math.min(100, settings.watermarkSize ?? 72))}%`,
            }}
          />
        ) : showWatermark ? (
          <div
            className="invoice-watermark-text"
            aria-hidden="true"
            style={{
              opacity: Math.max(0, Math.min(100, settings?.watermarkOpacity ?? 12)) / 100,
              fontSize: `${Math.max(10, Math.min(100, settings?.watermarkSize ?? 72))}%`,
            }}
          >
            {settings!.watermarkText.trim()}
          </div>
        ) : null}

        <header className="invoice-business-header">
          {settings?.showWatchoutLogo !== false && (
            <img
              className="invoice-header-logo"
              src={logoUrl}
              onError={useFallbackLogo}
              alt="Business logo"
            />
          )}

          <div className="invoice-business-identity">
            <h1>{businessName}</h1>
            {settings?.tagline?.trim() && <p>{settings.tagline}</p>}
            {settings?.address.trim() && <p>{settings.address}</p>}
            {(settings?.city?.trim() || settings?.state?.trim() || settings?.postalCode?.trim()) && (
              <p>{[settings?.city, settings?.state, settings?.postalCode].filter((part) => part?.trim()).join(", ")}</p>
            )}
            {settings?.country?.trim() && <p>{settings.country}</p>}
            {settings?.location?.trim() && <p>Location: {settings.location}</p>}
            {settings?.phone.trim() && <p>Phone: {settings.phone}</p>}
            {settings?.email.trim() && <p>{settings.email}</p>}
            {isGst && settings?.gstin.trim() && (
              <p>GSTIN: {settings.gstin}</p>
            )}
          </div>
        </header>

        <h2 className="invoice-document-title">
          {isGst ? "TAX INVOICE" : "INVOICE"}
        </h2>

        <div className="invoice-meta">
          <div>
            <p>
              <span>Invoice No.</span>
              <strong>{settings?.invoiceNumberPrefix.trim()
                ? `${settings.invoiceNumberPrefix.trim()}-${sale.id}`
                : sale.id}</strong>
            </p>
            <p><span>Date &amp; Time</span><strong>{formatDate(sale.createdAt)}</strong></p>
          </div>
          <div>
            <p><span>Status</span><strong>{sale.status}</strong></p>
            <p><span>Store ID</span><strong>{sale.storeId || "—"}</strong></p>
          </div>
        </div>

        <div className="invoice-section-rule" />

        <div className="invoice-customer-row">
          <strong>Bill To</strong>
          <span>Walk-in Customer</span>
        </div>

        <div className="invoice-table-wrap">
          <table className="invoice-items-table">
            <thead>
              <tr>
                <th className="invoice-number-col">#</th>
                <th>Item</th>
                <th className="invoice-qty-col">Qty</th>
                <th className="invoice-money-col">Rate</th>
                <th className="invoice-money-col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td className="invoice-item-name">
                    {line.productNameSnapshot}
                  </td>
                  <td>{line.quantity}</td>
                  <td>{formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}</td>
                  <td>{formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="invoice-totals">
          <p><span>Subtotal</span><span>{formatMoney(sale.subtotal.amountMinor, currency)}</span></p>
          {settings?.showDiscountOnInvoice === true && sale.discountTotal.amountMinor > 0 && (
            <p><span>Discount</span><span>{formatMoney(sale.discountTotal.amountMinor, currency)}</span></p>
          )}
          {isGst && taxTotal !== 0 && (
            <p><span>Tax total</span><span>{formatMoney(taxTotal, currency)}</span></p>
          )}
          <p className="invoice-grand-total">
            <strong>{isGst ? "GRAND TOTAL" : "TOTAL"}</strong>
            <strong>{formatMoney(sale.grandTotal.amountMinor, currency)}</strong>
          </p>
        </div>

        {qrDataUrl?.payload === qrPayload && qrDataUrl.dataUrl && (
          <div className="invoice-qr">
            <img src={qrDataUrl.dataUrl} alt="Invoice information QR code" />
            <p>Invoice information only — not payment confirmation</p>
          </div>
        )}

        <footer className="invoice-footer">
          <p>Sale recorded by WatchOut POS</p>
          <p className="invoice-thank-you">THANK YOU!</p>
          <p>We hope to see you again.</p>
          <p className="invoice-payment-disclaimer">
            This invoice records the sale in this POS. It does not by itself
            confirm a bank, card, or UPI payment.
          </p>
        </footer>
      </div>
    </section>
  );
}