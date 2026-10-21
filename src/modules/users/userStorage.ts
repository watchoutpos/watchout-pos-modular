import type { User, UserRole } from "../../shared/types/domain";

const DB_NAME = "watchout-pos-users";
const DB_VERSION = 1;
const STORE_NAME = "users";
const VALID_ROLES: UserRole[] = ["owner", "admin", "manager", "cashier"];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("byBusinessId", "businessId", { unique: false });
        store.createIndex("byStoreId", "storeId", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("User database upgrade is blocked."));
  });
}

export async function loadUsers(): Promise<User[]> {
  const db = await openDb();
  try {
    return await new Promise<User[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as User[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveUser(user: User): Promise<void> {
  if (!user.id.trim()) throw new Error("User ID is required.");
  if (!user.businessId.trim()) throw new Error("Business is required.");
  if (!user.name.trim()) throw new Error("User name is required.");
  if (!VALID_ROLES.includes(user.role)) throw new Error("Select a valid role.");
  if (user.storeId !== undefined && user.storeId !== null && !user.storeId.trim()) {
    throw new Error("Store assignment is invalid.");
  }

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        ...user,
        name: user.name.trim(),
        storeId: user.storeId || null,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Save aborted."));
    });
  } finally {
    db.close();
  }
}