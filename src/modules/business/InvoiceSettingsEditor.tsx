import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import {
  loadInvoiceSettings,
  saveInvoiceSettings,
  type InvoiceSettingsInput,
} from "../../shared/storage/workspaceStorage";

type SettingsScope = "business" | "store";

type InvoiceForm = {
  businessName: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  location: string;
  phone: string;
  email: string;
  gstin: string;
  invoiceMode: "gst" | "non-gst";
  showWatchoutLogo: boolean;
  showDiscountOnInvoice: boolean;
  businessLogoUrl: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkImageUrl: string;
  watermarkOpacity: number;
  watermarkSize: number;
  qrMode: "off" | "static" | "sale-total";
  qrStaticValue: string;
  invoiceNumberPrefix: string;
};

const EMPTY_SETTINGS: InvoiceForm = {
  businessName: "",
  tagline: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  location: "",
  phone: "",
  email: "",
  gstin: "",
  invoiceMode: "non-gst",
  showWatchoutLogo: true,
  showDiscountOnInvoice: false,
  businessLogoUrl: "",
  watermarkEnabled: false,
  watermarkText: "WATCHOUT",
  watermarkImageUrl: "",
  watermarkOpacity: 12,
  watermarkSize: 72,
  qrMode: "off",
  qrStaticValue: "",
  invoiceNumberPrefix: "WO",
};

export function InvoiceSettingsEditor() {
  const { businesses, stores, identity, loading } = useWorkspace();
  const [scope, setScope] = useState<SettingsScope>("business");
  const [selectedBusinessId, setSelectedBusinessId] = useState(identity.businessId);
  const [selectedStoreId, setSelectedStoreId] = useState(identity.storeId);
  const [form, setForm] = useState<InvoiceForm>(EMPTY_SETTINGS);
  const [working, setWorking] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const saveSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveSuccessTimer.current !== null) {
        clearTimeout(saveSuccessTimer.current);
      }
    };
  }, []);
  const [feedback, setFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  // Keep selections valid if the workspace collection changes.
  useEffect(() => {
    if (!businesses.some((item) => item.id === selectedBusinessId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep selection valid when businesses change.
      setSelectedBusinessId(identity.businessId && businesses.some((item) => item.id === identity.businessId)
        ? identity.businessId
        : businesses[0]?.id ?? "");
    }
  }, [businesses, identity.businessId, selectedBusinessId]);

  const selectedBusiness = businesses.find((item) => item.id === selectedBusinessId);
  const businessStores = useMemo(
    () => stores.filter((item) => item.businessId === selectedBusinessId && item.isActive),
    [stores, selectedBusinessId],
  );

  useEffect(() => {
    if (!businessStores.some((item) => item.id === selectedStoreId)) {
      const workspaceStore = businessStores.find((item) => item.id === identity.storeId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep store selection valid for the chosen business.
      setSelectedStoreId(workspaceStore?.id ?? businessStores[0]?.id ?? "");
    }
  }, [businessStores, identity.storeId, selectedStoreId]);

  const selectedStore = businessStores.find((item) => item.id === selectedStoreId);
  const targetStoreId = scope === "store" ? selectedStore?.id ?? null : null;

  useEffect(() => {
    let cancelled = false;

    if (!selectedBusiness) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the editor when no business is selected.
      setForm(EMPTY_SETTINGS);
      setFeedback("Create or select a business before configuring invoice settings.");
      setFeedbackIsError(true);
      return () => { cancelled = true; };
    }

    const business = selectedBusiness;

    async function load() {
      setFeedback("");
      setFeedbackIsError(false);
      try {
        const stored = await loadInvoiceSettings(business.id, targetStoreId);
        const inherited = targetStoreId
          ? await loadInvoiceSettings(business.id, null)
          : undefined;
        const source = stored ?? inherited;
        if (cancelled) return;

        setForm({
          ...EMPTY_SETTINGS,
          businessName: source?.businessName ?? business.name,
          tagline: source?.tagline ?? "",
          address: source?.address ?? "",
          city: source?.city ?? "",
          state: source?.state ?? "",
          postalCode: source?.postalCode ?? "",
          country: source?.country ?? "India",
          location: source?.location ?? "",
          phone: source?.phone ?? "",
          email: source?.email ?? "",
          gstin: source?.gstin ?? "",
          invoiceMode: source?.invoiceMode ?? "non-gst",
          showWatchoutLogo: source?.showWatchoutLogo ?? true,
          showDiscountOnInvoice: source?.showDiscountOnInvoice ?? false,
          businessLogoUrl: source?.businessLogoUrl ?? "",
          watermarkEnabled: source?.watermarkEnabled ?? false,
          watermarkText: source?.watermarkText ?? "WATCHOUT",
          watermarkImageUrl: source?.watermarkImageUrl ?? "",
          watermarkOpacity: source?.watermarkOpacity ?? 12,
          watermarkSize: source?.watermarkSize ?? 72,
          qrMode: source?.qrMode ?? "off",
          qrStaticValue: source?.qrStaticValue ?? "",
          invoiceNumberPrefix: source?.invoiceNumberPrefix ?? "WO",
        });
      } catch (cause) {
        if (!cancelled) {
          setFeedback(cause instanceof Error ? cause.message : "Unable to load invoice settings.");
          setFeedbackIsError(true);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [selectedBusiness, targetStoreId]);

  function handleWatermarkUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFeedback("Choose a PNG, JPEG, or WebP watermark image.");
      setFeedbackIsError(true);
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFeedback("Watermark image must be 2 MB or smaller.");
      setFeedbackIsError(true);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        setFeedback("Unable to read this watermark image. Please choose another file.");
        setFeedbackIsError(true);
        return;
      }
      update("watermarkImageUrl", reader.result);
      setFeedback("Watermark image loaded. Save invoice settings to keep it in this browser workspace.");
      setFeedbackIsError(false);
    };
    reader.onerror = () => {
      setFeedback("Unable to read this watermark image. Please choose another file.");
      setFeedbackIsError(true);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }
  function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFeedback("Choose a PNG, JPEG, or WebP image.");
      setFeedbackIsError(true);
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFeedback("Logo must be 2 MB or smaller.");
      setFeedbackIsError(true);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        setFeedback("Unable to read this image. Please choose another file.");
        setFeedbackIsError(true);
        return;
      }
      update("businessLogoUrl", reader.result);
      setFeedback("Logo loaded. Save invoice settings to keep it in this browser workspace.");
      setFeedbackIsError(false);
    };
    reader.onerror = () => {
      setFeedback("Unable to read this image. Please choose another file.");
      setFeedbackIsError(true);
    };
    reader.readAsDataURL(file);
  }
  function update<K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBusiness) {
      setFeedback("Select a business before saving invoice settings.");
      setFeedbackIsError(true);
      return;
    }
    if (scope === "store" && !selectedStore) {
      setFeedback("Select an active store belonging to the selected business before saving.");
      setFeedbackIsError(true);
      return;
    }

    setWorking(true);
    setSaveSucceeded(false);
    if (saveSuccessTimer.current !== null) {
      clearTimeout(saveSuccessTimer.current);
      saveSuccessTimer.current = null;
    }
    setFeedback("");
    setFeedbackIsError(false);
    try {
      const input: InvoiceSettingsInput = {
        ...form,
        businessId: selectedBusiness.id,
        storeId: targetStoreId,
        updatedAt: new Date().toISOString(),
      };
      await saveInvoiceSettings(input);
      setFeedback(scope === "store"
        ? `Store invoice settings saved locally for ${selectedStore?.name ?? "selected store"}.`
        : `Business invoice settings saved locally for ${selectedBusiness.name}.`);
      setFeedbackIsError(false);
      setSaveSucceeded(true);
      saveSuccessTimer.current = setTimeout(() => {
        setSaveSucceeded(false);
        saveSuccessTimer.current = null;
      }, 5000);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Unable to save invoice settings.");
      setFeedbackIsError(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="business-card invoice-settings-card">
      <h3>Invoice &amp; receipt settings</h3>
      <p>Choose a business and optionally a store override. Settings are stored in this browser's local workspace.</p>

      {feedback && (
        <p className={`invoice-settings-feedback ${feedbackIsError ? "is-error" : "is-success"}`} role="status">
          {feedback}
        </p>
      )}

      <form onSubmit={submit}>
        <div className="invoice-settings-fields">
          <div>
            <label htmlFor="invoice-settings-business">Business</label>
            <select
              id="invoice-settings-business"
              value={selectedBusinessId}
              onChange={(event) => {
                setSelectedBusinessId(event.target.value);
                setFeedback("");
              }}
              disabled={working || loading || businesses.length === 0}
              required
            >
              <option value="">Select a business</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="invoice-settings-scope">Settings apply to</label>
            <select
              id="invoice-settings-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as SettingsScope)}
              disabled={working || loading}
            >
              <option value="business">Business default</option>
              <option value="store">Selected store override</option>
            </select>
          </div>
          <div>
            <label htmlFor="invoice-settings-store">Store</label>
            <select
              id="invoice-settings-store"
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              disabled={working || loading || businessStores.length === 0}
            >
              <option value="">Select a store</option>
              {businessStores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
            <p className="business-muted">
              {scope === "business"
                ? "Business default applies unless a store has its own override."
                : "Only active stores belonging to the selected business are listed."}
            </p>
          </div>
        </div>

        {!selectedBusiness && (
          <p className="business-muted">Create or select a business before editing invoice settings.</p>
        )}
        {scope === "store" && !selectedStore && (
          <p className="business-muted">Select an active store before saving a store override.</p>
        )}

        <div className="invoice-settings-fields">
          <div>
            <label htmlFor="invoice-business-name">Business name on invoice</label>
            <input id="invoice-business-name" value={form.businessName}
              onChange={(event) => update("businessName", event.target.value)} maxLength={120} required />
          </div>
          <div>
            <label htmlFor="invoice-tagline">Business tagline</label>
            <input id="invoice-tagline" value={form.tagline}
              onChange={(event) => update("tagline", event.target.value)} maxLength={120} />
          </div>
          <div>
            <label htmlFor="invoice-address">Address</label>
            <input id="invoice-address" value={form.address}
              onChange={(event) => update("address", event.target.value)} maxLength={250} />
          </div>
          <div>
            <label htmlFor="invoice-city">City</label>
            <input id="invoice-city" value={form.city}
              onChange={(event) => update("city", event.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="invoice-state">State</label>
            <input id="invoice-state" value={form.state}
              onChange={(event) => update("state", event.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="invoice-postal-code">PIN / Postal code</label>
            <input id="invoice-postal-code" value={form.postalCode}
              onChange={(event) => update("postalCode", event.target.value)} maxLength={20} />
          </div>
          <div>
            <label htmlFor="invoice-country">Country</label>
            <input id="invoice-country" value={form.country}
              onChange={(event) => update("country", event.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="invoice-location">Store / branch location label</label>
            <input id="invoice-location" value={form.location}
              onChange={(event) => update("location", event.target.value)} maxLength={100} />
          </div>
          <div>
            <label htmlFor="invoice-phone">Phone</label>
            <input id="invoice-phone" value={form.phone}
              onChange={(event) => update("phone", event.target.value)} maxLength={40} />
          </div>
          <div>
            <label htmlFor="invoice-email">Email</label>
            <input id="invoice-email" type="email" value={form.email}
              onChange={(event) => update("email", event.target.value)} maxLength={120} />
          </div>
          <div>
            <label htmlFor="invoice-gstin">GSTIN</label>
            <input id="invoice-gstin" value={form.gstin}
              onChange={(event) => update("gstin", event.target.value)} maxLength={20} />
          </div>
          <div>
            <label htmlFor="invoice-mode">Invoice mode</label>
            <select id="invoice-mode" value={form.invoiceMode}
              onChange={(event) => update("invoiceMode", event.target.value as typeof form.invoiceMode)}>
              <option value="non-gst">Standard invoice</option>
              <option value="gst">GST invoice</option>
            </select>
          </div>
          <div className="invoice-logo-settings">
            <label htmlFor="invoice-logo-upload">Business logo</label>
            <div className="invoice-logo-preview">
              {form.businessLogoUrl ? (
                <img src={form.businessLogoUrl} alt="Business logo preview" />
              ) : (
                <span>Built-in WATCHOUT logo</span>
              )}
            </div>
            <input id="invoice-logo-upload" type="file" accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoUpload} disabled={working || loading} />
            <p className="business-muted">PNG, JPEG or WebP; maximum 1 MB. Save settings after selecting a logo.</p>
            <label htmlFor="invoice-logo-url">Or use a public image URL / asset path</label>
            <input id="invoice-logo-url" value={form.businessLogoUrl.startsWith("data:image/") ? "" : form.businessLogoUrl}
              onChange={(event) => update("businessLogoUrl", event.target.value)}
              maxLength={500} placeholder="/assets/my-business-logo.png" />
            <div className="invoice-logo-actions">
              <button type="button" className="business-secondary"
                onClick={() => { update("businessLogoUrl", ""); setFeedback("Logo cleared. Save settings to apply the built-in logo."); setFeedbackIsError(false); }}
                disabled={working || !form.businessLogoUrl}>Clear / use built-in logo</button>
            </div>
          </div>
          <div>
            <label htmlFor="invoice-number-prefix">Invoice number prefix</label>
            <input id="invoice-number-prefix" value={form.invoiceNumberPrefix}
              onChange={(event) => update("invoiceNumberPrefix", event.target.value)} maxLength={20} />
          </div>
          <div>
            <label htmlFor="invoice-qr-mode">QR mode</label>
            <select id="invoice-qr-mode" value={form.qrMode}
              onChange={(event) => update("qrMode", event.target.value as typeof form.qrMode)}>
              <option value="off">Off</option>
              <option value="static">Static QR payload</option>
              <option value="sale-total">Sale summary QR</option>
            </select>
          </div>
          <div>
            <label htmlFor="invoice-qr-value">Static QR payload</label>
            <input id="invoice-qr-value" value={form.qrStaticValue}
              onChange={(event) => update("qrStaticValue", event.target.value)}
              maxLength={500} placeholder="Text or URL to encode in the QR code" />
          </div>
          <div>
            <label htmlFor="invoice-watermark-text">Watermark text</label>
            <input id="invoice-watermark-text" value={form.watermarkText}
              onChange={(event) => update("watermarkText", event.target.value)} maxLength={80} />
          </div>
        </div>

        <label className="invoice-settings-checkbox">
          <input type="checkbox" checked={form.showWatchoutLogo}
            onChange={(event) => update("showWatchoutLogo", event.target.checked)} />
          Show logo in invoice header
        </label>
        <label className="invoice-settings-checkbox">
          <input type="checkbox" checked={form.showDiscountOnInvoice}
            onChange={(event) => update("showDiscountOnInvoice", event.target.checked)} />
          Show discount on printed invoice
        </label>
        <div className="invoice-watermark-image-settings">
          <label htmlFor="invoice-watermark-upload">Watermark image (separate from the business logo)</label>
          <input id="invoice-watermark-upload" type="file" accept="image/png,image/jpeg,image/webp"
            onChange={handleWatermarkUpload} disabled={working || loading} />
          <p className="business-muted">PNG, JPEG or WebP; maximum 2 MB. Select your separate WATCHOUT POS artwork, then save settings.</p>
          {form.watermarkImageUrl && (
            <div className="invoice-watermark-image-preview">
              <img src={form.watermarkImageUrl} alt="Watermark image preview" />
              <button type="button" className="business-secondary"
                onClick={() => { update("watermarkImageUrl", ""); setFeedback("Watermark image cleared. Save settings to apply the change."); setFeedbackIsError(false); }}
                disabled={working}>Clear watermark image</button>
            </div>
          )}
        </div>        <div className="invoice-settings-fields invoice-watermark-controls">
          <div>
            <label htmlFor="invoice-watermark-opacity">Watermark opacity (%)</label>
            <input id="invoice-watermark-opacity" type="number" min="0" max="100" step="1"
              value={form.watermarkOpacity}
              onChange={(event) => update("watermarkOpacity", Number(event.target.value))} />
          </div>
          <div>
            <label htmlFor="invoice-watermark-size">Watermark size (%)</label>
            <input id="invoice-watermark-size" type="number" min="10" max="100" step="1"
              value={form.watermarkSize}
              onChange={(event) => update("watermarkSize", Math.max(10, Math.min(100, Number(event.target.value) || 10)))} />
          </div>
        </div>
        <label className="invoice-settings-checkbox">
          <input type="checkbox" checked={form.watermarkEnabled}
            onChange={(event) => update("watermarkEnabled", event.target.checked)} />
          Show watermark on invoice
        </label>

        <button
          type="submit"
          className={saveSucceeded ? "save-success-button" : undefined}
          disabled={working || loading || !selectedBusiness || (scope === "store" && !selectedStore)}
        >
          {working ? "Saving..." : saveSucceeded ? "Saved ✓" : "Save invoice settings"}
        </button>
      </form>
      <InvoiceSettingsLivePreview form={form} />
    </section>
  );
}



function InvoiceSettingsLivePreview({ form }: { form: InvoiceForm }) {
  const [format, setFormat] = useState<"full-page" | "thermal">("full-page");
  const [qrDataUrl, setQrDataUrl] = useState<{ payload: string; dataUrl: string } | null>(null);
  const address = [form.address, form.city, form.state, form.postalCode, form.country]
    .filter(Boolean)
    .join(", ");

  const total = form.invoiceMode === "gst"
    ? (form.showDiscountOnInvoice ? "₹346.50" : "₹366.50")
    : (form.showDiscountOnInvoice ? "₹330.00" : "₹350.00");  const qrPayload = form.qrMode === "static"
    ? form.qrStaticValue.trim()
    : form.qrMode === "sale-total"
      ? JSON.stringify({
          type: "watchout-pos-sale-summary",
          sample: true,
          invoiceId: `${form.invoiceNumberPrefix.trim() || "WO"}-SAMPLE-001`,
          currency: "INR",
          totalAmountMinor: form.invoiceMode === "gst"
            ? (form.showDiscountOnInvoice ? 34650 : 36650)
            : (form.showDiscountOnInvoice ? 33000 : 35000),
        })
      : "";

  useEffect(() => {
    let cancelled = false;

    if (!qrPayload) {
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 180,
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl({ payload: qrPayload, dataUrl });
    }).catch(() => {
      if (!cancelled) setQrDataUrl({ payload: qrPayload, dataUrl: "" });
    });

    return () => {
      cancelled = true;
    };
  }, [qrPayload]);
  return (
    <div className="invoice-live-preview">
      <div className="invoice-live-preview-toolbar">
        <div>
          <h4>Live invoice preview</h4>
          <p>Sample preview — not a saved sale. Changes are not saved until you save settings.</p>
        </div>
        <div className="invoice-live-preview-switch" role="group" aria-label="Preview format">
          <button type="button" className={format === "full-page" ? "is-active" : ""}
            aria-pressed={format === "full-page"} onClick={() => setFormat("full-page")}>
            Full-page
          </button>
          <button type="button" className={format === "thermal" ? "is-active" : ""}
            aria-pressed={format === "thermal"} onClick={() => setFormat("thermal")}>
            80mm receipt
          </button>
        </div>
      </div>

      <div className={`invoice-live-preview-stage ${format === "thermal" ? "is-thermal" : ""}`}>
        <article className="invoice-live-preview-paper">
          {form.watermarkEnabled && form.watermarkImageUrl && (
            <img className="invoice-live-preview-watermark-image"
              src={form.watermarkImageUrl} alt="" aria-hidden="true"
              style={{
                opacity: Math.max(0, Math.min(100, form.watermarkOpacity)) / 100,
                width: `${Math.max(10, Math.min(100, form.watermarkSize))}%`,
              }} />
          )}
          {form.watermarkEnabled && !form.watermarkImageUrl && form.watermarkText.trim() && (
            <div className="invoice-live-preview-watermark-text" aria-hidden="true"
              style={{
                opacity: Math.max(0, Math.min(100, form.watermarkOpacity)) / 100,
                fontSize: `${Math.max(10, Math.min(100, form.watermarkSize)) * 0.45}px`,
              }}>
              {form.watermarkText}
            </div>
          )}

          <header className="invoice-live-preview-header">
            {form.showWatchoutLogo && (
              <div className="invoice-live-preview-logo">
                {form.businessLogoUrl
                  ? <img src={form.businessLogoUrl} alt="Business logo" />
                  : <span><b>WATCH</b><strong>OUT</strong></span>}
              </div>
            )}
            <div className="invoice-live-preview-business">
              <h3>{form.businessName.trim() || "Your Business Name"}</h3>
              {form.tagline && <p>{form.tagline}</p>}
              {address && <p>{address}</p>}
              {form.location && <p>{form.location}</p>}
              {form.phone && <p>Phone: {form.phone}</p>}
              {form.email && <p>{form.email}</p>}
              {form.invoiceMode === "gst" && form.gstin && <p>GSTIN: {form.gstin}</p>}
            </div>
          </header>

          <h4 className="invoice-live-preview-title">
            {form.invoiceMode === "gst" ? "TAX INVOICE" : "INVOICE"}
          </h4>
          <div className="invoice-live-preview-meta">
            <span><b>Invoice:</b> {(form.invoiceNumberPrefix.trim() || "WO")}-SAMPLE-001</span>
            <span><b>Date:</b> Sample date</span>
            <span><b>Customer:</b> Sample Customer</span>
          </div>

          <table className="invoice-live-preview-table">
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
              <tr><td>Sample Product A</td><td>2</td><td>₹100.00</td><td>₹200.00</td></tr>
              <tr><td>Sample Product B</td><td>1</td><td>₹150.00</td><td>₹150.00</td></tr>
            </tbody>
          </table>

          <div className="invoice-live-preview-totals">
            <p><span>Subtotal</span><span>₹350.00</span></p>
            {form.showDiscountOnInvoice && (
              <p><span>Discount (sample)</span><span>−₹20.00</span></p>
            )}
            {form.invoiceMode === "gst" && <>
              <p><span>GST (illustrative)</span><span>{form.showDiscountOnInvoice ? "₹16.50" : "₹16.50"}</span></p>
            </>}
            <p className="invoice-live-preview-grand-total">
              <span>Total (sample)</span><span>{total}</span>
            </p>
          </div>

          {form.qrMode !== "off" && (
            <div className="invoice-live-preview-qr">
              {qrDataUrl?.payload === qrPayload && qrDataUrl.dataUrl ? (
                <img src={qrDataUrl.dataUrl}
                  alt={form.qrMode === "static" ? "Scannable static QR code preview" : "Scannable sample sale-summary QR code preview"} />
              ) : (
                <p role="status">
                  {form.qrMode === "static" && !form.qrStaticValue.trim()
                    ? "Enter a static QR payload to generate the QR code."
                    : (qrDataUrl?.payload === qrPayload ? "QR payload could not be encoded." : "Generating QR code…")}
                </p>
              )}
              <b>{form.qrMode === "static" ? "Static QR preview" : "Sample sale-summary QR"}</b>
              <p>
                {form.qrMode === "static"
                  ? (form.qrStaticValue.trim() || "No static QR payload entered.")
                  : "Sample data only — not a real sale or payment request."}
              </p>
            </div>
          )}

          <footer className="invoice-live-preview-footer">
            <p>Thank you for your business!</p>
            <small>Sample preview only — not a payment confirmation.</small>
          </footer>
        </article>
      </div>
    </div>
  );
}