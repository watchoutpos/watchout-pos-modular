# WatchOut POS Modular — Progress Tracker

> Update this file as work is verified. The browser dashboard stores local status separately; use this export to bring your updates back into Git.

**Overall:** 9% completed based on checklist statuses at export time.

## 1. Project foundation & architecture

_Repository, architecture decisions, developer workflow_

- [x] Architecture baseline documented — Architecture, module contracts, and development rules exist. `ID: foundation.docs`
- [x] Git repository and remote baseline established — Initial documentation baseline pushed to the project repository. `ID: foundation.git`
- [x] React + Vite + TypeScript scaffold installed — Dependencies installed in the new modular project. `ID: foundation.scaffold`
- [x] Local-data and secret ignore rules reviewed — Protect environment files, databases, build output, and local backups. `ID: foundation.ignore`
- [x] Build and lint checks pass — Latest shell changes passed both checks. `ID: foundation.quality`
- [x] Responsive application shell created — Navigation and placeholder module screens exist; no POS business logic yet. `ID: foundation.shell`
- [x] Review desktop and phone layout in browser — Still needs visual review and navigation/responsive checks. `ID: foundation.visual`
- [ ] Continuous integration checks configured and verified — Build/lint/test checks should run automatically on pull requests. `ID: foundation.ci`

## 2. Product design & shared foundations

_Reusable UI, data contracts, errors, validation_

- [ ] Finalize design tokens and responsive layout — Consistent typography, spacing, controls, mobile navigation. `ID: design.tokens`
- [ ] Build reusable form, table, dialog, search and empty-state components — Avoid duplicate one-off UI patterns. `ID: design.components`
- [ ] Define shared validation and error-handling conventions — Readable errors; no silent failures. `ID: design.validation`
- [ ] Define audit-event and entity-ID conventions — Stable IDs and traceable changes. `ID: design.audit`

## 3. Product master

_Product setup, pricing, units, barcodes and sale eligibility_

- [ ] Define product data model and validation — Include product type, inventory mode and direct-sale eligibility. `ID: products.model`
- [ ] Create, view, edit and deactivate products — Persist products reliably; prevent accidental data loss. `ID: products.crud`
- [ ] Support price, tax, unit and discount rules — Document rounding and tax behavior. `ID: products.pricing`
- [ ] Support barcode/SKU search and lookup — Handle missing or duplicate identifiers. `ID: products.barcode`
- [ ] Implement Finished Good, Ingredient/Raw Material, Intermediate, Assembled — Match the agreed product type choices. `ID: products.types`
- [ ] Implement Stocked, Made to Order, Batch Produced, Non-Stocked — Apply consistent inventory behavior per mode. `ID: products.inventory-mode`
- [ ] Implement Available for direct sale checkbox — Validate that product setup controls sales eligibility. `ID: products.direct-sale`
- [ ] Add product validation and CRUD tests — Include invalid data, duplicates and edit cases. `ID: products.tests`

## 4. Sales & receipts

_Core cash-sale workflow and customer-facing output_

- [ ] Build product lookup, cart, quantity and line removal — Phone-first touch targets and clear totals. `ID: sales.cart`
- [ ] Calculate subtotal, discounts, tax and grand total — Use tested decimal/rounding rules. `ID: sales.pricing`
- [ ] Complete a cash sale with durable local transaction ID — Persist before showing local success. `ID: sales.cash`
- [ ] Generate receipt view and print layout — Test common paper widths and browser printing. `ID: sales.receipt`
- [ ] Implement cancellation/void and correction rules — Keep audit trail; don't silently delete completed sales. `ID: sales.void`
- [ ] Show sale history and sale details — Search by date, receipt number and status. `ID: sales.history`
- [ ] Test full sale flow and edge cases — Empty cart, repeated taps, refresh, failed persistence. `ID: sales.tests`

## 5. Inventory & stock movements

_Opening stock, adjustments, consumption and reconciliation_

- [ ] Define stock ledger and inventory-event model — Auditable events rather than silent quantity overwrites. `ID: inventory.model`
- [ ] Record opening stock — Validate quantities and units. `ID: inventory.opening`
- [ ] Record additions, removals and corrections — Require reason and record who/when. `ID: inventory.adjust`
- [ ] Deduct stock for eligible completed sales — Respect product inventory mode and cancellation rules. `ID: inventory.sales`
- [ ] Add configurable low-stock thresholds and view — Do not confuse offline estimate with authoritative stock. `ID: inventory.low-stock`
- [ ] Build stock reconciliation and discrepancy reporting — Flag stale/offline stock and potential overselling. `ID: inventory.reconcile`

## 6. Purchases & suppliers

_Receiving goods and traceable purchase records_

- [ ] Create supplier records and lookup — Keep supplier data validated. `ID: purchases.suppliers`
- [ ] Record purchase and received quantities — Separate ordered from actually received quantity if needed. `ID: purchases.entry`
- [ ] Update stock through purchase inventory events — Prevent duplicate receiving on retry. `ID: purchases.stock`
- [ ] Purchase history, details and cancellation flow — Retain auditability and correct stock reversals. `ID: purchases.history`

## 7. Customers & business setup

_Business profile, stores, customers and settings_

- [ ] Business profile and receipt identity settings — Support the intended local-first launch. `ID: business.profile`
- [ ] Store/location model and active store selection — Keep data model ready for multiple stores without promising live sync. `ID: business.store`
- [ ] Customer create/search/edit workflow — Keep optional customer flow fast for small shops. `ID: customers.crud`
- [ ] Settings validation and durable persistence — No controls that appear saved when changes are not persisted. `ID: business.settings`

## 8. Reports & operational visibility

_Sales, stock, purchases and exports_

- [ ] Daily/period sales summary — Verify totals against source transactions. `ID: reports.sales`
- [ ] Product performance and sales detail — Define date range and tax/discount treatment. `ID: reports.products`
- [ ] Current stock, low stock and movement history — Show reconciliation warnings clearly. `ID: reports.inventory`
- [ ] Purchase and supplier summaries — Match source purchase records. `ID: reports.purchases`
- [ ] Export reports and validate exported data — Handle date filters, encoding and large result sets. `ID: reports.export`

## 9. Users, roles & security

_Access control, privacy and safe local operations_

- [ ] Implement login/session behavior appropriate to deployment — Do not rely on UI-only access hiding. `ID: security.login`
- [ ] Implement owner/admin/manager/cashier permissions — Enforce permissions in backend/service boundaries where applicable. `ID: security.roles`
- [ ] Enforce business/store data boundaries — Never trust a client-supplied store ID without authorization. `ID: security.store-scope`
- [ ] Review secrets, dependency and input handling — No secrets in frontend bundles or Git. `ID: security.secrets`
- [ ] Audit important actions — User, time, entity, action and reason where appropriate. `ID: security.audit`

## 10. Offline-first storage & recovery

_Local durable sales, queued sync design and data-loss protection_

- [ ] Implement storage abstraction with IndexedDB for browser data — Keep browser persistence behind a repository/service layer. `ID: offline.storage`
- [ ] Verify transactions survive refresh and browser restart — Do not report success before durable local save. `ID: offline.durable`
- [ ] Add explicit pending/failed/synchronized states for queued operations — Stable IDs and idempotent retry. `ID: offline.queue`
- [ ] Handle offline/online transitions without losing work — No silent queue deletion or overwrite. `ID: offline.network`
- [ ] Implement and test backup/restore and device-loss recovery — Browser local storage alone is not a backup. `ID: offline.backup`
- [ ] Show stale stock and reconcile after reconnect — Disconnected devices can oversell the same stock. `ID: offline.reconcile`
- [ ] Document what works offline vs online-only — Live payment verification and cloud-dependent actions require connectivity. `ID: offline.scope`

## 11. Testing, quality & release readiness

_Automated tests, usability, reliability and support_

- [ ] Unit tests for calculations, validation and permissions — Prioritize tax, discounts, totals and stock logic. `ID: testing.unit`
- [ ] Integration tests for persistence and service workflows — Include duplicate retries and failed writes. `ID: testing.integration`
- [ ] End-to-end tests for core shop workflows — Product → sale → receipt → stock/report. `ID: testing.e2e`
- [ ] Test phone, tablet and desktop layouts — Real devices and browser print behavior. `ID: testing.devices`
- [ ] Review keyboard, contrast, focus and readable errors — Accessible controls and touch targets. `ID: testing.accessibility`
- [ ] Run security and dependency review — Fix high-severity findings before pilot. `ID: testing.security`
- [ ] Test backup restore, corrupted data and interrupted operations — Document recovery steps. `ID: testing.recovery`
- [ ] Test realistic data volumes and slower devices — Avoid blocking main interactions. `ID: testing.performance`

## 12. Pilot & production launch

_Real-shop validation, deployment, support and release gates_

- [ ] Define pilot scope and acceptance criteria — Choose a small, representative shop workflow. `ID: pilot.scope`
- [ ] Prepare safe test data and migration/import plan — No uncontrolled production data edits. `ID: pilot.data`
- [ ] Prepare setup guide, cashier guide and troubleshooting steps — Keep instructions suitable for non-technical shop owners. `ID: pilot.training`
- [ ] Run pilot and record issues with severity — Do not label unresolved critical issues as launch-ready. `ID: pilot.feedback`
- [ ] Finalize one-time licensing and activation approach — Commercial/legal decisions must be reviewed before sale. `ID: pilot.license`
- [ ] Set up production hosting/domain and secure configuration — Confirm costs, backups and operational ownership. `ID: pilot.deploy`
- [ ] Add crash/error diagnostics and support process — Protect customer and business data in logs. `ID: pilot.monitor`
- [ ] Complete go/no-go review and production checklist — Only after critical workflows and recovery are verified. `ID: pilot.release`

## 13. Later phase — cloud & multi-device sync

_Deferred until the local-first product is stable_

- [ ] Design and secure cloud API/service — Server-side authorization and tenant isolation. `ID: later.api`
- [ ] Implement conflict-aware sync and idempotent reconciliation — Define source of truth for every entity. `ID: later.sync`
- [ ] Enable shared multi-store inventory and reporting — Do not promise cross-device sync until proven. `ID: later.multistore`
- [ ] Evaluate payment-provider integrations — Never treat a client-side payment claim as verified. `ID: later.payments`
- [ ] Evaluate subscription/cloud operating costs if business model changes — Keep scope aligned with one-time licensing decision. `ID: later.billing`

## Status key

- `[x]` Completed and verified
- `[ ]` Pending
- Use `**Status: In progress.**` or `**Status: BLOCKED.**` to distinguish work not yet complete.
