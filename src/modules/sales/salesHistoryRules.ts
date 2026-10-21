import type { Sale, SaleStatus } from "../../shared/types/domain";

export type SalesHistoryFilters = {
  query?: string;
  status?: "all" | SaleStatus;
  fromDate?: string;
  toDate?: string;
};

export function filterSalesHistory(sales: Sale[], filters: SalesHistoryFilters): Sale[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const status = filters.status ?? "all";
  const from = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const to = filters.toDate ? new Date(`${filters.toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

  return sales
    .filter((sale) => {
      if (query && !sale.id.toLowerCase().includes(query)) return false;
      if (status !== "all" && sale.status !== status) return false;
      const created = new Date(sale.createdAt).getTime();
      if (!Number.isFinite(created) || created < from || created > to) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
