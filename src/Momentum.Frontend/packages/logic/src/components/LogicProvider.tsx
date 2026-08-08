import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { InnovationBacklogProvider } from "../contracts/provider.js";
import { ProviderNotConfiguredError } from "../errors/errors.js";

/**
 * Data families that can be invalidated independently.
 *
 * This is the whole cache story, and it is deliberately small. Each family carries
 * a counter; read hooks include it in their dependency list and mutate hooks bump
 * it. Adding a query library would pull a runtime dependency into `logic`, which is
 * supposed to stay dependency-free so it can be reasoned about and tested without
 * one.
 */
export type DataFamily =
  | "ideas"
  | "solutions"
  | "engagement"
  | "collaboration"
  | "approvals";

const FAMILIES: readonly DataFamily[] = [
  "ideas",
  "solutions",
  "engagement",
  "collaboration",
  "approvals",
];

type VersionMap = Record<DataFamily, number>;

const ZERO_VERSIONS: VersionMap = {
  ideas: 0,
  solutions: 0,
  engagement: 0,
  collaboration: 0,
  approvals: 0,
};

interface LogicContextValue {
  provider: InnovationBacklogProvider;
  versions: VersionMap;
  invalidate: (...families: DataFamily[]) => void;
}

const LogicContext = createContext<LogicContextValue | null>(null);

export interface LogicProviderProps {
  provider: InnovationBacklogProvider;
  children: React.ReactNode;
}

export function LogicProvider({ provider, children }: LogicProviderProps): React.ReactElement {
  const [versions, setVersions] = useState<VersionMap>(ZERO_VERSIONS);

  const invalidate = useCallback((...families: DataFamily[]) => {
    if (families.length === 0) return;
    setVersions((current) => {
      const next = { ...current };
      for (const family of families) {
        next[family] = current[family] + 1;
      }
      return next;
    });
  }, []);

  const value = useMemo<LogicContextValue>(
    () => ({ provider, versions, invalidate }),
    [provider, versions, invalidate],
  );

  return <LogicContext.Provider value={value}>{children}</LogicContext.Provider>;
}

function useLogicContext(): LogicContextValue {
  const context = useContext(LogicContext);
  if (!context) throw new ProviderNotConfiguredError();
  return context;
}

export function useProvider(): InnovationBacklogProvider {
  return useLogicContext().provider;
}

/**
 * A single number that changes whenever any of the given families is invalidated.
 * Read hooks depend on this rather than on the whole version map, so a mutation in
 * an unrelated family does not refetch them.
 */
export function useDataVersion(...families: DataFamily[]): number {
  const { versions } = useLogicContext();
  const watched = families.length > 0 ? families : FAMILIES;
  let total = 0;
  for (const family of watched) total += versions[family];
  return total;
}

export function useInvalidate(): (...families: DataFamily[]) => void {
  return useLogicContext().invalidate;
}

/**
 * Whether the backend behind this provider offers a capability.
 *
 * Absent is not failure — it means this backend has no such capability, and the
 * surface should render nothing rather than an action that cannot work. Use it to
 * gate a control, not to decide whether to show an error.
 */
export function useCapability<T>(
  select: (provider: InnovationBacklogProvider) => T | undefined,
): T | undefined {
  const provider = useProvider();
  return select(provider);
}
