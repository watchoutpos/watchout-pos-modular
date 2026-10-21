import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createFirstOwner, getAuthSession, hasOwnerCredential, signInOwner, signOutOwner, type AuthSession } from "./localAuthStorage";
import "./LocalAuthGate.css";
type Props = { children: ReactNode };
export function LocalAuthGate({ children }: Props) {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession());
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const authFlowStarted = useRef(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void hasOwnerCredential().then((exists) => {
      // A slow initial IndexedDB read must not overwrite state after the user
      // has already started creating an account or signing in.
      if (alive && !authFlowStarted.current) setSetupRequired(!exists);
    }).catch((cause: unknown) => {
      if (alive && !authFlowStarted.current) {
        setError(cause instanceof Error ? cause.message : "Could not check local owner setup.");
        setSetupRequired(false);
      }
    });
    return () => { alive = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); authFlowStarted.current = true; setError(null); setBusy(true);
    try {
      const next = setupRequired
        ? await createFirstOwner({ username, password, confirmPassword })
        : await signInOwner(username, password);
      setSetupRequired(false); setSession(next); setPassword(""); setConfirmPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
      try { setSetupRequired(!(await hasOwnerCredential())); } catch { /* keep original error */ }
    } finally { setBusy(false); }
  }
  if (!import.meta.env.DEV) return <main className="local-auth-shell"><section className="local-auth-card"><h1>Production authentication not configured</h1><p>Local browser authentication is for development only. Configure server-backed authentication before live use.</p></section></main>;
  if (setupRequired === null) return <main className="local-auth-shell"><section className="local-auth-card" aria-live="polite"><h1>WATCHOUT POS</h1><p>Checking local owner setup…</p></section></main>;
  if (session) return <><>{children}</><div className="local-auth-toolbar"><span>Signed in as <strong>{session.username}</strong> - Owner</span><button type="button" onClick={() => { signOutOwner(); setSession(null); setPassword(""); setError(null); }}>Sign out</button></div></>;
  return <main className="local-auth-shell"><section className="local-auth-card">
    <img src="/assets/watchout-pos-wide.png" alt="WATCHOUT POS" className="local-auth-logo" />
    <p className="local-auth-eyebrow">LOCAL DEVELOPMENT SETUP</p>
    <h1>{setupRequired ? "Create your owner account" : "Sign in to WATCHOUT POS"}</h1>
    <p>{setupRequired ? "Create the first owner login for this browser. Existing business and staff records will be left unchanged." : "Enter the owner username and password configured on this browser."}</p>
    <form onSubmit={submit}>
      <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={64} required /></label>
      <label>Password<input type="password" autoComplete={setupRequired ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={setupRequired ? 12 : undefined} maxLength={256} required /></label>
      {setupRequired && <label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} maxLength={256} required /></label>}
      {error && <p className="local-auth-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : setupRequired ? "Create owner account" : "Sign in"}</button>
    </form><small>Local prototype only. Do not use this as production security.</small>
  </section></main>;
}