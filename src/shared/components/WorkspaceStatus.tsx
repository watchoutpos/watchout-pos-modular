import { useState, type FormEvent } from 'react'
import { useWorkspace } from '../WorkspaceProvider'

export function WorkspaceStatus() {
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
  } = useWorkspace()

  const [businessName, setBusinessName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleCreateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setSaving(true)
    try {
      await createBusiness(businessName)
      setBusinessName('')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to create business.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setSaving(true)
    try {
      await createStore(storeName)
      setStoreName('')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to create store.')
    } finally {
      setSaving(false)
    }
  }

  const activeStores = stores.filter(
    (store) => store.businessId === identity.businessId && store.isActive,
  )

  return (
    <section className="workspace-status" aria-label="Workspace management">
      <h2>Workspace</h2>

      {loading ? (
        <p>Loading workspace…</p>
      ) : (
        <>
          <label htmlFor="workspace-business">Business</label>
          <select
            id="workspace-business"
            value={businesses.some((item) => item.id === identity.businessId)
              ? identity.businessId
              : ''}
            onChange={(event) => {
              void selectBusiness(event.target.value).catch((cause: unknown) => {
                setActionError(cause instanceof Error ? cause.message : 'Unable to select business.')
              })
            }}
          >
            <option value="">Select a business</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>{business.name}</option>
            ))}
          </select>

          <form onSubmit={handleCreateBusiness}>
            <label htmlFor="workspace-new-business">Add business</label>
            <input
              id="workspace-new-business"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Business name"
              maxLength={100}
              required
            />
            <button type="submit" disabled={saving}>
              Create business
            </button>
          </form>

          <label htmlFor="workspace-store">Store</label>
          <select
            id="workspace-store"
            value={activeStores.some((item) => item.id === identity.storeId)
              ? identity.storeId
              : ''}
            onChange={(event) => selectStore(event.target.value)}
            disabled={!businesses.some((item) => item.id === identity.businessId)}
          >
            <option value="">Select a store</option>
            {activeStores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

          <form onSubmit={handleCreateStore}>
            <label htmlFor="workspace-new-store">Add store</label>
            <input
              id="workspace-new-store"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              placeholder="Store name"
              maxLength={100}
              required
              disabled={!businesses.some((item) => item.id === identity.businessId)}
            />
            <button
              type="submit"
              disabled={saving || !businesses.some((item) => item.id === identity.businessId)}
            >
              Create store
            </button>
          </form>
        </>
      )}

      {(actionError || error) && (
        <p role="alert">{actionError || error}</p>
      )}

      <p className="workspace-status-note">
        Local development workspace — this is not login or access control.
      </p>
    </section>
  )
}