import React from "react";
import { MomentumContextProvider, type IService } from "@momentum/sdk";

export interface AppShellProps {
  service: IService;
  children: React.ReactNode;
}

export function AppShell({ children, service }: AppShellProps): React.ReactElement {
  return <MomentumContextProvider service={service}>{children}</MomentumContextProvider>;
}
