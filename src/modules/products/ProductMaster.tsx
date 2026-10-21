import { useEffect, useMemo, useState, type FormEvent , useLayoutEffect, useRef} from 'react'
import type { InventoryMode, Product, ProductType, UnitOfMeasure } from '../../shared/types/domain'
import { useWorkspace } from '../../shared/WorkspaceProvider'
import type { ProductInput, ProductFieldErrors } from './types'
import { validateProductInput } from './validation'
import {
  runLegacyProductImportDryRun,
  type LegacyProductDryRunReport,
} from './legacyProductImport'
import {
  DuplicateProductIdentifierError,
  loadProducts,
  saveProduct,
  saveProductsAtomically,
  updateStoredProduct,
} from '../../shared/storage/productStorage'

const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'finished-good', label: 'Finished Good' },
  { value: 'ingredient-raw-material', label: 'Ingredient / Raw Material' },
  { value: 'intermediate-product', label: 'Intermediate Product' },
  { value: 'assembled-product', label: 'Assembled Product' },
]
const INVENTORY_MODES: { value: InventoryMode; label: string }[] = [
  { value: 'stocked', label: 'Stocked' },
  { value: 'made-to-order', label: 'Made to Order' },
  { value: 'batch-produced', label: 'Batch Produced' },
  { value: 'non-stocked', label: 'Non-Stocked' },
]
const UNITS: { value: UnitOfMeasure; label: string }[] = [
  { value: 'each', label: 'Each (unit)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'ml', label: 'Millilitre (ml)' },
  { value: 'l', label: 'Litre (l)' },
]
const INITIAL_FORM = {
  name: '', sku: '', barcode: '', productType: 'finished-good' as ProductType,
  inventoryMode: 'stocked' as InventoryMode, unitOfMeasure: 'each' as UnitOfMeasure,
  sellingPrice: '', costPrice: '', gstPercentage: '0', mrp: '',
  hsnSac: '', taxInclusive: false, defaultDiscountPercentage: '0',
  availableForDirectSale: true, isActive: true,
  category: 'Uncategorized', imageDataUrl: null as string | null,
}
type ProductForm = typeof INITIAL_FORM
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const moneyLabel = (amountMinor: number) => currency.format(amountMinor / 100)

export function ProductMaster() {
  const [form, setForm] = useState<ProductForm>(INITIAL_FORM)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'catalogue' | 'add'>('catalogue')
  const [products, setProducts] = useState<Product[]>([])
  const [errors, setErrors] = useState<ProductFieldErrors>({})
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [migrationReport, setMigrationReport] =
    useState<LegacyProductDryRunReport | null>(null)
  const [migrationMessage, setMigrationMessage] = useState('')
  const [migrationBusy, setMigrationBusy] = useState(false)

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => !query || [product.name, product.sku ?? '', product.barcode ?? ''].some((value) => value.toLowerCase().includes(query)))
  }, [products, search])

  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setNotice('')
  }

  const { identity, loading: workspaceLoading } = useWorkspace()
  const BUSINESS_ID = identity.businessId
  const currentBusinessIdRef = useRef(BUSINESS_ID)
  const migrationRunRef = useRef(0)

  useLayoutEffect(() => {
    currentBusinessIdRef.current = BUSINESS_ID
    migrationRunRef.current += 1
  }, [BUSINESS_ID])

  useEffect(() => {
    let cancelled = false

    setProducts([])
    setEditingProductId(null)
    setForm(INITIAL_FORM)
    setMigrationReport(null)
    setMigrationMessage('')
    setMigrationBusy(false)

    if (workspaceLoading || !BUSINESS_ID) {
      return () => {
        cancelled = true
      }
    }

    loadProducts(BUSINESS_ID)
      .then((savedProducts) => {
        if (!cancelled) setProducts(savedProducts)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : 'Could not load saved products.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [BUSINESS_ID, workspaceLoading])

  async function previewLegacyImport(file: File | undefined) {
    if (!file || !BUSINESS_ID || workspaceLoading) return

    const previewBusinessId = BUSINESS_ID
    const runId = ++migrationRunRef.current

    setMigrationBusy(true)
    setMigrationReport(null)
    setMigrationMessage('')

    try {
      const raw = await file.text()

      if (
        migrationRunRef.current !== runId ||
        currentBusinessIdRef.current !== previewBusinessId
      ) return

      const preview = JSON.parse(raw.replace(/^\uFEFF/, '')) as unknown
      const existingProducts = await loadProducts(previewBusinessId)

      if (
        migrationRunRef.current !== runId ||
        currentBusinessIdRef.current !== previewBusinessId
      ) return

      const report = runLegacyProductImportDryRun(
        preview,
        existingProducts,
        previewBusinessId,
      )

      if (
        migrationRunRef.current !== runId ||
        currentBusinessIdRef.current !== previewBusinessId
      ) return

      setMigrationReport(report)
      setMigrationMessage(
        report.readyToImport
          ? 'Dry run passed. No products or inventory were changed.'
          : 'Dry run blocked. Review the errors and conflicts below.',
      )
    } catch (error: unknown) {
      if (
        migrationRunRef.current !== runId ||
        currentBusinessIdRef.current !== previewBusinessId
      ) return

      setMigrationReport(null)
      setMigrationMessage(
        error instanceof Error
          ? `Could not run preview: ${error.message}`
          : 'Could not run the migration preview.',
      )
    } finally {
      if (migrationRunRef.current === runId) {
        setMigrationBusy(false)
      }
    }
  }

  async function importLegacyProducts() {
    const report = migrationReport
    const importBusinessId = BUSINESS_ID

    if (!report || !report.readyToImport || migrationBusy) return

    if (
      !importBusinessId ||
      report.businessId !== importBusinessId ||
      currentBusinessIdRef.current !== importBusinessId
    ) {
      setMigrationReport(null)
      setMigrationMessage(
        'Import blocked: the active business changed. Run the preview again.',
      )
      return
    }

    const count = report.importableProducts.length
    if (count === 0) {
      setMigrationMessage('Import blocked: there are no validated products.')
      return
    }

    const confirmed = window.confirm(
      `Import ${count} products into this browser's Product Master? ` +
      'This will not import inventory quantities. Continue?',
    )
    if (!confirmed) return

    if (
      currentBusinessIdRef.current !== importBusinessId ||
      BUSINESS_ID !== importBusinessId ||
      report.businessId !== importBusinessId
    ) {
      setMigrationReport(null)
      setMigrationMessage(
        'Import blocked: the active business changed. Run the preview again.',
      )
      return
    }

    const runId = ++migrationRunRef.current
    setMigrationBusy(true)
    setMigrationMessage('Importing products...')
    try {
      const now = new Date().toISOString()
      const products: Product[] = report.importableProducts.map((input) => ({
        ...input,
        id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        createdAt: now,
        updatedAt: now,
      }))

      await saveProductsAtomically(products, importBusinessId)

      const refreshedProducts = await loadProducts(importBusinessId)

      if (
        migrationRunRef.current !== runId ||
        currentBusinessIdRef.current !== importBusinessId
      ) return

      setProducts(refreshedProducts)
      setMigrationReport(null)
      setMigrationMessage(
        `Successfully imported ${products.length} products. Inventory was not changed.`,
      )
    } catch (error: unknown) {
      if (
        migrationRunRef.current !== runId ||
        currentBusinessIdRef.current !== importBusinessId
      ) return

      setMigrationMessage(
        error instanceof Error
          ? `Import failed; no batch should have been committed: ${error.message}`
          : 'Import failed. Please verify Product Master before retrying.',
      )
    } finally {
      if (migrationRunRef.current === runId) {
        setMigrationBusy(false)
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')

    const price = Number(form.sellingPrice)
    const input: ProductInput = {
      businessId: BUSINESS_ID,
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      productType: form.productType,
      inventoryMode: form.inventoryMode,
      unitOfMeasure: form.unitOfMeasure,
      availableForDirectSale: form.availableForDirectSale,
      sellingPrice: {
        amountMinor:
          form.sellingPrice.trim() !== '' && Number.isFinite(price)
            ? Math.round(price * 100)
            : Number.NaN,
        currency: 'INR',
      },
      costPrice: form.costPrice.trim() === '' ? null : {
        amountMinor:
          Number.isFinite(Number(form.costPrice))
            ? Math.round(Number(form.costPrice) * 100)
            : Number.NaN,
        currency: 'INR',
      },
      gstPercentage:
        form.gstPercentage.trim() !== '' && Number.isFinite(Number(form.gstPercentage))
          ? Number(form.gstPercentage)
          : Number.NaN,
      mrp: form.mrp.trim() === '' ? null : {
        amountMinor:
          Number.isFinite(Number(form.mrp))
            ? Math.round(Number(form.mrp) * 100)
            : Number.NaN,
        currency: 'INR',
      },
      hsnSac: form.hsnSac.trim() || null,
      category: form.category,
      imageDataUrl: form.imageDataUrl,
      taxInclusive: form.taxInclusive,
      defaultDiscountPercentage: form.defaultDiscountPercentage.trim() !== '' && Number.isFinite(Number(form.defaultDiscountPercentage))
        ? Number(form.defaultDiscountPercentage)
        : Number.NaN,
      isActive: form.isActive,
    }

    const result = validateProductInput(input)
    if (!result.valid) {
      setErrors(result.errors)
      setNotice('Please correct the highlighted fields.')
      return
    }

    const existingProduct = editingProductId
      ? products.find((item) => item.id === editingProductId)
      : undefined

    if (editingProductId && !existingProduct) {
      setNotice('Could not find the product being edited. Reload the catalogue and try again.')
      return
    }

    const now = new Date().toISOString()
    const product: Product = {
      ...result.value,
      id: existingProduct?.id ??
        `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: existingProduct?.createdAt ?? now,
      updatedAt: now,
    }

    try {
      if (existingProduct) {
        await updateStoredProduct(product)
        setProducts((current) =>
          current.map((item) => item.id === product.id ? product : item),
        )
      } else {
        await saveProduct(product)
        setProducts((current) => [product, ...current])
      }

      setForm(INITIAL_FORM)
      setEditingProductId(null)
      setErrors({})
      setActiveTab('catalogue')
      setNotice(`${product.name} ${existingProduct ? 'updated' : 'saved'} successfully.`)
    } catch (error: unknown) {
      if (error instanceof DuplicateProductIdentifierError) {
        const field = error.message.toLowerCase().includes('barcode') ? 'barcode' : 'sku'
        setErrors((current) => ({ ...current, [field]: error.message }))
        setNotice(error.message)
      } else {
        setNotice(error instanceof Error ? error.message : 'Could not save the product. Please try again.')
      }
    }
  }

  function startEditing(product: Product) {
    setActiveTab('add')
    setEditingProductId(product.id)
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      productType: product.productType,
      inventoryMode: product.inventoryMode,
      unitOfMeasure: product.unitOfMeasure,
      availableForDirectSale: product.availableForDirectSale,
      sellingPrice: (product.sellingPrice.amountMinor / 100).toFixed(2),
      costPrice: product.costPrice
        ? (product.costPrice.amountMinor / 100).toFixed(2)
        : '',
      gstPercentage: String(product.gstPercentage ?? 0),
      mrp: product.mrp
        ? (product.mrp.amountMinor / 100).toFixed(2)
        : '',
      hsnSac: product.hsnSac ?? '',
      category: product.category ?? 'Uncategorized',
      imageDataUrl: product.imageDataUrl ?? null,
      taxInclusive: product.taxInclusive ?? false,
      defaultDiscountPercentage: String(product.defaultDiscountPercentage ?? 0),
      isActive: product.isActive,
    })
    setErrors({})
    setNotice(`Editing ${product.name}. Save changes when finished.`)
  }

  function cancelEditing() {
    setEditingProductId(null)
    setActiveTab('catalogue')
    setForm(INITIAL_FORM)
    setErrors({})
    setNotice('Edit cancelled. No changes were saved.')
  }

  async function toggleActive(productId: string) {
    const existing = products.find((product) => product.id === productId)
    if (!existing) return

    const updated: Product = {
      ...existing,
      isActive: !existing.isActive,
      updatedAt: new Date().toISOString(),
    }

    try {
      await updateStoredProduct(updated)
      setProducts((current) =>
        current.map((product) => product.id === productId ? updated : product),
      )
      setNotice(`${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}.`)
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : 'Could not update the product.')
    }
  }
  return (
    <section className="product-workspace" aria-labelledby="product-master-title">
      <div className="product-toolbar">
        <div>
          <p className="eyebrow">CATALOGUE MANAGEMENT</p>
          <h2 id="product-master-title">Product Master</h2>
          <p className="section-description">Create products and define how each item is sold and stocked.</p>
        </div>
        <div className="product-count"><strong>{products.length}</strong><span>{products.length === 1 ? 'product saved' : 'products saved'}</span></div>
      </div>

            <section
        className="product-list-section"
        aria-labelledby="legacy-preview-title"
      >
        <div className="list-heading">
          <div>
            <h3 id="legacy-preview-title">Legacy product migration preview</h3>
            <p>Select the commercial JSON preview file to validate it against products currently saved in this browser.</p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="legacy-preview-file">Commercial preview JSON</label>
          <input
            id="legacy-preview-file"
            type="file"
            accept=".json,application/json"
            disabled={migrationBusy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              void previewLegacyImport(file)
              event.currentTarget.value = ''
            }}
          />
          <small>
            Read-only check. This does not import products, change stock, or modify the source file.
          </small>
        </div>

        {migrationBusy && (
          <p role="status" className="form-notice">
            Validating the selected file against saved productsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦
          </p>
        )}

        {migrationMessage && (
          <p role="status" className="form-notice">
            {migrationMessage}
          </p>
        )}

        {migrationReport && (
          <div>
            <h4>Dry-run results</h4>
            <p>
              Status: <strong>{migrationReport.status}</strong>
            </p>
            <p>Business: {migrationReport.businessId}</p>
            <p>Expected source products: {migrationReport.expectedSourceCount}</p>
            <p>Mapped products: {migrationReport.mappedCount}</p>
            <p>Existing destination products: {migrationReport.existingProductCount}</p>
            <p>Validated entries: {migrationReport.importableProducts.length}</p>
            <p>Conflicts: {migrationReport.conflicts.length}</p>
            <p>Errors: {migrationReport.errors.length}</p>
            <p>Writes performed: No</p>
            <p>Inventory imported: No</p>
            <p>
              Ready for a separately approved import: {migrationReport.readyToImport ? 'Yes' : 'No'}
            </p>

            <button
              type="button"
              className="primary-button"
              disabled={!migrationReport.readyToImport || migrationBusy}
              onClick={() => void importLegacyProducts()}
            >
              {migrationBusy ? 'Please wait...' : `Import ${migrationReport.importableProducts.length} Products`}
            </button>

            {migrationReport.conflicts.length > 0 && (
              <div>
                <h4>Conflicts</h4>
                <ul>
                  {migrationReport.conflicts.map((issue, index) => (
                    <li key={`conflict-${index}`}>
                      <strong>{issue.productName}</strong>
                      {issue.sku ? ` (SKU: ${issue.sku})` : ""}: {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {migrationReport.errors.length > 0 && (
              <div>
                <h4>Validation errors</h4>
                <ul>
                  {migrationReport.errors.map((issue, index) => (
                    <li key={`error-${index}`}>
                      <strong>{issue.productName}</strong>
                      {issue.sku ? ` (SKU: ${issue.sku})` : ""}: {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="product-master-tabs" role="tablist" aria-label="Product Master views">
        <button
          type="button"
          role="tab"
          id="product-catalogue-tab"
          aria-selected={activeTab === 'catalogue'}
          aria-controls="product-catalogue-panel"
          className={activeTab === 'catalogue' ? 'product-master-tab is-active' : 'product-master-tab'}
          onClick={() => setActiveTab('catalogue')}
        >
          Product Catalogue
        </button>
        <button
          type="button"
          role="tab"
          id="product-add-tab"
          aria-selected={activeTab === 'add'}
          aria-controls="product-add-panel"
          className={activeTab === 'add' ? 'product-master-tab is-active' : 'product-master-tab'}
          onClick={() => setActiveTab('add')}
        >
          {editingProductId ? 'Edit Product' : 'Add Product'}
        </button>
      </div>

      {activeTab === 'add' && (
        <div id="product-add-panel" role="tabpanel" aria-labelledby="product-add-tab">
      <form className="product-form" onSubmit={submit} noValidate>
        <div className="form-section-heading"><span className="section-number">01</span><div><h3>Basic information</h3><p>Identify the product in your catalogue.</p></div></div>
        <div className="form-grid">
          <div className="field field-wide"><label htmlFor="product-name">Product name <span className="required-mark">*</span></label><input id="product-name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Classic Croissant" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'product-name-error' : undefined} />{errors.name && <small className="field-error" id="product-name-error">{errors.name}</small>}</div>
          <div className="field"><label htmlFor="product-sku">SKU <span className="optional-label">Optional</span></label><input id="product-sku" value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="e.g. BAK-001" aria-invalid={Boolean(errors.sku)} />{errors.sku && <small className="field-error">{errors.sku}</small>}</div>
          <div className="field"><label htmlFor="product-barcode">Barcode <span className="optional-label">Optional</span></label><input id="product-barcode" value={form.barcode} onChange={(e) => update('barcode', e.target.value)} placeholder="Scan or enter barcode" aria-invalid={Boolean(errors.barcode)} />{errors.barcode && <small className="field-error">{errors.barcode}</small>}</div>
          <div className="field"><label htmlFor="product-category">Sales category</label><input id="product-category" value={form.category} maxLength={60} onChange={(e) => update('category', e.target.value)} placeholder="e.g. Croissant, Desserts, Drinks" /><small className="field-hint">Used to group products on the Sales screen.</small></div>
          <div className="field field-wide"><label htmlFor="product-image">Product image <span className="optional-label">Optional (up to 2 MB)</span></label><input id="product-image" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/')) { setNotice('Choose a valid image file.'); e.currentTarget.value = ''; return; } if (file.size > 2 * 1024 * 1024) { setNotice('Image must be 2 MB or smaller.'); e.currentTarget.value = ''; return; } const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) { update('imageDataUrl', reader.result); } else { setNotice('Could not read this image.'); } }; reader.onerror = () => setNotice('Could not read this image.'); reader.readAsDataURL(file); }} />{form.imageDataUrl && <div className="product-image-editor"><img src={form.imageDataUrl} alt="Product preview" /><button type="button" className="secondary-button" onClick={() => { update('imageDataUrl', null); const input = document.getElementById('product-image') as HTMLInputElement | null; if (input) input.value = ''; }}>Remove image</button></div>}<small className="field-hint">Use a clear product photo. Existing images are retained when editing unless changed or removed.</small></div>
        </div>

        <div className="form-section-heading section-heading-spaced"><span className="section-number">02</span><div><h3>Product & inventory rules</h3><p>Choose the product category and stock handling method.</p></div></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="product-type">Product type <span className="required-mark">*</span></label><select id="product-type" value={form.productType} onChange={(e) => update('productType', e.target.value as ProductType)}>{PRODUCT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{errors.productType && <small className="field-error">{errors.productType}</small>}</div>
          <div className="field"><label htmlFor="inventory-mode">Inventory mode <span className="required-mark">*</span></label><select id="inventory-mode" value={form.inventoryMode} onChange={(e) => update('inventoryMode', e.target.value as InventoryMode)}>{INVENTORY_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{errors.inventoryMode && <small className="field-error">{errors.inventoryMode}</small>}</div>
          <div className="field"><label htmlFor="product-unit">Unit of measure <span className="required-mark">*</span></label><select id="product-unit" value={form.unitOfMeasure} onChange={(e) => update('unitOfMeasure', e.target.value as UnitOfMeasure)}>{UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{errors.unitOfMeasure && <small className="field-error">{errors.unitOfMeasure}</small>}</div>
          <div className="field"><label htmlFor="selling-price">Selling price (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹) <span className="required-mark">*</span></label><div className="price-input-wrap"><span aria-hidden="true">ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹</span><input id="selling-price" type="number" min="0" step="0.01" inputMode="decimal" value={form.sellingPrice} onChange={(e) => update('sellingPrice', e.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.sellingPrice)} /></div>{errors.sellingPrice && <small className="field-error">{errors.sellingPrice}</small>}</div>
          <div className="field"><label htmlFor="cost-price">Cost price (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹) <span className="optional-label">Optional</span></label><input id="cost-price" type="number" min="0" step="0.01" inputMode="decimal" value={form.costPrice} onChange={(e) => update('costPrice', e.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.costPrice)} />{errors.costPrice && <small className="field-error">{errors.costPrice}</small>}</div>
          <div className="field"><label htmlFor="gst-percentage">GST (%)</label><input id="gst-percentage" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.gstPercentage} onChange={(e) => update('gstPercentage', e.target.value)} aria-invalid={Boolean(errors.gstPercentage)} />{errors.gstPercentage && <small className="field-error">{errors.gstPercentage}</small>}</div>
          <div className="field"><label htmlFor="defaultDiscountPercentage">Default discount (%)</label><input id="defaultDiscountPercentage" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.defaultDiscountPercentage} onChange={(e) => update('defaultDiscountPercentage', e.target.value)} placeholder="0" aria-invalid={Boolean(errors.defaultDiscountPercentage)} />{errors.defaultDiscountPercentage && <small className="field-error">{errors.defaultDiscountPercentage}</small>}<small className="field-hint">Applied by default in Sales; can be overridden per item.</small></div>
          <div className="field"><label htmlFor="mrp">MRP (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹) <span className="optional-label">Optional</span></label><input id="mrp" type="number" min="0" step="0.01" inputMode="decimal" value={form.mrp} onChange={(e) => update('mrp', e.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.mrp)} />{errors.mrp && <small className="field-error">{errors.mrp}</small>}</div>
          <div className="field"><label htmlFor="hsn-sac">HSN / SAC <span className="optional-label">Optional</span></label><input id="hsn-sac" value={form.hsnSac} onChange={(e) => update('hsnSac', e.target.value)} placeholder="Enter HSN/SAC code" aria-invalid={Boolean(errors.hsnSac)} />{errors.hsnSac && <small className="field-error">{errors.hsnSac}</small>}</div>
        </div>

        <div className="availability-row">
          <label className="checkbox-label"><input type="checkbox" checked={form.taxInclusive} onChange={(e) => update('taxInclusive', e.target.checked)} /> Selling price includes GST</label>
          <label className="check-option" htmlFor="direct-sale"><input id="direct-sale" type="checkbox" checked={form.availableForDirectSale} onChange={(e) => update('availableForDirectSale', e.target.checked)} /><span className="custom-check" aria-hidden="true">ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ</span><span><strong>Available for direct sale</strong><small>Allow this item to be selected in the sales workflow.</small></span></label>
          <label className="check-option compact-check" htmlFor="product-active"><input id="product-active" type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} /><span className="custom-check" aria-hidden="true">ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ</span><span><strong>Active</strong><small>Product is currently enabled.</small></span></label>
        </div>
        {notice && <p className={`form-notice ${Object.keys(errors).length ? 'form-notice-error' : ''}`} role="status">{notice}</p>}
        <div className="form-actions"><span className="required-note"><span className="required-mark">*</span> Required fields</span><div><button type="button" className="secondary-button" onClick={editingProductId ? cancelEditing : () => { setForm(INITIAL_FORM); setErrors({}); setNotice('') }}>{editingProductId ? 'Cancel edit' : 'Clear form'}</button><button type="submit" className="primary-button">{editingProductId ? 'Save changes' : 'Add product'}</button></div></div>
      </form>
        </div>
      )}

      {activeTab === 'catalogue' && (
      <section className="product-list-section" aria-labelledby="product-list-title">
        <div className="list-heading"><div><h3 id="product-list-title">Product catalogue</h3><p>Products are saved locally in this browser.</p></div><label className="search-field"><span aria-hidden="true">&#128269;</span><input aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU or barcode" /></label></div>
        {visibleProducts.length === 0 ? <div className="empty-products"><span className="empty-products-icon">&#9633;</span><strong>{products.length ? 'No matching products' : 'Your catalogue starts here'}</strong><p>{products.length ? 'Try another product name, SKU or barcode.' : 'Add your first product using the form above.'}</p></div> : <div className="product-table-wrap"><table className="product-table"><thead><tr><th>Product</th><th>Type</th><th>Price</th><th>Sale</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku || product.barcode || 'No SKU or barcode'}</small></td><td>{PRODUCT_TYPES.find((item) => item.value === product.productType)?.label}</td><td className="price-cell"><strong className="product-price-primary">{moneyLabel(product.sellingPrice.amountMinor)}</strong>{product.costPrice ? <small className="product-price-secondary">Cost: {moneyLabel(product.costPrice.amountMinor)}</small> : null}{product.mrp ? <small className="product-price-secondary">MRP: {moneyLabel(product.mrp.amountMinor)}</small> : null}</td><td><span className={`table-pill ${product.availableForDirectSale ? 'pill-yes' : 'pill-no'}`}>{product.availableForDirectSale ? 'Direct sale' : 'Not for sale'}</span></td><td><span className={`table-pill ${product.isActive ? 'pill-yes' : 'pill-no'}`}>{product.isActive ? 'Active' : 'Inactive'}</span></td><td><div className="row-actions"><button type="button" className="row-action" onClick={() => startEditing(product)}>Edit</button><button type="button" className="row-action" onClick={() => toggleActive(product.id)}>{product.isActive ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></table></div>}
      </section>
      )}
      <p className="session-warning"><span aria-hidden="true">ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ</span><span><strong>Local storage:</strong> Products are saved in this browser using IndexedDB. This does not provide cloud backup or cross-device synchronization.</span></p>
    </section>
  )
}


