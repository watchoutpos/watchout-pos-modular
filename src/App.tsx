import { useState } from 'react'
import './App.css'

type ModuleId = 'sales' | 'products' | 'inventory' | 'purchases' | 'reports'

const modules: { id: ModuleId; label: string; symbol: string; description: string }[] = [
  { id: 'sales', label: 'Sales', symbol: '↗', description: 'Create and manage customer sales.' },
  { id: 'products', label: 'Products', symbol: '▦', description: 'Maintain product names, prices and sale settings.' },
  { id: 'inventory', label: 'Inventory', symbol: '▤', description: 'Track stock levels and inventory movements.' },
  { id: 'purchases', label: 'Purchases', symbol: '＋', description: 'Record supplier purchases and received stock.' },
  { id: 'reports', label: 'Reports', symbol: '▥', description: 'Review sales, stock and business performance.' },
]

function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('sales')
  const selectedModule = modules.find((item) => item.id === activeModule)!

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="WatchOut home"
          onClick={(event) => {
            event.preventDefault()
            setActiveModule('sales')
          }}>
          <span className="brand-mark">W<span>!</span></span>
          <span className="brand-copy">
            <strong>WATCHOUT</strong>
            <small>POINT OF SALE</small>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <div className="store-card">
          <span className="store-icon">⌂</span>
          <span className="store-copy">
            <strong>Main Store</strong>
            <small>Current workspace</small>
          </span>
          <span className="store-indicator" aria-label="Selected store" />
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <span className="nav-heading">BUSINESS</span>
          {modules.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
              onClick={() => setActiveModule(item.id)}
              aria-current={activeModule === item.id ? 'page' : undefined}
            >
              <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
              <span>{item.label}</span>
              {item.id !== 'sales' && <span className="planned-dot" title="Foundation planned" />}
            </button>
          ))}
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
            <span className="brand-mark">W<span>!</span></span>
            <strong>WATCHOUT</strong>
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

          {activeModule === 'sales' ? (
            <>
              <section className="welcome-card">
                <div className="welcome-copy">
                  <span className="welcome-kicker">WELCOME TO WATCHOUT POS</span>
                  <h2>Everyday business.<br />Made simpler.</h2>
                  <p>
                    Start with the essentials. Build your product catalogue first,
                    then connect it to the sales and inventory workflow.
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setActiveModule('products')}
                  >
                    Explore Products <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <div className="art-ring ring-one" />
                  <div className="art-ring ring-two" />
                  <div className="art-card">
                    <span className="art-logo">W<span>!</span></span>
                    <span className="art-line long" />
                    <span className="art-line short" />
                    <span className="art-divider" />
                    <span className="art-line medium" />
                    <span className="art-line long" />
                    <span className="art-total"><span>TOTAL</span><strong>₹ —</strong></span>
                  </div>
                  <span className="art-spark spark-one">✳</span>
                  <span className="art-spark spark-two">✦</span>
                </div>
              </section>

              <div className="section-heading">
                <div>
                  <h2>Your workspace</h2>
                  <p>Core modules being established for the first release.</p>
                </div>
              </div>

              <section className="module-grid" aria-label="POS modules">
                {modules.filter((item) => item.id !== 'sales').map((item, index) => (
                  <button
                    className="module-card"
                    type="button"
                    key={item.id}
                    onClick={() => setActiveModule(item.id)}
                  >
                    <span className={`module-icon module-icon-${index + 1}`} aria-hidden="true">
                      {item.symbol}
                    </span>
                    <span className="module-card-title">{item.label}</span>
                    <span className="module-card-description">{item.description}</span>
                    <span className="module-card-footer">
                      <span>View module</span><span aria-hidden="true">→</span>
                    </span>
                  </button>
                ))}
              </section>

              <section className="notice-card">
                <span className="notice-icon" aria-hidden="true">i</span>
                <div>
                  <strong>Implementation status</strong>
                  <p>
                    This is the initial interface only. Sales processing, persistent
                    products, offline storage, login and synchronization are not
                    implemented yet.
                  </p>
                </div>
              </section>
            </>
          ) : (
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
              <button type="button" className="secondary-button" onClick={() => setActiveModule('sales')}>
                ← Back to workspace
              </button>
            </section>
          )}

          <footer className="page-footer">
            <span>WATCHOUT POS · MODULAR EDITION</span>
            <span>Foundation build · Not for live transactions</span>
          </footer>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {modules.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mobile-nav-item ${activeModule === item.id ? 'active' : ''}`}
            onClick={() => setActiveModule(item.id)}
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
