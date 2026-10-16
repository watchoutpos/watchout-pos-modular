# WatchOut POS — Architecture Baseline

Version: 0.1
Status: Initial proposal — review before implementation

## 1. Product goal

Build a modular, responsive POS for small shops and roadside vendors.
The application must support phones, tablets and desktops, with a path
to offline operation, cloud deployment and multi-store support.

## 2. Architecture principles

- Build one application as a modular monolith, not separate applications
  for each business module.
- Keep UI, business rules, API and database access separate.
- Define shared contracts before implementing dependent modules.
- Avoid duplicated calculations for price, discount, tax and stock.
- Prefer simple, affordable infrastructure for the first pilot.
- Test persistence, permissions, failures and integration—not just screens.
- Never claim a requirement is complete until it has been tested.

## 3. Proposed technology baseline

- Frontend: React and Vite.
- Language: JavaScript initially; evaluate TypeScript before scaffolding.
- UI: shared design tokens and reusable accessible components.
- Installability: Progressive Web App (PWA).
- Backend: Node.js API.
- Browser-local persistence for the initial PWA: IndexedDB, accessed only
  through a storage abstraction; validate browser support and persistence limits.
- Backend database: SQLite remains a candidate behind a repository/data-access
  layer for a single-server pilot, subject to deployment and concurrency review.
- A future local service may use SQLite if pilot evidence justifies it; the
  browser must never access a server-side SQLite file directly.
- Cloud synchronization, shared records and backup require a configured
  backend service and explicit authorization, idempotency and recovery rules.
- Testing: unit, API/integration and browser end-to-end tests.
- Version control: Git, with small changes and reviewed commits.

These are proposed choices, not installed or implemented components.
Confirm versions and dependencies before installation.

## 4. Logical layers

1. Application shell: routing, navigation, session and layout.
2. Feature modules: products, inventory, purchasing, POS and reporting.
3. Shared domain services: pricing, tax, permissions, audit and validation.
4. API layer: request validation, authentication and consistent errors.
5. Data-access layer: repositories and controlled schema migrations.
6. Deployment layer: local runtime initially; cloud deployment later.

Feature modules must not directly manipulate another module's tables.
Use documented services or API contracts instead.

## 5. Module boundaries

- Business Setup
- Authentication and Authorization
- Product Master
- Inventory and Replenishment
- Suppliers and Purchasing
- POS and Billing
- Payments and Cash Management
- Customers and Loyalty
- Sales History, Returns and Refunds
- Expenses
- Reports and Dashboard
- Settings, Tax and Invoice Configuration
- Notifications
- Offline and Synchronization
- Integrations and Device Support
- Administration, Backup and Maintenance

The list is a target scope, not a statement that these modules exist.

## 6. Data and transaction rules

- Use stable identifiers and explicit relationships.
- Store money using integer minor units where practical, with currency
  and rounding rules defined centrally.
- Use database transactions for related stock, sale and payment updates.
- Record completed sales and financial adjustments with an audit trail.
- Do not silently delete completed financial transactions.
- Define stock movements as traceable records.
- Use explicit schema migrations and tested backup/restore procedures.
- Never store passwords in plain text or commit secrets and live customer data.

## 7. Offline and cloud strategy

Offline support is an architecture requirement, not an automatic PWA feature.

Before implementation, decide which data is stored on the device,
how users authenticate offline, which actions are allowed offline,
how queued changes are retried, and how conflicting updates are resolved.

A browser-based offline store may require IndexedDB and a synchronization
outbox. SQLite on a server does not by itself provide browser offline support.

Do not promise seamless multi-device synchronization until it is implemented
and tested. Keep the first deployment simple and introduce cloud infrastructure
when the deployment model and business needs are confirmed.

## 8. Security baseline

- Enforce authorization on the backend, not only by hiding UI controls.
- Validate inputs at API and business-service boundaries.
- Use secure session handling and protect sensitive settings.
- Record security-relevant and financial actions in an audit log.
- Restrict access to backups and database files.
- Use HTTPS for network deployments.
- Define recovery, update and incident procedures before production.

## 9. Responsive and device support

Design for narrow phone screens first, then tablet and desktop.
Use accessible controls and avoid fixed-width layouts where possible.

Printing, barcode scanners, cash drawers and camera-based scanning require
device-specific validation. A responsive screen alone does not prove
peripheral compatibility.

## 10. Definition of done

A module is complete only when:
- Requirements and acceptance criteria are mapped.
- Validation and permissions are enforced.
- Data persists after reload and restart.
- Failure and duplicate-submission cases are handled.
- Unit and integration tests pass.
- Relevant end-to-end and regression tests pass.
- Documentation and known limitations are recorded.
## 11. Confirmed deployment and offline decisions

Status: Approved architecture direction; implementation pending.

### Deployment model

- Support local operation with optional cloud services.
- Keep the first release affordable and avoid mandatory cloud dependencies
  for essential local POS operations.
- Define the supported local installation and recovery model before coding.
- Cloud backup, synchronization and multi-device access must use documented
  interfaces and explicit security controls.
- Do not assume that a browser PWA can run without a local application
  service or that server-side SQLite is accessible directly from a browser.

### Essential offline POS operations

The target is to support essential operations without internet access,
then synchronize eligible changes when connectivity returns.

The detailed offline capability matrix must specify which operations are
permitted, including product lookup, cart management, sale completion,
payment recording and receipt generation.

- Store required offline data locally using a suitable browser or local
  storage technology.
- Assign each offline-created transaction a stable unique identifier.
- Persist pending changes in a durable synchronization outbox.
- Make synchronization retries safe against duplicate processing.
- Track synchronization state and expose actionable failures.
- Define conflict rules for stock, price changes, returns and concurrent edits.
- Do not silently overwrite conflicting financial or inventory records.
- Define offline authentication, device authorization and session expiry.
- Protect local data and define backup, recovery and device-loss procedures.

Offline behavior is not considered implemented until disconnection,
restart, retry, duplicate delivery and conflict scenarios have been tested.

### Multi-business and multi-store model

- Support multiple businesses, with one or more stores per business.
- Scope business data to a business identifier.
- Scope store-specific transactions and stock to the appropriate store.
- Enforce business and store access permissions on the backend.
- Define how users are assigned to businesses and stores.
- Define product catalogs, prices, taxes and settings that are global to
  a business versus specific to a store.
- Track stock movements between stores as explicit, auditable operations.
- Prevent one business from accessing another business's data.
- Include business and store scope in API authorization and relevant records.
- Test cross-business isolation and cross-store permission boundaries.

### Synchronization and data ownership

- Define a canonical record owner for every synchronized entity.
- Distinguish globally unique transaction IDs from business and store IDs.
- Define versioning, retry, idempotency and conflict-resolution policies.
- Treat completed sales and financial records as auditable transactions.
- Never assume that offline stock balances are globally current.
- Define how rejected changes are reviewed and resolved.
- Do not claim multi-device consistency until the chosen synchronization
  mechanism has passed integration and failure-recovery tests.

### Implementation constraint

The above is the approved direction for architecture design. Specific
storage technology, synchronization protocol, hosting configuration and
conflict-resolution rules must be designed and tested before implementation.

## 12. Confirmed phased operating model

**Decision:** Hybrid, phased rollout.

### Phase 1 — Mobile-friendly PWA
- Prioritize phones and responsive browser-based operation.
- Support installable PWA behavior where supported.
- Define and test offline operations before implementation.
- Persist essential offline transactions safely on the device.
- Track pending synchronization and retry safely when connectivity returns.
- Make no assumption that offline devices can synchronize with each other.

### Phase 2 — Pilot validation
- Test real shop workflows, network interruptions, device restarts and recovery.
- Measure offline reliability, data integrity and usability.
- Validate device and browser storage limitations.

### Phase 3 — Local service, only when justified
Consider a local service if pilot evidence shows that reliable multi-device
operation, peripherals, or local-network communication requires it.
Document the business need and evaluate installation, security, backup,
updates and support before approving this phase.

### Architecture guardrail
Do not build the local service pre-emptively. Do not promise seamless
multi-device synchronization during an internet outage without a tested
local coordination design.

No application dependencies or runtime code are authorized by this decision.

## 13. Initial offline pilot and stock reconciliation

### Included in the initial pilot
- Search locally available products and manage the cart offline.
- Complete cash sales and persist them locally.
- Generate receipts for locally saved sales.
- Queue eligible transactions for synchronization when connectivity returns.
- Display synchronization state and actionable failure information.

### Initially online-only
- Live online payment verification.
- Cloud-dependent administration.

### Deferred
- Guaranteed coordination between multiple devices while disconnected.
- A local coordination service, unless pilot evidence justifies it.

### Inventory rule
A device may have stale stock information while offline. The POS may
allow a sale against its last known stock, but must flag the transaction
for reconciliation. Synchronization must not silently overwrite stock
changes or discard a sale.

This rule accepts a temporary overselling risk when devices operate
independently while disconnected. The user interface must make pending
reconciliation visible. Inventory adjustments must be auditable.

### Transaction safety
- Assign each sale a stable unique identifier before synchronization.
- Persist the sale and its synchronization state reliably.
- Make retries idempotent so the same sale is not recorded twice.
- Preserve failed transactions for investigation and retry.
- Define explicit conflict handling before implementation.
- Do not treat a queued sale as successfully synchronized.

## 14. Data authority and synchronization

### Authority by deployment
- A single offline device is authoritative for its locally saved transactions
  until those transactions are accepted by the configured synchronization
  authority.
- When cloud synchronization is enabled, the cloud server is authoritative
  for shared product and inventory records.
- If a future local service is deployed, its responsibilities for local
  coordination and shared records must be explicitly defined.
- Without a configured synchronization service, do not promise cloud backup,
  shared live inventory, or cross-device synchronization.

### Offline sale lifecycle
1. Assign a stable unique sale ID.
2. Persist the sale locally before confirming local success.
3. Mark it as pending synchronization.
4. Submit it when the configured authority is reachable.
5. Deduplicate retries using the stable sale ID and server-side idempotency.
6. Record acceptance or a reconciliation exception.
7. Preserve the original sale and its audit history.

### Inventory authority
- Represent stock changes as auditable inventory events.
- Treat offline stock availability as a local estimate that may be stale.
- Do not overwrite shared stock with a device's local stock count.
- Reconcile conflicting events explicitly while preserving the underlying sales.
- Define correction, return and adjustment rules before implementing inventory.
- A synchronized sale does not by itself guarantee that every inventory
  conflict has been resolved.

### Product data
- The device may use a locally cached product snapshot while offline.
- Initial pilot changes to shared product master data require connectivity.
- Offline product-master editing is deferred until conflict and authorization
  rules have been designed.

### Recovery and security
- Browser-local persistence is not a backup.
- Define backup, restore and device-loss procedures before production release.
- Enforce business and store access at the server boundary.
- Never rely on client-side visibility controls as authorization.
