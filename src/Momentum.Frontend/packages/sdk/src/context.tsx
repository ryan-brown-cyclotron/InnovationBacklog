import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AppUser } from "@momentum/contracts";
import type { IService } from "./types.js";

export interface MomentumContext {
  user: AppUser | null;
  service: IService;
}

const Ctx = createContext<MomentumContext | null>(null);

export function MomentumContextProvider({
  children,
  service,
  initialUser,
}: {
  children: React.ReactNode;
  service: IService;
  initialUser?: AppUser | null;
}): React.ReactElement {
  const [user, setUser] = useState<AppUser | null>(initialUser ?? null);

  useEffect(() => {
    if (initialUser === undefined) {
      fetch("/api/auth/me", { credentials: "include" })
        .then(r => (r.ok ? r.json() : null))
        .then((u: AppUser | null) => setUser(u))
        .catch(() => setUser(null));
    }
  }, [initialUser]);

  const callTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => service.callTool(name, args),
    [service],
  );

  return <Ctx.Provider value={{ user, service: { callTool } }}>{children}</Ctx.Provider>;
}

export function useMomentumContext(): MomentumContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMomentumContext must be used within MomentumContextProvider");
  return ctx;
}
