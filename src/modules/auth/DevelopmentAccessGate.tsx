type DevelopmentAccessGateProps = {
  children: React.ReactNode;
};

/**
 * Development-only access gate.
 * This is NOT authentication or production authorization.
 */
export function DevelopmentAccessGate({
  children,
}: DevelopmentAccessGateProps) {
  if (!import.meta.env.DEV) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>Authentication not configured</h1>
        <p>
          This development build has no production authentication.
          Configure and test an authentication strategy before live use.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
