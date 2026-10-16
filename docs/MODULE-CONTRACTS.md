# WatchOut POS — Module Contracts

Version: 0.1
Status: Initial proposal

## 1. Rules for every module

Every module must document:
- Purpose and out-of-scope behavior.
- Screens and user workflows.
- Data it owns and data it references.
- API endpoints and request/response contracts.
- Permissions required for each operation.
- Validation, error handling and audit requirements.
- Offline behavior, if applicable.
- Unit, integration and end-to-end acceptance tests.

## 2. Ownership

- Product Master owns product definitions, identifiers and sale configuration.
- Inventory owns stock balances and stock movement history.
- Purchasing owns suppliers, purchase documents and receiving workflows.
- POS owns cart and sale workflow, using shared pricing and tax services.
- Payments owns payment records and cash reconciliation.
- Sales operations owns return/refund workflows and their references to original sales.
- Authentication owns identity and session lifecycle.
- Authorization provides shared permission checks.
- Settings owns explicitly defined business configuration.
- Reporting reads data through documented queries or reporting services.

These boundaries must be reviewed before database schemas are created.

## 3. Shared service rules

Pricing, discount, tax, permission checks, identifiers, audit events,
time handling and error formats must have one agreed implementation.

Do not copy business calculations into individual screens.

## 4. API conventions

- Use versioned, documented endpoints where appropriate.
- Validate all inputs on the server.
- Return consistent success and error structures.
- Apply authentication and authorization to protected operations.
- Use idempotency protection for retry-prone financial operations.
- Avoid exposing database internals to frontend components.

## 5. Database conventions

- Each module declares its tables, relationships and migrations.
- Cross-module changes use explicit service boundaries and transactions.
- Do not modify another module's data by bypassing its rules.
- Financial records and stock movements must remain traceable.
- Migrations must be tested against a disposable database before use.

## 6. Integration checklist

Before integrating a module, verify:
- Contracts match the approved design.
- Shared identifiers and validation rules are consistent.
- Permissions work for allowed and denied users.
- Database transactions preserve data integrity.
- Duplicate requests and failure recovery are tested.
- Existing module tests still pass.
- No secrets or live data are included in source control.
## 7. Offline, synchronization and multi-store contract

### Business and store scope

- Every business-owned record must have an explicit business scope.
- Store-specific records must also have a store scope.
- Backend services must verify the authenticated user's access to both.
- Never trust a business or store ID supplied by the client without
  checking authorization.
- Cross-store stock transfers must record source, destination, quantity,
  status and audit history.
- Tests must verify that unauthorized business and store data cannot be read
  or modified.

### Offline transaction contract

- Offline-created records must receive stable unique identifiers.
- Financial submissions must be idempotent so retries cannot create
  duplicate completed sales or payments.
- Pending changes must be durable across application restarts.
- Each synchronized record must expose a meaningful pending, synchronized
  or failed state.
- Retryable network errors must not silently discard pending records.
- Permanent validation failures must be surfaced for resolution.
- Conflicting price, stock, return or financial changes must follow explicit
  rules rather than implicit last-write-wins behavior.
- Device time alone must not be treated as authoritative ordering for all
  financial or inventory events.

### Required failure tests

- Disconnect during a sale and complete the supported offline workflow.
- Restart the application with pending changes.
- Retry a submission after an ambiguous network failure.
- Deliver the same synchronization request more than once.
- Resolve a conflict involving stock or a changed price.
- Deny access to another business or an unauthorized store.
- Recover from a failed synchronization without losing transaction history.

These contracts describe required behavior. They do not imply that
offline synchronization or multi-store support has been implemented.

## 8. Phased rollout contract

- The initial client must be mobile-friendly and PWA-oriented.
- Offline behavior must be explicitly specified per business operation.
- Offline writes must be durable, uniquely identified and safe to retry.
- Synchronization must handle duplicate delivery and report failures.
- The interface must distinguish saved locally, pending sync and synchronized.
- A local service is a later architecture option, not an initial requirement.
- Any move to a local service requires documented pilot evidence and a
  reviewed migration plan.
- Multi-device offline coordination must not be implied by single-device
  offline support.

## 9. Offline sales and inventory reconciliation

- Product lookup and cart operations must work from locally available data.
- Cash sales must be durably saved before the UI reports local success.
- Receipts must be reproducible from saved sale data.
- Each sale must have a stable unique identifier.
- Synchronization retries must not duplicate sales.
- The UI must distinguish locally saved, pending, failed and synchronized.
- Stale-stock sales must be flagged for reconciliation.
- Inventory synchronization must preserve an auditable record of changes.
- Conflicts must not be resolved by silently overwriting stock or sales.
- Online payment verification remains unavailable when the required online
  service cannot be reached.
- Multi-device coordination during an internet outage is not promised
  in the initial pilot.

## 10. Data ownership and synchronization contract

- Every sale has a stable unique ID before any synchronization attempt.
- Local success means durably saved on the device, not remotely synchronized.
- Retries must be idempotent and must not create duplicate sales.
- Shared records are governed by the configured synchronization authority.
- Local stock counts must never silently replace shared inventory state.
- Inventory events and reconciliation decisions must be auditable.
- Conflicts must preserve the original sale and expose an actionable status.
- Product-master edits are online-only during the initial pilot.
- Cloud backup and cross-device synchronization are unavailable unless
  the relevant service is configured and working.
- Business and store authorization must be enforced by the server.
- Backup, restoration and device-loss recovery must be tested before release.
