import type { UserRole } from "../../shared/types/domain.ts";

/**
 * Defines the initial cancellation policy for a completed sale.
 *
 * This is a policy decision only. It does not authenticate a user,
 * establish their role, or enforce authorization at a trusted boundary.
 */
export function canCancelCompletedSale(
  role: UserRole | null | undefined,
): boolean {
  switch (role) {
    case "owner":
    case "admin":
      return true;

    case "manager":
    case "cashier":
    default:
      return false;
  }
}