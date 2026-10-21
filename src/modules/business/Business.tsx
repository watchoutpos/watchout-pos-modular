import { useState, type FormEvent } from "react";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import "./Business.css";
import { InvoiceSettingsEditor } from "./InvoiceSettingsEditor";

export function Business() {
  const {
    businesses,
    stores,
    identity,
    loading,
    error,
    createBusiness,
    createStore,
    selectBusiness,
    selectStore,
    refresh,
  } = useWorkspace();

  const [businessName, setBusinessName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      await createBusiness(businessName.trim());
      setBusinessName("");
      setMessage("Business created and selected.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not create business.");
    } finally {
      setWorking(false);
    }
  }

  async function submitStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try {
      await createStore(storeName.trim());
      setStoreName("");
      setMessage("Store created and selected.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not create store.");
    } finally {
      setWorking(false);
    }
  }

  async function changeBusiness(value: string) {
    if (!value) return;
    setWorking(true);
    setMessage("");
    try {
      await selectBusiness(value);
      setMessage("Business selected.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not select business.");
    } finally {
      setWorking(false);
    }
  }

  const activeStores = stores.filter(
    (store) => store.businessId === identity.businessId && store.isActive
  );

  return (
    <section className="business-page" aria-label="Business management">
      <header className="business-summary">
        <div>
          <p className="business-eyebrow">WORKSPACE SETTINGS</p>
          <h2>Business &amp; Stores</h2>
          <p>Manage the business and store used by this local POS workspace.</p>
        </div>
        <button
          type="button"
          className="business-secondary"
          onClick={() => void refresh()}
          disabled={working || loading}
        >
          Refresh workspace
        </button>
      </header>

      {(error || message) && (
        <p className="business-feedback" role="status">{message || error}</p>
      )}

      <div className="business-grid">
        <section className="business-card">
          <h3>Current workspace</h3>
          <label htmlFor="business-select">Business</label>
          <select
            id="business-select"
            value={businesses.some((business) => business.id === identity.businessId)
              ? identity.businessId : ""}
            disabled={working || loading || businesses.length === 0}
            onChange={(event) => void changeBusiness(event.target.value)}
          >
            <option value="">Select a business</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>{business.name}</option>
            ))}
          </select>

          <label htmlFor="store-select">Active store</label>
          <select
            id="store-select"
            value={activeStores.some((store) => store.id === identity.storeId)
              ? identity.storeId : ""}
            disabled={working || loading || activeStores.length === 0}
            onChange={(event) => {
              if (event.target.value) selectStore(event.target.value);
            }}
          >
            <option value="">Select a store</option>
            {activeStores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

          <p className="business-muted">
            {loading ? "Loading workspace…" :
              `${businesses.length} business(es) · ${stores.filter((store) => store.isActive).length} active store(s)`}
          </p>
        </section>

        <section className="business-card">
          <h3>Create business</h3>
          <p>Add a business profile to this browser's local workspace.</p>
          <form onSubmit={submitBusiness}>
            <label htmlFor="new-business-name">Business name</label>
            <input
              id="new-business-name"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              maxLength={100}
              required
              placeholder="e.g. WatchOut Retail"
            />
            <button type="submit" disabled={working || loading || !businessName.trim()}>
              Create business
            </button>
          </form>
        </section>

        <section className="business-card">
          <h3>Create store</h3>
          <p>Stores belong to the currently selected business.</p>
          <form onSubmit={submitStore}>
            <label htmlFor="new-store-name">Store name</label>
            <input
              id="new-store-name"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              maxLength={100}
              required
              placeholder="e.g. Main Store"
            />
            <button
              type="submit"
              disabled={working || loading ||
                !businesses.some((business) => business.id === identity.businessId) ||
                !storeName.trim()}
            >
              Create store
            </button>
          </form>
        </section>

        <InvoiceSettingsEditor />

        <section className="business-card business-note">
          <h3>Implementation boundary</h3>
          <p>
            Workspace records are stored locally in this browser. Staff login,
            cloud synchronization, store editing, and enforced role-based
            permissions are not implemented by this screen.
          </p>
        </section>
      </div>
    </section>
  );
}