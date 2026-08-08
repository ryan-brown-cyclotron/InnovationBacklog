import { useEffect, useState } from "react";
import { useProvider } from "../components/LogicProvider.js";
import type { CurrentUser } from "../domain/identity.js";
import type { Role } from "../domain/enums.js";
import { canChangeVisibility, canReview } from "../domain/enums.js";
import type { AsyncResource } from "./useAsyncResource.js";
import { useAsyncResource } from "./useAsyncResource.js";

export function useCurrentUser(): AsyncResource<CurrentUser | null> {
  const provider = useProvider();
  return useAsyncResource("current-user", () => provider.identity.getCurrentUser());
}

export interface Permissions {
  role: Role | null;
  canReview: boolean;
  canChangeVisibility: boolean;
}

/**
 * Presentational permissions only.
 *
 * These decide what to render, never what is allowed. Every one of them is
 * re-evaluated by the backend on the write path, and a provider that trusts this is
 * broken. Frontend authorization is not authorization.
 */
export function usePermissions(): Permissions {
  const { data } = useCurrentUser();
  const role = data?.role ?? null;
  return {
    role,
    canReview: role ? canReview(role) : false,
    canChangeVisibility: role ? canChangeVisibility(role) : false,
  };
}

/**
 * The non-production banner label, or null.
 *
 * Never throws and never surfaces an error: a value that cannot be read is
 * indistinguishable from one deliberately left blank, and both mean "hide the
 * banner". That is how the banner disappears in production without a build flag.
 */
export function useEnvironmentDesignation(): string | null {
  const provider = useProvider();
  const [designation, setDesignation] = useState<string | null>(null);

  useEffect(() => {
    const environment = provider.environment;
    if (!environment) {
      setDesignation(null);
      return;
    }

    let cancelled = false;
    void environment
      .getDesignation()
      .then((value) => {
        if (!cancelled) setDesignation(value);
      })
      .catch(() => {
        if (!cancelled) setDesignation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  return designation;
}
