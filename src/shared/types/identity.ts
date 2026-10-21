import type { UserRole } from "../../shared/types/domain";
export interface ActiveIdentityContext { businessId: string; storeId: string; userId: string; role: UserRole; }
/** Development fallback only; never treat this as authenticated identity. */
export const LOCAL_DEVELOPMENT_IDENTITY: ActiveIdentityContext = {
  businessId: "local-demo-business", storeId: "local-demo-store",
  userId: "local-demo-preview-user", role: "owner",
};