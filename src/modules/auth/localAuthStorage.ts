import type { UserRole } from "../../shared/types/domain";
const DB_NAME = "watchout-pos-local-auth";
const DB_VERSION = 1;
const STORE_NAME = "credentials";
const OWNER_KEY = "first-owner";
const PBKDF2_ITERATIONS = 310_000;
const SESSION_KEY = "watchout-pos-auth-session";
export interface OwnerCredential {
  id: "first-owner"; username: string; userId: string; salt: string;
  passwordHash: string; iterations: number; createdAt: string; role: "owner";
}
export interface AuthSession {
  userId: string; username: string; role: UserRole; authenticatedAt: string;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser does not support local authentication storage.")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(request.error ?? new Error("Could not open authentication storage."));
    request.onblocked = () => reject(new Error("Authentication storage upgrade is blocked."));
  });
}
function toBase64(bytes: Uint8Array): string {
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure password hashing is unavailable in this browser.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}
function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0; for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}
function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY); if (!raw) return null;
    const value = JSON.parse(raw) as AuthSession;
    if (!value.userId || !value.username || value.role !== "owner") return null;
    return value;
  } catch { return null; }
}
export async function getOwnerCredential(): Promise<OwnerCredential | null> {
  const db = await openDb();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(OWNER_KEY);
    request.onsuccess = () => resolve((request.result as OwnerCredential | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read owner credential."));
  }); } finally { db.close(); }
}
export async function createFirstOwner(input: { username: string; password: string; confirmPassword: string }): Promise<AuthSession> {
  const username = input.username.trim();
  if (username.length < 3 || username.length > 64) throw new Error("Username must contain 3–64 characters.");
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw new Error("Use letters, numbers, dot, underscore, or hyphen in the username.");
  if (input.password.length < 12 || input.password.length > 256) throw new Error("Password must contain 12–256 characters.");
  if (input.password !== input.confirmPassword) throw new Error("Passwords do not match.");
  const db = await openDb();
  try {
    const existing = await new Promise<OwnerCredential | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(OWNER_KEY);
      request.onsuccess = () => resolve((request.result as OwnerCredential | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not check owner setup."));
    });
    if (existing) throw new Error("Owner setup is already complete. Please sign in.");
    const salt = new Uint8Array(16); crypto.getRandomValues(salt);
    const passwordHash = await deriveHash(input.password, salt, PBKDF2_ITERATIONS);
    const credential: OwnerCredential = {
      id: OWNER_KEY, username, userId: `local-owner-${crypto.randomUUID()}`,
      salt: toBase64(salt), passwordHash: toBase64(passwordHash),
      iterations: PBKDF2_ITERATIONS, createdAt: new Date().toISOString(), role: "owner",
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const check = store.get(OWNER_KEY);
      check.onsuccess = () => { if (check.result) { transaction.abort(); return; } store.add(credential); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Owner setup failed."));
      transaction.onabort = () => reject(new Error("Owner setup is already complete or could not be saved."));
    });
    const session: AuthSession = { userId: credential.userId, username, role: "owner", authenticatedAt: new Date().toISOString() };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
    catch { throw new Error("Owner was created, but this browser could not save the session. Sign in to continue."); }
    return session;
  } finally { db.close(); }
}
export async function signInOwner(usernameInput: string, password: string): Promise<AuthSession> {
  const username = usernameInput.trim(); const credential = await getOwnerCredential();
  if (!credential || credential.username.toLocaleLowerCase() !== username.toLocaleLowerCase()) throw new Error("Invalid username or password.");
  const hash = await deriveHash(password, fromBase64(credential.salt), credential.iterations);
  if (!constantTimeEqual(hash, fromBase64(credential.passwordHash))) throw new Error("Invalid username or password.");
  const session: AuthSession = { userId: credential.userId, username: credential.username, role: "owner", authenticatedAt: new Date().toISOString() };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  catch { throw new Error("Could not save the sign-in session in this browser."); }
  return session;
}
export function getAuthSession(): AuthSession | null { return readSession(); }
export function signOutOwner(): void { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* UI still locks on sign-out. */ } }
export async function hasOwnerCredential(): Promise<boolean> { return (await getOwnerCredential()) !== null; }