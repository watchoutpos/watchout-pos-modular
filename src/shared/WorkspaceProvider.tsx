import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadBusinesses,
  loadStores,
  saveBusiness,
  saveStore,
} from "./storage/workspaceStorage";
import { getActiveIdentityContext } from "./getActiveIdentity";
import type { Business, Store } from "./types/domain";
import type { ActiveIdentityContext } from "./types/identity";

const BUSINESS_KEY = "watchout-pos-selected-business";
const STORE_KEY = "watchout-pos-selected-store";

interface WorkspaceContextValue {
  businesses: Business[];
  stores: Store[];
  identity: ActiveIdentityContext;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createBusiness: (name: string) => Promise<Business>;
  createStore: (name: string) => Promise<Store>;
  selectBusiness: (businessId: string) => Promise<void>;
  selectStore: (storeId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function now(): string {
  return new Date().toISOString();
}

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The current session still works if browser storage is unavailable.
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [identity, setIdentity] = useState<ActiveIdentityContext>(
    getActiveIdentityContext,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allBusinesses = await loadBusinesses();
      const savedBusinessId = readSaved(BUSINESS_KEY);
      const fallbackBusinessId = identity.businessId;
      const business =
        allBusinesses.find((item) => item.id === savedBusinessId) ??
        allBusinesses.find((item) => item.id === fallbackBusinessId) ??
        allBusinesses[0] ??
        null;

      setBusinesses(allBusinesses);

      if (!business) {
        setStores([]);
        setIdentity(getActiveIdentityContext());
        return;
      }

      const businessStores = await loadStores(business.id);
      const activeStores = businessStores.filter((item) => item.isActive);
      const savedStoreId = readSaved(STORE_KEY);
      const store =
        activeStores.find((item) => item.id === savedStoreId) ??
        activeStores.find((item) => item.id === identity.storeId) ??
        activeStores[0] ??
        null;

      setStores(businessStores);
      writeSaved(BUSINESS_KEY, business.id);

      if (store) {
        writeSaved(STORE_KEY, store.id);
        setIdentity((current) => ({
          ...current,
          businessId: business.id,
          storeId: store.id,
        }));
      } else {
        writeSaved(STORE_KEY, "");
        setIdentity((current) => ({
          ...current,
          businessId: business.id,
          storeId: "",
        }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workspace.");
    } finally {
      setLoading(false);
    }
  }, [identity.businessId, identity.storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the persisted business and store workspace asynchronously.
    void refresh();
  }, [refresh]);

  const createBusiness = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Business name is required.");

    const timestamp = now();
    const business: Business = {
      id: makeId("business"),
      name: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await saveBusiness(business);
    const allBusinesses = await loadBusinesses();
    setBusinesses(allBusinesses);
    setStores([]);
    setIdentity((current) => ({
      ...current,
      businessId: business.id,
      storeId: "",
    }));
    writeSaved(BUSINESS_KEY, business.id);
    writeSaved(STORE_KEY, "");
    return business;
  }, []);

  const createStore = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Store name is required.");

    const business = businesses.find(
      (item) => item.id === identity.businessId,
    );
    if (!business) throw new Error("Select a saved business before creating a store.");

    const timestamp = now();
    const store: Store = {
      id: makeId("store"),
      businessId: business.id,
      name: trimmed,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await saveStore(store);
    const businessStores = await loadStores(business.id);
    setStores(businessStores);
    setIdentity((current) => ({ ...current, storeId: store.id }));
    writeSaved(STORE_KEY, store.id);
    return store;
  }, [businesses, identity.businessId]);

  const selectBusiness = useCallback(async (businessId: string) => {
    const business = businesses.find((item) => item.id === businessId);
    if (!business) throw new Error("Selected business was not found.");

    const businessStores = await loadStores(businessId);
    const activeStores = businessStores.filter((item) => item.isActive);
    const savedStore = activeStores[0] ?? null;

    setStores(businessStores);
    setIdentity((current) => ({
      ...current,
      businessId,
      storeId: savedStore?.id ?? "",
    }));
    writeSaved(BUSINESS_KEY, businessId);
    writeSaved(STORE_KEY, savedStore?.id ?? "");
  }, [businesses]);

  const selectStore = useCallback((storeId: string) => {
    const store = stores.find(
      (item) =>
        item.id === storeId &&
        item.businessId === identity.businessId &&
        item.isActive,
    );
    if (!store) {
      setError("Choose an active store belonging to the selected business.");
      return;
    }

    setError(null);
    setIdentity((current) => ({ ...current, storeId: store.id }));
    writeSaved(STORE_KEY, store.id);
  }, [identity.businessId, stores]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    businesses,
    stores,
    identity,
    loading,
    error,
    refresh,
    createBusiness,
    createStore,
    selectBusiness,
    selectStore,
  }), [
    businesses,
    stores,
    identity,
    loading,
    error,
    refresh,
    createBusiness,
    createStore,
    selectBusiness,
    selectStore,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Keep the provider's shared context hook in this module.
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return context;
}
