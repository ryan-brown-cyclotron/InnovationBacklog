import React, { useMemo } from "react";
import { LogicProvider, useCurrentUser, useEnvironmentDesignation } from "@innovation-backlog/logic";
import type { CurrentUser } from "@innovation-backlog/logic";
import { MomentumContextProvider } from "@momentum/sdk";
import type { AppUser } from "@momentum/sdk";
import { App as InnovationBacklogApp, LoadingScreen } from "@momentum/ui";
import { createCodeAppProvider } from "./provider/index.js";
import { createCallToolService } from "./provider/callTool.js";
import { ErrorToastBridge } from "./ErrorToastBridge.js";

/**
 * The code app mounts the SAME `<App/>` the web app mounts.
 *
 * Not a lookalike — the identical component tree from `@momentum/ui`, down to the
 * stylesheet. The two hosts cannot drift apart because there is one UI and two ways
 * of feeding it: `apps/web` supplies a fetch-backed service, this supplies one
 * backed by Dataverse and Azure DevOps. `createCallToolService` is the whole
 * difference.
 */

// Module scope: the Power Apps SDK caches one global data-sources context from the
// first getClient() call, so acquisition happens exactly once per app load.
const provider = createCodeAppProvider();

export function App(): React.ReactElement {
  return (
    <LogicProvider provider={provider}>
      <ErrorToastBridge />
      <EnvironmentBanner />
      <AuthenticatedApp />
    </LogicProvider>
  );
}

/**
 * Resolve the signed-in user BEFORE mounting the shared UI.
 *
 * Two reasons this cannot be done inline. `MomentumContextProvider` seeds its state
 * with `useState(initialUser ?? null)`, so a user supplied after mount is ignored.
 * And `<App/>` renders a sign-in screen whenever the user is null, pointing at
 * `/api/auth/login` — a route that exists on Momentum.Service and not in the Power
 * Apps host, which answers it with `RouteNotFound`. There is nothing to sign in to
 * here: Entra already authenticated the user before the app loaded.
 */
function AuthenticatedApp(): React.ReactElement {
  const { data: user, loading, error } = useCurrentUser();
  const service = useMemo(() => createCallToolService(provider), []);

  if (loading) return <LoadingScreen />;

  if (error || !user) {
    // Deliberately not falling through to <App/>: its signed-out branch offers a
    // sign-in link that cannot work in this host, which reads as a broken app
    // rather than a configuration problem.
    return (
      <Notice>
        <strong>Could not resolve your account</strong>
        <p style={{ margin: "8px 0 0", color: "#605e5c" }}>
          {error?.userMessage ??
            "You are signed in to Power Apps, but no matching Dataverse user was found."}
        </p>
      </Notice>
    );
  }

  return (
    <MomentumContextProvider service={service} initialUser={toAppUser(user)}>
      <InnovationBacklogApp />
    </MomentumContextProvider>
  );
}

/**
 * The shared UI's user shape.
 *
 * `role` is not on `AppUser`, but the shared App reads it as an optional extra
 * property — `(user as AppUser & { role?: string }).role` — and gates every
 * approver surface on it. Dropping it here is what kept Approvals hidden no matter
 * what the resolver returned. It is compared lowercase there, hence the fold.
 */
function toAppUser(user: CurrentUser): AppUser & { role: string } {
  return {
    id: user.id,
    sub: user.sub,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    role: user.role.toLowerCase(),
  };
}

function Notice({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main
      style={{
        display: "grid",
        placeContent: "center",
        minHeight: "60vh",
        padding: 24,
        textAlign: "center",
        font: "15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div>{children}</div>
    </main>
  );
}

/**
 * Blank in production, so the banner disappears without a build flag — the whole
 * reason the designation is a runtime environment variable rather than a build one.
 */
function EnvironmentBanner(): React.ReactElement | null {
  const designation = useEnvironmentDesignation();
  if (!designation) return null;

  return (
    <div
      style={{
        background: "#8a6d1f",
        color: "#fff",
        padding: "4px 16px",
        font: "13px/1.4 system-ui, sans-serif",
      }}
    >
      {designation}
    </div>
  );
}
