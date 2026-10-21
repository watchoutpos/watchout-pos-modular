import test from "node:test";
import assert from "node:assert/strict";
const { filterSalesHistory } = await import("./salesHistoryRules" + ".ts");
import type { Sale } from "../../shared/types/domain";

function money(amountMinor: number, currency = "INR") {
  return { amountMinor, currency };
}

function sale(id: string, createdAt: string, status: Sale["status"] = "completed"): Sale {
  return {
    id, businessId: "business-1", storeId: "store-1", createdByUserId: "user-1",
    status, lines: [], subtotal: money(1000), discountTotal: money(0), taxTotal: money(0), grandTotal: money(1000),
    syncStatus: "local-only", createdAt, updatedAt: createdAt,
  };
}

const data = [
  sale("sale-old", "2026-10-18T10:00:00.000Z"),
  sale("receipt-new", "2026-10-20T10:00:00.000Z", "completed"),
  sale("sale-void", "2026-10-19T10:00:00.000Z", "cancelled"),
];

test("history sorts newest first without mutating source array", () => {
  const result = filterSalesHistory(data, {});
  assert.deepEqual(result.map((item) => item.id), ["receipt-new", "sale-void", "sale-old"]);
  assert.equal(data[0].id, "sale-old");
});

test("history searches sale ID case-insensitively", () => {
  assert.deepEqual(filterSalesHistory(data, { query: "RECEIPT" }).map((item) => item.id), ["receipt-new"]);
});

test("history filters by status", () => {
  assert.deepEqual(filterSalesHistory(data, { status: "cancelled" }).map((item) => item.id), ["sale-void"]);
});

test("history includes dates on both selected calendar days", () => {
  const result = filterSalesHistory(data, { fromDate: "2026-10-19", toDate: "2026-10-20" });
  assert.deepEqual(result.map((item) => item.id), ["receipt-new", "sale-void"]);
});

test("history can combine search, status and date filters", () => {
  assert.deepEqual(filterSalesHistory(data, {
    query: "sale", status: "completed", fromDate: "2026-10-18", toDate: "2026-10-19",
  }).map((item) => item.id), ["sale-old"]);
});

