import { LOCAL_DEVELOPMENT_IDENTITY, type ActiveIdentityContext } from "./types/identity.ts";
const SESSION_KEY = "watchout-pos-auth-session";
/** Client-side local owner context; not a trusted authorization boundary. */
export function getActiveIdentityContext(): ActiveIdentityContext {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw) as { userId?: unknown; role?: unknown };
      if (typeof session.userId === "string" && session.userId && session.role === "owner") {
        return { ...LOCAL_DEVELOPMENT_IDENTITY, userId: session.userId, role: "owner" };
      }
    }
  } catch { /* fall through to development identity */ }
  return { ...LOCAL_DEVELOPMENT_IDENTITY };
}