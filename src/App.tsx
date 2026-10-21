import { useState } from 'react'
import { MODULES } from './shared/config/modules'
import type { ModuleId } from './shared/types/modules'
import { ProductMaster } from './modules/products/ProductMaster'
import { Inventory } from './modules/inventory/Inventory'
import { Purchases } from './modules/purchases/Purchases'
import { Sales } from './modules/sales/Sales'
import { Reports } from './modules/reports/Reports'
import { Business } from './modules/business/Business'
import { Users } from './modules/users/Users'
import './App.css'

const moduleSymbols: Record<ModuleId, string> = {
  sales: '\u2194',
  products: '\u25A6',
  inventory: '\u25A4',
  purchases: '\u002B',
  reports: '\u25A5',
  business: '\u2302',
  users: '\u263A',
}

const modules = MODULES
  .map((module) => ({
    ...module,
    symbol: moduleSymbols[module.id],
  }))

function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    const savedModule = localStorage.getItem('watchout-pos-active-module')
    return savedModule && modules.some((item) => item.id === savedModule)
      ? (savedModule as ModuleId)
      : 'sales'
  })

  const navigateToModule = (moduleId: ModuleId) => {
    setActiveModule(moduleId)
    localStorage.setItem('watchout-pos-active-module', moduleId)
  }
  const selectedModule = modules.find((item) => item.id === activeModule)!

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="WatchOut home"
          onClick={(event) => {
            event.preventDefault()
            navigateToModule('sales')
          }}>
          <img
            className="brand-logo"
            src="/assets/watchout-pos-wide.png"
            alt="WATCHOUT POS"
          />
        </a>


        {/* WATCHOUT_NAV_GROUPS_V1 */}
        <nav className="primary-nav" aria-label="Main navigation">
          {[
            { label: 'DAILY OPERATIONS', ids: ['sales', 'products', 'inventory'] },
            { label: 'PROCUREMENT', ids: ['purchases'] },
            { label: 'MANAGEMENT', ids: ['reports', 'business', 'users'] },
          ].map((group) => {
            const items = modules.filter((item) => group.ids.includes(item.id))
            return (
              <div className="nav-group" key={group.label}>
                <span className="nav-heading">{group.label}</span>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
                    onClick={() => navigateToModule(item.id)}
                    aria-current={activeModule === item.id ? 'page' : undefined}
                  >
                    <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>
            <strong>Foundation stage</strong>
            <small>Local development</small>
          </span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <img
              className="mobile-brand-logo"
              src="/assets/watchout-pos-wide.png"
              alt="WATCHOUT POS"
            />
          </div>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{selectedModule.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment-badge"><span /> Development</span>
            <div className="avatar" aria-label="User profile placeholder">U</div>
          </div>
        </header>

        <main className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR BUSINESS, SIMPLIFIED</p>
              <h1>{activeModule === 'sales' ? 'Sales workspace' : selectedModule.label}</h1>
              <p className="page-description">
                {activeModule === 'sales'
                  ? 'A simpler way to manage everyday shop transactions.'
                  : selectedModule.description}
              </p>
            </div>
            <span className="stage-chip">INITIAL FOUNDATION</span>
          </div>

          <div hidden={activeModule !== 'products'}>
            <ProductMaster />
          </div>

          {activeModule === 'sales' ? <Sales /> : activeModule === 'products' ? null : activeModule === 'inventory' ? <Inventory /> : activeModule === 'purchases' ? <Purchases /> : activeModule === 'reports' ? <Reports /> : activeModule === 'business' ? <Business /> : activeModule === 'users' ? <Users /> : (
            <section className="module-placeholder">
              <div className="placeholder-icon" aria-hidden="true">{selectedModule.symbol}</div>
              <span className="placeholder-label">MODULE FOUNDATION</span>
              <h2>{selectedModule.label} is planned next</h2>
              <p>{selectedModule.description}</p>
              <p className="placeholder-note">
                No business records are being created or changed on this screen.
                The module workflow and data rules will be implemented and tested
                before this area is treated as operational.
              </p>
              <button type="button" className="secondary-button" onClick={() => navigateToModule('sales')}>
                {String.fromCharCode(8592)} Back to workspace
              </button>
            </section>
          )}

          <footer className="page-footer">
            <span>WATCHOUT POS - MODULAR EDITION</span>
            <span>Foundation build - Not for live transactions</span>
          </footer>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {modules.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mobile-nav-item ${activeModule === item.id ? 'active' : ''}`}
            onClick={() => navigateToModule(item.id)}
            aria-current={activeModule === item.id ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.symbol}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App




