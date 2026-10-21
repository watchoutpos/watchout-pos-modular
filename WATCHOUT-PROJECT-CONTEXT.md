# WatchOut POS Modular — Project Context

## Working rules
- Work only in D:\WatchOut-POS-Modular; keep the original WatchOut POS untouched.
- Prefer one consolidated guarded PowerShell script per module update.
- Back up affected files, preserve unrelated uncommitted work, and run tests/build/lint.
- Never use destructive Git reset/clean commands.
- Do not commit, push, or deploy without explicit approval.
- Do not import legacy inventory quantities as part of product migration.
- Do not mark work complete without verified results.

## Architecture and decisions
- React, TypeScript, Vite PWA; browser persistence uses IndexedDB.
- Product and inventory business ID: local-demo-business.
- Inventory demo store ID: local-demo-store.
- Balance and movement history are written in one read-write transaction.
- Opening stock can be recorded only once for a product/store balance.
- Reductions and wastage decrease stock; negative stock is rejected.
- Product and inventory modules must preserve existing data and unrelated work.

## Verified prior work
- Inventory UI manually verified for opening stock, increase, reduction, wastage, and negative-stock rejection.
- Movement-rule tests previously passed.
- Prior reported baseline: 22 tests passed, build passed, lint passed.
- Progress trackers: progress-tracker.html and PROGRESS-TRACKER.md.

## Current task
Add isolated IndexedDB transaction tests for initial opening stock, duplicate opening rejection, valid increase, negative-stock rejection, and invalid inputs. The tests use fake-indexeddb, not real browser inventory.

## Status
VERIFIED 2026-10-17: IndexedDB transaction tests passed. Full suite: 27 passed, 0 failed. Production build passed. Lint passed. Five transaction scenarios covered. Tests use fake-indexeddb and do not write to real browser inventory. Both progress trackers were updated after verification. No commit, push, or deployment performed.
## Sales Cart milestone attempt (20261017-150229)
- Implemented product lookup from the existing Product Master IndexedDB.
- Cart supports adding saleable active products, quantity updates, line removal and clearing.
- Subtotal uses integer minor currency units; tax/discount/payment/receipt and stock deduction are not implemented here.
- No sale persistence, sale completion, inventory write, Git commit, push or deployment.
- Automated validation result must be read from the run report before considering this milestone verified.
## Sales Pricing Engine automated milestone (20261017-152419)
- Added src/modules/sales/pricingRules.ts and pricingRules.test.ts.
- Pricing uses integer minor currency units, line-level percentage discounts, per-product GST rate and tax-inclusive setting.
- Mixed currencies and invalid values are rejected.
- Automated test, build and lint commands all passed.
- Sales UI integration, manual pricing verification, bill-level discounts, checkout and durable sale persistence remain open.
- No product or inventory data changed. No commit, push or deployment performed.

## Sales Pricing Engine validation correction (20261017-152734)
- A prior pasted script printed a success message even though its validation loop was interrupted by PowerShell handling npm stderr.
- The result from that earlier run is not treated as proof of passing checks.
- Revalidation report: D:\WatchOut-POS-Modular\artifacts\sales-assessment\sales-pricing-verified-20261017-152734.txt
- Revalidation confirmed test, build and lint all exited successfully.
- Pricing UI integration and manual verification remain open.
## Sales Integrity milestone (20261017-181149)
- Sale storage now validates sale-line and aggregate pricing totals against the pricing engine.
- Sale lines snapshot GST rate, tax-inclusive setting and whether stock is tracked.
- Stock deductions are checked against tracked sale quantities; invalid or incomplete deductions are rejected.
- Automated validation: 62 tests passed, 0 failed. Build and lint passed.
- Report: D:\WatchOut-POS-Modular\artifacts\sales-assessment\sales-integrity-20261017-181149\sales-integrity-result.txt
- Backup: D:\WatchOut-POS-Modular\backups\sales-integrity-20261017-181149
- Checkout remains disabled. No product import, Git operation, or deployment was performed.