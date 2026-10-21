# WatchOut POS Modular — Progress Tracker

> **Updated:** 18 October 2026. Statuses are based on verified project output and the Purchases browser screenshots. This is not a production-readiness sign-off.

> **Current snapshot:** React + Vite + TypeScript modular app; workspace/business/store persistence; Product Master and Inventory foundations; Sales cart/pricing foundations; purchase draft storage and history UI. Latest reported test suite: **86 passed, 0 failed**; production build passed. Checkout is still disabled and purchase receiving is not implemented.

## Status key

- [x] Completed and verified
- [ ] Pending
- **Status: In progress.** Implemented partially or needs full verification
- **Status: BLOCKED.** Waiting on dependency or decision

## 1. Project foundation & architecture

_Repository, architecture decisions, developer workflow_

- [x] Architecture baseline documented — Architecture, module contracts, and development rules exist. `ID: foundation.docs`
- [x] Git repository and remote baseline established — Initial documentation baseline pushed to the project repository. `ID: foundation.git`
- [x] React + Vite + TypeScript scaffold installed — Dependencies installed in the new modular project. `ID: foundation.scaffold`
- [x] Local-data and secret ignore rules reviewed — Protect environment files, databases, build output, and local backups. `ID: foundation.ignore`
- [x] Build and quality checks pass — Latest npm test run: 86 passed, 0 failed; production build passed. Lint status is not reverified in this latest run. `ID: foundation.quality`
- [x] Responsive application shell created — Desktop app shell and core module navigation are visible; core workflows are still incomplete. `ID: foundation.shell`
- [ ] Review desktop and phone layout in browser — **Status: In progress.** Still needs visual review and navigation/responsive checks. `ID: foundation.visual`
- [ ] Continuous integration checks configured and verified — Build/lint/test checks should run automatically on pull requests. `ID: foundation.ci`

## 2. Product design & shared foundations

_Reusable UI, data contracts, errors, validation_

- [x] Apply approved premium charcoal/yellow theme — Use #0B0C0E, #17191D, #FFC914, #D6A84F and #F02D3A consistently across desktop and mobile. `ID: design.tokens`
- [x] Integrate approved WATCHOUT POS logo — Wide logo in desktop sidebar and mobile header; stable assets under public/assets. `ID: design.brand-assets`
- [ ] Verify logo sizing and responsive behavior — **Status: In progress.** Inspect logo proportions, transparency, contrast and phone layout in browser. `ID: design.brand-visual`
- [ ] Plan compact circular logo placement — Use the circular asset for future login and compact-brand contexts where appropriate. `ID: design.brand-compact`
- [ ] Review approved theme at desktop, tablet and phone widths — **Status: In progress.** Verify navigation, contrast, focus states, form spacing and horizontal overflow in the browser. `ID: design.responsive-review`
- [ ] Build reusable form, table, dialog, search and empty-state components — Avoid duplicate one-off UI patterns. `ID: design.components`
- [ ] Define shared validation and error-handling conventions — Readable errors; no silent failures. `ID: design.validation`
- [ ] Define audit-event and entity-ID conventions — Stable IDs and traceable changes. `ID: design.audit`

## 3. Workspace & tenant foundations

_Business/store setup and scoped local data_

- [x] Persist businesses and stores in IndexedDB — Workspace storage and create/select flows are implemented and exercised. `ID: workspace.storage`
- [x] Persist selected business and store across refresh — Browser verification confirmed selection persists after refresh. `ID: workspace.selection`
- [ ] Use active workspace identity in module data access — **Status: In progress.** Product Master and Inventory use the selected workspace identity; Purchases is scoped by business and store. `ID: workspace.identity`
- [ ] Replace development identity with real authentication and authorization — Current workspace is explicitly local-development-only, not login or access control. `ID: workspace.auth`

## 4. Product master

_Product setup, pricing, units, barcodes and sale eligibility_

- [x] Define product data model and validation — Include product type, inventory mode and direct-sale eligibility. `ID: products.model`
- [x] Build responsive Product Master create/list screen — Product name, SKU, barcode, price, type, inventory mode, unit and availability controls. `ID: products.screen`
- [ ] Add temporary in-session create, search and active/inactive toggle — Clearly label this as temporary; do not imply durable persistence. `ID: products.session-state`
- [ ] Create, view, edit and deactivate products with reliable persistence — **Status: In progress.** Product Master is workspace-scoped and a product is selectable in Purchases; full CRUD/migration edge-case coverage remains to verify. `ID: products.crud`
- [ ] Support price, tax, unit and discount rules — **Status: In progress.** Pricing engine tests/build/lint previously passed; UI integration and end-to-end manual verification remain open. `ID: products.pricing`
- [ ] Support barcode/SKU search and lookup — Handle missing or duplicate identifiers. `ID: products.barcode`
- [x] Implement Finished Good, Ingredient/Raw Material, Intermediate, Assembled — Match the agreed product type choices. `ID: products.types`
- [x] Implement Stocked, Made to Order, Batch Produced, Non-Stocked — Apply consistent inventory behavior per mode. `ID: products.inventory-mode`
- [x] Implement Available for direct sale checkbox — Validate that product setup controls sales eligibility. `ID: products.direct-sale`
- [ ] Add product validation and CRUD tests — **Status: In progress.** Include invalid data, duplicates and edit cases. `ID: products.tests`

## 5. Sales & receipts

_Core cash-sale workflow and customer-facing output_

- [x] Build product lookup, cart, quantity and line removal — Phone-first touch targets and clear totals. `ID: sales.cart`
- [ ] Calculate subtotal, discounts, tax and grand total — **Status: In progress.** Use tested decimal/rounding rules. `ID: sales.pricing`
- [x] Validate sale integrity and stock deduction coverage — 62 tests passed; build and lint passed. Checkout remains disabled. `ID: sales.integrity`
- [ ] Complete a cash sale with durable local transaction ID — Persist before showing local success. `ID: sales.cash`
- [ ] Generate receipt view and print layout — Test common paper widths and browser printing. `ID: sales.receipt`
- [ ] Implement cancellation/void and correction rules — Keep audit trail; don't silently delete completed sales. `ID: sales.void`
- [ ] Show sale history and sale details — Search by date, receipt number and status. `ID: sales.history`
- [ ] Test full sale flow and edge cases — Empty cart, repeated taps, refresh, failed persistence. `ID: sales.tests`

## 6. Inventory & stock movements

_Opening stock, adjustments, consumption and reconciliation_

- [ ] Define stock ledger and inventory-event model — Auditable events rather than silent quantity overwrites. `ID: inventory.model`
- [ ] Record opening stock — Validate quantities and units. `ID: inventory.opening`
- [ ] Record additions, removals and corrections — Require reason and record who/when. `ID: inventory.adjust`
- [x] Test inventory movement rules — Unit tests cover quantity signs, invalid quantities, stock calculations and negative-stock protection. `ID: inventory.movement-rules-tests`
- [x] Test inventory IndexedDB transactions — PASS: 5 transaction tests; full suite 27 passed, 0 failed; build and lint passed. `ID: inventory.storage-tests`
- [ ] Deduct stock for eligible completed sales — Respect product inventory mode and cancellation rules. `ID: inventory.sales`
- [ ] Add configurable low-stock thresholds and view — Do not confuse offline estimate with authoritative stock. `ID: inventory.low-stock`
- [ ] Build stock reconciliation and discrepancy reporting — Flag stale/offline stock and potential overselling. `ID: inventory.reconcile`

## 7. Purchases & suppliers

_Receiving goods and traceable purchase records_

- [x] Persist purchase drafts with business/store scope — Draft storage and scope/status validation tests are implemented; draft save does not change stock. `ID: purchases.storage`
- [x] Create purchase draft from active products — Verified in browser: product dropdown, supplier fields, line totals and draft save. `ID: purchases.draft-ui`
- [x] Show purchase history for selected business/store — Verified in browser: saved draft appears in history with supplier, status and total. `ID: purchases.history-ui`
- [ ] Receive purchase and create stock movements atomically — Not implemented; stock must change only on explicit receiving, with duplicate-retry protection. `ID: purchases.receive`
- [ ] Create supplier records and lookup — Keep supplier data validated. `ID: purchases.suppliers`
- [ ] Record purchase and received quantities — Separate ordered from actually received quantity if needed. `ID: purchases.entry`
- [ ] Update stock through purchase inventory events — Prevent duplicate receiving on retry. `ID: purchases.stock`
- [ ] Purchase history, details and cancellation flow — Retain auditability and correct stock reversals. `ID: purchases.history`

## 8. Customers & business setup

_Business profile, stores, customers and settings_

- [ ] Business profile and receipt identity settings — Support the intended local-first launch. `ID: business.profile`
- [ ] Store/location model and active store selection — Keep data model ready for multiple stores without promising live sync. `ID: business.store`
- [ ] Customer create/search/edit workflow — Keep optional customer flow fast for small shops. `ID: customers.crud`
- [ ] Settings validation and durable persistence — No controls that appear saved when changes are not persisted. `ID: business.settings`

## 9. Reports & operational visibility

_Sales, stock, purchases and exports_

- [ ] Daily/period sales summary — Verify totals against source transactions. `ID: reports.sales`
- [ ] Product performance and sales detail — Define date range and tax/discount treatment. `ID: reports.products`
- [ ] Current stock, low stock and movement history — Show reconciliation warnings clearly. `ID: reports.inventory`
- [ ] Purchase and supplier summaries — Match source purchase records. `ID: reports.purchases`
- [ ] Export reports and validate exported data — Handle date filters, encoding and large result sets. `ID: reports.export`

## 10. Users, roles & security

_Access control, privacy and safe local operations_

- [ ] Implement login/session behavior appropriate to deployment — Do not rely on UI-only access hiding. `ID: security.login`
- [ ] Implement owner/admin/manager/cashier permissions — Enforce permissions in backend/service boundaries where applicable. `ID: security.roles`
- [ ] Enforce business/store data boundaries — Never trust a client-supplied store ID without authorization. `ID: security.store-scope`
- [ ] Review secrets, dependency and input handling — No secrets in frontend bundles or Git. `ID: security.secrets`
- [ ] Audit important actions — User, time, entity, action and reason where appropriate. `ID: security.audit`

## 11. Offline-first storage & recovery

_Local durable sales, queued sync design and data-loss protection_

- [ ] Implement storage abstraction with IndexedDB for browser data — Keep browser persistence behind a repository/service layer. `ID: offline.storage`
- [ ] Persist Product Master records through the storage abstraction — Products survive refresh, navigation and browser restart; test migration and failure handling. `ID: offline.product-persistence`
- [ ] Verify transactions survive refresh and browser restart — Do not report success before durable local save. `ID: offline.durable`
- [ ] Add explicit pending/failed/synchronized states for queued operations — Stable IDs and idempotent retry. `ID: offline.queue`
- [ ] Handle offline/online transitions without losing work — No silent queue deletion or overwrite. `ID: offline.network`
- [ ] Implement and test backup/restore and device-loss recovery — Browser local storage alone is not a backup. `ID: offline.backup`
- [ ] Show stale stock and reconcile after reconnect — Disconnected devices can oversell the same stock. `ID: offline.reconcile`
- [ ] Document what works offline vs online-only — Live payment verification and cloud-dependent actions require connectivity. `ID: offline.scope`

## 12. Testing, quality & release readiness

_Automated tests, usability, reliability and support_

- [ ] Unit tests for calculations, validation and permissions — Prioritize tax, discounts, totals and stock logic. `ID: testing.unit`
- [ ] Integration tests for persistence and service workflows — Include duplicate retries and failed writes. `ID: testing.integration`
- [ ] End-to-end tests for core shop workflows — Product → sale → receipt → stock/report. `ID: testing.e2e`
- [ ] Test phone, tablet and desktop layouts — Real devices and browser print behavior. `ID: testing.devices`
- [ ] Review keyboard, contrast, focus and readable errors — Accessible controls and touch targets. `ID: testing.accessibility`
- [ ] Run security and dependency review — Fix high-severity findings before pilot. `ID: testing.security`
- [ ] Test backup restore, corrupted data and interrupted operations — Document recovery steps. `ID: testing.recovery`
- [ ] Test realistic data volumes and slower devices — Avoid blocking main interactions. `ID: testing.performance`

## 13. Pilot & production launch

_Real-shop validation, deployment, support and release gates_

- [ ] Define pilot scope and acceptance criteria — Choose a small, representative shop workflow. `ID: pilot.scope`
- [ ] Prepare safe test data and migration/import plan — No uncontrolled production data edits. `ID: pilot.data`
- [ ] Prepare setup guide, cashier guide and troubleshooting steps — Keep instructions suitable for non-technical shop owners. `ID: pilot.training`
- [ ] Run pilot and record issues with severity — Do not label unresolved critical issues as launch-ready. `ID: pilot.feedback`
- [ ] Finalize one-time licensing and activation approach — Commercial/legal decisions must be reviewed before sale. `ID: pilot.license`
- [ ] Set up production hosting/domain and secure configuration — Confirm costs, backups and operational ownership. `ID: pilot.deploy`
- [ ] Add crash/error diagnostics and support process — Protect customer and business data in logs. `ID: pilot.monitor`
- [ ] Complete go/no-go review and production checklist — Only after critical workflows and recovery are verified. `ID: pilot.release`

## 14. Later phase — cloud & multi-device sync

_Deferred until the local-first product is stable_

- [ ] Design and secure cloud API/service — Server-side authorization and tenant isolation. `ID: later.api`
- [ ] Implement conflict-aware sync and idempotent reconciliation — Define source of truth for every entity. `ID: later.sync`
- [ ] Enable shared multi-store inventory and reporting — Do not promise cross-device sync until proven. `ID: later.multistore`
- [ ] Evaluate payment-provider integrations — Never treat a client-side payment claim as verified. `ID: later.payments`
- [ ] Evaluate subscription/cloud operating costs if business model changes — Keep scope aligned with one-time licensing decision. `ID: later.billing`

## Verified recent milestones

- Workspace business/store selection persists after browser refresh.
- Product Master uses the active workspace business ID; Purchases now lists `Diagnostic Test` under the selected business after the product was created in that workspace.
- Purchase draft saved and appears in Purchase History; screenshot showed supplier `Scoops` and total ₹500.00. Draft save explicitly did not change inventory.
- Latest test run reported 86 passed, 0 failed; production build passed.
- Sales checkout remains disabled; no real sale/payment is confirmed.
- Purchase receiving and stock update-on-receive remain pending.

## Next recommended work

1. Implement purchase receiving with atomic/idempotent stock movement and tests.
2. Verify inventory balance and movement history after receiving; test duplicate receive attempts.
3. Finish Sales checkout only after transaction persistence, receipt, sale history, void/correction, and stock deduction tests are ready.
4. Complete responsive device testing, backup/restore, authentication/authorization, security review, pilot, and production deployment.
