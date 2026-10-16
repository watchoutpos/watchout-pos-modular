# WatchOut POS Modular — Progress Tracker

> **Purpose:** Single end-to-end checklist for tracking the project from architecture through production. Mark an item complete only after the change is implemented and verified.
>
> **Current status snapshot:** Architecture documents and the initial Git baseline are established. React + Vite + TypeScript scaffold is installed. The responsive app shell exists, and the latest build and lint checks passed. The rendered UI still needs review. No real POS business workflow has been implemented yet.

## Status key
- [x] Completed and verified
- [ ] Pending
- **Status: In progress.** Work started but not complete
- **Status: BLOCKED.** Waiting on a dependency or decision

## 1. Project foundation & architecture
- [x] Architecture baseline documented — architecture, module contracts, development rules. `ID: foundation.docs`
- [x] Git repository and remote baseline established. `ID: foundation.git`
- [x] React + Vite + TypeScript scaffold installed. `ID: foundation.scaffold`
- [x] Local-data and secret ignore rules reviewed. `ID: foundation.ignore`
- [x] Build and lint checks pass for the current shell. `ID: foundation.quality`
- [x] Responsive application shell created; modules remain placeholders. `ID: foundation.shell`
- [ ] Review desktop and phone layout in browser. `ID: foundation.visual`
- [ ] Configure and verify continuous integration checks. `ID: foundation.ci`

## 2. Product design & shared foundations
- [ ] Finalize design tokens and responsive layout. `ID: design.tokens`
- [ ] Build reusable form, table, dialog, search and empty-state components. `ID: design.components`
- [ ] Define shared validation and error-handling conventions. `ID: design.validation`
- [ ] Define audit-event and entity-ID conventions. `ID: design.audit`

## 3. Product master
- [ ] Define product data model and validation, including product type, inventory mode and direct-sale eligibility. `ID: products.model`
- [ ] Create, view, edit and deactivate products with reliable persistence. `ID: products.crud`
- [ ] Support price, tax, unit and discount rules with tested rounding. `ID: products.pricing`
- [ ] Support barcode/SKU search and lookup. `ID: products.barcode`
- [ ] Implement product types: Finished Good, Ingredient / Raw Material, Intermediate Product, Assembled Product. `ID: products.types`
- [ ] Implement inventory modes: Stocked, Made to Order, Batch Produced, Non-Stocked. `ID: products.inventory-mode`
- [ ] Implement Available for direct sale checkbox. `ID: products.direct-sale`
- [ ] Add product validation and CRUD tests. `ID: products.tests`

## 4. Sales & receipts
- [ ] Product lookup, cart, quantity changes and line removal. `ID: sales.cart`
- [ ] Correct subtotal, discounts, tax and grand total calculations. `ID: sales.pricing`
- [ ] Complete cash sale with durable local transaction ID. `ID: sales.cash`
- [ ] Receipt view and print layout. `ID: sales.receipt`
- [ ] Cancellation/void and correction rules with audit trail. `ID: sales.void`
- [ ] Sale history and sale details. `ID: sales.history`
- [ ] Sales workflow tests, including refresh and failed persistence. `ID: sales.tests`

## 5. Inventory & stock movements
- [ ] Define auditable stock ledger and inventory events. `ID: inventory.model`
- [ ] Record opening stock. `ID: inventory.opening`
- [ ] Record stock additions, removals and corrections with reasons. `ID: inventory.adjust`
- [ ] Deduct stock for eligible completed sales. `ID: inventory.sales`
- [ ] Low-stock thresholds and view. `ID: inventory.low-stock`
- [ ] Stock reconciliation and discrepancy reporting. `ID: inventory.reconcile`

## 6. Purchases & suppliers
- [ ] Supplier records and lookup. `ID: purchases.suppliers`
- [ ] Purchase entry and received quantities. `ID: purchases.entry`
- [ ] Update stock through purchase inventory events; prevent duplicate receiving. `ID: purchases.stock`
- [ ] Purchase history, details and cancellation flow. `ID: purchases.history`

## 7. Customers & business setup
- [ ] Business profile and receipt identity settings. `ID: business.profile`
- [ ] Store/location model and active store selection; do not imply sync is already available. `ID: business.store`
- [ ] Customer create, search and edit workflow. `ID: customers.crud`
- [ ] Validated and persistent settings. `ID: business.settings`

## 8. Reports & operational visibility
- [ ] Daily/period sales summary reconciled against transactions. `ID: reports.sales`
- [ ] Product performance and sales detail. `ID: reports.products`
- [ ] Current stock, low stock and movement history. `ID: reports.inventory`
- [ ] Purchase and supplier summaries. `ID: reports.purchases`
- [ ] Report export and exported-data validation. `ID: reports.export`

## 9. Users, roles & security
- [ ] Login/session behavior appropriate to the chosen deployment. `ID: security.login`
- [ ] Owner/admin/manager/cashier permissions. `ID: security.roles`
- [ ] Enforce business/store data boundaries at trusted service/backend boundaries. `ID: security.store-scope`
- [ ] Review secrets, dependency and input handling. `ID: security.secrets`
- [ ] Audit important actions. `ID: security.audit`

## 10. Offline-first storage & recovery
- [ ] Storage abstraction with IndexedDB for browser data. `ID: offline.storage`
- [ ] Verify transactions survive refresh and browser restart. `ID: offline.durable`
- [ ] Explicit pending/failed/synchronized states, stable IDs and idempotent retry. `ID: offline.queue`
- [ ] Handle offline/online transitions without losing work. `ID: offline.network`
- [ ] Implement and test backup/restore and device-loss recovery. `ID: offline.backup`
- [ ] Show stale stock and reconcile after reconnect. `ID: offline.reconcile`
- [ ] Document offline vs online-only capabilities. `ID: offline.scope`

## 11. Testing, quality & release readiness
- [ ] Unit tests for calculations, validation and permissions. `ID: testing.unit`
- [ ] Integration tests for persistence and service workflows. `ID: testing.integration`
- [ ] End-to-end tests for product → sale → receipt → stock/report. `ID: testing.e2e`
- [ ] Test phone, tablet and desktop layouts. `ID: testing.devices`
- [ ] Accessibility review: keyboard, contrast, focus and readable errors. `ID: testing.accessibility`
- [ ] Security and dependency review. `ID: testing.security`
- [ ] Recovery tests: backup restore, corrupted data and interrupted operations. `ID: testing.recovery`
- [ ] Performance checks with realistic data and slower devices. `ID: testing.performance`

## 12. Pilot & production launch
- [ ] Define pilot scope and acceptance criteria. `ID: pilot.scope`
- [ ] Prepare safe test data and migration/import plan. `ID: pilot.data`
- [ ] Prepare setup, cashier and troubleshooting guides. `ID: pilot.training`
- [ ] Run pilot and track issues by severity. `ID: pilot.feedback`
- [ ] Finalize one-time licensing and activation approach. `ID: pilot.license`
- [ ] Set up production hosting/domain and secure configuration. `ID: pilot.deploy`
- [ ] Add error diagnostics and support process with privacy-safe logging. `ID: pilot.monitor`
- [ ] Complete go/no-go review and production checklist. `ID: pilot.release`

## 13. Later phase — cloud & multi-device sync
> Deferred until the local-first product is stable. Do not advertise these as available before implementation and verification.

- [ ] Design and secure cloud API/service. `ID: later.api`
- [ ] Implement conflict-aware sync and idempotent reconciliation. `ID: later.sync`
- [ ] Enable shared multi-store inventory and reporting. `ID: later.multistore`
- [ ] Evaluate payment-provider integrations and server-side verification. `ID: later.payments`
- [ ] Evaluate cloud operating costs if the business model changes. `ID: later.billing`

## Working rule
Only mark a task complete after implementation and verification. Build/lint passing proves code quality gates only; it does not mean the POS feature is complete. Keep this file committed in Git. For the visual dashboard, open `progress-tracker.html` through the Vite dev server and use **Export Markdown** after changing statuses, then replace this file with the export and commit the update.
