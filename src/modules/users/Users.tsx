import { useEffect, useMemo, useState } from "react";
import type { User, UserRole } from "../../shared/types/domain";
import { useWorkspace } from "../../shared/WorkspaceProvider";
import { loadUsers, saveUser } from "./userStorage";
import "./Users.css";

const roles: UserRole[] = ["owner", "admin", "manager", "cashier"];

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function Users() {
  const { businesses, stores, identity } = useWorkspace();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [businessId, setBusinessId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setUsers(await loadUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the existing local user records on mount.
    void refresh();
  }, []);

  useEffect(() => {
    if (!businessId && (identity.businessId || businesses[0]?.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize the business selection from the loaded workspace.
      setBusinessId(identity.businessId || businesses[0]?.id || "");
    }
  }, [businessId, identity.businessId, businesses]);

  const assignedStores = useMemo(
    () => stores.filter((store) => store.businessId === businessId && store.isActive),
    [stores, businessId],
  );

  const visibleUsers = useMemo(
    () => users.filter((user) => !businessId || user.businessId === businessId),
    [users, businessId],
  );

  function resetForm() {
    setName("");
    setRole("cashier");
    setStoreId("");
    setEditingId(null);
    setError(null);
  }

  function editUser(user: User) {
    setEditingId(user.id);
    setName(user.name);
    setRole(user.role);
    setBusinessId(user.businessId);
    setStoreId(user.storeId ?? "");
    setError(null);
    setNotice(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId) {
      setError("Create a business before adding users.");
      return;
    }

    const existing = editingId ? users.find((user) => user.id === editingId) : undefined;
    const now = timestamp();
    const record: User = {
      id: existing?.id ?? newId(),
      businessId,
      storeId: storeId || null,
      name: name.trim(),
      role,
      isActive: existing?.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveUser(record);
      await refresh();
      resetForm();
      setNotice(existing ? "User updated." : "User created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    setError(null);
    setNotice(null);
    try {
      await saveUser({ ...user, isActive: !user.isActive, updatedAt: timestamp() });
      await refresh();
      setNotice(`${user.name} is now ${user.isActive ? "inactive" : "active"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update user status.");
    }
  }

  function businessName(id: string) {
    return businesses.find((business) => business.id === id)?.name ?? "Unknown business";
  }

  function storeName(user: User) {
    if (!user.storeId) return "All stores";
    return stores.find((store) => store.id === user.storeId)?.name ?? "Assigned store";
  }

  return (
    <section className="users-page">
      <header className="users-header">
        <div>
          <h1>Users &amp; Roles</h1>
          <p>Manage staff records, role assignments, and store access.</p>
        </div>
        <button type="button" className="users-secondary" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error && <div className="users-message users-error" role="alert">{error}</div>}
      {notice && <div className="users-message" role="status">{notice}</div>}

      <div className="users-layout">
        <form className="users-form" onSubmit={submit}>
          <h2>{editingId ? "Edit user" : "Add user"}</h2>

          <label>
            Business
            <select value={businessId} onChange={(event) => {
              setBusinessId(event.target.value);
              setStoreId("");
            }} required>
              <option value="">Select business</option>
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </label>

          <label>
            User name
            <input value={name} onChange={(event) => setName(event.target.value)}
              required maxLength={100} placeholder="Enter staff name" />
          </label>

          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Store assignment
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              <option value="">All stores / business-wide</option>
              {assignedStores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </label>

          <div className="users-actions">
            <button type="submit" disabled={saving || !businesses.length}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add user"}
            </button>
            {editingId && (
              <button type="button" className="users-secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
          {!businesses.length && (
            <p className="users-hint">Create a business in the Business workspace first.</p>
          )}
        </form>

        <section className="users-list">
          <div className="users-list-header">
            <h2>Staff users</h2>
            <span>{visibleUsers.length} total</span>
          </div>

          {loading ? <p>Loading users…</p> :
            visibleUsers.length === 0 ? (
              <p className="users-empty">No users yet for this business. Add your first staff record.</p>
            ) : (
              <div className="users-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Store</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <small>{businessName(user.businessId)}</small>
                        </td>
                        <td>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</td>
                        <td>{storeName(user)}</td>
                        <td>
                          <span className={user.isActive ? "users-status active" : "users-status inactive"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="users-row-actions">
                            <button type="button" className="users-secondary"
                              onClick={() => editUser(user)}>Edit</button>
                            <button type="button" className="users-secondary"
                              onClick={() => void toggleActive(user)}>
                              {user.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </section>
      </div>
      <p className="users-hint">
        These are local staff records. Login credentials and permission enforcement are not configured yet.
      </p>
    </section>
  );
}
