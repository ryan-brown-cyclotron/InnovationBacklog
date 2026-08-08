import React from "react";
import type { AppUser } from "@momentum/contracts";
import type { IService } from "./types.js";
export interface MomentumContext {
    user: AppUser | null;
    service: IService;
}
export declare function MomentumContextProvider({ children, service, initialUser, }: {
    children: React.ReactNode;
    service: IService;
    initialUser?: AppUser | null;
}): React.ReactElement;
export declare function useMomentumContext(): MomentumContext;
//# sourceMappingURL=context.d.ts.map